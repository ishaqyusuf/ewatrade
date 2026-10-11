# Expense receipt mount-guard fix — 11 October 2026

Reproduced the access-changed message on a disposable cancelled bill in the dashboard
sheet over /assistant. Temporary diagnostic (no identifiers/data) confirmed the query
ran while mounted.current was false. The lifecycle passive effect ran after query
subscriptions during development Strict Mode replay.

Move mount guard setup/cleanup into a layout effect before useInfiniteQuery. Preserve
read generation invalidation, actor/tenant/Book/bill/online checks, abort handling and
query-cache removal. Temporary diagnostic removed. No permission or server-policy change.

Browser before/after on the same fixture: original error reproduced; after change,
receipt list completes with No receipts have been added. Refresh also completes;
cancelled expense retains disabled new receipts and reversed payment history. Close
returns to /assistant. Screenshot artifacts/assistant-operations-web/e04-receipt-lifecycle-fixed.jpg.
Existing expense-receipt-state suite:9 tests/43 assertions passed, including stale,
offline and superseded response rejection. No broad types/tests rerun.

Owned web QA fixture cleanup independently verified voided bill, reversed payment,
four balanced journals/two completed proposals, then removed exact Book/chat;0 remain.
Logs /private/tmp/e04-receipt-diagnostic-{fixture,cleanup}.log. No mobile work, deployment
or persistent activation. The saved correction-chat error remains visible behind the
sheet and is a separate unresolved issue; full E04 web acceptance remains incomplete.
