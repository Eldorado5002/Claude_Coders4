"""Web Push (VAPID). Notifies installed PWAs about blocked invoices and auto-resolutions."""

import asyncio
import json
import logging

from sqlmodel import Session, select

from app.config import get_settings
from app.db import get_engine
from app.models import PushSub

log = logging.getLogger("precedent.push")


def enabled() -> bool:
    s = get_settings()
    return bool(s.vapid_public_key and s.vapid_private_key)


def save_subscription(endpoint: str, keys: dict[str, str]) -> None:
    with Session(get_engine()) as session:
        session.merge(PushSub(endpoint=endpoint, keys=keys))
        session.commit()


def _send_all(payload: dict) -> None:
    from pywebpush import WebPushException, webpush

    s = get_settings()
    sent = failed = 0
    with Session(get_engine()) as session:
        subs = session.exec(select(PushSub)).all()
        for sub in subs:
            try:
                webpush(
                    subscription_info={"endpoint": sub.endpoint, "keys": sub.keys},
                    data=json.dumps(payload),
                    vapid_private_key=s.vapid_private_key,
                    vapid_claims={"sub": s.vapid_subject},
                    ttl=3600,
                )
            except WebPushException as e:
                status = getattr(e.response, "status_code", None)
                if status in (404, 410):  # subscription expired
                    session.delete(sub)
                log.info("push failed (%s): %s", status, e)
                failed += 1
            else:
                sent += 1
        session.commit()
    log.info("push %r: sent to %d device(s), %d failed", payload.get("title"), sent, failed)


async def notify(title: str, body: str, url: str = "/") -> None:
    if not enabled():
        return
    await asyncio.to_thread(_send_all, {"title": title, "body": body, "url": url})
