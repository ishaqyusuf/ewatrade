# ẸwáTrade — Precision Rise

Implemented locally on 2 October 2026 at the owner's request to implement the
recommended logo and wordmark, including mobile branding.

## Assets

- `logo.svg`: horizontal symbol + **ẸwáTrade** wordmark, 548 × 120 artboard.
- `wordmark.svg`: lettering alone, with the dot below Ẹ and acute above á.
- `mark.svg`: 120 × 120 symbol artboard for compact placements.
- Each has `-mono.svg` and `-reverse.svg` alternatives.
- `social-preview.svg`: new 1200 × 630 social card using the same identity.
- `preview.html`: saved static asset gallery with download links.
- `geometry.json`: exact paths, colours and dimensions for regeneration.

Every SVG uses paths. There are no fonts, raster images, external references,
scripts or live text in the exported artwork. Cal Sans is the lettering source;
the existing locally hosted font contains both required Yoruba glyphs.

## Usage

Use ink **#182420** and green **#17684F** on light surfaces, or the white reverse
on dark surfaces. Preserve the intrinsic aspect ratio, leave at least one
wordmark dot's diameter around the artwork, and never remove its diacritics.
For small square placements use the symbol instead of compressing the full logo.
Web interactive monochrome marks inherit the surrounding foreground colour.
Marketing and Dashboard browser favicons use the colour mark in light mode and
white reverse in dark mode through metadata media links; ICO remains the fallback.
The owner deferred app-corner changes. Platform launcher exports remain square;
the OS owns the installed icon's mask.

Versioned web exports live in both Marketing and dashboard `public/brand`.
The mobile PNG wordmark/logo exports are in `apps/mobile/assets/brand`.
Native app/icon/splash exports are versioned `precision-rise-*` files in
`apps/mobile/assets/icons`, with `dev-` and `preview-` prefixes where relevant.
iOS/app icons are opaque; Android foregrounds and splash artwork are transparent.
Android foreground artwork stays inside the central 66% safe circle. DEV and
PREVIEW badges remain on launcher/iOS icons, with existing environment colours.
Development launcher/iOS canvases preserve the blueprint grid and construction
guides; Preview preserves the dotted plum Market Day treatment. Light versions
use the original background palette; dark versions keep the same patterns in
darker palettes. `native-icon-background.mjs` owns those generated backdrops.
Adaptive foregrounds and splash marks remain transparent.

## Regeneration

`build-vectors.py` needs Python `fonttools` and `brotli`, and reads the existing
`apps/marketing/public/shop-v3/cal-sans.woff2`. `render-assets.mjs` needs Sharp;
`BRAND_SHARP_MODULE` may point to an available absolute module path. These are
asset-authoring tools; no application dependency was added.

```sh
python3 artifacts/brand-identity/precision-rise/build-vectors.py
node artifacts/brand-identity/precision-rise/render-assets.mjs
```

For mobile-only regeneration, run `bun run --cwd apps/mobile icons:generate`
(with `BRAND_SHARP_MODULE` when needed), or pass `--mobile-only` to the renderer.
This path does not write web assets or recreate superseded mobile filenames.

If mark geometry changes, update the web/native `BrandMark` components alongside
the export source. `BrandLogo` and `BrandWordmark` dimensions must match exports.

## Verification and rollout

- Marketing and dashboard sign-in browser rendering verified; Marketing at
  desktop, 390 and 320 pixels, dashboard at desktop and 390 pixels.
- Browser favicon DOM links verified on both sites, including anonymous
  Dashboard dark-SVG access. Browser/OS theme toggling was not exercised.
- Focused web/native brand component TypeScript and affected source bundling pass.
- Dashboard middleware tests: 6 pass / 14 assertions. Only exact versioned brand
  assets are session-free GET/HEAD; other paths and writes retain the guard.
- Expo public config resolves all assets for production/development/preview,
  preserving application identities and native background colours.
- SVG outlines, alpha/opacity, icon dimensions and Android safe area checked.
- Environment-pattern correction verified: exactly six dev/preview opaque icons
  changed; all 18 native asset checks pass. Five background samples per light
  environment match the original exports. See `evidence/environment-pattern-preview.png`.
- No native device rendering, launcher installation, app build, OTA publication,
  production deployment, print acceptance or trademark clearance is claimed.
- New native builds are required for launcher icons and the native splash.

Historical web logos and previous social previews remain available for recovery.
Superseded mobile icon/splash files were removed on 3 October 2026; the mobile
icon directory contains 18 current Precision Rise PNGs plus the four restored
Market Day/Market Pulse PNG/SVG illustrations, retained at the owner's request.
