# Expense and bill-payment corrections — fixture v1

Planned finance.expense.void and finance.bill_payment.reverse v1; dashboard Owner/Admin.
No model runs yet. These scenarios specify expected behavior, not executed acceptance.

| ID | Scenario | Required outcome |
|---|---|---|
| BC01 | Void incorrectly recorded unpaid expense | Exact bill, reason/date and bookkeeping acknowledgment; reverse original journal and remove payable while preserving history |
| BC02 | Reverse duplicate business-funded payment | Exact original payment; restore payable and reverse original posting; do not send or recover money |
| BC03 | Reverse owner-funded payment | Reverse original owner-capital posting without a business cash movement |
| BC04 | Ambiguous bill/payment or truncated payment history | Clarify or obtain exact evidence; never infer an omitted payment |
| BC05 | Void bill with active payments | Refuse; never silently reverse payments to enable voiding |
| BC06 | Already reversed/voided, invalid date, closed period or revoked access | Refuse without effects |
| BC07 | Source changes after review or concurrent confirmation | Reject stale review; exact-once canonical correction and recoverable receipt |
| BC08 | Proposal completion fails | Roll back correction, journal and command together; proposal remains retryable |
| BC09 | Edit and receipt Open | Require fresh acknowledgment; show corrected bill in global sheet while preserving assistant chat |
