"""Hand-authored artwork; deterministic themed exports. No runtime integration."""
import html
import json
import re
from pathlib import Path
from remaining_art import make_art

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent.parent
PALETTES = {
    'light': {'ink': '#17684f', 'fill': '#ecf3ee', 'accent': '#8cd5b5', 'highlight': '#fff9ed'},
    'dark': {'ink': '#8cd5b5', 'fill': '#26372d', 'accent': '#17684f', 'highlight': '#10271d'},
}


def path(d, fill='fill', **attrs):
    extra = ' '.join(f'{k.replace("_", "-")}="{v}"' for k, v in attrs.items())
    return f'<path d="{d}" fill="@{fill}" {extra}/>'


def ellipse(cx, cy, rx, ry, fill='fill'):
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="@{fill}"/>'


def rect(x, y, w, h, r=5, fill='fill'):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="@{fill}"/>'


def line(d):
    return path(d, 'none')


def eye(x, y):
    return f'<circle cx="{x}" cy="{y}" r="2.5" fill="@ink" stroke="none"/>'


ART = {
    'ill-egg': ('Egg', path('M64 18C48 18 31 53 31 76a33 33 0 0 0 66 0C97 53 80 18 64 18Z') + line('M44 73c0-13 5-25 11-33')),
    'ill-egg-tray': ('Egg tray', ''.join(path(f'M{x} 34c-7 0-13 15-13 25a13 13 0 0 0 26 0c0-10-6-25-13-25Z', 'highlight') for x in [32,64,96]) + ''.join(path(f'M{x} 52c-7 0-13 15-13 25a13 13 0 0 0 26 0c0-10-6-25-13-25Z', 'highlight') for x in [32,64,96]) + path('M15 77h98l-8 28H23Z','accent') + line('M25 90h78M39 80v18M64 80v18M89 80v18')),
    'ill-chick': ('Chick', ellipse(63,77,29,25) + ellipse(73,44,20,20,'highlight') + path('M92 43l15 7-15 7Z','accent') + path('M44 75q19-9 23 10-18 9-23-10Z','accent') + eye(80,40) + line('M56 102v10m0-3-9 3m9-3 8 3M75 102v10m0-3-7 3m7-3 9 3')),
    'ill-chicken': ('Chicken', path('M47 61 21 43l4 30-10-4q4 33 36 33h23q25-3 24-30L89 53q18-8 11-25-7-14-24-8-13 4-13 24v13Z') + path('M74 23q-10-16-1-18 6-1 8 9 1-12 8-11 6 2 2 12 9-6 12 0 2 7-10 12Z','accent') + path('M100 34l13 6-13 6Z','accent') + path('M90 50q12 9 3 17-9 0-8-14','accent') + path('M48 67q26-13 32 11-9 21-30 5Z','accent') + eye(87,33) + line('M56 102v12m-9 0h18M77 100v14m-8 0h17')),
    'ill-grain-feed-sack': ('Grain / feed sack', path('M47 24 41 13l14 3 10-4 10 4 13-3-9 11Z','accent') + path('M46 29q-16 18-20 45-7 36 19 36h39q25 0 19-36-5-26-23-45Z') + line('M45 27h36M35 87q-3 13 8 14') + ellipse(64,68,20,23,'highlight') + line('M64 81V56') + ''.join(path(f'M64 {y}q-13-10-11-15 11 0 11 15m0 0q13-10 11-15-11 0-11 15','accent') for y in [66,78])),
    'ill-tomato': ('Tomato', path('M63 43C27 25 8 62 25 91q14 24 39 17 27 7 40-18 19-35-18-49Z') + path('M65 45 47 33l10 2-2-13 11 9 14-9-3 14 15 0-20 12Z','accent') + line('M66 32q1-14 12-16M34 66q-7 13 0 23')),
    'ill-seed-packet': ('Seed packet', rect(31,17,66,94,6) + line('M32 30h64M32 99h64') + ellipse(64,63,23,26,'highlight') + path('M63 77V56q-17 2-16-14 15-2 17 13 0-17 17-18 5 17-17 19','accent') + line('M54 83h19')),
    'ill-trowel': ('Trowel', path('M49 65q-16 24 15 47 31-23 15-47Z') + path('M59 57h10v25H59Z','accent') + rect(54,15,20,45,8,'highlight') + line('M64 91v11')),
    'ill-produce-crate': ('Produce crate', ellipse(42,49,17,18,'highlight') + ellipse(80,48,20,19,'highlight') + path('M41 31l-6-9 9 3 7-6-3 12M79 28q-4-12 5-15','accent') + rect(16,58,96,48,4) + path('M18 65h92v10H18ZM18 86h92v10H18Z','accent') + rect(24,55,9,54,2,'highlight') + rect(95,55,9,54,2,'highlight') + line('M47 102h34')),
    'ill-pepper': ('Pepper', path('M46 36q28-12 42 6 17 35-7 56-17 16-48 5 31-1 26-29-23-14-13-38Z') + path('M56 34q0-16 18-20l5 7q-15 4-12 15Z','accent') + line('M75 47q11 12 5 27')),
    'ill-maize': ('Maize', ellipse(64,58,20,42,'highlight') + ''.join(line(f'M{x} 26v62') for x in [56,64,72]) + ''.join(line(f'M46 {y}h36') for y in [39,50,61,72]) + path('M63 111Q23 96 27 53q25 12 37 43 9-37 37-46 1 42-38 61Z','accent') + line('M42 74q13 15 22 37M85 73q-13 18-21 38')),
    'ill-herb-leaf': ('Herb', line('M64 112V29') + path('M63 87Q25 88 25 58q32-3 38 29Z') + path('M64 66q32 1 38-29-32-4-38 29Z','accent') + path('M63 43Q40 38 49 14q25 6 14 29Z') + line('M37 69l27 18M89 48 64 66M55 27l9 16')),
    'ill-shirt': ('Shirt', path('M45 24 22 34 11 60l21 10 8-14v53h48V56l8 14 21-10-11-26-23-10Z') + path('M45 24l19 22 19-22-10-8H55Z','highlight') + path('M45 24 54 51l10-5 10 5 9-27','accent') + line('M64 46v61M75 65h9') + ''.join(eye(64,y) for y in [61,77,93])),
    'ill-folded-clothes': ('Folded clothes', rect(20,75,90,29,7,'accent') + line('M28 88h74') + path('M32 38 18 57l14 13 8-11v20h49V59l8 11 14-13-14-19-17-7H49Z') + path('M49 31q15 18 31 0','highlight') + line('M43 68h42')),
    'ill-towel': ('Towel', rect(24,30,80,76,9) + rect(24,30,57,76,7,'highlight') + path('M25 84h78v12H25Z','accent') + line('M81 39v59M33 39h36') + ''.join(line(f'M{x} 106v7') for x in range(34,100,10))),
    'ill-hanger': ('Hanger', line('M64 51V38q0-4 7-8 13-9 4-19-12-10-20 5') + path('M64 49 15 87q-8 8 3 10h92q11-2 3-10Z','none')),
    'ill-iron': ('Iron', path('M17 88q17-34 46-36h30q12 0 15 14l7 25Z') + path('M49 53V36q0-10 12-10h32q12 0 14 12l3 16h-13l-2-11q-1-4-5-4H66q-4 0-4 5v9Z','accent') + path('M15 91h100v12H15Z','highlight') + eye(89,65) + line('M27 77h30M106 33q12-5 13-17')),
    'ill-laundry-basket': ('Laundry basket', path('M28 48 23 29q10-14 22-4l10-10q14-2 23 15l15-6q12 1 12 22Z','highlight') + line('M39 31l9 15M76 33l5 13') + path('M15 49h98l-13 59H28Z') + path('M16 49h96v12H16Z','accent') + ''.join(line(f'M{x} 71v26') for x in [39,55,72,88]) + line('M31 83h67')),
    'ill-detergent-jug': ('Detergent jug', rect(42,17,30,12,3,'accent') + path('M40 30h34q25 8 29 30v42q0 9-10 9H37q-12 0-12-12V49q0-13 15-19Z') + path('M76 40q16 6 17 24v15H79V55q0-10-3-15Z','highlight') + path('M53 56q-14 18-14 27a14 14 0 0 0 28 0q0-9-14-27Z','accent') + line('M42 35h24')),
    'ill-garment-bag': ('Garment bag', line('M64 25v-7q14-9 5-13-9-4-12 4') + path('M64 23 27 42v65q0 7 7 7h60q7 0 7-7V42Z') + line('M64 35v64') + rect(60,69,8,13,2,'accent') + line('M38 101h52')),
    'ill-duvet': ('Duvet', rect(20,29,88,77,10) + path('M20 42q16-15 39-3t49 0V29H30q-10 0-10 13Z','highlight') + line('M20 90h88M42 46v44M64 46v44M86 46v44M22 65h84') + path('M21 91h86v8q0 7-9 7H30q-9 0-9-7Z','accent')),
    'ill-mop': ('Mop', path('M57 16q0-6 7-6t7 6v65H57Z','highlight') + path('M41 76h46v12H41Z','accent') + path('M43 88h42l11 19q-4 7-10 2-7 8-14 1-7 8-14 0-7 6-14-1-6 5-11-2Z') + ''.join(line(f'M{x} 91q{dx} 8 {dx} 18') for x,dx in [(48,-7),(57,-3),(66,0),(75,3),(83,6)])),
    'ill-bucket': ('Bucket', path('M26 55V44q0-29 38-29t38 29v11','none') + path('M22 51h84l-10 57H32Z') + ellipse(64,51,42,9,'highlight') + rect(53,12,22,8,4,'accent') + line('M37 69l4 26')),
    'ill-spray-bottle': ('Spray bottle', path('M57 18h28l16 9v10H79v15H58V37H40V26Z','accent') + path('M75 36q-1 17-16 20','none') + path('M58 49h21v10q22 9 22 29v20q0 7-8 7H40q-8 0-8-7V86q0-15 26-27Z') + rect(43,78,46,24,5,'highlight') + line('M58 65h21M23 28h5M19 40l7-3M20 16l6 3')),
}
ART.update(make_art(path, line, rect, ellipse, eye))


