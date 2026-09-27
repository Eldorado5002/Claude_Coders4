"""Hindsight memory: what the AP team has learned.

Bank setup (missions, disposition, directives, entity labels) lives here, plus the
four things the agent does with memory: retain a resolution, reflect for a
recommendation, recall observations about a vendor, and read the vendor playbook.
"""

import asyncio
import contextlib
import logging
import re
import time
from datetime import datetime
from typing import Any

from hindsight_client import Hindsight

from app.config import Settings, get_settings
from app.schemas import Citation, CitationKind, ExceptionType

log = logging.getLogger("precedent.memory")

BANK_MISSION = (
    "Institutional memory of the accounts-payable team at Deccan Precision Components, a Hyderabad manufacturer. "
    "It records how invoice exceptions (3-way match failures between invoice, purchase order and goods receipt) "
    "were resolved, and learns each vendor's billing habits and the team's policies."
)
RETAIN_MISSION = (
    "Extract who resolved which invoice exception for which vendor, the exception type, the amounts involved, the "
    "decision (approve, approve_adjusted, hold, reject, escalate) and the exact reason given — especially thresholds, "
    "caps, percentages, agreements, seasons and conditions. Also record what the AP agent (Precedent) recommended and "
    "whether the human accepted or overruled it."
)
OBSERVATIONS_MISSION = (
    "Observations are durable vendor habits and resolution policies, e.g. 'Vendor X bills freight separately on the "
    "last line; the team approves it when under ₹5,000 per trip'. Keep numeric limits exact. When a vendor's terms or "
    "the team's decisions change, update the observation and keep the history."
)
REFLECT_MISSION = (
    "I am Precedent, a careful accounts-payable specialist. I recommend how to resolve invoice exceptions from how "
    "this team resolved similar cases before — this vendor's precedents first, then the same exception type. I quote "
    "the exact limits the team uses, I say plainly when there is no relevant precedent, and I never weaken financial "
    "controls."
)

DIRECTIVES = [
    (
        "Bank change",
        "Never recommend approving an invoice whose pay-to bank account differs from the vendor master. Recommend "
        "escalate so treasury verifies the change by phone callback on the registered number.",
    ),
    (
        "Duplicates",
        "Never recommend approving a possible duplicate invoice (same vendor and invoice number, or same amount and "
        "date as an earlier invoice). Recommend reject and name the earlier invoice.",
    ),
    (
        "New vendors",
        "Never approve the first invoice from a newly onboarded vendor. Recommend escalate until KYC and bank "
        "verification are complete.",
    ),
    (
        "Approval limit",
        "Invoices above ₹5,00,000 always need Finance Controller approval. Recommend escalate.",
    ),
    (
        "Evidence",
        "Only rely on precedents that match the vendor or clearly generic team policy. If precedents conflict, prefer "
        "the most recent and mention the conflict. If no precedent applies, recommend hold or escalate with low "
        "confidence.",
    ),
    (
        "E-invoicing",
        "Suppliers above Rs 5 crore turnover must issue GST e-invoices with an IRN and signed QR code. An invoice "
        "from such a supplier without a valid IRN is not a valid tax invoice: recommend hold and ask for an "
        "IRP-registered invoice.",
    ),
    (
        "Supplier GSTIN",
        "If the GSTIN printed on an invoice fails its checksum or differs from the vendor master, treat it as "
        "possible impersonation and recommend escalate.",
    ),
]

ENTITY_LABELS = [
    {
        "key": "exception_type",
        "description": "Type of invoice exception discussed",
        "type": "value",
        "optional": True,
        "values": [{"value": t.value, "description": t.value.replace("_", " ")} for t in ExceptionType],
    },
    {
        "key": "decision",
        "description": "How the exception was resolved",
        "type": "value",
        "optional": True,
        "values": [
            {"value": "approve", "description": "paid as invoiced"},
            {"value": "approve_adjusted", "description": "paid a corrected amount"},
            {"value": "hold", "description": "sent back to vendor or waiting for information"},
            {"value": "reject", "description": "rejected, e.g. duplicate"},
            {"value": "escalate", "description": "sent to manager or treasury"},
        ],
    },
]

