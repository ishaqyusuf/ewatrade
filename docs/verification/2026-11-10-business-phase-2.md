# Phase 2 — shipment UI continuation — 10 November 2026

Status: **focused source repairs verified; local commit recorded in Git/handoff**.
T4/R10–R15 connected business acceptance remains open. No launch credit claimed.

Owner chat `01a1c532-fad9-7f40-a027-1ae797f43268`; coordinating chat
`01a1c511-a483-75b0-b017-0152cab33c12`. Initial main checkout was
`2ecf668cc55775d9731a5afc95c5b5ccded55b47` with only foreign `AGENT_CHAT.md` dirty.
No worktree, branch change, push, merge, build, provider action or deployment.

## Preserved baseline and evidence

Workshop `ewatrade/dashboard/web-app/inventory/shipments`, selected **01 Record
sheet** revision `923e5659`, is the implemented baseline. Preserve full sheet/step
flow and earlier immutable design history. Existing source commits:

- `0c3848939`: shared status/landed-cost helpers.
- `27a53202f`: dashboard Inventory → Shipments and record-sheet steps.
- `ea8d58176`: shared draft model.
- `623e90e8d`: mobile More → Shipments and arrival steps.
- `60ff9e2cc`: readable dashboard currency picker.
- `f2e296168`: Store-owned stock choices and mobile title repair.
- `39ada60cd`: later type-only fixes, including shared draft/arrival line types.

Reuse the recorded successful list/form/picker/missing-rate refusal checks from
[the gap-ticket handoff](../../.brain/tasks/2026-11-09-four-business-gap-tickets.md)
and [takeover](2026-11-10-five-phase-takeover.md). Their original browser/emulator
scope stays historical. T1's prior costing9/30 and integration1/32 are canonical
backend evidence at their recorded source/target, not this UI's merchant receipt.
No ordinary theme/viewport/font/device matrix was repeated.

Limits remain: one freight charge; edit only Draft, Reopen only an unreceived and
unadjusted Expected shipment; catalog mapping before arrival; existing revisioned
Catalog commands for prospective selling prices; canonical `Shipment` Inventory
receipt category; received stock retains its cost. Owner/Admin Finance admission,
server-derived tenant/Store scope and stock/configuration revisions remain intact.

## Reproduced defects and repairs

Actual mounted `ShipmentSheet` and `ShipmentScreen` used real React state/handlers
with inert query, mutation and UI ports. Pre-repair source: **eight regression
failures and one passing ordinary whole-unit control**. No in-memory fixture was
persisted, no product runtime was driven and no business/provider call occurred.

- Dashboard `1.` crashed exact arithmetic during total/render; negative input in
  another row was silently omitted while valid rows could submit. Arrival preflight
  now validates every row before any receive request and keeps unfinished input
  renderable. Negative/malformed/over-six-decimal or excessive quantities refuse
  the whole arrival. Blank/zero rows remain omitted.
- Dashboard `0.3 − 0.1` showed `0.19999999999999998`; shared exact-decimal strings
  now produce `0.2` through preview, total and canonical receipt input.
- Mobile floored outstanding quantities: Everything selected2 instead of2.5 and
  a final0.5 could not be received. The existing stepper now clamps exactly to the
  outstanding amount, and its center supports decimal entry through the existing
  FormField. Whole-unit controls remain. Compact side widths preserve space for
  the field without adding a new component or search variant.
- Both price steps silently skipped malformed later entries. Shared preflight
  validates all entered values against Catalog's existing100,000,000-minor bound
  before the first write. Repeated offerings must agree and produce one command;
  unchanged/blank values are skipped; zero remains valid.
- Each selling price remains its own revisioned `catalog.updatePrice` command.
  A later failure now reports the successful count and refreshes prices/revisions
  before retry, so already-saved prices are skipped. This is explicitly not an
  atomic multi-price transaction.
- Dashboard's existing landed-cost callback referenced a possibly-undefined line
  after an outer guard. Capturing the already-checked ID fixes the compiler error
  without changing which line/command is submitted. No adjustment formula change.

Both apps retain thin command wiring; shared UI arithmetic/preflight lives in
`@ewatrade/utils/shipments`, following the local Midday form/quantity pattern.
No backend/API/schema/permission/manifest/WhatsApp rollout change. Assistant T7's
planned/source status remains owned by Phase 3; source presence is not live access.

