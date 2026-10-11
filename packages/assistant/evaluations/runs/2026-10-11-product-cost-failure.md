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

## Follow-up runs

- `0c066791-a3cd-45b7-8a1a-0f85035110ee`, source `fcf631e8`:
  opening purchase expired at 32.739 seconds; 0 pass/1 fail, 3 assertions,
  62.98 seconds total. Owned cleanup verified. Local log
  `d02-cost-opening-purchase-timeout.log`.
- `ae81eeac-553b-44e1-9b88-9ee8414d7715`, source `44a95f6a`:
  opening purchase expired at 47.101 seconds; 0 pass/1 fail, 3 assertions,
  88.32 seconds total. Owned cleanup verified. Local log
  `d02-cost-observed-purchase-timeout.log`. Read-only wait samples for this run's
  connection showed ClientRead/idle-in-transaction when available; two samples
  were unavailable. No lock wait was observed, but intermittent sampling does not
  exclude one. Aggregate SQL phases were unavailable because pool instrumentation
  was not enabled in this runner. These results do not isolate a code root cause.

No cost acceptance process remains running after these terminal attempts. The
financial gate remains open; transaction and test timeout limits are unchanged.
