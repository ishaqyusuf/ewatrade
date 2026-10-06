"""Outline the approved Cal Sans wordmark; requires fonttools and brotli."""

from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
import json

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
FONT = TTFont(ROOT / "apps/marketing/public/shop-v3/cal-sans.woff2")
GLYPHS = FONT.getGlyphSet()
CMAP = FONT.getBestCmap()
INK, GREEN = "#182420", "#17684F"
MARK = [
    "M17 41 29 20H82L64 38H41L36 47H13Z",
    "M10 97 17 73 44 48H73L92 29 84 21 112 13 104 41 97 34 80 66H52L22 96Z",
    "M42 82H99L86 102H22Z",
]


def lettering(text, size=91, tracking=-1.8):
    scale = size / FONT["head"].unitsPerEm
    paths, cursor, bounds = [], 0, []
    for i, char in enumerate(text):
        name = CMAP[ord(char)]
        glyph = GLYPHS[name]
        transform = (scale, 0, 0, -scale, cursor, 0)
        pen = SVGPathPen(GLYPHS)
        glyph.draw(TransformPen(pen, transform))
        box = BoundsPen(GLYPHS)
        glyph.draw(TransformPen(box, transform))
        if box.bounds:
            bounds.append(box.bounds)
        paths.append({"d": pen.getCommands(), "accent": i >= 3})
        cursor += FONT["hmtx"][name][0] * scale + tracking
    return paths, (
        min(b[0] for b in bounds), min(b[1] for b in bounds),
        max(b[2] for b in bounds), max(b[3] for b in bounds),
    )


WORD, BOX = lettering("ẸwáTrade")
WORD_X, BASELINE = 132, 94
LOGO_WIDTH = round(WORD_X + BOX[2] + 10)
LOGO_HEIGHT = 120


def mark(ink, accent):
    return "".join(f'<path fill="{accent if i == 1 else ink}" d="{d}"/>' for i, d in enumerate(MARK))


def word(ink, accent):
    return "".join(f'<path fill="{accent if p["accent"] else ink}" d="{p["d"]}"/>' for p in WORD)


def svg(viewbox, body, label):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" role="img" aria-label="{label}">{body}</svg>\n'


for suffix, ink, accent in [("", INK, GREEN), ("-mono", INK, INK), ("-reverse", "#FFFFFF", "#FFFFFF")]:
    (OUT / f"mark{suffix}.svg").write_text(svg("0 0 120 120", mark(ink, accent), "ẸwáTrade mark"))
    (OUT / f"logo{suffix}.svg").write_text(svg(
        f"0 0 {LOGO_WIDTH} {LOGO_HEIGHT}",
        mark(ink, accent) + f'<g transform="translate({WORD_X} {BASELINE})">{word(ink, accent)}</g>',
        "ẸwáTrade",
    ))
    x, y, right, bottom = BOX
    (OUT / f"wordmark{suffix}.svg").write_text(svg(
        f"{x - 4:.3f} {y - 6:.3f} {right - x + 8:.3f} {bottom - y + 12:.3f}",
        word(ink, accent), "ẸwáTrade wordmark",
    ))

manifest = {
    "direction": "Precision Rise", "wordmark": "ẸwáTrade",
    "ink": INK, "green": GREEN, "logoWidth": LOGO_WIDTH,
    "logoHeight": LOGO_HEIGHT, "markPaths": MARK,
    "font": "Cal Sans", "wordmarkPaths": WORD,
}
(OUT / "geometry.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")

# Copy versioned, font-independent production assets into each web owner.
for app in ["marketing", "dashboard"]:
    public = ROOT / f"apps/{app}/public/brand"
    public.mkdir(parents=True, exist_ok=True)
    for kind in ["logo", "wordmark", "mark"]:
        for suffix in ["", "-mono", "-reverse"]:
            (public / f"ewatrade-{kind}-precision-rise-v1{suffix}.svg").write_bytes((OUT / f"{kind}{suffix}.svg").read_bytes())

print(f"Outlined ẸwáTrade: {LOGO_WIDTH} × {LOGO_HEIGHT}; {len(WORD)} glyphs, including Ẹ and á.")

# A fresh social card uses the same outlined typography and production logo.
def text_at(text, x, baseline, size, fill=INK, tracking=-1):
    paths, _ = lettering(text, size, tracking)
    body = "".join(f'<path fill="{fill}" d="{p["d"]}"/>' for p in paths)
    return f'<g transform="translate({x} {baseline})">{body}</g>'

social = '<rect width="1200" height="630" fill="#FFF9ED"/>'
social += f'<g transform="translate(68 52) scale(.43)">{mark(INK, GREEN)}<g transform="translate({WORD_X} {BASELINE})">{word(INK, GREEN)}</g></g>'
social += text_at("Come. Trade.", 68, 270, 104, tracking=-2)
social += text_at("Together.", 68, 374, 104, GREEN, -2)
social += '<path d="M68 444H1132" stroke="#DCE2DF" stroke-width="2"/>'
social += text_at("Products. Orders. What’s next.", 68, 504, 31, tracking=-.3)
social += text_at("ewatrade.com", 68, 565, 24, GREEN, -.2)
social += f'<g transform="translate(895 166) scale(1.85)">{mark(INK, GREEN)}</g>'
(OUT / "social-preview.svg").write_text(svg("0 0 1200 630", social, "ẸwáTrade — Come. Trade. Together."))

for label in ["DEV", "PREVIEW"]:
    paths, bounds = lettering(label, 48 if label == "DEV" else 38, 1)
    x, y, right, bottom = bounds
    body = "".join(f'<path fill="#FFFFFF" d="{p["d"]}"/>' for p in paths)
    (OUT / f"badge-{label.lower()}.svg").write_text(svg(f"{x} {y} {right-x} {bottom-y}", body, label))
