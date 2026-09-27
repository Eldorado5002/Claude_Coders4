"""README diagrams as fixed SVGs (light + dark), readable without zooming.

Run: uv run python -m scripts.make_diagrams
"""

from html import escape
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "docs" / "assets"
FONT = "Segoe UI, -apple-system, BlinkMacSystemFont, Helvetica Neue, Helvetica, Arial, sans-serif"
NL = "\n"

THEMES = {
    "light": {
        "surface": "#fcfcfb",
        "border": "#e1e0d9",
        "node": "#ffffff",
        "stroke": "#d0d7de",
        "text": "#1f2328",
        "text2": "#57606a",
        "arrow": "#8c959f",
        "accent": "#2a78d6",
        "accent_fill": "#eaf2fc",
        "good": "#1a7f37",
        "good_fill": "#eef8f1",
        "bad": "#cf222e",
        "bad_fill": "#fdf1f1",
        "lane": "#e1e0d9",
        "note": "#fff8e5",
        "note_stroke": "#e3c878",
    },
    "dark": {
        "surface": "#1a1a19",
        "border": "#2c2c2a",
        "node": "#232322",
        "stroke": "#3d3d3a",
        "text": "#f0f0ee",
        "text2": "#b3b2ab",
        "arrow": "#7d7c76",
        "accent": "#3987e5",
        "accent_fill": "#15263b",
        "good": "#3fb950",
        "good_fill": "#13261a",
        "bad": "#f85149",
        "bad_fill": "#2e1716",
        "lane": "#2f2f2d",
        "note": "#2b2616",
        "note_stroke": "#6b5a24",
    },
}


def wrap(text: str, width: int) -> list[str]:
    """Word-wrap to `width` characters; an explicit newline always starts a new line."""
    if NL in text:
        return [line for part in text.split(NL) for line in wrap(part, width)]
    lines, cur = [], ""
    for word in text.split():
        if cur and len(cur) + 1 + len(word) > width:
            lines.append(cur)
            cur = word
        else:
            cur = f"{cur} {word}".strip()
    if cur:
        lines.append(cur)
    return lines


class Svg:
    def __init__(self, w: int, h: int, t: dict, title: str, desc: str):
        self.w, self.h, self.t = w, h, t
        self.parts = [
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="{FONT}" role="img" aria-labelledby="t d">',
            f'<title id="t">{escape(title)}</title><desc id="d">{escape(desc)}</desc>',
            "<defs>"
            f'<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">'
            f'<path d="M0,0 L10,5 L0,10 z" fill="{t["arrow"]}"/></marker>'
            f'<marker id="aa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">'
            f'<path d="M0,0 L10,5 L0,10 z" fill="{t["accent"]}"/></marker>'
            "</defs>",
            f'<rect x="0.5" y="0.5" width="{w - 1}" height="{h - 1}" rx="12" fill="{t["surface"]}" '
            f'stroke="{t["border"]}"/>',
        ]

    def add(self, s: str) -> None:
        self.parts.append(s)

    def text(self, x, y, s, size=14, weight=400, color="text", anchor="start") -> None:
        self.add(
            f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{self.t[color]}" '
            f'text-anchor="{anchor}">{escape(s)}</text>'
        )

    def badge(self, cx, cy, n) -> None:
        t = self.t
        self.add(f'<circle cx="{cx}" cy="{cy}" r="12" fill="{t["accent"]}" stroke="{t["surface"]}" stroke-width="3"/>')
        self.text(cx, cy + 4.5, str(n), size=12.5, weight=700, color="surface", anchor="middle")

    def box(self, x, y, w, h, title, body="", kind="node", badge=None, chars=24) -> None:
        t = self.t
        fill, stroke = {
            "node": (t["node"], t["stroke"]),
            "accent": (t["accent_fill"], t["accent"]),
            "good": (t["good_fill"], t["good"]),
            "bad": (t["bad_fill"], t["bad"]),
            "note": (t["note"], t["note_stroke"]),
        }[kind]
        width = 2 if kind in ("accent", "good", "bad") else 1.2
        self.add(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{fill}" stroke="{stroke}" '
            f'stroke-width="{width}"/>'
        )
        lines = wrap(body, chars) if body else []
        block = 20 + 18 * len(lines)
        ty = y + (h - block) / 2 + 15
        cx = x + w / 2
        if title:
            self.text(cx, ty, title, size=16, weight=600, anchor="middle")
        for i, line in enumerate(lines):
            self.text(cx, ty + 22 + 18 * i, line, size=13.5, color="text2", anchor="middle")
        if badge is not None:
            self.badge(x + 2, y + 2, badge)  # on the corner, clear of the title

    def arrow(self, pts, accent=False, dashed=False) -> None:
        d = " ".join(f"{'M' if i == 0 else 'L'}{x},{y}" for i, (x, y) in enumerate(pts))
        color = self.t["accent"] if accent else self.t["arrow"]
        dash = ' stroke-dasharray="6 5"' if dashed else ""
        self.add(
            f'<path d="{d}" fill="none" stroke="{color}" stroke-width="2"{dash} stroke-linejoin="round" '
            f'marker-end="url(#{"aa" if accent else "a"})"/>'
        )

    def label(self, x, y, s, color="text2", anchor="middle", size=13, weight=400) -> None:
        self.text(x, y, s, size=size, color=color, anchor=anchor, weight=weight)

    def render(self) -> str:
        return NL.join([*self.parts, "</svg>"]) + NL


