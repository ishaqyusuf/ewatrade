# Locked physical purchase receipt confirmation — 11 October 2026

Evidence kind: canonical source/unit and provider-free database confirmation.
E05/PN07 remains partial. The assistant action still accepts INVOICE/OWNERSHIP;
physical receipt proposals, editor and whole assistant transaction are not enabled.

recognizeReviewedFinancePurchaseReceiptInTransaction compares a SHA-256 digest of
the complete current physical receipt review inside the canonical Finance command.
Fresh authority and immutable source are verified under the existing Book lock;
original stock rows are locked in sorted order before stock/category/pool review.
The exact comparison precedes financial or stock writes. Receipt revisions are
derived from actual reviewed original lines; no supplied source graph or alternate
cost/stock target is accepted. Command replay retains authority and exact payload
binding, with a separate reviewed-receipt command kind and the approved digest.

Recognition valuation reuses that transaction's verified complete original owner.
It reads the new immutable journal/lines and actual saved receipts/movements, then
checks the actual created recognition event, original goods/unit/configuration,
physical actor/date and Store against those persisted facts before valuation.
The same pure journal/control proof and receipt-movement proof remain authoritative.
The generic batch/single valuation adapters still load their own complete owners.
There is no global cache, model graph, nested transaction, root-client write,
change to quantity/value arithmetic or increased transaction timeout.

Focused22 tests/136 assertions pass: prior invoice/ownership and canonical receipt
valuation regressions, exact source/movement/journal mutations, whole receipt guards,
known/UNKNOWN arithmetic and new fingerprint sensitivity/malformed approval refusal.
Affected source/test/API adapter TypeScript exits0; no broad/mobile checks.

The first database launch failed before any query could reach the server in the
network sandbox. The approved network-capable retry used exact ewatrade_qa_v1,
classified QA tenant, exact Owner/email and the retained owned agreement. A wrong
64-character digest refuses with CONFLICT and saved fact counts remain unchanged.
Matching digest confirmation, including its fresh full locked review, exact physical
receipt and valuation comparison, completes28,060ms inside the unchanged30s budget.
The separate advisory review takes11,515ms. Flour0→2.125bag/1000 NGN minor and
Sugar0→1bag/100 retain exact KNOWN value0→1000/0→100. Every quantity/cost/value/status/
sequence field agrees with the reviewed projection. Deliberate rollback preserves
saved events2/journals2/receipts0. No fixture cleanup or persistent writes.

Raw mode-reviewed result and log are retained in ignored artifacts. The reusable
comparison helper now supports both original command and reviewed confirmation.
The pg concurrent-query deprecation warning is nonfatal and retained.

Owning agreement screenshot: artifacts/assistant-operations-web/
e05-receipt-confirmation-agreement-web.jpg. Only saved invoice/ownership are present;
the global sheet opens and closes over the assistant. Temporary inspection tab closed.

The canonical confirmation now fits for the two-line local example, but ~1.9s
remaining headroom does not establish acceptance of the surrounding assistant
proposal claim/completion transaction. Next: retain the same transaction-local
fresh review through proposal confirmation, verify replay/stale/authority/rollback
at that boundary and implement the receipt editor and owning saved history.
Larger bounds, advances/allocation/settlement and full E05 acceptance remain open.
No availability change, provider, schema/migration, mobile, push or deployment.
Roadmap remains13/45 accepted(28.9%),32/45 not accepted(71.1%), including deferred A04.
