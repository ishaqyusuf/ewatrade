# Product cost acceptance — interrupted by database failure

- Run: `ac8d5df5-5f84-485b-b97c-6918725baf0d`, 11 October 2026.
- Evidence kind: `deterministic-integration`; verdict: **fail**.
- Source: `a0631ea3`; isolated Development QA fixtures.
- Model/provider/prompt/dashboard build: not applicable; infrastructure cost unknown.
- Result: 0 pass, 1 fail, 1 error, 6 assertions; 528.89 seconds total process time.

Opening stock was ready after 39.237 seconds. The test exceeded its unchanged
300-second timeout. The eventual connection-terminated error points to the
closed-period fulfillment rejection assertion, before the reviewed successful issue.
No known-cost preview/posting pass is established. Whether the underlying cause is
a database connection stall, locking, or application execution remains unproven.

Cleanup began but did not finish in that process. A separate guarded audit identified
exactly its two QA tenants. Run-scoped cleanup subsequently completed and verified
zero remaining owned tenants. No unrelated or hosted data was targeted.

Local evidence in `artifacts/assistant-operations-web/`:

- `d02-cost-after-bulk-web-failure.log`
- `d02-cost-after-bulk-web-audit.log`
- `d02-cost-after-bulk-web-cleanup.log`

Follow-up adds aggregate timing around closed-period rejection and the reviewed first
issue. Timeouts, assertion scope and business behavior remain unchanged. D02 financial
acceptance stays open; earlier no-Book and dashboard passes do not cover this gate.
