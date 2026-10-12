# Direct purchase — assistant source and dashboard editor

12 October 2026. Capability `finance.purchase.record` v1/action `purchase_record`
remains planned. Canonical `finance.recordPurchase` now has its strict assistant
adapter and actual dashboard editor. E05 partial/unbookmarked; all three remaining
procedures stay unchecked. Roadmap13/45accepted28.9%,32awaiting71.1% (11partial,
20pending,1mobile A04deferred). Full45-ticket goal remains active.

The strict payload permits Book/supplier, exact UTC bill/due date, description/
reference and1–10 distinct original goods with exact unit/config/revision, positive
string minor cost and1–10 named/existing categories each. Total cost is capped at
100000000000000. Explicit invoiceOwnershipReceiptConfirmed=true binds the combined
invoice/ownership/physical receipt facts. Caller Tenant, actor, Store, key, proof or
posting lines are rejected. Canonical Store/authority are derived from active scope;
the adapter retains Owner/Admin finance plan/access checks and fresh whole-review
preparation using the approved digest. Plain execution refuses without locked signed
preparation. Receipt uses the existing global finance_purchase_bill overlay/Book.
Source availability, API runtime and persistent financial writes were not changed.

Review text shows exact supplier/Store/date/due/reference, each entered unit/cost,
on-hand/reserved/available and canonical stock quantity, original cost and known or
explicit unknown carrying value, category creation, original Inventory1300 debit/
Payable2000 credit and total payable increase. Payment/transfer/advance allocation
are absent; receipt correction needs the canonical supplier-return source. Draft
instructions use authorized lookups and natural questions, distinguish registration
and separately timed recognition, and never ask the merchant to supply IDs or JSON.

Midday customer form/feature-flow and existing assistant registration/editor/query
patterns were inspected and followed. Finance Workshop comparison is retained as a
React preview:01 labelled goods cards,02 compact grid,03 step form.01 was selected
under the owner's implement-and-pick instruction: it preserves the accepted form
pattern and keeps all invoice/goods controls labelled. Alternatives had working
local simulated review/step interactions; no real business mutation is performed.
No dependency, new global sheet, table filter or pagination layer is needed here.

## Verification

- 2 strict payload tests23 assertions pass, including override/confirmation/date/
 quantity/revision/category/total guards and maximum10goods/100categories.
- 6 supplier/finance policy tests231 assertions pass. The new source-copy policy
 probe caught a missing domain-access mapping; adding the native finance assertion
 restores Owner/Admin while retaining staff/Free/suspension refusal. Planned visibility
 remains refused even to Owner. Dummy nonconnecting DB URL; no policy database call.
- Scoped affected API/contracts/manifest/context/editor types pass; suite76687exit0.
 The initial checker exceeded Node's default4GB heap after API checks; the scoped
 retry with6GB passed. No unrelated broad typecheck or mobile check was run.
- Actual GeneralProposalEditor browser tab52: fresh acknowledgement refuses Save;
 zero cost refuses; one-line6.25→625minor/2.375 quantity/edited description preserves
 exact original bill .123Z/due .456Z and reviewed Book/supplier/goods/unit/config/
 revision/categories. Maximum ten lines render and remount resets acknowledgement;
 last cost5.05→505minor survives with all10 lines and original exact dates. Due
 earlier than bill refuses, restoring the same displayed due preserves .456Z.
 Cancel shows Cancelled without saving. No business records changed.
- First date fill reported a deadline, but authoritative DOM showed it had taken
 effect; it was not blindly retried. Exact current value drove the refusal check.
- Actual one/ten editor screenshots and payload evidence saved. Selected01 visually
 checked with shared fields/labels/buttons and dashboard chrome. Owned route/tab52
 removed after testing; preview source is retained under artifacts.

Local evidence: `artifacts/assistant-operations-web/e05-direct-purchase-editor-web.json`,
`e05-direct-purchase-editor-web.jpg`, `e05-direct-purchase-ten-line-editor-web.jpg`,
`e05-direct-purchase-editor-preview.tsx`. These are component evidence, not saved
chat confirmation or model evaluations. Canonical1/10-line rollback, exact posting/
stock/value and four authentic stale-source checks are documented separately in
[canonical report](2026-10-12-direct-purchase-canonical.md), commit67e6716b.

## Remaining

Authentic signed confirmation rollback/stale guards and full saved dashboard
Edit/re-review/Confirm/Open/Close/reload/exact readback/concurrent recovery of the
complete1–10 line range remain pending. Capability planned/procedure unchecked;
no mobile/provider/model/schema/deletion/source activation/runtime restart/push/
deployment. Prior supplier-entry reversal enable/API-restart approval still awaits
an answer following automatic review rejection; no retry or workaround.

Brain feature/API/decision/plan/tasks, versioned fixture/run catalog and ticket board
updated. Foreign dirty shared files are preserved using an owned cached patch.
