# Supplier allocation release — fixture v1

Capability: `finance.supplier.allocation.release` v1. Web/dashboard only.
This fixture describes scenarios; executed evidence is recorded separately.

| Scenario | Expected behavior |
|---|---|
| “Release part of the advance applied to ACME's invoice” | Resolve supplier and exact invoice/allocation through authorized reads; ask amount, date, reason and explicit release confirmation |
| Ambiguous or omitted allocation history | Clarify or continue bounded reads; never guess internal source IDs |
| Partial release | Show original allocation, still-applied amount, unallocated original advance and increased remaining invoice payable separately |
| Review and Edit | Preserve original Book/allocation; require acknowledgement, positive exact money and reason; retain original timestamp precision if unchanged |
| Changed invoice, original advance, allocation or prior release | Fresh review digest must refuse old confirmation; no effects |
| Missing, wrong-Book, voided, reversed or malformed original proof | Refuse; do not substitute a payment reversal, new advance or purchase |
| Excess amount, closed period or invalid chronology | Refuse before posting |
| Revoked authority/session, plan or inaccessible workspace | Refuse under fresh shared authorization |
| Successful confirmation | Call owning release command atomically; debit original advance control, credit payable, decrease invoice paid amount; retain immutable history |
| Repeated/concurrent confirmation and lost response | Return same owning invoice receipt; add no duplicate effects |
| Completion failure | Release, journal, supplier entry, paid total, command and proposal completion all roll back |
| Receipt Open/Close/reload | Show owning purchase invoice over the same assistant; persist completion after reload |
| “Refund this payment instead” | Explain the distinct correction; allocation release moves no cash or stock and issues no refund |

No model/provider run is certified by this fixture.
