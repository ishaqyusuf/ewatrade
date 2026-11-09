# Subscription plan redesign — Workshop review, 9 November 2026

The owner rejected the v10 simple overview because it concealed complete package
benefits. This replaces that proposal with three complete, interactive directions
in the existing Workshop. It does not select or implement a new product direction.

## Review choices

Permanent comparison: https://workshop.localhost/ewatrade/legacy/mobile-ui-audit/android-2026-08-24/business-subscription

| Direction | Exact revision | Reading structure |
| --- | --- | --- |
| 01 Benefits tabs (recommended) | a/v14 `5a86be5d-efe9-49bf-9b0c-adc097279ea0` | Four tabs, one complete package visible by default; all included and unavailable features remain explicit. |
| 02 Plan list → full comparison | b/v14 `daaebc06-6964-4cd6-831e-bb428324828c` | Compact plan list transitions to replacement comparison with Back; never appends another overview. |
| 03 Your plan beside another | c/v13 `4061804a-336a-463f-a83f-8207649dc9d0` | Current business plan beside an alternative; complete common, added and missing benefits. |

All four plans include scoped capacities, catalog/storefront distinction,
support/history/device allowances, full inherited features and Coming soon offline
wording. Free proposes 10 public storefront items; Starter proposes its full
published catalog within 100 catalog items, Growth within 1,000, Pro unlimited.
No numeric assistant allowance is invented. Paid owners explicitly cover a business;
purchase or restore alone never grants business enrollment. Sample store prices
and outcomes are synthetic, and localized store terms retain authority.

## Actual model authorship and preserved baseline

Two isolated safe/restricted CLI author jobs ran with exact
`--model claude-opus-5-5 --effort high`: three lower layouts and the common floating
feedback renderer. Init metadata and final modelUsage confirm `claude-opus-5-5`
for both successful jobs. Inputs were sanitized preview source, simulated captures,
product facts and skill references. No repository/private payment inputs, MCP tools,
Chrome access or product/provider effects were granted. Only StructuredOutput was
available for returning source. Codex integrated the authored modules with the
existing simulator, proof guards, accessibility corrections and verification.

The selected, implemented a/v9 `e33d8ec7-faa5-453c-a84b-f72d9ca5fb00`
(source commit `e047ed676`) stays selected. Rejected a/v10
`bf06b0f6-f10d-4b8f-b485-ac344a770751`, intermediate drafts, b/c history and
historic d remain archived. Existing upper plan/vertical Usage renderer and base
CSS are byte-identical. All 53 named financial states and 15 scenario groups
remain. New revisions are unselected/unimplemented; the catalog's overall
implemented status belongs to the old v9 record, not these proposals.

## Restore and Release floating feedback

The coordinated additional design request is included in every direction:

- Restore responds on first tap with processing. Only explicit verified purchase,
  completed store finishing and fresh same-scope postconditions permit success.
- Release first asks for confirmation. It explains freeing the owner slot,
  returning the business to Free limits, keeping records/existing staff and
  continuing Apple renewal until separately cancelled in App Store settings.
- A fresh same-scope catalog must prove the business is unenrolled before release
  success. A resolved `Promise<void>` or no-op callback is insufficient.
- Confirmed success holds briefly, auto-closes, refreshes the owning screen, then
  scrolls its phone content to the top. Refresh failure has its own sheet and
  refresh-only retry, never repeating the operation.
- No purchase, pending/deferred, verification/store-finish failure, operation
  failure and resolved-no-proof outcomes stay truthful without auto-success/top.
  Account/business changes retire operation identity/timers and prevent stale
  completion, refresh or scroll, including a switch during the success hold.

These are local simulated transitions. They do not prove native completion or fix
the reported first Cover tap. The real recovered Starter Sandbox purchase and
current enrollment are coordinated runtime evidence, not recreated in this work.
No app/backend/catalog caps, purchase handler, billing provider, API, schema,
permission, assistant authority, native binary, OTA, provider configuration or
release is changed. Existing runtime storefront caps remain pending approved work.

