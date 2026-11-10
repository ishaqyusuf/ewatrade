# Phase 3 — WhatsApp workflows and native-sale implementation

10 November 2026. Chat `01a1c533-0d6b-7220-9fe4-ed71b34ebc0f`, main checkout.
Dispatch baseline `2ecf668cc55775d9731a5afc95c5b5ccded55b47`; coordinator documentation
advanced HEAD to `585842939c3fd7e355b47290f717af787193f921` during this work.
No branch/worktree change, push, deployment or provider action.

## Current T10 checkpoint — supersedes the planning snapshot below

The owner selected exact Library01 v17 `d329aac5-7648-450c-a4bd-4218b4a1b36b`
and authorized T10 product implementation. Selection was recorded before source
edits. Source now implements native exact choice and full stock/payment facts,
restricted same-Order initial payment, immutable complete-page delivery/Next proof,
final canonical revalidation and original receipt recovery behind default-off
release entries. See the [current implementation evidence](2026-11-10-whatsapp-native-catalog-sale.md).

Actual Cancel/stale no-effect checks pass. Paid/Cashier source acceptance remains
open: guarded paid runs reached the unchanged30-second transaction limit. Measured
bounded duplicate-read/context/output repairs pass focused source checks, and the
one isolated partial-payment probe still failed P2028 at30,751ms/30,000ms. Strict
cleanup/externalCalls0 and frozen-graph equality pass. No further retry is open. No
merchant72case, native/device, hosted, provider or deployment acceptance is claimed.
The canonical NGN1m ceiling remains; complete native page count is dynamic rather
than fixed to the design's seven compact pages. Private Site remains unchanged.

The sections below preserve the earlier committed planning/design audit and its
then-current evidence. Statements that v17 is unselected, implementation is pending,
order_create is app-only or no synthetic fixture has run describe that earlier
checkpoint only. They do not describe the current implementation. Later guarded
synthetic QA fixtures, failures and cleanup are recorded in the current receipt.

## Historical planning/design snapshot

## Delivery and remaining acceptance

- [x] Recover T5 `082595e9a` and T6/T7 `1e6672a17`, `6b092d7ca`, `b37a2ac4f`.
  Reuse their existing canonical-domain integration receipts where unchanged.
- [x] Recover exact selected conversations v13 `0bd43b1a-331c-4d40-a816-9dbb0ea1ae66`
  and v14 `ce2df6f7-63ff-4e87-a573-3fda97f00f08`, implementation deviations and
  the owner's current `assistant/conversations` review surface/private-mirror exception.
- [x] Repair the stale T7 capability expectation and verify current channel gates.
- [x] Extend the complete existing Workshop Library with T10.1 design cases.
- [ ] Owner selects the exact T10 revision and authorizes product implementation.
- [ ] T10.2–T10.5 source/authority/page proof and canonical-effect implementation.
- [ ] Actual native/target/merchant/provider acceptance for T5–T7 and T10.

This is local source/design follow-through. The inherited launch score remains
**6/72 local passes (8.3%), 1 fail, 47 blocked, 18 not assessed** at dispatch;
Phase 5 owns subsequent score changes. Source checks and design states do not
increase acceptance credit. No Hypnos/Alhaq catalog, price, stock, photo or shipment
was invented. No sale/payment, business fixture, real phone/OTP/provider send,
hosted setting, build/upload/OTA, private Site publication or release occurred.

## Contract/evidence repair

The existing `capability-action-handoff.test.ts` failed its exact planned-capability
inventory: T7's `finance.shipment.create`, `.receive` and `.cost` were missing.
Add only those existing declarations to the expected list. A focused regression
checks all six T6/T7 writes: app rollout remains `planned`; WhatsApp has the existing
`source`/`aheadOfApp` declaration; default local source does not enable their native
review; exact native-review action enables local source only; hosted public scope
needs both the exact capability ID and exact native-review action; similarly named
entries and disabled writes refuse. `order_create` remains app review even if a
native-review setting names it. No product behavior/permission/manifest changed.

The original T6 impact record claimed this handoff suite passed; the reproduced
current failure supersedes that statement for this baseline. This repair is test
and evidence maintenance, not a newly implemented WhatsApp capability.

Focused executed evidence:

- Offline `qa:doctor` passes target-isolation/dependency/client presence only.
- Owned-doc quick plan maps `core`, zero unknown mappings; final source quick plan
  expands for the changed assistant test (concurrent work excluded).
- Initial six-suite invocation: 31 pass, 2 fail, 1 import error. One failure is the
  stale inventory above. API projection imports require a DB URL even for inert
  stubs; the missing-URL error occurred before a DB connection. Rerun those two
  suites with `EWATRADE_DATABASE_URL=postgresql://unit-only@127.0.0.1:1/unused`:
  **13 tests / 110 assertions pass**, no connection/provider/model call.
- Handoff suite after repair: **7 tests / 164 assertions pass**.
- T5 unchanged command projection, workflow-suggestion and product-limit suites:
  **23 tests pass** in the original run. No connected/photo/provider acceptance
  is inferred. Historical T5 stale presentation expectations and Neon delivery
  flakiness remain scoped in the prior handoff, not relabeled whole-suite green.

The shared Phase 1 source hold was acknowledged at `7dc59b33`; tracked inputs and
HEAD stayed untouched by this chat through Phase 5's early release `c0ee81fe`.
Only independent offline Workshop authoring continued outside the checkout.
Phase 1 retains the emulator; this phase made no device or connected-domain run.