CASE_ID = re.compile(r"EXC-\d{4}")
TEAM_POLICY_ID = "team-policy"


def vendor_tag(vendor_id: str) -> str:
    return f"vendor:{vendor_id}"


def exc_tag(t: str) -> str:
    return f"exc:{t}"


def _kind(t: str | None) -> CitationKind:
    try:
        return CitationKind(t or "world")
    except ValueError:
        return CitationKind.WORLD


def _dt(x: Any) -> datetime | None:
    if x is None or isinstance(x, datetime):
        return x
    try:
        return datetime.fromisoformat(str(x).replace("Z", "+00:00"))
    except ValueError:
        return None


class MemoryStore:
    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()
        self._client: Hindsight | None = None
        self._ready: set[str] = set()
        self._lock = asyncio.Lock()
        self.hindsight_defense = False

    @property
    def client(self) -> Hindsight:
        if self._client is None:
            self._client = Hindsight(
                base_url=self.settings.hindsight_base_url,
                api_key=self.settings.hindsight_api_key or None,
                timeout=self.settings.hindsight_timeout,
            )
        return self._client

    async def close(self) -> None:
        if self._client is not None:
            with contextlib.suppress(Exception):
                await self._client.aclose()
            self._client = None

    # ---------------------------------------------------------------- bank setup

    async def health(self, bank_id: str) -> bool:
        try:
            await asyncio.wait_for(self.client.aget_bank_config(bank_id), timeout=8)
            return True
        except Exception:
            try:
                await asyncio.wait_for(self.client.aget_version(), timeout=8)
                return True
            except Exception:
                return False

    async def ensure_bank(self, bank_id: str) -> None:
        if bank_id in self._ready:
            return
        async with self._lock:
            if bank_id in self._ready:
                return
            try:
                await self.client.aget_bank_config(bank_id)
                exists = True
            except Exception:
                exists = False
            if not exists:
                await self.client.acreate_bank(
                    bank_id,
                    name="Precedent — AP team memory",
                    mission=BANK_MISSION,
                    retain_mission=RETAIN_MISSION,
                    observations_mission=OBSERVATIONS_MISSION,
                    reflect_mission=REFLECT_MISSION,
                    disposition_skepticism=5,
                    disposition_literalism=4,
                    disposition_empathy=1,
                )
                await self.client.aupdate_bank_config(bank_id, entity_labels=ENTITY_LABELS)
            existing = await self.client.alist_directives(bank_id)
            items = getattr(existing, "items", None) or getattr(existing, "directives", None) or []
            have = {getattr(d, "name", None) for d in items}
            for priority, (name, content) in enumerate(DIRECTIVES):
                if name not in have:
                    await self.client.acreate_directive(bank_id, name=name, content=content, priority=10 - priority)
            # playbooks refresh at most every 5 min (each refresh is a paid LLM call)
            with contextlib.suppress(Exception):
                await self.client.aupdate_bank_config(bank_id, mental_model_min_refresh_interval_seconds=300)
            # Hindsight's own PII redaction is a paid add-on; use it when the org has it.
            # Precedent always redacts locally before retain (app/memory/redact.py).
            try:
                await self.client.aupdate_bank_config(
                    bank_id, memory_defense={"enabled": True, "rules": [{"on": "sensitive_data", "action": "redact"}]}
                )
                self.hindsight_defense = True
            except Exception:
                self.hindsight_defense = False
            await self._ensure_team_policy(bank_id)
            self._ready.add(bank_id)

    async def _ensure_team_policy(self, bank_id: str) -> None:
        try:
            await self.client.aget_mental_model(bank_id, TEAM_POLICY_ID, detail="metadata")
        except Exception:
            with contextlib.suppress(Exception):
                await self.client.acreate_mental_model(
                    bank_id,
                    name="AP team exception policy",
                    source_query=(
                        "What standing policies does the AP team apply to invoice exceptions across all vendors? "
                        "List tolerances, caps, no-PO limits, GST rules, seasonal allowances, and which exceptions "
                        "are always held, rejected or escalated. Quote exact numbers. Short markdown bullets."
                    ),
                    id=TEAM_POLICY_ID,
                )

    async def team_policy(self, bank_id: str) -> tuple[str | None, datetime | None]:
        """Team-wide policy mental model; refreshed on demand when older than 10 minutes."""
        await self.ensure_bank(bank_id)
        try:
            mm = await self.client.aget_mental_model(bank_id, TEAM_POLICY_ID, detail="full")
        except Exception:
            return None, None
        refreshed = _dt(getattr(mm, "last_refreshed_at", None))
        stale = refreshed is None or (datetime.now(refreshed.tzinfo) - refreshed).total_seconds() > 600
        if stale or getattr(mm, "is_stale", False):
            with contextlib.suppress(Exception):
                await self.client.arefresh_mental_model(bank_id, TEAM_POLICY_ID)
        return _mm_content(mm), refreshed

    # ---------------------------------------------------------------- beliefs (observation history)

    async def beliefs(self, bank_id: str, vendor_id: str, vendor_name: str, limit: int = 5) -> list[dict]:
        """Consolidated observations about a vendor, each with its evidence count and version history."""
        await self.ensure_bank(bank_id)
        obs = await self.recall(
            bank_id,
            f"How does the AP team handle invoices from {vendor_name}?",
            vendor_id=vendor_id,
            fact_types=["observation"],
            strict=True,
        )
        out = []
        for o in obs[:limit]:
            oid = str(o.id)
            detail, history = await asyncio.gather(
                self.client._memory_api.get_memory(bank_id, oid, _request_timeout=self.settings.hindsight_timeout),
                self.client._memory_api.get_observation_history(
                    bank_id, oid, _request_timeout=self.settings.hindsight_timeout
                ),
                return_exceptions=True,
            )
            detail = {} if isinstance(detail, Exception) else (_to_dict(detail) or {})
            history = [] if isinstance(history, Exception) else [_to_dict(h) for h in (history or [])]
            versions = [
                {
                    "text": h.get("previous_text", ""),
                    "as_of": h.get("previous_mentioned_at") or h.get("previous_occurred_end"),
                    "new_evidence": [f.get("text", "") for f in (h.get("source_facts") or []) if f.get("is_new")],
                }
                for h in history
                if h.get("previous_text")
            ]
            versions.sort(key=lambda v: str(v["as_of"] or ""))
            out.append(
                {
                    "id": oid,
                    "text": o.text,
                    "evidence_count": len(detail.get("source_memory_ids") or []),
                    "first_seen": getattr(o, "occurred_start", None) or detail.get("occurred_start"),
                    "last_updated": getattr(o, "mentioned_at", None) or detail.get("mentioned_at"),
                    "versions": versions,
                }
            )
        return out

    # ---------------------------------------------------------------- knowledge pages (vendor wiki)

    async def _tree(self, bank_id: str) -> list[dict]:
        tree = _to_dict(await self.client.aget_knowledge_base_tree(bank_id)) or {}
        return tree.get("roots") or []

    async def knowledge_pages(self, bank_id: str) -> list[dict]:
        await self.ensure_bank(bank_id)
        pages = []

        def walk(nodes: list[dict]) -> None:
            for n in nodes:
                if n.get("kind") == "page":
                    vendor = next((t.split(":", 1)[1] for t in n.get("tags") or [] if t.startswith("vendor:")), None)
                    pages.append({"id": n["id"], "name": n["name"], "vendor_id": vendor, "stale": n.get("is_stale")})
                walk(n.get("children") or [])

        walk(await self._tree(bank_id))
        return pages

    async def knowledge_page(self, bank_id: str, page_id: str) -> dict:
        page = _to_dict(await self.client.aget_knowledge_page(bank_id, page_id)) or {}
        vendor = next((t.split(":", 1)[1] for t in page.get("tags") or [] if t.startswith("vendor:")), None)
        return {
            "id": page_id,
            "name": page.get("name", ""),
            "vendor_id": vendor,
            "stale": None,
            "markdown": strip_frontmatter(page.get("markdown") or page.get("body")),
        }

    async def vendor_page(self, bank_id: str, vendor_id: str, vendor_name: str) -> str | None:
        """The vendor's wiki page (Hindsight Knowledge Page), created on first use under a 'Vendors' folder."""
        await self.ensure_bank(bank_id)
        existing = next((p for p in await self.knowledge_pages(bank_id) if p["vendor_id"] == vendor_id), None)
        if existing:
            return (await self.knowledge_page(bank_id, existing["id"]))["markdown"]
        roots = await self._tree(bank_id)
        folder = next((n for n in roots if n.get("kind") == "folder" and n.get("name") == "Vendors"), None)
        if folder is None:
            folder = _to_dict(await self.client.acreate_knowledge_folder(bank_id, name="Vendors"))
        await self.client.acreate_knowledge_page(
            bank_id,
            name=vendor_name,
            parent_id=folder["id"],
            source_query=(
                f"What should an AP clerk know about invoices from {vendor_name} ({vendor_id})? Billing habits, exact "
                "limits and conditions, the standard decision for each exception type, and anything that changed "
                "over time."
            ),
            tags=[vendor_tag(vendor_id)],
        )
        return None  # Hindsight writes it in the background; the next request returns it

    async def delete_document(self, bank_id: str, document_id: str) -> bool:
        """Forget one lesson: deletes the document and every fact extracted from it."""
        try:
            resp = await self.client._documents_api.delete_document(
                bank_id, document_id, _request_timeout=self.settings.hindsight_timeout
            )
            return bool(getattr(resp, "success", True))
        except Exception as e:  # noqa: BLE001
            log.warning("delete_document %s/%s failed: %s", bank_id, document_id, e)
            return False

    async def delete_bank(self, bank_id: str) -> None:
        try:
            await self.client.adelete_bank(bank_id)
        except Exception as e:  # missing bank is fine
            log.info("delete_bank %s: %s", bank_id, e)
        self._ready.discard(bank_id)

    # ---------------------------------------------------------------- retain

    async def retain_resolution(
        self,
        bank_id: str,
        *,
        content: str,
        case_id: str,
        vendor_id: str,
        types: list[str],
        decision: str,
        when: datetime,
        taught_by: str = "",
        retain_async: bool = False,
    ) -> str:
        await self.ensure_bank(bank_id)
        await self.client.aretain(
            bank_id,
            content=content,
            timestamp=when,
            context="AP invoice exception resolution",
            document_id=case_id,
            metadata={"exception_id": case_id, "vendor_id": vendor_id, "decision": decision, "taught_by": taught_by},
            tags=[vendor_tag(vendor_id), *(exc_tag(t) for t in types), f"decision:{decision}"],
            retain_async=retain_async,
        )
        return case_id

    async def retain_batch(self, bank_id: str, items: list[dict[str, Any]], retain_async: bool = True) -> None:
        await self.ensure_bank(bank_id)
        payload = [
            {
                "content": it["content"],
                "timestamp": it["when"].isoformat(),
                "context": "AP invoice exception resolution",
                "document_id": it["case_id"],
                "metadata": {"exception_id": it["case_id"], "vendor_id": it["vendor_id"], "decision": it["decision"]},
                "tags": [vendor_tag(it["vendor_id"]), *(exc_tag(t) for t in it["types"]), f"decision:{it['decision']}"],
            }
            for it in items
        ]
        for i in range(0, len(payload), 25):
            await self.client.aretain_batch(bank_id, items=payload[i : i + 25], retain_async=retain_async)

    # ---------------------------------------------------------------- reflect / recall

    async def reflect(
        self,
        bank_id: str,
        query: str,
        *,
        vendor_id: str | None = None,
        types: list[str] | None = None,
        response_schema: dict[str, Any] | None = None,
        budget: str = "low",
    ) -> tuple[Any, list[Citation], int]:
        await self.ensure_bank(bank_id)
        tags = [vendor_tag(vendor_id)] if vendor_id else []
        tags += [exc_tag(t) for t in types or []]
        t0 = time.perf_counter()
        resp = await self.client.areflect(
            bank_id,
            query=query,
            budget=budget,
            response_schema=response_schema,
            tags=tags or None,
            tags_match="any",
            include_facts=True,
        )
        return resp, citations_from(resp), int((time.perf_counter() - t0) * 1000)

    async def recall(
        self,
        bank_id: str,
        query: str,
        *,
        vendor_id: str | None = None,
        types: list[str] | None = None,
        fact_types: list[str] | None = None,
        strict: bool = False,
        max_tokens: int = 2048,
        query_timestamp: str | None = None,
    ) -> list[Any]:
        await self.ensure_bank(bank_id)
        tags = [vendor_tag(vendor_id)] if vendor_id else []
        tags += [exc_tag(t) for t in types or []]
        resp = await self.client.arecall(
            bank_id,
            query=query,
            types=fact_types,
            budget="low",
            max_tokens=max_tokens,
            tags=tags or None,
            tags_match="any_strict" if strict else "any",
            query_timestamp=query_timestamp,
        )
        return list(resp.results or [])

    async def recent(self, bank_id: str, limit: int = 20) -> list[Any]:
        await self.ensure_bank(bank_id)
        resp = await self.client.alist_memories(bank_id, limit=limit)
        items = getattr(resp, "items", None) or getattr(resp, "memories", None) or []
        return list(items)

    async def playbook(self, bank_id: str, vendor_id: str, vendor_name: str) -> str | None:
        """Vendor playbook as a Hindsight mental model (created on first use, refreshed after consolidation)."""
        await self.ensure_bank(bank_id)
        mm_id = f"playbook-{vendor_id.lower()}"
        try:
            mm = await self.client.aget_mental_model(bank_id, mm_id, detail="content")
            content = _mm_content(mm)
            if content:
                return content
            await self.client.arefresh_mental_model(bank_id, mm_id)
            return None
        except Exception:
            pass
        try:
            await self.client.acreate_mental_model(
                bank_id,
                name=f"AP playbook — {vendor_name}",
                source_query=(
                    f"How does the AP team handle invoice exceptions from {vendor_name} ({vendor_id})? List the "
                    "vendor's billing habits, the exact limits and conditions the team applies, and the standard "
                    "decision for each exception type. Use short markdown bullets."
                ),
                tags=[vendor_tag(vendor_id)],
                trigger={"refresh_after_consolidation": True},
                id=mm_id,
            )
        except Exception as e:
            log.info("create mental model %s: %s", mm_id, e)
        return None


