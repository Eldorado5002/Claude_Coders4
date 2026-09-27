"""Generate the dataset and load it into SQLite.

Run: uv run python -m app.data.seed [--keep-state]
"""

import argparse
from collections import Counter

from sqlmodel import Session

from app.config import get_settings
from app.data.generator import generate
from app.db import get_engine, init_db, set_state
from app.models import GoodsReceipt, Invoice, PurchaseOrder, Vendor


def seed(drop: bool = True) -> dict:
    s = get_settings()
    init_db(drop=drop)
    ds = generate(s.seed, s.sim_start, s.sim_days)
    with Session(get_engine()) as session:
        session.add_all(Vendor(**v) for v in ds.vendors)
        session.flush()
        session.add_all(PurchaseOrder(**p) for p in ds.pos)
        session.flush()
        session.add_all(GoodsReceipt(**g) for g in ds.grns)
        session.add_all(Invoice(**i) for i in ds.invoices)
        session.commit()
        set_state(session, "sim_day", -1)
        set_state(session, "stage", "day1")
        set_state(session, "memory_enabled", True)
        set_state(session, "exception_seq", 0)
    exc = [i for i in ds.invoices if i["truth"]["expected_types"]]
    return {
        "vendors": len(ds.vendors),
        "purchase_orders": len(ds.pos),
        "goods_receipts": len(ds.grns),
        "invoices": len(ds.invoices),
        "exceptions": len(exc),
        "by_type": Counter(t for i in exc for t in i["truth"]["expected_types"]).most_common(),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the Precedent database")
    parser.parse_args()
    for k, v in seed().items():
        print(f"{k:16} {v}")


if __name__ == "__main__":
    main()
