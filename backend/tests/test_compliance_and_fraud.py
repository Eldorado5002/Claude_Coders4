import math
import random
from datetime import date

import pytest

from app.config import get_settings
from app.data.generator import generate, gstin_checksum, make_irn
from app.guardrails.controls import (
    _transposed,
    find_duplicate,
    gstin_valid,
    invoice_digits,
    normalize_invoice_number,
)
from app.matching.engine import MatchInput, match_invoice
from app.ml.benford import EXPECTED, benford
from app.services.compliance import CORPORATE_TAX_RATE, msme_note, msme_status


def inv(number, total=1000.0, d=date(2026, 4, 1), po="PO-1", **kw):
    return {
        "id": kw.pop("id", "INV-X"),
        "invoice_number": number,
        "total": total,
        "invoice_date": d,
        "arrival_date": d,
        "po_number": po,
        **kw,
    }


# ---------------------------------------------------------------- duplicates


def test_invoice_number_normalisation():
    assert normalize_invoice_number("CIS/2526/0423") == normalize_invoice_number("cis-2526-423")
    assert invoice_digits("ILW/2627/0820-R") == invoice_digits("ILW/2627/0820")
    assert _transposed("26270820", "26270802") and not _transposed("26271123", "26271128")


@pytest.mark.parametrize(
    ("new", "prior", "flag"),
    [
        (inv("CIS-2526-423", d=date(2026, 4, 20)), inv("CIS/2526/0423", id="A"), True),  # reformatted
        (inv("ILW/2627/0820-R", d=date(2026, 4, 15)), inv("ILW/2627/0820", id="A"), True),  # suffix
        (inv("ILW/2627/0802", d=date(2026, 4, 10)), inv("ILW/2627/0820", id="A"), True),  # digits swapped
        (inv("DFC/2627/1241", d=date(2026, 5, 11)), inv("DFC/2627/1234", id="A", d=date(2026, 5, 11)), True),
        (
            inv("DFC/2627/1241", d=date(2026, 5, 11), po="PO-2"),
            inv("DFC/2627/1234", id="A", d=date(2026, 5, 11)),
            False,
        ),  # same amount + date but a different PO: two real orders
        (inv("HK/2627/0112", d=date(2026, 5, 1)), inv("HK/2627/0104", id="A", d=date(2026, 4, 1)), False),
        (inv("ILW/2627/0820-R", total=999.0, d=date(2026, 4, 15)), inv("ILW/2627/0820", id="A"), False),
    ],
)
def test_duplicate_rules(new, prior, flag):
    assert (find_duplicate(new, [prior]) is not None) is flag


# ---------------------------------------------------------------- GSTIN & e-invoice


def test_gstin_checksum_validation():
    ds = generate(20260302, date(2026, 3, 2), 182)
    for v in ds.vendors:
        assert gstin_valid(v["gstin"])
        tampered = v["gstin"][:14] + ("A" if v["gstin"][14] != "A" else "B")
        assert not gstin_valid(tampered)
    assert gstin_checksum("27AAPFU0939F1Z") == "V" and gstin_valid("27AAPFU0939F1ZV")


def _vendor(**profile):
    return {
        "id": "V1",
        "gstin": "27AAPFU0939F1ZV",
        "bank_name": "HDFC",
        "account_number": "XXXXXX1234",
        "ifsc": "HDFC0001234",
        "onboarded_on": date(2020, 1, 1),
        "profile": profile,
    }


def _invoice(**kw):
    base = {
        "id": "INV-1",
        "invoice_number": "A/1",
        "total": 118.0,
        "invoice_date": date(2026, 4, 1),
        "arrival_date": date(2026, 4, 1),
        "po_number": None,
        "account_number": "XXXXXX1234",
        "ifsc": "HDFC0001234",
        "bank_name": "HDFC",
        "supplier_gstin": "27AAPFU0939F1ZV",
        "irn": None,
        "lines": [
            {
                "line_no": 1,
                "sku": None,
                "description": "x",
                "qty": 1,
                "uom": "Nos",
                "unit_price": 100.0,
                "tax_rate": 18,
                "amount": 100.0,
            }
        ],
    }
    return {**base, **kw}


def test_einvoice_control_needs_a_valid_irn():
    types = lambda i, v: {t.value for t in match_invoice(MatchInput(invoice=i, vendor=v)).types}  # noqa: E731
    assert "einvoice_missing" in types(_invoice(), _vendor(e_invoice=True))
    assert "einvoice_missing" in types(_invoice(irn="not-an-irn"), _vendor(e_invoice=True))
    ok_irn = make_irn("27AAPFU0939F1ZV", "A/1", date(2026, 4, 1))
    assert "einvoice_missing" not in types(_invoice(irn=ok_irn), _vendor(e_invoice=True))
    assert "einvoice_missing" not in types(_invoice(), _vendor(e_invoice=False))


def test_gstin_control_catches_tampering_and_impersonation():
    types = lambda i: {t.value for t in match_invoice(MatchInput(invoice=i, vendor=_vendor())).types}  # noqa: E731
    assert "invalid_gstin" in types(_invoice(supplier_gstin="27AAPFU0939F1ZX"))  # checksum fails
    assert "invalid_gstin" in types(_invoice(supplier_gstin="36AAECS4821K1Z3"))  # someone else's GSTIN
    assert "invalid_gstin" not in types(_invoice())


# ---------------------------------------------------------------- MSME 43B(h)


