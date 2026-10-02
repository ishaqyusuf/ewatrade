# Complete catalog illustration library

The owner approved all 24 individual farming/poultry and laundry/cleaning options,
then all remaining options, on 1 October 2026. This folder now contains all 85
hand-authored designs across 15 business profiles, each exported in light and dark
palettes: 170 transparent SVG files. The two combined business image concepts were
rejected. The folder retains its original P1 name to preserve earlier links.

Open `index.html` for paired theme previews and 32/48 pixel thumbnails, or view
`contact-sheet.png`; `contact-sheet-1.png` through `contact-sheet-4.png` split the
library into readable review boards. `manifest.json` holds stable IDs, labels, business/category
associations, custom Service contexts, files and byte sizes. Profile associations
rank recommendations; they must not restrict Browse all or global search.
Merchant photo upload, replacement and removal remain available during any later
integration. No picker, runtime source, media persistence or publication changed.

`catalog-illustrations-all.zip` is the full current library; the earlier
`catalog-illustrations-p1.zip` is retained as the original 24-design snapshot.

`build.py` owns the original geometry and one centralized palette per theme.
Exports contain only SVG paths/basic shapes and resolved paints, avoiding browser
CSS-variable dependencies in native renderers. The manifest maps semantic ink,
fill, accent and highlight roles. The green values follow the local workshop
reference; this artifact does not change the app's global theme.

Regenerate with `python3 artifacts/catalog-illustrations-p1/build.py` from the
repository root. `verify.mjs` uses the bundled Node sharp/Playwright dependencies
to render all exports at 32, 48 and 128 px, check transparent edges, generate the
contact sheet, and capture the file-based browser preview at desktop and 390 px.
Set `CHROMIUM_EXECUTABLE` to an existing browser binary if Playwright's expected
revision is not installed. No browser download is required.

Actual files are smaller than the 2–15 KB target; they are not padded. See
`verification.json` for measured sizes and checks. Small-size visibility and the
contact sheet were visually reviewed. Native Android SVG renderer acceptance,
actual theme-provider wiring, picker integration and merchant visual approval
remain pending. Sharp rasterization/browser checks do not prove Android behavior.

No copyrighted marks, logos, raster payloads, fonts, scripts or external resources
are embedded. The illustration is a generic visual aid, not an exact photograph,
unit count, availability signal, service outcome or medical claim.
