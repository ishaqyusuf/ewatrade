# Customer funds tool/database acceptance — 11 October 2026

Run: `646c2de6-0e7b-4876-b41a-90235d4953e1`.
Source base: `7f171ed7`, plus the customer-funds integration helper in this commit.
Evidence kind: deterministic integration, provider/model not applicable.
Environment: verified isolated Development database, owned disposable QA tenant.

The existing held-credit refund composition fixture invokes actual GENERAL read
executors, including their fresh-authority wrapper and canonical router procedures.
Before refund, account discovery, exact 1000 credit, remaining source and statement
are checked. After a 250 refund, reads must show 750, old source revision must be
unavailable and the original statement snapshot must still show 1000. Missing
account must return unavailable and emit an unavailable answer, never zero.

Three planned read capabilities are enabled only in this test process and restored
in finally. Existing refund stale-review, receipt-failure rollback, balanced posting,
replay, remaining-credit cap and owned fixture cleanup remain in the run.
Transaction limits are unchanged: maxWait 10 seconds, timeout 30 seconds.

Separate authority source checks: general-access.test.ts passed 11 tests / 111
assertions, including planned denial, Owner/Admin permission and Free-plan denial
for the new reads. These are not live role-revocation or foreign-tenant DB tests.
Scoped integration TypeScript passed. No live model, browser, HTTP transport,
true multi-page traversal, mobile, runtime activation or deployment acceptance.

Verdict: **pass**, 1 integration test / 44 assertions in 183.31 seconds; process
exited 0. Financial cleanup counts and outer owned tenant/user cleanup verified.
Confirmation 16.911 seconds / 70 SQL; injected rollback 16.454 seconds / 69 SQL.
The generic parent test title mentions additional default-suite cases that this
focused branch does not execute. Detailed local log: /private/tmp/e02-customer-funds-database.log.
