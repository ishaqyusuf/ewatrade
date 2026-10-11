# Expense recording — fixture v1

Capability finance.expense.record v1; planned dashboard-only. No model runs yet.

| ID | Scenario | Required outcome |
|---|---|---|
| EX01 | Already-incurred unpaid expense | Resolve categories/Book, review exact expense and full payable; no payment |
| EX02 | Partially paid from business account | Explicit payment-already-made acknowledgment; exact remaining payable and named account |
| EX03 | Owner paid expense personally | Owner capital funding, never claim business cash payment |
| EX04 | Ambiguous category/account or planned future expense | Ask for clarification; require incurred expense and actual payment evidence |
| EX05 | Wrong Book, closed period, archived category/account | Refuse without effects |
| EX06 | Overpayment, payment before expense, authority injection | Reject invalid payload; server supplies tenant/actor/Store/key |
| EX07 | Stale review, completion failure, retry | Fresh review, atomic bill/payment/journals, exactly-once recovery |
| EX08 | Edit and open receipt | Review edited values; bill sheet opens over assistant and closes preserving chat |

Fixtures describe expectations, not executed acceptance. Bill payment/reversal and
category creation are additional E04 work; this fixture covers new expense recording.
