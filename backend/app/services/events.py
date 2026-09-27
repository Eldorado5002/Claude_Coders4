"""In-process pub/sub for Server-Sent Events."""

import asyncio
import contextlib
import json
from typing import Any

from pydantic import BaseModel


class EventBus:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue] = set()

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=500)
        self._subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self._subscribers.discard(q)

    def publish(self, event: str, data: Any) -> None:
        if isinstance(data, BaseModel):
            data = data.model_dump(mode="json")
        payload = json.dumps(data, default=str)
        for q in list(self._subscribers):
            with contextlib.suppress(asyncio.QueueFull):
                q.put_nowait((event, payload))


bus = EventBus()
