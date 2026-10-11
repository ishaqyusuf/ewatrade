# Customer receipt conversation fixtures — version 1

Capability customers.receipt.record v1, action customer_receipt, dashboard-only,
planned. All live-model scenarios below are **not run**.

| ID | Request / condition | Required behavior |
|---|---|---|
| CR01 | “Record the new deposit I received from this customer.” | Resolve customer/currency/Book and money account, clarify amount/method/description, require received-money acknowledgment and reviewed confirmation. |
| CR02 | Money already recorded as an order payment | Do not duplicate it as a customer deposit; clarify ownership and use the existing order/payment record. |
| CR03 | “Collect money” or ambiguous receipt/customer/account | Do not claim collection or infer receipt; ask for the missing facts without creating an effect. |
| CR04 | Concurrent account change or account archived / period closed | Refresh stale review or refuse using canonical current checks. |
| CR05 | Revoked role or foreign target | Refuse without leaking account details or creating records. |
| CR06 | Receipt-save failure, retry or lost response | Ledger credit, receipt, journal and assistant outcome are atomic; retry produces one effect. |
| CR07 | Confirmed receipt | Increase unallocated credit only, leave existing debt/orders unchanged, show named customer receipt over the same assistant chat. |

Record sanitized run outcomes and exact source/model versions separately. Schema
and command tests are not successful conversation evaluations.
