# Expense category discovery — 11 October 2026

Source base9c9520f2 plus this change. Provider/model not-applicable.
Canonical finance.expenseCategories query returns active operating expense category
identities from exact tenant Finance Book, with afterCode continuation and bounded page.
Owner/Admin finance authority is checked on every request. Assistant tool fixes page
size10, states identity-only coverage and asks for ambiguity resolution. Planned
finance.expense_categories.read capability is dashboard-only. Draft tool guidance
requires incurred expense, resolved categories/payment accounts and actual prior payment;
owner funding is explicit. No silent category creation or money transfer claim.

3focused tests/22assertions pass for scoped active filtering, pagination, absent Book,
authority refusal and invalid input. Scoped API tool TypeScript passed; coverage regenerated.
No actual-tool database or browser/model execution in this report. No screenshot: API/read
source change only. E04 remains incomplete; editor and integration/web acceptance pending.
No mobile, schema/migration, rollout activation, deployment or provider spend.
