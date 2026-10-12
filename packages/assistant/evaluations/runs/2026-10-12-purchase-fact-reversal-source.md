# Purchase fact reversal — source, canonical rollback and editor

12 October 2026. E05 remains partial/unbookmarked. Capability remains `planned`.
Evidence kinds: deterministic integration and manual web component check;
provider/model: not applicable. No actual saved assistant reversal is certified.

## Implementation

Strict `purchase_recognition_reverse` binds the Book, original agreement/event,
correction date/reason and `bookkeepingOnly=true`. Stage, amount, replacement
accounts/goods, tenant/actor and command identity cannot be supplied by callers.
Natural-language instructions resolve authorized purchase history and clarify the
intended original invoice/ownership fact before drafting.

Advisory review shares the canonical original journal/cost/source guards. Fresh
confirmation prepares that proof under the Book lock and keeps it in a private,
snapshot-bound execution closure for one command. Existing authority, replay and
posting checks remain; no nested transaction or caller proof/cache is introduced.
Review includes whole original costs, original controls and history, dependent
facts, settlement snapshot, date/reason and stock/money boundaries. The receipt
targets the owning agreement through the existing global purchase sheet.

Invoice reversal voids only the original unpaid invoice and removes its whole
payable; active cash payments or consumed advances must already be corrected.
Ownership reversal changes original controls without invoice void or payable
removal. Canonical physical receipt reversal remains refused: it requires a
supplier return/credit source. No refund, recovery, advance release or stock move
is performed implicitly.

## Executed evidence

- Strict contract and canonical review: **4 tests, 150 assertions**, pass.
  Includes invoice/ownership controls, preserved costs, physical receipt,
  dependent facts, original source integrity, active settlement, authority,
  closed periods and correction chronology.
- Finance capability policy: **3 tests, 201 assertions**, pass, provider-free.
  Planned capability stays unavailable. With test-only source visibility,
  Owner/Admin are allowed; staff, Free plan and suspended access are denied.
  Policy used a nonconnecting dummy database URL; no database call was made.
- Scoped affected API/core/QA helper and dashboard types: pass.
- Exact classified `ewatrade_qa_v1` Owner fixture, whole cost1300minor:
  invoice review **5.904s**, reversal/readback/replay **14.179s**;
  ownership review **5.302s**, reversal/readback/replay **12.395s**.
  Invoice original2000Cr/1340Dr reverses2000Dr/1340Cr and voids the unpaid bill;
  ownership recorded after invoice reverses1340Dr/1310Cr. Exact original journal
  account/amount reversal, event link/date/reason/actor, invoice metadata,
  memoized replay, different-command refusal and native command replay pass.
  Forced rollback preserves saved command/journal/event/supplier-entry/receipt/
  valuation counts, Book sequence and original invoice fields.
- Real later ownership blocks invoice reversal; real physical receipt correction
  refuses with the supplier-return boundary.
- Actual dashboard component: missing acknowledgement refuses Save; edited reason
  saves exact Book/agreement/event and unchanged `2026-10-10T12:00:00.123Z` despite
  browser input normalization. Screenshot retained; owned route/tab removed.

Existing maxWait10s/timeout30s unchanged. Original QA invoice and ownership source
facts are retained; tested reversals roll back. No fixture deletion. Nonfatal
existing pg concurrent-query deprecation warning is retained in the DB log.

Local evidence under `artifacts/assistant-operations-web/`:
`e05-fact-reversal-rollback.json`, `e05-fact-reversal-editor-web.jpg` and the retained
component/script fixtures. Terminal log: `/private/tmp/e05-fact-reversal-rollback.log`.
Runtime API was not restarted and does not yet load this planned action.

## Remaining scope

Actual signed assistant completion rollback/stale-source refusal, saved dashboard
Edit/re-review/Confirm, owning history Open/Close/reload and concurrent completed
recovery precede availability and the procedure check. E05 still has four unchecked
canonical procedures: direct purchase, supplier opening, purchase fact reversal
and supplier entry reversal, plus parent operational acceptance. Roadmap13/45
accepted28.9%;32/45 awaiting71.1%; mobileA04 deferred. No mobile work, provider call,
schema/migration change, push or deployment.
