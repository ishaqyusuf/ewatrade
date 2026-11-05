# Web signup and setup — Workshop review candidate

Final candidate: [02 Room to sort v5](https://workshop.localhost/ewatrade/dashboard/owner-signup-redesign/directions/02?rev=4cc2151f-74ab-42bc-a7fe-74d7a4ba78a4).
Revision `4cc2151f-74ab-42bc-a7fe-74d7a4ba78a4`, published 5 November 2026.
Design only: unselected and unimplemented. Existing selected/implemented v2
`a9b4a59d-4c63-4159-b555-4332ca0b69c5`, implementation record
`152962b1-8bc8-49ff-b2f8-c7e885574e7e`, v3 and other directions are preserved.
Initial review candidate v4 `eeb28173-c17e-49af-bc85-4d288594093b` is retained.

## Authorship and review

Claude Opus 5.5 (`claude-opus-5-5`) authored the HTML/CSS/JS with explicit
`--effort high`, session `ab9b42d3-2521-44a0-9267-3fd2bb4704eb`. Returned model,
session and current-checkout metadata were verified for authoring and correction.
Codex coordinated source fidelity, publication and browser review. An independent
Impeccable finish reviewer identified one material issue: at 320px the link-status
checkmark wrapped to a separate row. Opus replaced the wrapping flex status with
an icon/message/Edit grid. The reviewer's verdict pass marked that finding
resolved (`ship` at the scope of the scored fix, not blanket product acceptance).

The independent documentation review confirmed matching marketing v15 light
palette and byte-identical Hedvig/Inter fonts. Headings adapt to 44/34/30px;
controls retain 48px sizing and 8px corners. These are proposed local surface
choices; no global DESIGN.md or design-token registry was created or changed.

## Verification

- Offline QA doctor and existing local Dashboard service probe passed.
- Scoped `test:quick --files` on the four owned Markdown paths passed QA tooling
  types and 48 core tests (211 assertions). No unknown mappings. This deliberately
  excludes unrelated staged explainers and mixed Agent Chat history; it is not
  whole-checkout or feature/API acceptance. `git diff --check` passed.
- Opus's JavaScript syntax check passed; Impeccable detector ran once on the
  three authored files and returned zero findings. The later fix is CSS only.
- CUA inspected the actual current signup before design review, then the
  immutable Workshop. A full local simulation completed Account → Code →
  Business type → Store → country/currency → Overview.
- Also exercised multi-business Move selection; saved setup and Same-as;
  save failure/retry; finish-time link conflict returning to the focused link
  editor; provider-unavailable and Under-13 data clearing states.
- Shared config screen/theme/viewport switches and collapse/reopen preserve
  current data. Light and dark layouts were inspected. Phone surfaces at
  390×844 and 320×568 have no horizontal overflow, 16px input text and measured
  48.8px input heights. These are HTML phone viewport previews, not native tests.
- Browser console had zero errors during the exercised flow. CSS correction
  recaptured at desktop, 390, 320 and grouping; full flow evidence is reused
  because behavior/source JS did not change.
- The author's stub-DOM smoke failed after invoking a location action outside
  the Store step. It is not counted as a passing test. Actual browser location
  simulation worked; no live geolocation or provider request was made.

Final captures are in the conversation visualization directory:
`/Users/M1PRO/.codex/visualizations/2026/11/05/01a1abb7-6541-7eb2-ae56-8b7e43e74579/`
as `signup-v5-desktop.png`, `signup-v5-mobile.png`, `signup-v5-compact.png`, and
`signup-v5-businesses.png`.

Source archive hashes:

| File | SHA-256 |
| --- | --- |
| index.html | 66d7998c73f74483731ad301e3f9fff90ca1e648405556ddc6b1adfe7ef216af |
| kit/web.css | 939ba3c88d41109528422768b43e4e7b8f6d69fe9c91b683191c1aee40008ce7 |
| kit/flow.js | 60de99f653367c32a953d87873a583757b5e3fc8ca0aceb5291c5452884d6fee |

## Limits and next decision

This is a source-grounded interactive design, not account/API/release acceptance.
Countries are a representative subset, location returns a local sample address,
and some API error wording is representative. Home contains the real signup-owned
continuation components, not a recreation of all Dashboard features. Close setup,
share and other external actions are simulated. No real account, agreement,
message, provider configuration, business record or deployment was created.

Current signup policy says Starter/first 3 items; marketing offers say Free/10.
That discrepancy remains visible for policy reconciliation before implementation.
Do not silently turn marketing offer copy into new runtime entitlements.

Owner review of the exact v5 is the next step. Marketing release remains pending
by owner choice, and the Impeccable update is deferred to a later turn. No worktree
was created, branch changed, push/merge/deployment performed or product UI edited.

Brain impact: updated `.brain/BRAIN.md`, `.brain/tasks/in-progress.md`,
`.brain/tasks/2026-11-05-web-signup-refinement.md`, and
`.brain/features/marketing-launch-v4.md`. Brain is locally ignored; tracked
brief/product/verification records preserve the deliverable without force-adding it.
