# Money movement database acceptance — 11 October 2026

Run d2432522-bc74-4c7a-8433-f186fb5c3508. Source f30df87f plus integration fixture.
Evidence: deterministic-integration; provider/model not-applicable.
Isolated Development database ewatrade_general_assistant_main_20261009, owned QA tenant.
Explicit RUN_GENERAL_MONEY_MOVEMENT branch; temporary in-process capability activation
restored in finally. Scoped integration TypeScript passed.

1 test / 25 assertions passed in 73.05 seconds. Wrong Book and before-start date refused.
Account rename invalidated stale review. Injected proposal-completion failure rolled
back journal and command, leaving proposal PENDING. Confirmation and sequential
response-loss replay returned the same receipt, with one command and one journal.
Canonical receipt read proved two balanced lines: cash credit1000, bank debit1000,
correct current account name and exact 2026-10-01T12:00:00.123Z timestamp. No customer
receipt created. Financial and outer tenant/user cleanup completed and verified.

Initial sandbox attempt failed before fixture creation at current_database with
DatabaseNotReachable. Authorized network run above passed. Existing pg concurrent-query
warning was emitted; it did not fail this run. Transaction limits remained10s/30s.
Local detailed log: /private/tmp/e03-money-movement-database.log.

This is transfer acceptance only. Owner contribution/withdrawal database, concurrency,
closed-period race and full successful dashboard receipt acceptance remain pending.
No live model evaluation, provider spend, mobile work, deployment or rollout change.
No new screenshot: database-only checks; component screenshots are in prior report.
E03 remains incomplete.
