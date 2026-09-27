"""Capture accuracy on real, third-party invoice scans we did not make.

Dataset: katanaml-org/invoices-donut-data-v1 (Hugging Face), validation split: 50 scanned
invoices, each with a hand-checked ground-truth parse (header, line items, totals). We send
every image through the same Gemini vision call and the same CapturedInvoice schema the app
uses, then score field by field. The only change from production is the system prompt: these
invoices use US dates and European decimal commas, so the prompt names that locale (a real
deployment configures the locale per region in the same way).

Run: uv run python -m scripts.eval_capture
Writes: data/capture_eval.json (images are cached under data/external/katanaml/, not committed)
"""

import asyncio
import json
import re
import statistics
from datetime import datetime
from difflib import SequenceMatcher

import httpx

from app.config import BACKEND_DIR
from app.llm.router import get_router
from app.services.capture import CapturedInvoice, parse_invoice_date

DATASET = "katanaml-org/invoices-donut-data-v1"
SPLIT = "validation"
ROWS = f"https://datasets-server.huggingface.co/rows?dataset={DATASET.replace('/', '%2F')}&config=default&split={SPLIT}"
CACHE = BACKEND_DIR / "data" / "external" / "katanaml"
OUT = BACKEND_DIR / "data" / "capture_eval.json"
N = 50
CONCURRENCY = 4

SYSTEM = (
    "You extract data from supplier invoices. Read the document carefully and return every field exactly as "
    "printed. vendor_name is the seller's company name only, without its address. Dates on these invoices are "
    "printed MM/DD/YYYY; return them as ISO YYYY-MM-DD. Amounts are plain numbers: drop currency symbols and "
    "thousands separators, and read a decimal comma as a decimal point (889,20 -> 889.20). The bank account is "
    "the IBAN if one is printed. If a field is not printed, use null."
)
FIELDS = ("invoice_number", "invoice_date", "vendor_name", "total", "bank_account", "line_count", "lines")
DIAGNOSTIC = ("invoice_date_model_iso",)  # reported, not part of the headline
LINE_FIELDS = ("line_count", "lines")
ITEM_KEYS = ("item_desc", "item_qty", "item_net_price", "item_net_worth", "item_vat", "item_gross_worth")
SUMMARY_KEYS = ("total_net_worth", "total_vat", "total_gross_worth")


def normalise(parse: dict) -> dict:
    """48 rows use {header, items, summary}; two are flattened with only the first line item labelled.
    We keep their header and totals, and mark their line items as incomplete so they are not scored."""
    if "header" in parse:
        return {**parse, "items_complete": True}
    flat = parse.get("None", parse)
    header = {k: v for k, v in flat.items() if k not in ITEM_KEYS + SUMMARY_KEYS}
    return {
        "header": header,
        "items": [{k: flat[k] for k in ITEM_KEYS if k in flat}],
        "summary": {k: flat[k] for k in SUMMARY_KEYS if k in flat},
        "items_complete": False,
    }


def amount(s: str | None) -> float | None:
    """'$ 1 234,56' -> 1234.56 (European decimal comma, space thousands)."""
    if not s:
        return None
    s = re.sub(r"[^\d,.]", "", s)
    s = s.replace(".", "").replace(",", ".") if "," in s and s.rfind(",") > s.rfind(".") else s.replace(",", "")
    try:
        return float(s)
    except ValueError:
        return None


def alnum(s: str | None) -> str:
    return re.sub(r"[^0-9a-z]", "", (s or "").lower())


def words(s: str | None) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^0-9a-z ]", " ", (s or "").lower())).strip()


def iso(us_date: str) -> str | None:
    try:
        return datetime.strptime(us_date.strip(), "%m/%d/%Y").date().isoformat()
    except ValueError:
        return None


def iban_valid(iban: str | None) -> bool:
    """ISO 13616 mod-97 check: rearrange, letters to numbers, remainder must be 1."""
    s = alnum(iban).upper()
    if len(s) < 15:
        return False
    return int("".join(str(int(c, 36)) for c in s[4:] + s[:4])) % 97 == 1