## T10.1 immutable design

Permanent collection: [Assistant conversations](https://workshop.localhost/ewatrade/assistant/conversations).
Review candidate: **01 Library v17 `d329aac5-7648-450c-a4bd-4218b4a1b36b`**,
[exact revision](https://workshop.localhost/ewatrade/assistant/conversations/directions/01?rev=d329aac5-7648-450c-a4bd-4218b4a1b36b).
New candidate is explicitly **not implemented** and is not selected. The selected
v14, every previous revision and all three implementation receipts remain intact.
Intermediate v15/v16 were immutable authoring checkpoints, not owner approvals.

Append **13 proposed cases / 122 states**, using the unchanged shared kit and full
surrounding library. All 62 prior scenes in the affected business file are deeply
equal to the baseline; all other preexisting scene/preview/kit files are unchanged
except the generated combined scene bundle. Current full build: **186 WhatsApp
scenes, 165 capability scenes, 114 app-system/variant scenes, 1,887 steps**; inventory
coverage **186/186, 165/165, 107/107**, plus the unchanged five-flow/47-state pilot.
The strict builder checks schema, message/button limits, copy and all navigation
targets. First build refused one 21-character button label; shortened to 16, then
strict build passed. No limit or validation was weakened.

The [T10 plan](../plans/2026-11-10-whatsapp-native-catalog-sales.md#t101-review-revision--10-november-2026)
maps every stable new case ID. Exact choice, unpaid/partial/full, handover versus
reservation, edit preserving received money, 30-line complete review, page failure,
stale/scope/access, retry/original receipt, restricted cashier initial payment,
separate customer confirmation and exact code/fractional-unit cases are included.
Six item pages show all rows 1–30 exactly once; page 7 gives full totals/customer/
payment/stock summary. No item page has a Confirm control. These are static local
state replays, not a production page-proof implementation; the authoring config can
inspect any state and old-control/refusal results are explicit branches.

Source inspection found two implementation prerequisites, now explicit in the plan:

1. `AssistantWhatsAppActionReview` binds one `reviewOutboxId`/content digest and an
   accepted quoted provider delivery. Read pagination cannot authorize unseen write
   facts. T10 needs a reviewed minimum durable immutable page-set/acknowledgment
   design before changing any schema, then whole-set invalidation and fresh authority.
2. `commercial-orders.ts` calls `ensureOrderCustomerInTransaction`; name/contact may
   create/link a directory Customer. Initial native sales must use a confirmed saved
   customer ID or explicit Walk-in, or separately confirm customer creation first.
   The proposed cashier initial-payment seam remains unimplemented and may not grant
   standalone payment or Finance access.

Exact Claude Opus 5.5/high probe failed with 401 expired OAuth before model output
(zero model usage). Codex took over under standing instructions; no alternate Claude
model/effort and no autonomous external model file access. The private review Site
was left unchanged under the recovered local-only owner exception.

Brain impact: `.brain/tasks/2026-11-10-business-phase-3.md` updated locally; aggregate
Brain/task summaries and acceptance register remain with their designated owners.

## Final checks and rendered review

Owned four-path `test:quick` passes **285 tests / 1,820 assertions**, QA-tooling
TypeScript and changed-file Biome, zero unknown mappings. It excludes peer work;
this is not a whole-checkout application or release acceptance result. Assistant
package TypeScript passes after declaring the test's found capability with the
existing `Capability` type (the initial inferred-union diagnostic is resolved).
This declaration changes no emitted behavior. H01 actual local-profile snapshot
check passes without regeneration; H02 CLI passes two current records covering
client/domain, zero capability/procedure row changes. No schema/route/manifest/
permission source change by this phase; the earlier full API/DB/canonical-domain
integration evidence is reused, with its original limitations.

Chrome shared archived preview **v17**, simulated mobile canvas: exact item and
customer selection reaches complete review; Edit navigation and edited receipt
retain ₦156,000 received against the new ₦234,000 total/₦78,000 balance; partial
₦60,000 review shows ₦96,000 balance and Cancel; deferred collection shows on-hand14,
reserved2, available12; separate Grace Customer Confirm returns to the sale review.
Walked Next across all seven maximum-order pages: only final summary has Confirm;
30 lines/₦2,340,000/received0/balance₦2,340,000/stock50→20 shown. No actual Order
was created. Theme light→dark, size390→320, collapse/reopen, scene navigation with
preferences retained and Reset were exercised; preferences restored light/390.
No browser warning/error logs in this focused preview session. This is a rendered
design check, not WhatsApp-device or integrated approval/state-machine evidence.

Screenshot (local evidence outside Git):
`/Users/M1PRO/.codex/visualizations/2026/11/10/01a1c533-0d6b-7220-9fe4-ed71b34ebc0f/t10-native-sale-v17.png`.
Workshop authoring evidence and before/after records:
`/private/tmp/ewatrade-phase3-design/`,
`/private/tmp/ewatrade-phase3-workshop-{before,after}.json`; final publication
`/private/tmp/ewatrade-phase3-workshop-publish-final.json`.

SHA-256 final design authoring source `scenes/wa/2-business.json`:
`98601b0fab0740747400c85f08b154f864d26e15c0d603e23b605671c0cd939a`;
archived scene bundle `direction-01/data/scenes.js`:
`18453c50a23a2472406707a13e6b6c74aeec1e47c01603b7588ca7bf361051de`.
The complete static preview is archived by Workshop, not copied into this product
repository. Owner selection and product implementation authorization remain open.