## Focused verification

- QA doctor offline passed. Documentation source-smoke scope is this owned receipt;
  the planned core group contains four existing tests. Native and release acceptance
  are separate.
- Canonical archived Workshop phone previews rendered with normal certificate
  validation, no substitute server or live payment fixtures.
- Plan suite after type/contrast corrections: 205 assertions, zero script errors;
  all 53 states render across all three directions. Single replacement view, all paid feature labels, unchanged
  upper markup, compact comparison without horizontal overflow and shared theme,
  size, collapse/reopen and cross-screen preference persistence checked.
- Shared controller suite: 56 assertions, zero script errors on the same simulator
  source before style-only corrections. First-tap processing, safe confirmation,
  proof-gated completion, close/refresh/top order, no-op/failure/pending, refresh-only
  retry and scope retirement checked. Final shared-sheet recaptures additionally
  verify scope retirement after success but before auto-close/refresh.
- Final visible lower text contrast sample has no ratios below 4.5. One static
  Impeccable detector pass on the new lower/sheet CSS returned zero findings;
  native code was not scanned or accepted by that detector.
- Independent finish review initially returned `fix` for typography below the
  incumbent scale and 48px sheet primary controls. One scoped correction restores
  body 16/22, support 14/20 and primary controls 50px; same phone captures recaptured.
  Reviewer scored the two findings resolved. A correction-induced compact word
  wrap was fixed by recovering cell space without reducing 14/20 type; the same
  compact capture was checked again with no horizontal overflow. Final independent
  disposition: `ship`, covering the scored fixes only, not native/production acceptance.
- Independent documenter preserved incumbent system files: no approved identity
  change. New type/control/motion conventions match the recorded scale. It reported
  pre-existing DESIGN.md teal/pinned green versus current native Midnight/indigo
  palette drift; no system refresh or sidecar creation was made to legitimize it.

Local reproducibility evidence: `/private/tmp/opus-plan-verification.json`,
`/private/tmp/opus-flow-verification.json`, `/private/tmp/opus-flow-final-visual.json`,
`/private/tmp/opus-detector.json` and captures under
`/private/tmp/opus-plans-review/`. These temporary receipts are not shipped files;
immutable bundled previews/coverage/provenance remain in the shared Workshop.
A durable local copy of the safe reports, captures and review record is retained
beside the Workshop sources in `verification-2026-11-09-opus/` (outside the product
checkout, ignored by the Workshop repository).

## Next stage and Brain impact

Workshop redesign is ready for owner review. The Workshop skill requires:
“Before applying a choice, record the accepted exact revision.” The previous 01/v9
selection does not authorize any of the newly revised options. After selection,
app/catalog benefit alignment and the chosen native interaction require a separate
source implementation with focused verification and exact catalog evidence.
No deployment or provider action is implied.

Local Brain records updated: `.brain/features/mobile-owner-ledger.md` and
`.brain/tasks/subscription-benefits-alignment-2026-11-09.md`. Product targets in the
existing alignment ADR remain unchanged. No API/schema/permission or assistant
contract changes at this preview stage. Brain is ignored local project memory;
only this owned documentation receipt is included in the local commit.

The billing coordinator released the temporary checkout hold for this single
owned documentation milestone after `fc2b64f8d`. No native implementation,
selection or deployment is authorized. Further repository commits remain on hold
for the next pinned billing release after this documentation commit.

Documentation-only source smoke passed: 51 tests / 254 assertions across four
existing files, plus QA tooling types; no applicable changed Biome files. Scope
was `--files docs/verification/2026-11-09-subscription-plan-redesign.md`, excluding
unrelated jobs/release work. This is documentation source evidence, not native,
provider, runtime or release acceptance. The prior preview evidence is reused;
no UI/device/payment checks were repeated for this documentation milestone.