def vendor_ok(pred: str, seller: str) -> bool:
    """The seller field is 'Company Name <address>'; the prediction must be that leading name."""
    p, s = words(pred), words(seller)
    if not p:
        return False
    return s.startswith(p) or SequenceMatcher(None, p, s[: len(p)]).ratio() >= 0.9


def score(cap: CapturedInvoice, gt: dict) -> dict:
    head, items, summary = gt["header"], gt.get("items") or [], gt.get("summary") or {}
    total = amount(summary.get("total_gross_worth"))
    matched = 0
    for pred, want in zip(cap.lines, items, strict=False):
        qty, price, vat = amount(want.get("item_qty")), amount(want.get("item_net_price")), amount(want.get("item_vat"))
        if (
            qty is not None
            and price is not None
            and abs(pred.qty - qty) < 0.005
            and abs(pred.unit_price - price) < 0.005
            and (vat is None or abs(pred.tax_rate - vat) < 0.005)
        ):
            matched += 1
    out = {
        "invoice_number": alnum(cap.invoice_number) == alnum(head.get("invoice_no")),
        "invoice_date": str(parse_invoice_date(cap.invoice_date_printed, cap.invoice_date, day_first=False))
        == iso(head.get("invoice_date", "")),
        "invoice_date_model_iso": cap.invoice_date == iso(head.get("invoice_date", "")),
        "vendor_name": vendor_ok(cap.vendor_name, head.get("seller", "")),
        "total": total is not None and abs(cap.total - total) <= 0.01,
        "bank_account": bool(head.get("iban")) and alnum(cap.account_number) == alnum(head.get("iban")),
        "line_count": len(cap.lines) == len(items),
        "lines": (matched, len(items)),
    }
    if not gt["items_complete"]:
        for f in LINE_FIELDS:
            out.pop(f)
    return out


async def fetch_rows(http: httpx.AsyncClient) -> list[dict]:
    r = await http.get(f"{ROWS}&offset=0&length={N}", timeout=60)
    r.raise_for_status()
    return [row["row"] for row in r.json()["rows"]]


async def image_for(http: httpx.AsyncClient, i: int, row: dict) -> bytes:
    path = CACHE / f"{SPLIT}-{i:03d}.jpg"
    if not path.exists():
        r = await http.get(row["image"]["src"], timeout=60)
        r.raise_for_status()
        path.write_bytes(r.content)
    return path.read_bytes()


async def predict(router, sem, i: int, data: bytes) -> dict:
    """One vision call per invoice; cached so re-scoring never pays twice."""
    path = CACHE / f"{SPLIT}-{i:03d}.pred.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    async with sem:
        res = await router.vision(SYSTEM, "Extract this invoice.", data, "image/jpeg", CapturedInvoice)
    out = {"value": res.value.model_dump(), "latency_ms": res.latency_ms, "cost_usd": res.cost_usd, "prompt": SYSTEM}
    path.write_text(json.dumps(out), encoding="utf-8")
    return out