def svg(asset_id, title, shapes, theme):
    palette = PALETTES[theme]
    content = shapes.replace('@none', 'none')
    for role, value in palette.items():
        content = content.replace('@' + role, value)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">'
            f'<title>{html.escape(title)}</title><g stroke="{palette["ink"]}" stroke-width="3" '
            f'stroke-linecap="round" stroke-linejoin="round">{content}</g></svg>\n')


def build():
    source = (REPO / '.brain/design/2026-10-01-catalog-illustration-library-checklist.md').read_text()
    categories = json.loads((REPO / 'packages/utils/src/catalog-category-presets.json').read_text())['categories']
    metadata = []
    for number, (asset_id, (title, shapes)) in enumerate(ART.items(), 1):
        match = re.search(rf'^\d+\. \[[ x]\] `{asset_id}`.*$', source, re.M)
        row = match.group()
        tags = re.findall(r'`([a-z-]+:[a-z-]+)`', row)
        profiles = sorted({p for cat in categories if any(t.startswith(cat['key'] + ':') for t in tags) for p in cat['businessProfileKeys']})
        primary = re.findall(r'Business tag: `([a-z-]+)`', source[:match.start()])[-1]
        if primary not in profiles:
            profiles.append(primary)
        # Keep explicit reuse context even when a Service has no matching preset.
        extra = {
            'ill-mop': ['other-mixed-business'],
            'ill-bucket': ['animal-feed-agricultural-supplies','other-mixed-business'],
            'ill-spray-bottle': ['animal-feed-agricultural-supplies','repair-maintenance','pharmacy-health-retail','other-mixed-business'],
            'ill-towel': ['beauty-salon-spa'],
        }.get(asset_id, [])
        profiles = sorted(set(profiles + extra))
        if asset_id == 'ill-generic-product':
            profiles = list(json.loads((REPO / 'packages/utils/src/business-catalog-guidance.json').read_text())['byBusinessProfile'])
        kinds = sorted({'product' if tag in [s['key'] for c in categories if 'product' in c['itemKinds'] for s in c['subcategories']] else 'service' for tag in tags})
        if number in [8,9,22,23,24] and 'service' not in kinds:
            kinds.append('service')
        if 'P `custom/Uncategorized`' in row and 'product' not in kinds:
            kinds.append('product')
        if 'S `custom/Uncategorized`' in row and 'service' not in kinds:
            kinds.append('service')
        sizes = {}
        for theme in PALETTES:
            directory = ROOT / theme
            directory.mkdir(exist_ok=True)
            target = directory / f'{asset_id}.svg'
            target.write_text(svg(asset_id, title, shapes, theme))
            sizes[theme] = target.stat().st_size
        metadata.append({'id': asset_id, 'label': title, 'priority': 'P1' if number<=24 else 'P2' if number<=83 else 'P3', 'primaryBusinessProfileKey': primary,
                         'businessProfileKeys': profiles, 'categoryKeys': tags, 'itemKinds': kinds,
                         'searchTags': title.lower().replace(' / ', ' ').split(),
                         'customServiceContext': 'S `custom/Uncategorized`' in row,
                         'files': {theme: f'{theme}/{asset_id}.svg' for theme in PALETTES}, 'bytes': sizes})
    (ROOT / 'manifest.json').write_text(json.dumps({'schemaVersion': 1, 'status': 'artwork-for-review',
        'paletteRoles': PALETTES, 'assets': metadata}, indent=2) + '\n')
    cards = ''.join(f'<article><div class="examples"><div class="light"><img src="light/{a["id"]}.svg" alt="{html.escape(a["label"])}"></div>'
        f'<div class="dark"><img src="dark/{a["id"]}.svg" alt="{html.escape(a["label"])} in dark palette"></div></div>'
        f'<b>{i}. {html.escape(a["label"])}</b><small>{a["id"]}</small><div class="thumbs">'
        f'<img src="light/{a["id"]}.svg" width="32" height="32" alt="32 pixel preview"><img src="light/{a["id"]}.svg" width="48" height="48" alt="48 pixel preview">'
        f'<span>{a["bytes"]["light"]} / {a["bytes"]["dark"]} bytes</span></div></article>' for i,a in enumerate(metadata,1))
    (ROOT / 'index.html').write_text('''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>EwaTrade — 85 catalog illustrations</title>
<style>:root{font-family:system-ui,sans-serif;color:#182420;background:#f3f4f5}*{box-sizing:border-box}body{margin:0;padding:32px}main{max-width:1200px;margin:auto}h1{font-size:30px;margin:0 0 12px}p{max-width:760px;line-height:1.6}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px;margin-top:28px}article{border:1px solid #dce2df;border-radius:12px;background:white;overflow:hidden;padding-bottom:16px}.examples{display:flex;margin-bottom:14px}.examples>div{width:50%;padding:16px;display:grid;place-items:center}.light{background:#fff}.dark{background:#1b2320}.examples img{width:100%;max-width:128px;height:128px}b,small{display:block;margin:0 16px}small{color:#626d69;margin-top:6px}.thumbs{display:flex;align-items:center;gap:8px;margin:12px 16px 0}.thumbs span{margin-left:auto;font-size:11px;color:#626d69}@media(max-width:500px){body{padding:16px}}</style></head><body><main>
<h1>The complete catalog illustration library</h1><p>85 individual SVG illustrations across 15 business profiles · Light and dark exports · Transparent backgrounds. The smaller previews show 32 and 48 pixel sizing. Artwork is ready for review; Android renderer acceptance and picker integration remain pending.</p>
<p>1–24: Farming, poultry, laundry &amp; cleaning · 25–79: Retail, fashion, food, beauty, electronics, repair, health, hardware &amp; wholesale · 80–85: Professional services &amp; mixed businesses. Merchants retain their own photo uploads.</p><section>''' + cards + '</section></main></body></html>\n')
    print(f'Built {len(metadata)} asset IDs / {len(metadata)*2} themed SVG exports.')
    print('Byte range:', min(v for a in metadata for v in a['bytes'].values()), max(v for a in metadata for v in a['bytes'].values()))


if __name__ == '__main__':
    build()
