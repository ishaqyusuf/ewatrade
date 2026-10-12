# Purchase fact reversal — fixture v1

Capability: `finance.purchase.fact.reverse` v1. Web/dashboard only.
Scenarios specify expected behavior; executed evidence is recorded separately.

| Scenario | Expected behavior |
|---|---|
| “Correct that duplicate invoice/ownership fact” | Resolve the exact agreement and original fact through authorized purchase history; ask correction date/reason and bookkeeping acknowledgement |
| Ambiguous fact, missing history or reversal event | Clarify or continue bounded reads; never guess the target or treat a correction as an original |
| Partial amount, replacement goods/accounts or caller stage | Refuse payload overrides; this action reverses the whole original fact with its original accounts |
| Review | Show supplier, Store, agreement, original date/reference, whole goods costs, exact reversed journal and invoice/payable effects |
| Edit | Preserve Book/agreement/event; edit date/reason with fresh acknowledgement and unchanged timestamp precision |
| Invoice | Require no active cash payment or consumed advance; void the original unpaid invoice and reverse the whole payable atomically |
| Ownership | Reverse original controls without voiding an invoice or moving stock/money |
| Physical receipt | Refuse; require the separate supplier return/credit source |
| Dependent original facts | Refuse until later dependent facts are corrected; never perform them implicitly |
| Wrong scope, changed/malformed original journal/cost or revoked authority | Fresh canonical checks refuse before effects |
| Closed period or correction preceding facts/settlement | Refuse the invalid posting date |
| Valid old confirmation after source changes | Reject stale review atomically |
| Confirm/retry/concurrent recovery | Save one linked correction through the owning command and return the owning agreement receipt without duplicate effects |
| Completion failure | Command, journal, correction event, supplier entry, invoice void and proposal completion roll back together |
| Receipt Open/Close/reload | Agreement history opens over the same assistant; completion persists |

No model/provider result is certified by this fixture.
