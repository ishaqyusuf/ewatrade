# Return acceptance — read-only transaction probes

Date: 11 October 2026. Database: isolated Development
`ewatrade_general_assistant_main_20261009`. No business records written.

Two minimal sequences each ran four Serializable transactions: deliberate rollback,
commit, deliberate rollback, commit. Each transaction read `SELECT 1`; the rollback
used a known error identity. The runtime target was checked with current_database.
Limits remained maxWait10s/timeout30s. Connections were disconnected on completion.

- Plain pool: 1079,949,959,985ms. All expected outcomes; after every transaction,
  total1/idle1/waiting0.
- Existing pool tracing enabled:1083,917,942,992ms. Same expected outcomes and counts.

Both processes exited0. These probes do not reproduce P2028, and do not establish a
root cause or a production fix. They rule out a consistently failing basic rollback/
reacquisition path in this small scenario. Heavier assistant authorization, relation
queries and transient remote latency remain outside the probe's scope.

Local sources/logs in `artifacts/assistant-operations-web/`:
`return-transaction-probe.ts`, `run-return-transaction-probe.mjs`,
`d03-transaction-probe.log`, `d03-transaction-probe-instrumented.log`.
The saved probe source is the instrumented variant. Both used the same transaction
sequence. No model, browser, mobile or hosted acceptance is implied.
