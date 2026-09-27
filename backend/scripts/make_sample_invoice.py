"""Render a realistic GST tax invoice (PNG) for the invoice-capture demo.

It bills a real Shree Balaji Steel purchase order from the dataset, with the vendor's
real GSTIN and bank account, plus the usual freight line — so after the demo has
reached Week 8 (freight autonomy earned), capturing it can be auto-resolved.

Run: uv run python -m scripts.make_sample_invoice
"""

from datetime import date
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from app.config import get_settings
from app.data.catalog import BUYER
from app.data.generator import generate, make_gstin, money

OUT = Path(__file__).resolve().parents[2] / "docs" / "samples"
FONT_DIR = Path("C:/Windows/Fonts")


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    for candidate in (FONT_DIR / name, Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")):
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default(size)


def inr(x: float) -> str:
    s = f"{x:,.2f}"
    whole, frac = s.split(".")
    digits = whole.replace(",", "")
    if len(digits) > 3:  # Indian grouping 12,34,567.89
        head, tail = digits[:-3], digits[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        whole = ",".join(groups) + "," + tail
    return f"{whole}.{frac}"


def main() -> None:
    s = get_settings()
    ds = generate(s.seed, s.sim_start, s.sim_days)
    vendor = next(v for v in ds.vendors if v["id"] == "V001")
    # a Balaji PO billed after the demo's twist stage
    pos = {p["po_number"]: p for p in ds.pos}
    later = [
        i
        for i in ds.invoices
        if i["vendor_id"] == "V001" and i["po_number"] and (i["arrival_date"] - s.sim_start).days >= 65
    ]
    po = pos[later[0]["po_number"]]

    import random

    buyer_gstin = make_gstin(random.Random(7), BUYER["state_code"], BUYER["name"], "C")
    lines = [dict(l) for l in po["lines"]]
    lines.append(
        {
            "line_no": len(lines) + 1,
            "description": "Freight charges - Medchal to Unit 2",
            "hsn": "996511",
            "qty": 1,
            "uom": "Trip",
            "unit_price": 3700.0,
            "tax_rate": 18,
            "amount": 3700.0,
        }
    )
    taxable = money(sum(l["amount"] for l in lines))
    cgst = sgst = money(taxable * 0.09)
    total = money(taxable + cgst + sgst)
    inv_no, inv_date = "SBST/2627/0612", date(2026, 4, 27)

    W, H = 1240, 1754  # A4 @150dpi
    img = Image.new("RGB", (W, H), (252, 251, 247))
    d = ImageDraw.Draw(img)
    b, r, sm, big = font("arialbd.ttf", 22), font("arial.ttf", 20), font("arial.ttf", 17), font("arialbd.ttf", 34)
    ink, grey, line_c = (25, 25, 30), (90, 90, 95), (60, 60, 70)

    d.text((60, 50), vendor["name"].upper(), font=big, fill=ink)
    d.text((60, 98), "Plot 14, IDA Medchal, Hyderabad, Telangana - 501401", font=r, fill=grey)
    d.text(
        (60, 126),
        f"GSTIN: {vendor['gstin']}    State: Telangana (36)    PAN: {vendor['gstin'][2:12]}",
        font=r,
        fill=ink,
    )
    d.text((W - 360, 50), "TAX INVOICE", font=font("arialbd.ttf", 38), fill=(150, 30, 30))
    d.text((W - 360, 98), "Original for Recipient", font=sm, fill=grey)
    d.line((60, 170, W - 60, 170), fill=line_c, width=3)

    d.text((60, 190), "Bill To / Ship To", font=b, fill=ink)
    d.text((60, 222), BUYER["name"], font=r, fill=ink)
    d.text((60, 250), "Unit 2, Phase II, IDA Cherlapally, Hyderabad, Telangana - 500051", font=sm, fill=grey)
    d.text((60, 276), f"GSTIN: {buyer_gstin}", font=sm, fill=ink)
    meta = [
        ("Invoice No.", inv_no),
        ("Invoice Date", inv_date.strftime("%d-%m-%Y")),
        ("Buyer PO No.", po["po_number"]),
        ("Place of Supply", "Telangana (36)"),
        ("Payment Terms", "45 days"),
    ]
    for i, (k, v) in enumerate(meta):
        d.text((W - 470, 190 + i * 30), f"{k}:", font=sm, fill=grey)
        d.text((W - 300, 190 + i * 30), v, font=b if k == "Invoice No." else r, fill=ink)
    d.line((60, 350, W - 60, 350), fill=line_c, width=2)

    cols = [
        (60, "#"),
        (100, "Description of Goods / Services"),
        (560, "HSN/SAC"),
        (680, "Qty"),
        (770, "Unit"),
        (860, "Rate (Rs)"),
        (1010, "Taxable (Rs)"),
    ]
    y = 362
    d.rectangle((60, y - 4, W - 60, y + 30), fill=(232, 232, 226))
    for x, t in cols:
        d.text((x + 4, y), t, font=b, fill=ink)
    y += 44
    for l in lines:
        row = [
            str(l["line_no"]),
            l["description"],
            l["hsn"],
            f"{l['qty']:g}",
            l["uom"],
            inr(l["unit_price"]),
            inr(l["amount"]),
        ]
        for (x, _), t in zip(cols, row, strict=True):
            d.text((x + 4, y), t, font=r, fill=ink)
        y += 40
        d.line((60, y - 8, W - 60, y - 8), fill=(210, 210, 205), width=1)

    y += 20
    for k, v in [("Total Taxable Value", taxable), ("CGST @ 9%", cgst), ("SGST @ 9%", sgst)]:
        d.text((760, y), k, font=r, fill=ink)
        d.text((1010, y), inr(v), font=r, fill=ink)
        y += 34
    d.line((760, y, W - 60, y), fill=line_c, width=2)
    d.text((760, y + 10), "Grand Total (Rs)", font=b, fill=ink)
    d.text((1010, y + 10), inr(total), font=b, fill=ink)

    y += 90
    acct_last4 = vendor["account_number"][-4:]
    d.text((60, y), "Bank Details for Payment", font=b, fill=ink)
    d.text(
        (60, y + 34),
        f"Bank: {vendor['bank_name']}   A/c No: 50200011{acct_last4}   IFSC: {vendor['ifsc']}",
        font=r,
        fill=ink,
    )
    d.text((60, y + 64), "Freight billed separately as per standing arrangement. E. & O.E.", font=sm, fill=grey)
    d.text((W - 420, y + 150), f"For {vendor['name'].split(' Pvt')[0]}", font=r, fill=ink)
    d.text((W - 420, y + 230), "Authorised Signatory", font=sm, fill=grey)

    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / "invoice-balaji-freight.png"
    img.save(path)
    print(f"wrote {path}  (PO {po['po_number']}, total Rs {inr(total)})")


if __name__ == "__main__":
    main()