# ---------------------------------------------------------------- 1. the loop


def loop(t: dict) -> str:
    s = Svg(
        960,
        290,
        t,
        "What Precedent does",
        "Invoice arrives, 3-way match, recall precedent from Hindsight, recommend with proof, a clerk or the agent "
        "decides, and the decision is retained as a lesson that improves the next recall.",
    )
    cards = [
        ("Invoice arrives", f"from the ERP, or as{NL}a phone photo", "node"),
        ("3-way match", f"invoice vs purchase{NL}order vs goods receipt", "node"),
        ("Recall precedent", f"Hindsight: how did we{NL}handle this before?", "accent"),
        ("Recommend", f"a decision, with the{NL}past cases as proof", "node"),
        ("Decide", f"the clerk decides, or{NL}the agent auto-resolves", "node"),
    ]
    x, y, w, h, gap = 24, 40, 160, 112, 30
    xs = [x + i * (w + gap) for i in range(len(cards))]
    for i, (title, body, kind) in enumerate(cards):
        s.box(xs[i], y, w, h, title, body, kind=kind, badge=i + 1)
        if i:
            s.arrow([(xs[i] - gap + 3, y + h / 2), (xs[i] - 3, y + h / 2)])
    ly = 204
    s.arrow(
        [(xs[4] + w / 2, y + h + 3), (xs[4] + w / 2, ly), (xs[2] + w / 2, ly), (xs[2] + w / 2, y + h + 7)],
        accent=True,
    )
    s.label(
        (xs[2] + xs[4] + w) / 2,
        ly + 28,
        "Learn: the decision and its reason become memory",
        color="accent",
        size=14.5,
        weight=600,
    )
    s.label(
        24,
        272,
        "Every loop makes the next recommendation better; nothing is ever re-learned from scratch.",
        anchor="start",
    )
    return s.render()


# ---------------------------------------------------------------- 2. the pipeline


