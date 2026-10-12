# D04 canonical four-case rollback attempt v4

The coordinator reviewed and committed the exact 11-path canonical read-refinement
delta as `ebf2ad777f53513f4b9d3afbf524eea3e3569304`, then scheduled one exclusive
full-suite attempt. The previously human-approved command ran outside the sandbox:
`RUN_D04_QA_ROLLBACK=1 node artifacts/assistant-operations-parallel/D04/run-rollback.mjs`.
It exited 0. All four cases completed their assertions, reached the identity-based
deliberate rollback sentinel, and preserved the full saved state. The runner
disconnected; its exclusive QA slot is released. No second attempt or signed suite.

## Configuration recorded before timing

Captured at `2026-10-12T09:04:53.857955+00:00`; suite started at
`2026-10-12T09:05:05.070Z`. HEAD at capture was the reviewed commit above. All 11
owned paths were committed and clean. No schema/client generation was performed.

The actual current schema generator is:

```prisma
generator client {
  provider        = "prisma-client"
  output          = "../generated/prisma"
  // Nested `include`s load in one joined query instead of one query per
  // relation. Each round trip to remote Neon costs ~200 ms from a dev machine,
  // so a two-line return went from 212 queries (43 s) to 96 (20 s).
  previewFeatures = ["relationJoins"]
}
```

`packages/db/prisma/schema.prisma` SHA256:
`f5859c52d8ae537c53eaeccc9cc6d16205e9fd051c4b3aea8ae3202203d42e8f`.
Generated `packages/db/generated/prisma/internal/class.ts` metadata contains
`"previewFeatures": ["relationJoins"]`; SHA256:
`1d96375730d51972cbac2c35f64f98d0ee285684a9d14673f1e231bbf6f53665`.
Both hashes were unchanged on the post-run check.

The schema and generated-client feature changes are foreign to the D04 delta.
The earlier v3 runtime configuration was not fingerprinted, so identical baseline
configuration cannot be established retrospectively. These results measure the
combined current configuration; they do not isolate the D04 code's speedup. The
generator comments above are recorded source text, not a verified performance
claim from this evaluation.

## Actual full-suite result

Every case retained Serializable isolation, `maxWait: 10000`, `timeout: 30000`, a
fresh guarded transaction-only fixture and nonce, all original assertions, and
the full saved-state comparison including CustomerLedger and Finance graphs.
Canonical command and owning receipt remain in the same case transaction. Full
native Job output/hydration remains. Refusals retain typed error checks and prove
no Intake/Order creation. Unexpected errors or timeouts do not satisfy refusal.

| Case | Transaction phase ms | Case elapsed ms | Deliberate rollback | Full state preserved |
| --- | ---: | ---: | --- | --- |
| creation-replay-receipt | 14174 | 14593 | yes | yes |
| immutable-snapshot | 12602 | 13012 | yes | yes |
| stale-review | 5323 | 5750 | yes | yes |
| revoked-authority | 3844 | 4263 | yes | yes |

All eight before/after hashes equal `be157acb19ccdd8b2e016056ba0192f6`.
The timing proxy labels transaction phases as `outcome: "error"` because the
sentinel is thrown intentionally; the successful identity-based rollback check
distinguishes this from transaction failure. The stale/revoked rejection phases
also intentionally throw their asserted typed errors.

Creation/replay case phases: fixture 203ms, fresh review 1640ms, canonical
execution 8499ms, canonical replay 2218ms, owning Order check 201ms, no-message
check 201ms, owning receipt 610ms. Exact total, tracked-only Job, unpaid payment
gate, customer identity, exact Intake/Order/first-Job replay and no message intent
all passed. The snapshot case's original receipt (603ms) and receipt after Customer
and Offering edits (613ms) matched exactly. Stale review rejected with the native
revision conflict; revoked authority rejected with the native forbidden error.
Both refusal graphs were unchanged inside the transaction.

The earlier v3 first-case attempt failed at owning Order lookup, completing zero
cases. Its execution/replay spans were 20386/6837ms; current spans are 8499/2218ms.
This is descriptive run evidence under the feature qualification above, not an
isolated causal comparison. Delegate operation counts are not SQL request counts.

## Evidence and remaining gates

Ignored artifacts under `artifacts/assistant-operations-parallel/D04/`:
`optimization-feature-configuration.before-v4.json`, `rollback.v4.json` and
`rollback-terminal.v4.log`. Prior `rollback-failure.v3.json` was preserved. The v4
filename is this attempt's evidence version; the unchanged suite payload retains
its verifier format version 3 and timing format version 2.

Proposal 2 (large Order write-core/summary extraction) remains on hold. Source
verification remains 32 focused tests / 122 assertions, scoped TypeScript and
9-file Biome passing at the reviewed commit. This run made no provider/model,
signed action, API restart, persistent fixture, activation or grant. D04 remains
partial/planned/unaccepted: signed and saved web flows, bounded editor options,
Finance-backed initial payment, reminders and scoped-Manager gates remain. The
accepted roadmap remains 13/45 (28.9%).
