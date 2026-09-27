"""Build Precedent's typographic mark from Newsreader outlines (text -> SVG paths, no font needed at runtime)."""

import io
import sys
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

SRC = Path(sys.argv[1])
OUT = Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)

INK, PAPER = "#15171A", "#FBFBFA"


def instance(wght: float, opsz: float = 72) -> tuple[TTFont, bytes]:
    f = TTFont(SRC)
    inst = instancer.instantiateVariableFont(f, {"wght": wght, "opsz": opsz})
    buf = io.BytesIO()
    inst.flavor = None
    inst.save(buf)
    data = buf.getvalue()
    return TTFont(io.BytesIO(data)), data


def shape(data: bytes, text: str, tracking: float = 0) -> list[tuple[str, float]]:
    face = hb.Face(data)
    font = hb.Font(face)
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(font, buf, {"kern": True, "liga": True})
    out, x = [], 0.0
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions, strict=True):
        out.append((info.codepoint, x + pos.x_offset))
        x += pos.x_advance + tracking
    return out, x - tracking


def glyph_paths(font: TTFont, placed, scale: float, dx: float, baseline: float) -> tuple[str, list[float]]:
    gs = font.getGlyphSet()
    order = font.getGlyphOrder()
    d_all = []
    xmin = ymin = 1e9
    xmax = ymax = -1e9
    for gid, x in placed:
        name = order[gid]
        pen = SVGPathPen(gs)
        # font units (y up) -> svg (y down)
        tpen = TransformPen(pen, (scale, 0, 0, -scale, dx + x * scale, baseline))
        gs[name].draw(tpen)
        d_all.append(pen.getCommands())
        bp = BoundsPen(gs)
        gs[name].draw(bp)
        if bp.bounds:
            a, b, c, d = bp.bounds
            xmin = min(xmin, dx + (x + a) * scale)
            xmax = max(xmax, dx + (x + c) * scale)
            ymin = min(ymin, baseline - d * scale)
            ymax = max(ymax, baseline - b * scale)
    return " ".join(d_all), [xmin, ymin, xmax, ymax]


def diamond(cx: float, cy: float, r: float) -> str:
    return f"M{cx:.2f} {cy - r:.2f}L{cx + r:.2f} {cy:.2f}L{cx:.2f} {cy + r:.2f}L{cx - r:.2f} {cy:.2f}Z"


def wordmark(wght: float, tracking_em: float, dot: float, fill: str, name: str) -> dict:
    font, data = instance(wght)
    upm = font["head"].unitsPerEm
    size = 96.0
    s = size / upm
    placed, width = shape(data, "Precedent", tracking=tracking_em * upm)
    pad = 8.0
    baseline = size * 0.86 + pad
    d, box = glyph_paths(font, placed, s, pad, baseline)
    r = dot * size / 2  # diamond half-diagonal
    gap = 0.05 * size
    cx = pad + width * s + gap + r
    cy = baseline - r * 1.02  # sits on the baseline like a full stop
    w = cx + r + pad
    h = baseline + pad + 4
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" width="{w:.0f}" height="{h:.0f}" '
        f'role="img" aria-label="Precedent"><title>Precedent</title>'
        f'<path fill="{fill}" d="{d}"/><path fill="{fill}" d="{diamond(cx, cy, r)}"/></svg>'
    )
    (OUT / f"{name}.svg").write_text(svg, encoding="utf-8")
    return {"name": name, "w": w, "h": h}


def monogram(wght: float, dot: float, fg: str, bg: str | None, name: str, box: float = 512, safe: float = 0.62) -> None:
    """P + diamond full stop, centred as a group inside a square (safe zone for maskable icons)."""
    font, data = instance(wght)
    upm = font["head"].unitsPerEm
    gs = font.getGlyphSet()
    gid = font.getBestCmap()[ord("P")]
    bp = BoundsPen(gs)
    gs[gid].draw(bp)
    a, b, c, d = bp.bounds  # font units
    glyph_w, glyph_h = c - a, d - b
    # group = P + gap + diamond; diamond diameter relative to cap height
    diam = dot * glyph_h
    gap = 0.06 * glyph_h
    group_w = glyph_w + gap + diam
    target = box * safe
    s = target / max(group_w, glyph_h)
    ox = (box - group_w * s) / 2 - a * s
    base = (box + glyph_h * s) / 2 + b * s  # baseline so the cap is vertically centred
    pen = SVGPathPen(gs)
    gs[gid].draw(TransformPen(pen, (s, 0, 0, -s, ox, base)))
    r = diam * s / 2
    cx = ox + (c + gap) * s + r
    cy = base - r * 1.02
    bg_rect = f'<rect width="{box}" height="{box}" fill="{bg}"/>' if bg else ""
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {box} {box}" width="{box}" height="{box}" role="img" '
        f'aria-label="Precedent"><title>Precedent</title>{bg_rect}'
        f'<path fill="{fg}" d="{pen.getCommands()}"/><path fill="{fg}" d="{diamond(cx, cy, r)}"/></svg>'
    )
    (OUT / f"{name}.svg").write_text(svg, encoding="utf-8")


FINAL = OUT
wordmark(600, -0.018, 0.18, "currentColor", "wordmark")
wordmark(600, -0.018, 0.18, INK, "wordmark-light")
wordmark(600, -0.018, 0.18, PAPER, "wordmark-dark")
monogram(680, 0.26, "currentColor", None, "mark", safe=0.9)
monogram(680, 0.26, PAPER, INK, "icon")  # app icon: paper on ink, inside the maskable safe zone
print("final assets written")
