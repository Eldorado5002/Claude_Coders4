from datetime import date

import pytest

from app.data.generator import generate, gstin_checksum
from app.matching.engine import MatchInput, match_invoice
from app.schemas import ExceptionType

SEED, START, DAYS = 20260302, date(2026, 3, 2), 182


@pytest.fixture(scope="module")
def ds():
    return generate(SEED, START, DAYS)


def run_engine(ds):
    vendors = {v["id"]: v for v in ds.vendors}
    pos = {p["po_number"]: p for p in ds.pos}
    grns = {g["po_number"]: g for g in ds.grns}
    seen: dict[str, list[dict]] = {}
    out = []
    for inv in ds.invoices:  # already in arrival order
        prior = seen.setdefault(inv["vendor_id"], [])
        res = match_invoice(
            MatchInput(
                invoice=inv,
                vendor=vendors[inv["vendor_id"]],
                po=pos.get(inv["po_number"]),
                grn=grns.get(inv["po_number"]),
                prior_invoices=list(prior),
            )
        )
        out.append((inv, res))
        prior.append(inv)
    return out


def test_engine_detects_exactly_what_generator_injected(ds):
    mismatches = []
    for inv, res in run_engine(ds):
        expected = set(inv["truth"]["expected_types"])
        got = {t.value for t in res.types}
        if expected != got:
            mismatches.append((inv["id"], inv["vendor_id"], sorted(expected), sorted(got), inv["truth"]["scenario"]))
    assert not mismatches, "\n".join(map(str, mismatches[:20]))


def test_generation_is_deterministic():
    a = generate(SEED, START, DAYS)
    b = generate(SEED, START, DAYS)
    assert [i["total"] for i in a.invoices] == [i["total"] for i in b.invoices]
    assert [v["gstin"] for v in a.vendors] == [v["gstin"] for v in b.vendors]


def test_gstin_checksum_valid(ds):
    for v in ds.vendors:
        g = v["gstin"]
        assert len(g) == 15 and g[:2] == v["state_code"] and g[13] == "Z"
        assert gstin_checksum(g[:14]) == g[14]


def test_known_gstin_checksum():
    # Publicly documented sample GSTIN format check
    assert gstin_checksum("27AAPFU0939F1Z") == "V"


def test_demo_storyline(ds):
    balaji = [i for i in ds.invoices if i["vendor_id"] == "V001"]
    day = {(i["arrival_date"] - START).days: i for i in balaji if i["truth"]["scenario"] != "duplicate"}
    assert day[0]["truth"]["expected_types"] == ["freight_charge"] and day[0]["truth"]["decision"] == "approve"
    assert day[16]["truth"]["decision"] == "approve"
    assert day[23]["truth"]["decision"] == "hold"  # freight above the ₹5,000 cap
    assert day[51]["truth"]["decision"] == "approve"
    twist = [i for i in balaji if (i["arrival_date"] - START).days == 56]
    kinds = sorted(i["truth"]["scenario"] for i in twist)
    assert kinds == ["bank_change", "duplicate"]
    dup = next(i for i in twist if i["truth"]["scenario"] == "duplicate")
    assert dup["invoice_number"] == day[16]["invoice_number"]


def test_hard_controls_present(ds):
    types = {t for i in ds.invoices for t in i["truth"]["expected_types"]}
    for t in (
        ExceptionType.DUPLICATE_INVOICE,
        ExceptionType.BANK_DETAILS_CHANGED,
        ExceptionType.NEW_VENDOR,
        ExceptionType.OVER_THRESHOLD,
    ):
        assert t.value in types


def test_only_intended_invoices_cross_threshold(ds):
    over = [i for i in ds.invoices if i["total"] > 500_000]
    assert all("over_threshold" in i["truth"]["expected_types"] for i in over)
    assert all(i["vendor_id"] == "V002" for i in over)
