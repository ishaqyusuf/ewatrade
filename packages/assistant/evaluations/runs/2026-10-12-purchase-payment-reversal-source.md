# Purchase payment reversal — source, signed rollback and editor

12 October 2026. E05 remains partial/unbookmarked. Capability remains `planned`;
actual saved dashboard Confirm/Open/Close/reload and concurrent completed recovery
are the next acceptance step. No model/provider run or deployment is certified.

## Implementation

Strict `purchase_payment_reverse` payload binds Book and exact original payment,
correction date/reason and `bookkeepingOnly=true`. No caller amount, replacement
account, supplier/invoice override, authority or command identity is accepted.
Natural-language drafting uses exact authorized invoice/payment history and asks
for missing facts instead of merchant-supplied internal IDs.

Advisory review shares the original canonical command's source proof. Signed
confirmation prepares the exact original proof once under the Book lock and keeps
it private to a snapshot-bound, one-command execution closure. It retains canonical
command authority/locking/replay and posting checks; there is no caller-supplied
proof, nested transaction, cross-transaction cache or timeout increase.

Review shows original payment/account/date/reference, full amount, reversed
journal, invoice paid/payable before/after, correction date/reason and no-money/
no-advance/no-purchase-cost/no-stock boundaries. Receipt opens the owning purchase
invoice. The existing dashboard correction editor supports this distinct action,
fixed source, date/reason, fresh acknowledgement, disabled controls and cancellation.

## Executed evidence

- Strict schema and canonical settlement review: **9 tests, 494 assertions**, pass.
  Includes missing/reversed/malformed/altered original payment, archived account,
  insufficient paid amount, changed/voided invoice, authority, cutoff and chronology.
- Finance capability policy: **3 tests, 184 assertions**, pass. Reversal stays
  unavailable while planned; when source-visible it allows Owner/Admin and denies
  Manager/Cashier/Operator, scoped staff, Free plan and suspended access.
  The first provider-free policy invocation lacked the required client-construction
  environment value; rerun used a nonconnecting dummy URL and passed. No database
  connection was made by this policy suite.
- Scoped affected API/core/harness and dashboard types: pass.
- Exact classified `ewatrade_qa_v1` Owner fixture: advisory review **7.482s**;
  owning command, precise journal/metadata/bill readback, private execution memoized
  replay, different command refusal and canonical command replay **16.998s**.
  Forced rollback preserves original payment metadata, invoice paid amount, Book
  sequence and commands/journals/entries/allocations/releases/receipts/valuations.
- Actual signed assistant confirmation reaches completion failure injection in
  **17.988s**. All business effects roll back; pending proposal remains. One original
  purchase recognition proof read occurs. Existing maxWait10s/timeout30s unchanged.
- Valid old signed review after invoice paid amount changes by one minor unit:
  actual decider refuses `CONFLICT` / “Review again”; test change rolls back.
  Negative probe plus saved-fact readback **16.111s**. Payment reversal metadata,
  invoice, Book sequence, all counted finance/purchase facts and all fourteen Store
  stock quantities/reservations/revisions remain identical.
- Actual browser component: missing acknowledgement refuses Save; changed reason
  saves fixed Book/payment and unchanged `2026-10-10T12:00:00.123Z`; disabled controls
  refuse interaction; Cancel records cancellation. Temporary route/tab removed.

Reviewed original payment250minor, original Shop cash account; invoice paid475→225,
remaining payable625→875, original journal reverses Dr cash250/Cr payable250.
Advance allocation/release and physical goods remain unchanged. No recovery,
refund or transfer is performed. No saved reversal has yet been confirmed.

Retained pending proposal: `f6557e85-855f-4604-82cf-25200de2afc5`, original payment
`cmv4g1us90006bp9kzdn3r89l`, original invoice `cmv494fds00142h9kh6r2qv6u`.
Test-only capability visibility was set after exact QA database/Owner/source guards
and restored afterward. Signatures, fresh authorization, locks and commands remain
real. Runtime API not restarted for this milestone; it has the previous source.

Local evidence: `e05-purchase-payment-reversal-rollback.json`,
`e05-payment-reversal-proposal-rollback.json`, `e05-payment-reversal-editor-web.jpg`
under `artifacts/assistant-operations-web/`; terminal logs under `/private/tmp/`.
Nonfatal existing pg concurrent-query deprecation warning retained in DB logs.

## Remaining scope

Full dashboard saved confirmation, owning invoice overlay/reload/readback and
concurrent completed recovery precede source availability. E05 also needs direct
purchase, supplier opening, purchase recognition reversal and supplier entry
reversal, plus parent operational acceptance. Roadmap13/45 accepted28.9%;32/45
awaiting71.1%. MobileA04deferred. No mobile work, provider calls, fixture deletion,
schema/migration change, push or deployment.
