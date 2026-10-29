# Mobile Category consistency refinement

Owner rejected both the v17 Category field and search screen as inconsistent.
This is a narrow Workshop refinement inside the existing implemented 01 Live
Card. No native code, selection, API, database, provider action or deployment.

[Review v18](https://workshop.localhost/ewatrade/legacy/mobile-quality-workshop?rev=83a401e2-f627-4a09-b14b-e41f37c403b3&screen=19-first-product-setup%2Findex.html&state=focus%3D01%26view%3Dessentials).
Existing `legacy/mobile-quality-workshop` / `archive`, exact revision
`83a401e2-f627-4a09-b14b-e41f37c403b3`. Earlier revisions remain available.

## Findings and correction

- The v17 field introduced a separate multiline surface and bolder selected text.
  It now reuses the existing `.inp` frame. Selected leaf and placeholder are one
  line, with the same font as Name; X remains a sibling button with 44px hit area.
  No ancestry/helper block appears inside or below the input. Full path remains
  available in its accessible name.
- The previous results used `.bm`, which was absent from the existing shared
  press-feedback padding selectors. The shared rule removes ListCard padding,
  then restores it only for its standard row classes; this left the category
  text flush against the card edges. Results now reuse `.orow` / `.om`, receiving
  the same 14px side padding, dividers, typography, truncation and press feedback
  as existing search rows. Row height 62px matches the current native RecordRow.
- Removed the repeated Category subsection heading. Each row shows a leaf and
  the nearest two parents on one muted line with slash separators, instead of
  repeating the long taxonomy root. Full paths remain in accessible row names
  and titles. Existing centered header/back and floating search stay in place.
- Result selection/clear returns focus to the trigger without changing form
  scroll. Query typing retains the existing search DOM/caret. Category stays
  optional; Product/Service selections remain independent.

Opus 5.5 with explicit high effort authored the concise refinement specification
from a self-contained brief, with tools disabled; canonical returned model
verified. Codex grounded and integrated it locally against existing components.
No private source/assets transmitted. Impeccable context and craft guidance used
for this narrow refinement; the native design notes/actual implementation remain
the visual authority. This was not a standalone formal critique run.

## Verification

- Compared v18 archived assets with v17: all 61 files retained, only
  `19-first-product-setup/index.html` changed. All shared assets and other screens
  are byte-identical, including the actual floating search implementation.
- Inline JS syntax check: pass.
- Rendered computed comparison (both unfocused): Category and Name have identical
  height 48px, radius 14px, 15px/600 typography, muted fill and border. No new palette.
- Rendered rows: 62px height, 12px vertical/14px horizontal padding; context is nowrap.
- Compact 320×568: Product six choices, incremental typing `milk` gives one result,
  query X restores six rows, pick returns showing Milk, Back from an empty search
  preserves Milk and Name, and field X returns Select category: pass.
- Service/dark: slash query `Services / Professional Services / Tax` gives one
  Tax Services result and returns with existing name/price: pass.
- Step synchronization, compact size, light/dark and config collapse/reopen with
  Service/Essentials/theme/size preserved: pass. Full navigation/shared controls
  retain the unchanged source and prior v17 evidence; no redundant app matrix.
- Browser error/warning logs empty when checked. No product save performed.
- Impeccable detector ran once on the finished HTML. It reported one gold
  zero-offset-shadow warning. Category adds no shadows; unchanged shared design
  and historical alternatives remain outside this refinement. This warning is
  disclosed, not represented as a clean scan or owner acceptance.
- Screenshots: `/private/tmp/ewatrade-category-consistency-field.png` and
  `/private/tmp/ewatrade-category-consistency-search.png`.
- Prior offline doctor evidence reused: no relevant dependencies/runtime changes.
  Owned-path documentation smoke: core-only plan, no unknown mappings; QA tooling
  types and 47 tests / 193 assertions pass. Concurrent changes excluded explicitly.

Owner review of this exact revision is still required before native build.
Brain impact: updated `.brain/design/2026-10-29-mobile-category-search-workshop.md`
and `.brain/tasks/in-progress.md`. No accepted architecture/API/schema changes,
so database/API/ADR documentation needs no update.
