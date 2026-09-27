"""Calibrate the synthetic dataset on a real purchase-to-pay log: BPI Challenge 2019.

The log comes from a multinational coatings & paints company (251,734 purchase-order
items, ~1.6M events). We stream it once and extract the statistics our generator uses:
timing lags, how often prices/quantities change, how often invoices are payment-blocked
(the real-world proxy for an "exception"), and how purchase volume spreads across vendors.

Run: uv run python -m scripts.calibrate_bpi
Source: https://icpmconference.org/2019/icpm-2019/contests-challenges/bpi-challenge-2019/
"""

import contextlib
import csv
import io
import json
import statistics
import urllib.request
import zipfile
from collections import Counter
from datetime import datetime

from app.config import BACKEND_DIR

URL = "https://icpmconference.org/2019/wp-content/uploads/sites/6/2019/02/BPIChallenge2019CSV.zip"
RAW = BACKEND_DIR / "data" / "external" / "bpi2019.zip"
OUT = BACKEND_DIR / "data" / "bpi2019_calibration.json"
THREE_WAY = {"3-way match, invoice after GR", "3-way match, invoice before GR"}


def ts(s: str) -> datetime | None:
    try:
        d = datetime.strptime(s.strip()[:19], "%d-%m-%Y %H:%M:%S")
    except ValueError:
        return None
    return d if 2017 <= d.year <= 2019 else None  # the log contains a few placeholder dates


def quantiles(xs: list[float]) -> dict:
    xs = sorted(xs)
    if not xs:
        return {}
    q = statistics.quantiles(xs, n=10, method="inclusive")
    return {
        "n": len(xs),
        "p10": q[0],
        "p25": statistics.quantiles(xs, n=4)[0],
        "median": statistics.median(xs),
        "p75": statistics.quantiles(xs, n=4)[2],
        "p90": q[8],
        "mean": statistics.fmean(xs),
    }


def main() -> None:
    if not RAW.exists():
        RAW.parent.mkdir(parents=True, exist_ok=True)
        print("downloading BPI Challenge 2019 (37 MB)...")
        req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
        RAW.write_bytes(urllib.request.urlopen(req, timeout=600).read())

    cases: dict[str, dict] = {}
    events = 0
    with zipfile.ZipFile(RAW) as z, z.open("BPI_Challenge_2019.csv") as f:
        rows = csv.reader(io.TextIOWrapper(f, encoding="latin-1"))
        head = [h.strip() for h in next(rows)]
        ix = {h: i for i, h in enumerate(head)}
        for row in rows:
            if len(row) != len(head):
                continue  # free-text columns occasionally contain commas
            events += 1
            cid = row[ix["case concept:name"]]
            c = cases.get(cid)
            if c is None:
                c = cases[cid] = {
                    "vendor": row[ix["case Vendor"]],
                    "cat": row[ix["case Item Category"]],
                    "acts": Counter(),
                    "first": {},
                    "value": None,
                }
            act = row[ix["event concept:name"]]
            if act == "Create Purchase Order Item" and c["value"] is None:
                with contextlib.suppress(ValueError):
                    c["value"] = float(row[ix["event Cumulative net worth (EUR)"]])
            c["acts"][act] += 1
            t = ts(row[ix["event time:timestamp"]])
            if t and (act not in c["first"] or t < c["first"][act]):
                c["first"][act] = t

    cats = Counter(c["cat"] for c in cases.values())
    three_way = [c for c in cases.values() if c["cat"] in THREE_WAY]
    with_inv = [c for c in three_way if c["acts"]["Record Invoice Receipt"]]

    def share(pred, pool) -> float:
        return round(sum(1 for c in pool if pred(c)) / len(pool), 4) if pool else 0.0

    def lag(pool, a, b) -> list[float]:
        out = []
        for c in pool:
            ta, tb = c["first"].get(a), c["first"].get(b)
            if ta and tb and tb >= ta:
                out.append((tb - ta).total_seconds() / 86400)
        return out

    after_gr = [c for c in with_inv if c["cat"] == "3-way match, invoice after GR"]
    vendor_items = Counter(c["vendor"] for c in three_way)
    counts = sorted(vendor_items.values(), reverse=True)
    top20 = sum(counts[: max(1, len(counts) // 5)]) / sum(counts)
    top25 = counts[:25]

    from app.ml.benford import benford

    real_benford = benford([c["value"] for c in cases.values() if c["value"] and c["value"] >= 10], min_n=100)

    result = {
        "source": "BPI Challenge 2019 (van Dongen, 4TU.ResearchData, doi:10.4121/uuid:d06aff4b-79f0-45e6-8ec8-e19730c248f1)",
        "events": events,
        "po_items": len(cases),
        "vendors": len(set(c["vendor"] for c in cases.values())),
        "item_categories": dict(cats.most_common()),
        "three_way_items": len(three_way),
        "three_way_with_invoice": len(with_inv),
        "exception_proxies": {
            "payment_block_set": share(lambda c: c["acts"]["Set Payment Block"] > 0, with_inv),
            "price_changed": share(lambda c: c["acts"]["Change Price"] > 0, with_inv),
            "quantity_changed": share(lambda c: c["acts"]["Change Quantity"] > 0, with_inv),
            "invoice_cancelled": share(lambda c: c["acts"]["Cancel Invoice Receipt"] > 0, with_inv),
            "any_of_the_above": share(
                lambda c: any(
                    c["acts"][a]
                    for a in ("Set Payment Block", "Change Price", "Change Quantity", "Cancel Invoice Receipt")
                ),
                with_inv,
            ),
            "invoice_before_goods_receipt": share(lambda c: c["cat"] == "3-way match, invoice before GR", with_inv),
        },
        "lag_days": {
            "po_to_goods_receipt": quantiles(lag(three_way, "Create Purchase Order Item", "Record Goods Receipt")),
            "goods_receipt_to_invoice_receipt": quantiles(
                lag(after_gr, "Record Goods Receipt", "Record Invoice Receipt")
            ),
            "invoice_receipt_to_clear": quantiles(lag(with_inv, "Record Invoice Receipt", "Clear Invoice")),
        },
        "benford_po_item_values": real_benford,
        "vendor_concentration": {
            "vendors_with_3way_items": len(counts),
            "top_20pct_vendor_share_of_items": round(top20, 4),
            "top_25_relative_volume": [round(x / top25[0], 4) for x in top25],
        },
    }
    OUT.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({k: result[k] for k in ("events", "po_items", "vendors", "three_way_with_invoice")}, indent=1))
    print(json.dumps(result["exception_proxies"], indent=1))
    print(
        json.dumps(
            {k: {m: round(v, 1) for m, v in d.items() if m != "n"} for k, d in result["lag_days"].items()}, indent=1
        )
    )
    print("Benford on real PO item values:", {k: real_benford[k] for k in ("n", "mad", "conformity")})
    print("top 20% vendors' share of items:", result["vendor_concentration"]["top_20pct_vendor_share_of_items"])
    print("wrote", OUT)


if __name__ == "__main__":
    main()