def test_msme_deadline_and_tax_at_risk():
    profile = {"msme": {"category": "micro", "udyam": "UDYAM-TS-02-0077310", "agreement_days": 45}}
    invoice = {"invoice_date": date(2026, 4, 20), "subtotal": 100_000.0}
    grn = {"received_date": date(2026, 4, 1)}
    m = msme_status(profile, invoice, grn, today=date(2026, 5, 10), terms_days=30)
    assert m.limit_days == 45 and m.deadline == date(2026, 5, 16) and m.days_left == 6 and m.status == "due_soon"
    assert m.tax_at_risk == pytest.approx(100_000 * CORPORATE_TAX_RATE)
    assert "43B(h)" in msme_note(m)
    no_agreement = {"msme": {**profile["msme"], "agreement_days": None}}
    late = msme_status(no_agreement, invoice, grn, today=date(2026, 5, 10), terms_days=30)
    assert late.limit_days == 15 and late.status == "breached" and late.terms_exceed_limit
    assert msme_status({"msme": {"category": "medium"}}, invoice, grn, date(2026, 5, 10), 30) is None
    assert msme_status({}, invoice, grn, date(2026, 5, 10), 30) is None


# ---------------------------------------------------------------- Benford & data realism


def test_benford_conformity_levels():
    rng = random.Random(1)
    natural = [10 ** rng.uniform(2, 7) for _ in range(5000)]  # log-uniform -> Benford
    assert benford(natural)["conformity"] in ("close", "acceptable")
    fabricated = [rng.choice([5000, 7500, 9000, 6000]) + rng.randint(0, 99) for _ in range(500)]
    assert benford(fabricated)["conformity"] == "nonconformity"
    assert benford([123.0] * 10)["conformity"] == "insufficient data"
    assert sum(EXPECTED) == pytest.approx(1.0) and EXPECTED[0] == pytest.approx(math.log10(2))


def test_dataset_matches_industry_benchmarks():
    s = get_settings()
    ds = generate(s.seed, s.sim_start, s.sim_days)
    exc = [i for i in ds.invoices if i["truth"]["expected_types"]]
    assert 0.22 <= len(exc) / len(ds.invoices) <= 0.28  # Ardent Partners: 23% of invoices are exceptions
    lines = [l["amount"] for i in ds.invoices for l in i["lines"]]
    assert benford(lines)["conformity"] in ("close", "acceptable")
    irn = [i for i in ds.invoices if i["irn"]]
    assert irn and all(len(i["irn"]) == 64 for i in irn)


# ---------------------------------------------------------------- API


def test_risk_benford_and_compliance_endpoints(env):
    import asyncio

    from fastapi.testclient import TestClient

    from app.main import app
    from app.services.cases import get_cases

    with TestClient(app) as client:
        svc = get_cases()
        s = get_settings()
        trap = next(
            i
            for i in generate(s.seed, s.sim_start, s.sim_days).invoices
            if i["truth"]["scenario"] == "einvoice_missing"
        )
        last_day = (trap["arrival_date"] - s.sim_start).days
        for day in range(1, last_day + 1):
            for cid in svc.process_arrivals(day):
                asyncio.run(svc.recommend_case(cid))
        risk = client.get("/api/risk").json()
        assert risk[0]["risk"]["score"] >= risk[-1]["risk"]["score"]
        top = {r["vendor"]["id"]: r["risk"] for r in risk}
        assert top["V013"]["level"] in ("medium", "high")  # attempted bank change
        assert any("bank account" in reason for reason in top["V013"]["reasons"])

        ben = client.get("/api/benford").json()
        assert ben["n"] > 50 and len(ben["observed"]) == 9

        vendors = {v["id"]: v for v in client.get("/api/vendors").json()}
        assert vendors["V015"]["msme_category"] == "micro" and vendors["V001"]["e_invoice_required"]
        assert vendors["V013"]["risk_level"] in ("medium", "high")

        page = client.get("/api/exceptions", params={"status": "open", "sort": "msme_deadline"}).json()
        days = [x["msme_days_left"] for x in page["items"] if x["msme_days_left"] is not None]
        assert days == sorted(days)

        einv = client.get("/api/exceptions", params={"status": "all", "type": "einvoice_missing"}).json()
        assert einv["total"] == 1
        d = client.get(f"/api/exceptions/{einv['items'][0]['id']}").json()
        assert d["compliance"]["e_invoice"] == {"required": True, "irn_present": False}
        assert d["recommendation"]["action"] == "hold" and d["recommendation"]["source"] == "guardrail"

        kpis = client.get("/api/metrics").json()["kpis"]
        assert "msme_open_at_risk" in kpis and "msme_tax_at_risk" in kpis


def test_captured_dates_are_parsed_with_the_locale():
    from app.services.capture import parse_invoice_date

    # the model said November 4th; an Indian invoice printing 04/11/2026 means 4 November, a US one 11 April
    assert parse_invoice_date("04/11/2026", "2026-11-04") == date(2026, 11, 4)
    assert parse_invoice_date("04/11/2026", "2026-11-04", day_first=False) == date(2026, 4, 11)
    assert parse_invoice_date("25/03/26", "2026-03-25", day_first=False) == date(2026, 3, 25)  # unambiguous
    assert parse_invoice_date("4 Nov 2026", "2026-11-04") == date(2026, 11, 4)  # words: trust the model
    assert parse_invoice_date(None, "not a date") is None
