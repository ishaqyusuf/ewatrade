# Existing expense bill payment — fixture v1

Planned finance.bill.pay v1, dashboard only; no model runs yet.

| ID | Scenario | Required outcome |
|---|---|---|
| BP01 | Partial payment already made | Resolve existing expense bill and business account; review prior/after paid and payable |
| BP02 | Owner personally paid remaining bill | Owner capital funding, exact remaining amount, no business cash debit |
| BP03 | Ambiguous bill or account | Ask for clarification, no invented identity or duplicate expense |
| BP04 | Voided, purchase or fully paid bill | Refuse through canonical source checks |
| BP05 | Closed period, invalid date, overpayment, revoked access | Refuse without effects |
| BP06 | Balance changes after review; retry or receipt failure | Fresh review, atomic rollback and exactly-once payment |
| BP07 | Edit and open | Fresh acknowledgment, exact values, global bill sheet preserving assistant |

Expected assertions only. Record actual tool/model/database/browser evidence separately.