async def main() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    router, sem = get_router(), asyncio.Semaphore(CONCURRENCY)
    async with httpx.AsyncClient(follow_redirects=True) as http:
        rows = await fetch_rows(http)

        async def one(i: int, row: dict) -> dict:
            gt = normalise(json.loads(row["ground_truth"])["gt_parse"])
            data = await image_for(http, i, row)
            try:
                pred = await predict(router, sem, i, data)
            except Exception as e:  # noqa: BLE001
                print(f"  #{i:02d} failed: {e}")
                return {"index": i, "error": str(e)}
            cap = CapturedInvoice(**pred["value"])
            s = score(cap, gt)
            label_error = (
                not s["bank_account"] and not iban_valid(gt["header"].get("iban")) and iban_valid(cap.account_number)
            )
            head = [k for k in s if k not in ("lines", *DIAGNOSTIC)]
            ok = sum(bool(s[k]) for k in head)
            lines = f"lines {s['lines'][0]}/{s['lines'][1]}" if "lines" in s else "lines not labelled"
            print(f"  #{i:02d} {ok}/{len(head)} fields, {lines}  {pred['latency_ms']} ms")
            return {
                "index": i,
                "latency_ms": pred["latency_ms"],
                "cost_usd": pred["cost_usd"],
                "score": s,
                "iban_label_error": label_error,
                "misses": {
                    k: {"expected": _expected(k, gt), "got": _got(k, cap)}
                    for k, v in s.items()
                    if k not in ("lines", *DIAGNOSTIC) and not v
                },
            }

        results = await asyncio.gather(*(one(i, row) for i, row in enumerate(rows)))

    done = [r for r in results if "score" in r]
    per_field = {}
    for f in FIELDS:
        scored = [r for r in done if f in r["score"]]
        if f == "lines":
            hit = sum(r["score"]["lines"][0] for r in scored)
            tot = sum(r["score"]["lines"][1] for r in scored)
        else:
            hit, tot = sum(bool(r["score"][f]) for r in scored), len(scored)
        per_field[f] = {"correct": hit, "total": tot, "accuracy": round(hit / tot, 4) if tot else None}
    for f in DIAGNOSTIC:
        hit = sum(bool(r["score"][f]) for r in done)
        per_field[f] = {"correct": hit, "total": len(done), "accuracy": round(hit / len(done), 4)}
    label_errors = sum(r["iban_label_error"] for r in done)
    b = per_field["bank_account"]
    b["label_errors"] = label_errors
    b["adjudicated_accuracy"] = round((b["correct"] + label_errors) / b["total"], 4)
    b["adjudication"] = (
        "When the extracted IBAN passes the ISO 13616 mod-97 checksum and the dataset's label fails it, the label "
        "is wrong (an OCR slip such as S read as 5, or a repeated digit run); we count those as correct."
    )
    header = ("invoice_number", "invoice_date", "vendor_name", "total")
    all_header = sum(all(r["score"][f] for f in header) for r in done)
    lat = sorted(r["latency_ms"] for r in done)
    report = {
        "dataset": f"{DATASET} ({SPLIT} split)",
        "source": f"https://huggingface.co/datasets/{DATASET}",
        "model": router.gemini_vision_model,
        "system_prompt": SYSTEM,
        "invoices": len(rows),
        "extracted": len(done),
        "note": "Two rows have flattened ground truth that labels only the first line item; their header "
        "fields and totals are scored, their line items are not.",
        "failed": len(rows) - len(done),
        "fields": per_field,
        "all_key_fields_correct": {
            "fields": list(header),
            "invoices": all_header,
            "rate": round(all_header / len(done), 4),
        },
        "latency_ms": {
            "p50": lat[len(lat) // 2],
            "p95": lat[int(len(lat) * 0.95) - 1],
            "mean": round(statistics.mean(lat)),
        },
        "cost_usd": {
            "total": round(sum(r["cost_usd"] or 0 for r in done), 5),
            "per_invoice": round(sum(r["cost_usd"] or 0 for r in done) / len(done), 6),
        },
        "misses": [{"index": r["index"], **r["misses"]} for r in done if r["misses"]],
        "errors": [r for r in results if "error" in r],
    }
    OUT.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print(json.dumps({k: report[k] for k in ("fields", "all_key_fields_correct", "latency_ms", "cost_usd")}, indent=2))


def _expected(field: str, gt: dict) -> str | None:
    h, items = gt["header"], gt.get("items") or []
    return {
        "invoice_number": h.get("invoice_no"),
        "invoice_date": h.get("invoice_date"),
        "vendor_name": h.get("seller"),
        "total": (gt.get("summary") or {}).get("total_gross_worth"),
        "bank_account": h.get("iban"),
        "line_count": str(len(items)),
    }.get(field)


def _got(field: str, cap: CapturedInvoice) -> str | None:
    return {
        "invoice_number": cap.invoice_number,
        "invoice_date": f"{cap.invoice_date_printed} -> {cap.invoice_date}",
        "vendor_name": cap.vendor_name,
        "total": str(cap.total),
        "bank_account": cap.account_number,
        "line_count": str(len(cap.lines)),
    }.get(field)


if __name__ == "__main__":
    asyncio.run(main())