## Verification

- Offline `qa:doctor --offline`: PASS for isolation/dependency/client presence;
  runtime/schema freshness is not certified.
- Owned-path quick plan: core/web/domain/mobile groups, zero unknown mappings;
  excludes concurrent phase source. Final scoped execution recorded below.
- Focused `bun --env-file=/dev/null test ./packages/utils/src/shipments.test.ts
  ./packages/utils/src/shipment-draft.test.ts
  ./apps/dashboard/src/components/shipments/shipment-steps.test.ts`:
  **13 outer tests /60 assertions PASS**, including the exact nine isolated child
  screen cases with no failures/skips. Child count is not added to the outer total.
- Whole mobile TypeScript: PASS (`tsc --noEmit -p apps/mobile/tsconfig.json`,16GB
  heap). Mobile has no `typecheck` script; the initial script lookup failed before
  compilation, then the actual configured compiler command was used.
- Whole Dashboard TypeScript: PASS (12GB heap). Initial run exposed the existing
  line callback diagnostic and test-only static mobile import pulling native aliases
  into Dashboard. The fixture now resolves the second app at runtime; each app
  retains its full independent compiler graph, with no relaxed settings. The final
  isolated wrapper rerun passes1test/15assertions and all9exact child cases.
- Final eight-owned-path fast smoke: **285tests/1,820assertions PASS**, QA tooling
  types and changed-source Biome PASS, zero unknown mappings. This deliberately
  excludes concurrent Phase1/3/4/5 source and is not whole-checkout approval.
- Scoped mobile ESLint and owned whitespace checks: PASS.
- Actual local-profile H01: current snapshot/PASS. Exact eight-path H02 evaluation:
  PASS, one owned record, client/domain areas, zero capability/procedure row changes.
  The normal working-tree H02 also passed with another phase's valid record; that
  is not foreign-work acceptance. No coverage regeneration needed.
- Owned receipt/Brain local links and final7source/impact-file Biome: PASS.

## Coordination and remaining acceptance

Claims/ACKs use root `bun agent:chat`; same-sender Codex messages were read from
shared history because they are excluded from the opposite-agent unread inbox.
Phase2 honored Phase5's native source hold, preparing only under `/private/tmp`.
No repository source was changed until early release `c0ee81fe` at11:31:40Z;
repair began on `585842939`. Phase1 retained emulator5556 throughout. No native
launch, shared-service restart or competing connected run occurred here.

Phase5 owns the case register and acceptance-run documents; neither was edited.
At dispatch the global register was **6/72 local passes (8.3%),1failed,47blocked,
18not assessed**. These source repairs do not promote a launch/hosted case.

Remaining create/confirm/landed-adjustment/selling-price/partial-receive acceptance
requires Phase5's agreed nonproduction window and owner-approved real shipment
facts. Hypnos/Alhaq catalog, supplier, prices, stock, photos and shipment facts
remain unavailable. Do not manufacture them or submit a shipment/payment for smoke.
The review is ready to execute once that dependency is satisfied:

1. Pin the current source/runtime/profile and exact approved business/Store,
   supplier, stock sources/units, expected quantities, source prices, rates with
   date/source, freight allocation and prospective selling prices.
2. Create via the existing draft UI; missing-rate refusal must create no shipment.
   Review saved rates/allocation and totals before Confirm; no stock/bill yet.
3. Confirm pins costs. Verify draft-only editing/Reopen rules, unreceived-cost delta
   with reason, received-cost preservation and prospective price/history behavior.
4. Record an approved partial arrival with stock/config revisions and `Shipment`
   category; verify actual stock delta and exactly one canonical supplier bill at
   that arrival's landed cost. Verify over-receipt/replay/concurrent-stale refusal.
5. Record the approved remainder, including fractional quantity if present; verify
   exact outstanding zero and final cost remainder. Preserve receipts and links.

These are acceptance instructions, not claimed executions. Existing canonical
backend/concurrency tests are reused where unchanged; genuine money, permission,
concurrency and native/target requirements still apply. No hosted/publication,
provider send, real phone, paid effect, native build/upload/OTA or deployment.

Brain updates (local_only): `.brain/features/shipment-ui.md` and
`.brain/tasks/2026-11-10-business-phase-2.md`. No schema/API/ADR update required:
no persistence contract, server authority or durable architecture decision changed.
