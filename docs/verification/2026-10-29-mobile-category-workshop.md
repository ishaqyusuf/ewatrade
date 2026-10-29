# Mobile Category in Essentials — Workshop review

Scope: design only, requested 29 October 2026. Native implementation requires
owner review and approval of the exact published revision. No mobile source,
API, assistant, database or provider changes are included.

## Requested behavior

- Category is a plain field directly after Name in Essentials for Goods and Services.
- Tap opens a dedicated category search screen. Show six initial sample choices
  (spoken “48” interpreted as four to eight), with leaf names and slash-separated
  parent paths. No tree browser or overlapping legacy presets.
- Search uses the existing mobile floating footer pattern. The eventual native
  build must reuse `BottomSearchFooter` and `FloatingSearchField`, preserving
  screen keyboard ownership; no copied or inline search variant.
- Selection immediately returns to the retained form, displaying the category.
  The field has an accessible X to clear; reopening allows another search.
  Back retains the previous choice and other form drafts.

## Author and publication

Owner confirmed Claude Opus 5.5 at high effort. Initial read-enabled delegation
was rejected by automatic approval review because it would send private source
and design assets to Claude. The accepted run receives only a self-contained
feature/design brief, uses exact `claude-opus-5-5`, explicit `--effort high`, and
`--tools ''`. No project source or design assets are in that payload. Codex owns
local component comparison, catalog publication and browser verification.

The existing canonical Workshop is
[Mobile catalog setup](https://workshop.localhost/ewatrade/legacy/catalog-setup-mobile-workshop).
The historical `archive` direction and its revisions stay unchanged. This update
appends stable direction `category-search`; it does not select or implement it.
Sources live inside the shared Workshop application's ignored `work/` tree.
The stopped shared viewer was restored with its existing `jd workshop dev`.

Published direction: `category-search`, version 1, exact revision
`260cdd4e-52d8-4297-a0a2-a9bab94993ba`.
[Review this revision](https://workshop.localhost/ewatrade/legacy/catalog-setup-mobile-workshop/directions/category-search?rev=260cdd4e-52d8-4297-a0a2-a9bab94993ba).
Final catalog read confirms selection remains null, implementation count remains
zero, and both historical archive revision IDs are unchanged. The catalog's Pick
badge is a recommendation; it does not record owner selection.

Claude returned a successful result with canonical model `claude-opus-5-5` and
no tool access. Exact launch included explicit `--effort high`. Codex locally
corrected sample ancestry to the pinned reference, bounded results at eight,
matched shared footer horizontal24px / inner18px spacing and shadows, aligned
field labels, synchronized config state and disabled out-of-scope saving.
These are preview-only changes; the existing native source remains unchanged.

## Verification

- `bun run qa:doctor --offline`: pass; runtime checks intentionally skipped.
- `bun run test:quick --plan --files docs/verification/2026-10-29-mobile-category-workshop.md`:
  core documentation scope, no unknown mappings.
- Focused `test:quick` for that same owned path: 47 tests / 193 assertions pass,
  including QA tooling types. Concurrent work excluded explicitly.
- `node --check` on the published preview's `app.js`: pass.
- Permanent shared Workshop route and archived revision rendered successfully.
- Goods: open from Essentials, six initial choices, search eggs, pick Whole Eggs,
  immediate return showing leaf/ancestry, X clear, and reopen: pass.
- Service: six initial choices; slash search
  `Services / Professional Services / Tax` returns one Tax Services result;
  pick returns to Essentials: pass.
- Edit Service draft name and price, open Category then Back: prior Tax Services
  selection plus `Consulting draft` / `17500` retained: pass.
- Empty-results state and query X clear: pass. Workshop State control stays in sync
  with interactions inside the phone.
- Light/dark, compact320×568 size, state switching, collapse/reopen with theme,
  size and Service preference preserved, and Reset to initial Goods draft: pass.
- Browser error/warning log empty when checked.
- Screenshots: `/private/tmp/ewatrade-mobile-category-essentials.png` and
  `/private/tmp/ewatrade-mobile-category-workshop.png` (browser prototype only).

No native build/device acceptance, connected product smoke, real submission,
product provider action, database action or deployment was performed. Product behavior
is unchanged. After owner approval, record this exact accepted revision before
implementing with native shared components and focused native verification.

Brain impact: updated the design record
`.brain/design/2026-10-29-mobile-category-search-workshop.md` and task pointer
`.brain/tasks/in-progress.md`. No API, schema, permission or accepted architecture
change, so database/API/ADR updates are unnecessary.
