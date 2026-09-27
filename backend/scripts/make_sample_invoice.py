"""Render realistic GST tax invoices (PNG) for the invoice-capture demo.

Each bills a real Shree Balaji Steel purchase order from the dataset, with the vendor's
real GSTIN and bank account, plus the usual freight line. Balaji is above the Rs 5 crore
e-invoicing threshold, so a valid invoice carries an IRN.

  invoice-balaji-freight.png    valid e-invoice; after Week 8 it is auto-resolved
  invoice-balaji-no-irn.png     no IRN printed -> held (not a valid tax invoice)
  invoice-balaji-bad-gstin.png  GSTIN altered by one character -> escalated (possible impersonation)

Run: uv run python -m scripts.make_sample_invoice
"""

import random
from datetime import date
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from app.config import get_settings
from app.data.catalog import BUYER
from app.data.generator import generate, make_gstin, make_irn, money

OUT = Path(__file__).resolve().parents[2] / "docs" / "samples"
FONT_DIR = Path("C:/Windows/Fonts")

VARIANTS = {
    # file stem: (invoice number, freight amount, print IRN?, tamper GSTIN?)
    "invoice-balaji-freight": ("SBST/2627/0612", 3700.0, True, False),
    "invoice-balaji-no-irn": ("SBST/2627/0618", 3900.0, False, False),
    "invoice-balaji-bad-gstin": ("SBST/2627/0621", 4100.0, True, True),
}


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


def tamper(gstin: str) -> str:
    """Change one character of the PAN part: looks right to the eye, fails the checksum."""
    return gstin[:9] + ("7" if gstin[9] != "7" else "8") + gstin[10:]


def render(
    vendor: dict, po: dict, buyer_gstin: str, inv_no: str, freight: float, with_irn: bool, bad_gstin: bool
) -> tuple[Image.Image, float]:
    inv_date = date(2026, 4, 27)
    gstin = tamper(vendor["gstin"]) if bad_gstin else vendor["gstin"]
    lines = [dict(l) for l in po["lines"]]
    lines.append(
        {
            "line_no": len(lines) + 1,
            "description": "Freight charges - Medchal to Unit 2",
            "hsn": "996511",
            "qty": 1,
            "uom": "Trip",
            "unit_price": freight,
            "tax_rate": 18,
            "amount": freight,
        }
    )
    taxable = money(sum(l["amount"] for l in lines))
    cgst = sgst = money(taxable * 0.09)
    total = money(taxable + cgst + sgst)

    W, H = 1240, 1754  # A4 @150dpi
    img = Image.new("RGB", (W, H), (252, 251, 247))
    d = ImageDraw.Draw(img)
    b, r, sm, big = font("arialbd.ttf", 22), font("arial.ttf", 20), font("arial.ttf", 17), font("arialbd.ttf", 34)
    ink, grey, line_c = (25, 25, 30), (90, 90, 95), (60, 60, 70)

    d.text((60, 50), vendor["name"].upper(), font=big, fill=ink)
    d.text((60, 98), "Plot 14, IDA Medchal, Hyderabad, Telangana - 501401", font=r, fill=grey)
    d.text((60, 126), f"GSTIN: {gstin}    State: Telangana (36)    PAN: {gstin[2:12]}", font=r, fill=ink)
    d.text((W - 360, 50), "TAX INVOICE", font=font("arialbd.ttf", 38), fill=(150, 30, 30))
    d.text(
        (W - 360, 98),
        "e-Invoice · Original for Recipient" if with_irn else "Original for Recipient",
        font=sm,
        fill=grey,
    )
    d.line((60, 170, W - 60, 170), fill=line_c, width=3)

    y0 = 190
    if with_irn:
        irn = make_irn(vendor["gstin"], inv_no, inv_date)
        d.text((60, y0), f"IRN: {irn}", font=sm, fill=ink)
        d.text((60, y0 + 26), f"Ack No.: 1126{inv_no[-4:]}0072941   Ack Date: {inv_date:%d-%m-%Y}", font=sm, fill=grey)
        y0 += 64

    d.text((60, y0), "Bill To / Ship To", font=b, fill=ink)
    d.text((60, y0 + 32), BUYER["name"], font=r, fill=ink)
    d.text((60, y0 + 60), "Unit 2, Phase II, IDA Cherlapally, Hyderabad, Telangana - 500051", font=sm, fill=grey)
    d.text((60, y0 + 86), f"GSTIN: {buyer_gstin}", font=sm, fill=ink)
    meta = [
        ("Invoice No.", inv_no),
        ("Invoice Date", inv_date.strftime("%d-%m-%Y")),
        ("Buyer PO No.", po["po_number"]),
        ("Place of Supply", "Telangana (36)"),
        ("Payment Terms", "45 days"),
    ]
    for i, (k, v) in enumerate(meta):
        d.text((W - 470, y0 + i * 30), f"{k}:", font=sm, fill=grey)
        d.text((W - 300, y0 + i * 30), v, font=b if k == "Invoice No." else r, fill=ink)
    y = y0 + 160
    d.line((60, y, W - 60, y), fill=line_c, width=2)

    cols = [
        (60, "#"),
        (100, "Description of Goods / Services"),
        (560, "HSN/SAC"),
        (680, "Qty"),
        (770, "Unit"),
        (860, "Rate (Rs)"),
        (1010, "Taxable (Rs)"),
    ]
    y += 12
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
    d.text((60, y), "Bank Details for Payment", font=b, fill=ink)
    d.text(
        (60, y + 34),
        f"Bank: {vendor['bank_name']}   A/c No: 50200011{vendor['account_number'][-4:]}   IFSC: {vendor['ifsc']}",
        font=r,
        fill=ink,
    )
    d.text((60, y + 64), "Freight billed separately as per standing arrangement. E. & O.E.", font=sm, fill=grey)
    d.text((W - 420, y + 150), f"For {vendor['name'].split(' Pvt')[0]}", font=r, fill=ink)
    d.text((W - 420, y + 230), "Authorised Signatory", font=sm, fill=grey)
    return img, total


def main() -> None:
    s = get_settings()
    ds = generate(s.seed, s.sim_start, s.sim_days)
    vendor = next(v for v in ds.vendors if v["id"] == "V001")
    pos = {p["po_number"]: p for p in ds.pos}
    later = [
        i
        for i in ds.invoices
        if i["vendor_id"] == "V001" and i["po_number"] and (i["arrival_date"] - s.sim_start).days >= 65
    ]
    po = max((pos[i["po_number"]] for i in later), key=lambda p: p["subtotal"])  # typical freight share
    buyer_gstin = make_gstin(random.Random(7), BUYER["state_code"], BUYER["name"], "C")
    OUT.mkdir(parents=True, exist_ok=True)
    for stem, (number, freight, with_irn, bad) in VARIANTS.items():
        img, total = render(vendor, po, buyer_gstin, number, freight, with_irn, bad)
        path = OUT / f"{stem}.png"
        img.save(path)
        print(f"wrote {path.name}  (PO {po['po_number']}, total Rs {inr(total)})")


if __name__ == "__main__":
    main()
