"""Plain vector RAG over past resolutions: the baseline the ablation compares Hindsight against.

Each resolution text the clerk writes is embedded once (Gemini embeddings) and kept in memory.
A new exception retrieves its k nearest past resolutions by cosine similarity. No tags, no time
awareness, no consolidation into observations: this is what "just add a vector store" gives you.
"""

import numpy as np

from app.llm.router import get_router

EMBED_MODEL = "gemini-embedding-001"
EMBED_PRICE = 0.15 / 1_000_000  # USD per input token


def _tokens(texts: list[str]) -> int:
    return sum(len(t) for t in texts) // 4  # the endpoint reports no usage; ~4 characters per token


class VectorRag:
    def __init__(self, model: str = EMBED_MODEL):
        gemini = next((p for p in get_router().providers if p.name == "gemini"), None)
        if gemini is None:
            raise RuntimeError("The RAG baseline needs a Gemini key for embeddings")
        self.client, self.model = gemini.client, model
        self.ids: list[str] = []
        self.texts: list[str] = []
        self.vectors: list[np.ndarray] = []
        self.total_cost = 0.0

    async def _embed(self, texts: list[str]) -> tuple[list[np.ndarray], float]:
        r = await self.client.embeddings.create(model=self.model, input=texts)
        vecs = [np.asarray(d.embedding, dtype=np.float32) for d in r.data]
        cost = _tokens(texts) * EMBED_PRICE
        self.total_cost += cost
        return [v / (np.linalg.norm(v) or 1.0) for v in vecs], cost

    async def add(self, doc_id: str, text: str) -> None:
        (vec,), _ = await self._embed([text])
        self.ids.append(doc_id)
        self.texts.append(text)
        self.vectors.append(vec)

    async def search(self, query: str, k: int = 8) -> tuple[list[dict], float]:
        """The k most similar past resolutions, and what embedding the query cost."""
        (q,), cost = await self._embed([query])
        if not self.vectors:
            return [], cost
        sims = np.stack(self.vectors) @ q
        top = np.argsort(-sims)[:k]
        return [{"id": self.ids[i], "text": self.texts[i], "score": float(sims[i])} for i in top], cost
