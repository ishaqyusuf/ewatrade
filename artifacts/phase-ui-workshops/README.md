# EwaTrade phase UI workshops

Open [index.html](index.html). Choose a feature, then try directions 01–03.
The star marks the recommended direction. Theme and mobile-width controls apply
to all previews. Reset clears each direction's local selections and results.

38 studies cover the UI work in the consolidated 18-phase plan. Each study has
three implemented layouts: ledger and inspector, guided editor, visual workbench.
[Coverage and recommendations](COVERAGE.md) account for all 171 plan tasks.

## Checks

- 114 directions exercised in desktop light/dark and 390px light/dark: 456 runs.
- Selection, review, confirmation, cancel focus return, reset, loaded images and
  page overflow checked for every direction in every run.
- Focused cases cover pending images, referenced-image deletion, missing rights,
  invalid contact, unavailable Product, template errors, search/empty results,
  plan prices, uncertain/rejected AI jobs, spend limits, HTML-safe text and
  isolated/retained direction state.
- Reduced motion enabled. Screenshots saved for every recommended direction;
  representative desktop, narrow and dark screenshots visually inspected.
- [Machine evidence](evidence/verification.json). Run `node artifacts/phase-ui-workshops/verify.mjs`
  from the repository root using the installed local Playwright runtime.
- `node artifacts/phase-ui-workshops/coverage.mjs` validates the plan mapping.

## Boundaries

All business actions use local sample data. State survives direction switching,
not a browser reload. No provider, database, payment, message or publication call
is made. Download buttons export sample JSON records, not production PDFs/PNGs.
AI imagery uses existing illustrations; no generated-image quality claim is made.
Mobile width is a browser reference, not Expo or physical-device acceptance.
Real screen-reader traversal, production routes, native share/camera, background
recovery, document rendering and provider behavior remain implementation gates.

The user requested short, direct copy. Scenario switches and policy notes are
outside the product previews. Proposed prices and optional paid licensing remain
clearly separate from adopted product policy.

No preview server was started. The files work locally and were opened through
the Codex browser tool (the host returned a queued panel open).