def pipeline(t: dict) -> str:
    s = Svg(
        960,
        470,
        t,
        "How an invoice flows through Precedent",
        "Invoice in, 3-way match (clean invoices are paid), hard controls (fired controls go to reject or escalate), "
        "Hindsight memory (a recall fast path for routine cases, reflect otherwise) plus an anomaly check, earned "
        "autonomy decides between auto-resolve and the clerk, and every decision is retained in Hindsight, which "
        "feeds the next recommendation.",
    )
    w, h, y, gap = 160, 122, 152, 28
    xs = [24 + i * (w + gap) for i in range(5)]
    boxes = [
        ("Invoice in", f"ERP feed, or a photo{NL}or PDF read by{NL}Gemini vision", "node"),
        ("3-way match", f"every line checked{NL}against the PO and{NL}goods receipt", "node"),
        ("Hard controls", f"duplicate · bank change{NL}GSTIN · e-invoice IRN{NL}new vendor · over ₹5L", "node"),
        ("Hindsight memory", f"routine: recall{NL}fast path · else reflect{NL}+ anomaly check", "accent"),
        ("Earned autonomy?", f"yes: auto-resolve{NL}no: clerk decides,{NL}with cited proof", "node"),
    ]
    for i, (title, body, kind) in enumerate(boxes):
        s.box(xs[i], y, w, h, title, body, kind=kind, badge=i + 1)
        if i:
            s.arrow([(xs[i] - gap + 3, y + h / 2), (xs[i] - 3, y + h / 2)])

    ex_y, ex_h = 26, 70
    s.box(xs[1] - 4, ex_y, w + 8, ex_h, "Paid", "everything matches", kind="good")
    s.arrow([(xs[1] + w / 2, y - 3), (xs[1] + w / 2, ex_y + ex_h + 4)])
    s.label(xs[1] + w / 2 + 8, 130, "clean", anchor="start")
    s.box(xs[2] - 4, ex_y, w + 8, ex_h, "Reject or escalate", "always goes to a human", kind="bad")
    s.arrow([(xs[2] + w / 2, y - 3), (xs[2] + w / 2, ex_y + ex_h + 4)])
    s.label(xs[2] + w / 2 + 8, 130, "control fires", anchor="start")

    ry, rh = 340, 74
    rx, rw = xs[3] - 4, (xs[4] + w) - xs[3] + 8
    s.box(
        rx,
        ry,
        rw,
        rh,
        "Hindsight retain",
        f"the lesson is stored: personal data redacted,{NL}attributed and tagged",
        kind="accent",
        chars=50,
    )
    s.arrow([(xs[4] + w / 2, y + h + 3), (xs[4] + w / 2, ry - 4)], accent=True)
    s.arrow([(xs[3] + w / 2, ry - 3), (xs[3] + w / 2, y + h + 7)], accent=True)
    s.label(xs[3] + w / 2 - 10, 306, "memory feeds", color="accent", anchor="end")
    s.label(xs[3] + w / 2 - 10, 323, "the next decision", color="accent", anchor="end")
    s.label(xs[4] + w / 2 - 10, 316, "every decision", color="accent", anchor="end")
    s.label(
        24,
        448,
        "Controls run in plain code before any AI. Memory can recommend, but it can never override them.",
        anchor="start",
    )
    return s.render()


# ---------------------------------------------------------------- 3. the learning loop, step by step


def sequence(t: dict) -> str:
    s = Svg(
        960,
        500,
        t,
        "The learning loop, step by step",
        "Numbered sequence between the invoice, the Precedent API, Hindsight and the AP clerk: reflect for a cited "
        "recommendation, the clerk decides, the autonomy ladder updates, and the lesson is retained.",
    )
    lanes = [("Invoice", 110), ("Precedent API", 360), ("Hindsight", 610), ("AP clerk", 850)]
    top, bottom = 26, 480
    for name, x in lanes:
        s.box(x - 80, top, 160, 44, name, kind="accent" if name == "Hindsight" else "node")
        s.add(f'<line x1="{x}" x2="{x}" y1="{top + 46}" y2="{bottom}" stroke="{t["lane"]}" stroke-width="2"/>')
    X = dict(lanes)

    def step(n, y, a, b, text, dashed=False, accent=False):
        x1, x2 = X[a], X[b]
        d = 1 if x2 > x1 else -1
        s.arrow([(x1 + d * 6, y), (x2 - d * 6, y)], dashed=dashed, accent=accent)
        s.label((x1 + x2) / 2, y - 10, text, color="text", size=13.5)
        s.badge(x1 + d * 22, y, n)

    def note(n, y, lane, text):
        x = X[lane]
        s.box(x - 150, y - 17, 300, 34, "", kind="note")
        s.text(x + 6, y + 5, text, size=13.5, color="text", anchor="middle")
        s.badge(x - 150, y, n)

    step(1, 118, "Invoice", "Precedent API", "3-way match finds an exception")
    step(2, 170, "Precedent API", "Hindsight", "reflect(case, vendor + type tags)", accent=True)
    step(3, 222, "Hindsight", "Precedent API", "approve · 1.00 · cited memories", dashed=True, accent=True)
    step(4, 274, "Precedent API", "AP clerk", "recommendation + memories-used panel")
    step(5, 326, "AP clerk", "Precedent API", "approve in one click, or correct with a reason", dashed=True)
    note(6, 378, "Precedent API", "autonomy ladder +1 (3 in a row = auto)")
    step(7, 424, "Precedent API", "Hindsight", "retain(lesson, tags, date)", accent=True)
    note(8, 466, "Hindsight", "facts extracted, observations updated")
    return s.render()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in (("loop", loop), ("pipeline", pipeline), ("sequence", sequence)):
        for mode, theme in THEMES.items():
            path = OUT / f"diagram-{name}-{mode}.svg"
            path.write_text(fn(theme), encoding="utf-8")
            print("wrote", path.name)


if __name__ == "__main__":
    main()