def _to_dict(x: Any) -> Any:
    return x.to_dict() if hasattr(x, "to_dict") else x


def strip_frontmatter(md: str | None) -> str | None:
    if not md:
        return None
    if md.startswith("---"):
        end = md.find("---", 3)
        if end != -1:
            md = md[end + 3 :]
    return md.strip() or None


def _mm_content(mm: Any) -> str | None:
    for attr in ("content", "text"):
        v = getattr(mm, attr, None)
        if isinstance(v, str) and v.strip():
            return v
    if isinstance(mm, dict):
        return mm.get("content") or mm.get("text")
    return None


def citations_from(resp: Any, limit: int = 6) -> list[Citation]:
    out: list[Citation] = []
    bo = getattr(resp, "based_on", None)
    if not bo:
        return out
    for mm in (bo.mental_models or [])[:2]:
        out.append(Citation(id=str(mm.id), kind=CitationKind.MENTAL_MODEL, text=_clip(mm.text)))
    for d in bo.directives or []:
        out.append(Citation(id=str(d.id), kind=CitationKind.DIRECTIVE, text=_clip(f"{d.name}: {d.content}")))
    for m in bo.memories or []:
        case = CASE_ID.search(m.text or "") or CASE_ID.search(getattr(m, "context", "") or "")
        out.append(
            Citation(
                id=str(m.id),
                kind=_kind(m.type),
                text=_clip(m.text),
                occurred_at=_dt(m.occurred_start),
                exception_id=case.group(0) if case else None,
            )
        )
    # memories first (most useful to the clerk), then models, then directives
    order = {
        CitationKind.OBSERVATION: 0,
        CitationKind.WORLD: 1,
        CitationKind.EXPERIENCE: 2,
        CitationKind.MENTAL_MODEL: 3,
        CitationKind.DIRECTIVE: 4,
    }
    out.sort(key=lambda c: order[c.kind])
    return out[:limit]


def _clip(text: str | None, n: int = 400) -> str:
    text = (text or "").strip()
    return text if len(text) <= n else text[: n - 1] + "…"


_store: MemoryStore | None = None


def get_memory() -> MemoryStore:
    global _store
    if _store is None:
        _store = MemoryStore()
    return _store
