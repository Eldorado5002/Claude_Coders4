"""One OpenAI-compatible client per provider, with failover.

LLMs only ever return schema-validated JSON here; control flow stays in Python.
Each provider spells structured output differently:
  groq   -> response_format json_schema, strict (constrained decoding)
  gemini -> response_format json_schema (OpenAI-compat layer)
  nvidia -> nvext.guided_json (constrained decoding)
"""

import base64
import copy
import hashlib
import json
import logging
import re
import time
from dataclasses import dataclass
from typing import Any, Generic, TypeVar

import openai
from openai import AsyncOpenAI
from pydantic import BaseModel, ValidationError
from sqlmodel import Session

from app.config import Settings, get_settings
from app.db import get_engine
from app.models import LlmCache

log = logging.getLogger("precedent.llm")
T = TypeVar("T", bound=BaseModel)

_STRIP_KEYS = {
    "title",
    "default",
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "minLength",
    "maxLength",
    "pattern",
    "format",
    "minItems",
    "maxItems",
}


def strict_schema(model: type[BaseModel]) -> dict[str, Any]:
    """Pydantic JSON schema -> strict-mode schema: refs inlined, all fields required, no extras."""
    raw = model.model_json_schema()
    defs = raw.pop("$defs", {})

    def walk(node: Any) -> Any:
        if isinstance(node, dict):
            if "$ref" in node:
                return walk(copy.deepcopy(defs[node["$ref"].split("/")[-1]]))
            out = {k: walk(v) for k, v in node.items() if k not in _STRIP_KEYS}
            if out.get("type") == "object" or "properties" in out:
                out["type"] = "object"
                out["additionalProperties"] = False
                out["required"] = list(out.get("properties", {}).keys())
            return out
        if isinstance(node, list):
            return [walk(x) for x in node]
        return node

    return walk(raw)


@dataclass
class Provider:
    name: str
    model: str
    client: AsyncOpenAI

    @property
    def label(self) -> str:
        return f"{self.name}:{self.model}"


@dataclass
class LlmResult(Generic[T]):
    value: T
    provider: str
    latency_ms: int
    cached: bool = False


class LlmUnavailable(RuntimeError):
    pass


def _extract_json(text: str) -> Any:
    text = (text or "").strip()
    text = re.sub(r"^<think>.*?</think>", "", text, flags=re.S).strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, flags=re.S)
    if fenced:
        text = fenced.group(1).strip()
    start = min((i for i in (text.find("{"), text.find("[")) if i >= 0), default=0)
    return json.loads(text[start:])


