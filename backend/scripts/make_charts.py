"""Learning-curve chart for the README (light + dark SVG) from data/eval.json.

Run: uv run python -m scripts.make_charts
"""

import json
from pathlib import Path

from app.services.metrics import EVAL_FILE

OUT = Path(__file__).resolve().parents[2] / "docs" / "assets"
WINDOW = 4  # rolling weeks (weekly counts are small, so raw weekly rates are noisy)

THEMES = {
    "light": {
        "surface": "#fcfcfb",
        "border": "#e1e0d9",
        "text": "#0b0b0b",
        "text2": "#52514e",
        "muted": "#898781",
        "grid": "#e1e0d9",
        "base": "#c3c2b7",
        "band": "#f0efec",
        "on": "#2a78d6",
        "off": "#eb6834",
    },
    "dark": {
        "surface": "#1a1a19",
        "border": "#2c2c2a",
        "text": "#ffffff",
        "text2": "#c3c2b7",
        "muted": "#898781",
        "grid": "#2c2c2a",
        "base": "#383835",
        "band": "#232322",
        "on": "#3987e5",
        "off": "#d95926",
    },
}
FONT = "Segoe UI, -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif"


def rolling(weeks: list[dict], key: str) -> list[float | None]:
    out = []
    for i in range(len(weeks)):
        win = weeks[max(0, i - WINDOW + 1) : i + 1]
        n = sum(w["exceptions"] for w in win if w.get(key) is not None)
        k = sum(w[key] * w["exceptions"] for w in win if w.get(key) is not None)
        out.append(k / n if n else None)
    return out


def panel(
    t: dict,
    x0: float,
    title: str,
    subtitle: str,
    series: list[tuple[str, list, str]],
    weeks: int,
    band_values: str,
    note: str | None = None,
    legend: bool = False,
) -> str:
    left, right, top, bottom = x0 + 46, x0 + 440, 96, 300

    def X(w: int) -> float:
        return left + (w - 1) / (weeks - 1) * (right - left)

    def Y(v: float) -> float:
        return bottom - v * (bottom - top)

    s = [
        f'<text x="{x0 + 8}" y="34" font-size="15" font-weight="600" fill="{t["text"]}">{title}</text>',
        f'<text x="{x0 + 8}" y="54" font-size="12.5" fill="{t["text2"]}">{subtitle}</text>',
    ]
    # measured window (months 5-6 = weeks 18-26)
    s.append(
        f'<rect x="{X(18):.1f}" y="{top}" width="{X(weeks) - X(18):.1f}" height="{bottom - top}" '
        f'fill="{t["band"]}" rx="3"/>'
    )
    cx = (X(18) + X(weeks)) / 2
    s.append(
        f'<text x="{cx:.1f}" y="{bottom - 24}" font-size="11" text-anchor="middle" '
        f'fill="{t["muted"]}">measured: months 5–6</text>'
    )
    s.append(
        f'<text x="{cx:.1f}" y="{bottom - 9}" font-size="11.5" font-weight="600" text-anchor="middle" '
        f'fill="{t["text2"]}">{band_values}</text>'
    )
    for v in (0, 0.25, 0.5, 0.75, 1.0):
        color = t["base"] if v == 0 else t["grid"]
        s.append(f'<line x1="{left}" x2="{right}" y1="{Y(v):.1f}" y2="{Y(v):.1f}" stroke="{color}" stroke-width="1"/>')
        s.append(
            f'<text x="{left - 8}" y="{Y(v) + 4:.1f}" font-size="11" text-anchor="end" '
            f'fill="{t["muted"]}">{int(v * 100)}%</text>'
        )
    for w in (1, 5, 9, 13, 17, 21, 26):
        s.append(
            f'<text x="{X(w):.1f}" y="{bottom + 18}" font-size="11" text-anchor="middle" '
            f'fill="{t["muted"]}">W{w}</text>'
        )
    if legend:
        lx = x0 + 8
        for label, _, color in series:
            s.append(
                f'<line x1="{lx}" x2="{lx + 18}" y1="72" y2="72" stroke="{color}" stroke-width="2.5" '
                'stroke-linecap="round"/>'
            )
            s.append(f'<text x="{lx + 24}" y="76" font-size="12" fill="{t["text2"]}">{label}</text>')
            lx += 24 + len(label) * 6.8 + 22
    for _label, values, color in series:
        pts = [(X(i + 1), Y(v)) for i, v in enumerate(values) if v is not None]
        d = " ".join(f"{'M' if i == 0 else 'L'}{x:.1f},{y:.1f}" for i, (x, y) in enumerate(pts))
        s.append(
            f'<path d="{d}" fill="none" stroke="{color}" stroke-width="2" stroke-linejoin="round" '
            'stroke-linecap="round"/>'
        )
        ex, ey = pts[-1]
        s.append(
            f'<circle cx="{ex:.1f}" cy="{ey:.1f}" r="4.5" fill="{color}" stroke="{t["surface"]}" stroke-width="2"/>'
        )
        s.append(
            f'<text x="{ex + 9:.1f}" y="{ey + 4:.1f}" font-size="12" font-weight="600" '
            f'fill="{t["text"]}">{values[-1] * 100:.0f}%</text>'
        )
    if note:
        s.append(f'<text x="{left + 6}" y="{top + 14}" font-size="11.5" fill="{t["text2"]}">{note}</text>')
    return "\n".join(s)


def render(mode: str, ev: dict) -> str:
    t = THEMES[mode]
    weeks = ev["weeks"]
    n = len(weeks)
    on, off, touch = rolling(weeks, "correct_on"), rolling(weeks, "correct_off"), rolling(weeks, "touchless_on")
    m = ev["months_5_6"]
    body = [
        panel(
            t,
            20,
            "Recommendation matches the clerk",
            "Same payment outcome · 4-week rolling average",
            [("Memory ON", on, t["on"]), ("Memory OFF", off, t["off"])],
            n,
            band_values=f"avg  ON {m['correct_on']:.0%} · OFF {m['correct_off']:.0%}",
            legend=True,
        ),
        panel(
            t,
            520,
            "Resolved by the agent on its own",
            "Earned autonomy · memory ON · 4-week rolling average",
            [("Memory ON", touch, t["on"])],
            n,
            band_values=f"avg  {m['touchless_on']:.0%}",
            note="Memory OFF stays at 0% — autonomy requires memory",
        ),
    ]
    total = sum(w["exceptions"] for w in weeks)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="360" viewBox="0 0 1000 360" font-family="{FONT}" role="img" aria-labelledby="t d">
<title id="t">Precedent learning curve</title>
<desc id="d">Over 26 simulated weeks the agent's recommendations match the clerk far more often with Hindsight memory than without, and the share of exceptions it resolves on its own rises from 0 as it earns autonomy.</desc>
<rect x="0.5" y="0.5" width="999" height="359" rx="12" fill="{t["surface"]}" stroke="{t["border"]}"/>
{chr(10).join(body)}
<text x="28" y="346" font-size="11" fill="{t["muted"]}">Replay of 26 simulated weeks · {total} exceptions · 25 vendors · same data and LLM for both runs</text>
</svg>
'''


def main() -> None:
    ev = json.loads(EVAL_FILE.read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    for mode in THEMES:
        path = OUT / f"learning-curve-{mode}.svg"
        path.write_text(render(mode, ev), encoding="utf-8")
        print("wrote", path)


if __name__ == "__main__":
    main()
