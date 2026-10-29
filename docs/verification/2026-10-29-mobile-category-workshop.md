# Existing mobile design correction — Category in Live Card

Owner corrected the initial isolated study: resume the existing implemented
mobile design and revise it rather than creating another feature demo. This is
now a standing rule in `AGENTS.md` under Workshop continuation rule.

Current review: [existing Mobile Quality Workshop, First product setup](https://workshop.localhost/ewatrade/legacy/mobile-quality-workshop?rev=ddb9c72f-d30c-4dc7-a310-4d77caffcacd&screen=19-first-product-setup%2Findex.html&state=focus%3D01%26view%3Dessentials).
Canonical path `legacy/mobile-quality-workshop`, existing direction `archive`.
Implemented in-source design: screen 19, `01 Live Card` (matched to native Classic
and the existing design/implementation records; imported catalog has no guessed
selection). This is a Category proposal inside that full design, not a claim that
the new revision is implemented.

## Baseline and exact revision

Resumed saved v15 `361450c2-3a3a-4b0d-b05d-9c337f5a177b`. SHA256 matched the
existing working preview's First product setup page. Copied the saved full
collection to its canonical Workshop work folder, then updated only
`19-first-product-setup/index.html`.

Final v17 `ddb9c72f-d30c-4dc7-a310-4d77caffcacd`. Archived comparison proves all 61
baseline files retained; exactly that one page changed. All 60 other files,
including shared floating search, phone/theme/config components and other mobile
screens, remain byte-identical. The collection has the same single `archive`
direction and all earlier revisions; no new selection or implementation receipt.
The intermediate v16 exposed a typing/caret redraw problem during browser checking;
v17 updates just result content, retaining the shared search input DOM and caret.

Opus 5.5/high returned a concise incremental design amendment with tools disabled;
canonical model and explicit launch effort verified. Codex integrated locally.
No private source/assets were sent to that author. The shared footer uses the
existing `FS.dock(FS.field(...))` call unchanged. Product native work remains
unmodified and approval is still required before building the new behavior.

Category now appears after Name for Product and Service in Live Card Essentials.
The old suggestion chip and More details Category row are removed from that flow.
The existing Category route shows six pinned Shopify sample paths, searches at
most eight matches with slash-path tokens, immediately returns on selection, and
supports X clear and Back. Product/Service selections stay independent; the
existing hero uses the selected leaf. Category stays optional, and existing save,
photos, units, choices, stock, pricing and review logic is retained.

## Focused verification of the integrated revision

- Inline JS syntax check: pass.
- Full collection asset comparison: 61 files retained, exactly 1 page changed.
- Browser: Product six choices → type `milk` → correct one result → select returns with
  Milk in original field and hero; X clear returns empty: pass.
- Service: slash search `Services / Professional Services / Tax` → Tax Services →
  immediate return with existing name and ₦15,000 price: pass.
- Empty results, Back cancellation retaining Tax Services/name/price, query X clear
  restoring six choices: pass.
- Edited Product `Eggs draft` survives keyboard search/selection and return; form
  returns at nonzero 303px scroll. Name restored to Eggs and Whole Eggs selected
  for the final review screenshot. No save action performed.
- Existing config: Product/Service/Step sync, dark/light, compact 320×568,
  collapse/reopen, navigate to Home and back retaining theme/size: pass.
- Existing Photos, units, choices, stock, pricing and review actions remain in
  the same form; their source is retained. No claim of exhaustive retesting.
- Browser error/warning log empty when checked on final revision.
- Screenshot: `/private/tmp/ewatrade-category-existing-live-card.png`.
- Existing offline doctor pass reused: no dependencies/runtime source changed.
- `bun run test:quick --plan --files AGENTS.md docs/verification/2026-10-29-mobile-category-workshop.md`: core documentation scope, no unknown mappings.
- Same explicit owned-path `test:quick`: QA tooling types and 47 tests / 193 assertions pass; unrelated concurrent changes excluded.

The prior isolated `category-search` study remains as history, is no longer
recommended, and its metadata points to the full collection. It is not the
implementation baseline. No production/mobile code, API/schema, product provider
or deployment action occurred. Owner review/selection precedes implementation.

Brain impact: `.brain/design/2026-10-29-mobile-category-search-workshop.md` and
`.brain/tasks/in-progress.md` updated to point at this integrated revision; no
API/database/accepted-architecture changes, so those documents need no update.

## Superseded initial standalone study

The following is historical verification of the initial study, not the current
review or native implementation target.

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