class LLMRouter:
    def __init__(self, settings: Settings | None = None):
        s = settings or get_settings()
        available = {
            "groq": (s.groq_api_key, "https://api.groq.com/openai/v1", s.groq_model),
            "gemini": (s.gemini_api_key, "https://generativelanguage.googleapis.com/v1beta/openai/", s.gemini_model),
            "nvidia": (s.nvidia_api_key, "https://integrate.api.nvidia.com/v1", s.nvidia_model),
        }
        self.providers: list[Provider] = []
        for name in [n.strip() for n in s.llm_order.split(",") if n.strip()]:
            key, url, model = available[name]
            if key:
                client = AsyncOpenAI(api_key=key, base_url=url, timeout=45.0, max_retries=0)
                self.providers.append(Provider(name=name, model=model, client=client))
        self.gemini_vision_model = s.gemini_vision_model

    @property
    def chain(self) -> list[str]:
        return [p.label for p in self.providers]

    # ---------------------------------------------------------------- core

    def _request_kwargs(self, p: Provider, schema: type[BaseModel], max_tokens: int) -> dict[str, Any]:
        js = strict_schema(schema)
        if p.name == "groq":
            return {
                "response_format": {
                    "type": "json_schema",
                    "json_schema": {"name": schema.__name__, "strict": True, "schema": js},
                },
                "reasoning_effort": "low",
                "max_completion_tokens": max_tokens + 1024,
            }
        if p.name == "gemini":
            return {
                "response_format": {"type": "json_schema", "json_schema": {"name": schema.__name__, "schema": js}},
                "reasoning_effort": "low",
                "max_tokens": max_tokens + 1024,
            }
        # NVIDIA's hosted API rejects nvext.guided_json; it accepts OpenAI-style response_format.
        return {
            "response_format": {"type": "json_schema", "json_schema": {"name": schema.__name__, "schema": js}},
            "max_tokens": max_tokens + 1024,
        }

    async def _call(self, p: Provider, messages: list[dict], schema: type[T], max_tokens: int, temperature: float) -> T:
        kwargs = self._request_kwargs(p, schema, max_tokens)
        resp = await p.client.chat.completions.create(
            model=p.model, messages=messages, temperature=temperature, **kwargs
        )
        content = resp.choices[0].message.content or ""
        try:
            return schema.model_validate(_extract_json(content))
        except (ValidationError, json.JSONDecodeError, ValueError) as e:
            # one repair attempt on the same provider
            repair = [
                *messages,
                {"role": "assistant", "content": content[:4000]},
                {
                    "role": "user",
                    "content": f"That output did not match the required JSON schema ({str(e)[:400]}). "
                    "Reply again with ONLY the corrected JSON object.",
                },
            ]
            resp = await p.client.chat.completions.create(model=p.model, messages=repair, temperature=0, **kwargs)
            return schema.model_validate(_extract_json(resp.choices[0].message.content or ""))

    async def structured(
        self,
        system: str,
        user: str,
        schema: type[T],
        *,
        max_tokens: int = 700,
        temperature: float = 0.2,
        cache: bool = False,
        providers: list[str] | None = None,
    ) -> LlmResult[T]:
        chain = [p for p in self.providers if providers is None or p.name in providers]
        key = None
        if cache:
            key = hashlib.sha256(
                json.dumps([schema.__name__, system, user, [p.label for p in chain]]).encode()
            ).hexdigest()
            with Session(get_engine()) as session:
                hit = session.get(LlmCache, key)
                if hit:
                    return LlmResult(schema.model_validate(hit.value["value"]), hit.value["provider"], 0, cached=True)

        messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        errors: list[str] = []
        for p in chain:
            t0 = time.perf_counter()
            try:
                value = await self._call(p, messages, schema, max_tokens, temperature)
            except (openai.APIError, ValidationError, json.JSONDecodeError, ValueError) as e:
                errors.append(f"{p.label}: {type(e).__name__}: {str(e)[:160]}")
                log.warning("LLM provider failed, trying next: %s", errors[-1])
                continue
            result = LlmResult(value, p.label, int((time.perf_counter() - t0) * 1000))
            if key:
                with Session(get_engine()) as session:
                    session.merge(
                        LlmCache(key=key, value={"value": value.model_dump(mode="json"), "provider": p.label})
                    )
                    session.commit()
            return result
        raise LlmUnavailable("; ".join(errors) or "no LLM providers configured")

    async def vision(self, system: str, prompt: str, image: bytes, mime: str, schema: type[T]) -> LlmResult[T]:
        """Image -> structured JSON. Gemini only (multimodal)."""
        p = next((p for p in self.providers if p.name == "gemini"), None)
        if p is None:
            raise LlmUnavailable("Gemini is required for invoice capture")
        data_url = f"data:{mime};base64,{base64.b64encode(image).decode()}"
        messages = [
            {"role": "system", "content": system},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            },
        ]
        vp = Provider(name="gemini", model=self.gemini_vision_model, client=p.client)
        t0 = time.perf_counter()
        value = await self._call(vp, messages, schema, max_tokens=2500, temperature=0)
        return LlmResult(value, vp.label, int((time.perf_counter() - t0) * 1000))


_router: LLMRouter | None = None


def get_router() -> LLMRouter:
    global _router
    if _router is None:
        _router = LLMRouter()
    return _router
