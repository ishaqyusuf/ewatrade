# Purchase payment reversal — fixture v1

Capability: `finance.purchase.payment.reverse` v1. Web/dashboard only.
Scenarios are specifications; executed evidence is recorded separately.

| Scenario | Expected behavior |
|---|---|
| “Correct that duplicate payment to ACME” | Resolve the exact invoice and original payment using authorized reads; ask correction date/reason and bookkeeping acknowledgement |
| Ambiguous payment or omitted history | Clarify or continue bounded reads; never guess IDs |
| Partial reversal or replacement account requested | Explain that this action reverses the whole original recorded payment using its original accounts; clarify the intended operation |
| Review | Show original supplier, invoice, payment/account/date/reference, full amount, exact reversed journal and increased payable |
| Edit | Preserve original Book/payment; edit date/reason with fresh acknowledgement; retain timestamp precision when unchanged |
| Wrong Book, missing/reversed/malformed source, changed invoice or archived account | Refuse before posting; do not substitute another correction |
| Closed period, invalid chronology or revoked authority/session | Fresh canonical scope/period/source checks refuse |
| Valid old confirmation after invoice changes | Reject stale review atomically without effects |
| Confirm | Owning command reverses original journal, adds linked supplier reversal, marks original payment and decreases invoice paid amount atomically |
| Repeat/concurrent confirmation or lost response | Return the same owning invoice receipt without duplicate effects |
| Completion failure | Journal, command, supplier entry, payment reversal metadata, invoice paid amount and proposal completion all roll back |
| Receipt Open/Close/reload | Owning invoice opens over the same assistant and completion persists |
| Refund, recovery, advance release or purchase/stock reversal | Explain distinct operations; this action performs none of these |

No model/provider result is certified by this fixture.
