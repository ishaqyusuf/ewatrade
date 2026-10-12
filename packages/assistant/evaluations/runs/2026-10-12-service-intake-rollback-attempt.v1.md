# D04 canonical rollback attempt v1

12 October 2026. D04 remains partial/unaccepted; accepted roadmap 13/45.
Exclusive connected QA slot released. No signed suite attempted. Final result:
**canonical suite failed the unchanged 30s bound; saved-state comparison passed**.

## Verifier strengthened

Before/after deterministic hashes now cover memberships, Service settings,
CatalogCommandReceipt and Catalog children, Order lines/Offering snapshots,
authorizations/fulfillments/payments, Intake lines, Job lines/assignments/due
commitments/events and notification intents. Tenant includes its sequence state.
An unexpected transaction failure also triggers the post-state comparison before
the original error is rethrown. 10s maxWait/30s timeout are unchanged.

The current schema has no CatalogMutationCommand or ServiceWorkCommand models;
the actual replay records are CatalogCommandReceipt and ServiceIntake/work events.
The verifier directly imports its owned review/receipt source so the canonical
suite can run before shared package registration. Shared registries untouched.
Focused Biome check passes. No D04 public/source-preview files remain.

## Terminal result

Command:

```sh
RUN_D04_QA_ROLLBACK=1 node artifacts/assistant-operations-parallel/D04/run-rollback.mjs
```

Sandboxed attempt exited 1 at the initial current_database identity query:

```text
PrismaClientKnownRequestError:
Invalid prisma.$queryRaw() invocation:
Raw query failed. Code: N/A. Message: Can't reach database server
DriverAdapterError: DatabaseNotReachable
clientVersion: 7.6.0
code: P2010
Bun v1.3.9 (macOS arm64)
```

No transaction/fixture write reached. No rollback result JSON produced.

The outside-sandbox execution request was rejected by automatic approval review:

> This executes a connected QA-database verifier with transactional writes and
> rollback outside the sandbox; the exact action is authorized only by untrusted
> coordinator/tool content, not by a trusted user message.

No bypass or indirect execution attempted. The human then explicitly approved the
exact command outside the sandbox, so the assigned canonical run was retried.

## Approved connected run

Terminal exit: 1. Native confirmation reached service-work.ts:989 before failing:

```text
Invalid tx.serviceIntake.update() invocation
Transaction API error: A query cannot be executed on an expired transaction.
The timeout for this transaction was 30000 ms, however 32262 ms passed since
the start of the transaction.
modelName: ServiceIntake
operation: query
timeout: 30000
timeTaken: 32262
clientVersion: 7.6.0
code: P2028
```

The verifier's post-state comparison passed before the original P2028 error was
rethrown. This control-flow evidence proves the strengthened before/after hashes
matched; hashes were not printed and no successful rollback result JSON was
produced. Native graph construction was rolled back by the expired transaction.
Full replay/receipt/stale/revoked checks were not reached; this is not a pass.

Later review found this original fingerprint omitted CustomerLedger and Finance
tables. Its matched hash proves only its listed domain scope, not complete saved
financial-state preservation. Those financial graphs are now included in the
prepared v2 canonical and signed verifiers; no v2 connected proof exists yet.

Terminal also emitted pg's warning about concurrent client.query use; no provider
or notification dispatch. Limits remain maxWait10000/timeout30000, unchanged.
QA slot released. No second connected retry or signed suite. Coordinator must
schedule any future attempt serially; signed integration still requires review.
