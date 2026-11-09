# Revolut-style plan benefits preview — 9 November 2026

Owner chose reference 1 (Revolut iOS Benefits) and requested shaping it in Workshop
before app implementation. Canonical review space:
https://workshop.localhost/ewatrade/legacy/mobile-ui-audit/android-2026-08-24/business-subscription

Only stable direction `a` was revised. Compact higher-plan tabs, one selected-plan
summary, complete grouped benefits and a lower-section anchored action adapt the
reference hierarchy to EwaTrade. The accepted current-plan hero, vertical Usage
and base stylesheet remain unchanged. The preview opens at Plan options; Section
can return to Current plan and Usage. The redundant owner-subscription card stays
removed. Existing full-comparison draft `b/v17` and historic `c/v13` stay intact.

Author: exact `claude-opus-5-5`, explicit `--effort high`, verified launch/init and
successful returned model usage. Safe restricted isolated CLI, StructuredOutput
only, no project/provider tools. Codex integrated the presentation-only section/
footer adapter and coordinated checks. No fallback, bank artwork, introductory
offer, Skip control or invented financial claim was imported. Reference image was
view-only author input; no remote asset ships with the preview.

Public structural reference:
https://www.pinterest.com/pin/paywall-subscription-ui-from-revolut-ios-app--962151907901123256/

## Scope and truth

Free has 10 catalog/storefront items; Starter has 100 catalog items and the full
published catalog. Growth/Pro similarly show the full published catalog bounded
by their catalog allowance. Every selected paid plan retains all capacity rows,
feature leaves, history, support and offline Coming soon wording, without a
numeric assistant quota. Published-only storefront scope and allowance rules
remain in Subscription settings. Current/Free tabs are excluded; Growth has one
fixed Pro option, Pro shows its benefits, and unknown remains unknown.

The business plan anchors comparisons. Purchase and explicit business activation
remain distinct. Paid owners manage through the original store; there is no second
purchase. Restore/remove-plan still require the inherited fresh same-scope proof
controller. Preview outcomes are synthetic; no app/native/API/schema/provider or
deployment change, payment or production acceptance follows.

The old `a/v9` selection/implementation remains authoritative. Choosing the public
reference did not select a new exact product revision.

## Verification

- `qa:doctor --offline` passed; no runtime or connected readiness claim.
- JavaScript syntax checks passed.
- Focused archived-preview suite: 124 checks, all 53 financial state IDs, pinned
  upper equality, higher-only alternatives, tab keyboard navigation/no purchase
  side effects, confirmed Free purchase/cancel, explicit activation, read-only
  controls, settings focus, Restore and remove-plan/no-op handling, compact/theme/
  config navigation. No script errors, external requests or low-contrast text
  findings in the inspected lower-content sample.
- The earlier v17 settings-focus failure was a synchronous test observation before
  the helper's requestAnimationFrame handoff. A focused unchanged-helper probe
  confirmed focus returns after that frame; the suite now awaits the predicate.
  No financial/timing behavior was changed to satisfy the test.
- Initial footer test needed to scroll to Plan options after changing the simulated
  current tier, which changes the pinned upper content height. The footer is scoped
  to the lower section; test navigation now reflects that contract.
- One static Impeccable detector pass on new module/CSS: no findings. This is an
  HTML Workshop check, not a native-code detector verdict.

Final preview: `a/v19`, `b2ed7e07-6eed-4cd9-841d-f56524a0bee9`.
The initial a/v18 remains immutable history. Reviewer copy fix changes only the
lower display period/disclosure and confirmation from “every 1 month” to
“per month”; translated period and unavailable-period gating remain intact.

- Final-revision geometry/completeness suite: 43 checks; 17 Starter / 18 Growth
  and Pro benefit rows, primary action at least 50px, overview/read-only/protected
  sheet suppression, and retired operation resolver disabled after scope change.
  Final settings row cleared the footer by approximately 73px.
- Five focused copy checks passed: summary, purchase disclosure, confirmation,
  retained French period and missing-period block. Reused the valid 124-check
  v18 financial/state evidence: only the reviewed display copy changed.
- Final archived source preservation: upper renderer, base stylesheet, shared
  helper module/CSS, feedback module/CSS, benefits JSON and financial-controller
  prefix are byte-identical to the preceding v17 baseline.
- Fresh shipped Impeccable finish reviewer: initial `fix` for monthly wording;
  initial concept-seed finding resolved not applicable under new-work.md:41's
  precisely specified local-extension exception. A verdict attempt requested a
  corrected tail screenshot (initial scroll had not settled). After that capture,
  full review returned **ship**, no material fixes, at scoped HTML preview level.
  Twelve final captures cover normal, top, Free/Growth/Pro/unknown, benefit tail,
  compact/dark, settings, remove confirmation and Restore progress.
- Shipped documenter completed read-only ordinary-extension review. Preserved
  incumbent DESIGN.md; no sidecar found. Pre-existing canonical frontmatter/
  sidecar drift and upper hero currency wrapping reported, not repaired.
- Catalog comparison: all earlier revision IDs retained; b/c directions exactly
  unchanged; selected revision remains a/v9 `e33d8ec7-faa5-453c-a84b-f72d9ca5fb00`,
  implementation count remains one. No new select/implement record.
- Scoped `test:quick --files` for this receipt: 51 tests / 254 assertions and QA
  tooling typecheck passed; plan had zero unmapped paths. This excludes concurrent
  checkout changes and is source smoke, not application or release acceptance.

Safe captures, verification outputs, sanitized launch/model provenance and review
findings are archived alongside the Workshop source in
`revolut-benefits-2026-11-09-verification/`. No raw model thinking logs retained there.

## Brain impact

Updated local ignored memory `.brain/features/mobile-owner-ledger.md` and
`.brain/tasks/subscription-benefits-alignment-2026-11-09.md`: owner reference choice,
new exact preview/evidence, and pending native implementation. No force-add.
Shared checkout commits must use exact-path `git commit --only`; no unrelated
staged changes belong to this receipt.
