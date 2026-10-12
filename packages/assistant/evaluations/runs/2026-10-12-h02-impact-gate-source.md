# H02 feature impact gate — source packet handoff

12 October 2026. Implementation-agent packet, **ready for coordinator review**.
Not accepted; no bookmark. Overall 13/45 accepted is unchanged.

## Before / after

Before: H01 checked manifest structure and coverage freshness, but nothing
required a change to record its assistant support, exclusion or documentation
decisions; `ai-rules.md` said to do it manually.

After (as repaired below): any change to merchant behavior — routers and API
schemas, Prisma schema, permission helpers, assistant adapters/contracts, domain
commands/queries/services (`apps/api/src/**`, `packages/*/src/**`) or web/mobile
feature source (`apps/*/src/**`, `packages/ui/src/**`) — must add a strict v1
record under `packages/assistant/impact/`. The gate diffs the tracked generated
`COVERAGE.md` against the merge base and requires every added/changed/removed
capability and merchant procedure row to be named with its actual change and
current rollout/status, a `feature` decision plus per-area `api`/`schema`/
`permissions`/`capability` decisions, an explicit assistant decision (capability
rows or `noAssistantImpact`) and evidence. `--draft <id>` prints machine-known rows
with TODO rationale. Brain paths must be `local_only`: existence-checked locally,
only noted in CI. Exempt: tests/fixtures/test helpers, Markdown and static assets,
the gate tooling, and configuration/build tooling outside the source trees.

## Owned paths

- `packages/assistant/src/capabilities/impact.ts` (new)
- `packages/assistant/src/capabilities/impact.test.ts` (new)
- `packages/assistant/impact/README.md`, `packages/assistant/impact/2026-10-12-h02-impact-gate.json` (new)
- `scripts/assistant-impact.ts` (new)
- `package.json` — one line: `"assistant:impact": "bun scripts/assistant-impact.ts"`
- `.github/pull_request_template.md`, `.github/workflows/assistant-gate.yml` (new)
- This report
- Ignored Brain (not to be added): `.brain/engineering/ai-rules.md`, H02 section of
  `.brain/plans/2026-10-09-assistant-business-operations.md`

No shared manifest, contract, router, sheet or editor path touched.

## Checks actually run (local diagnostics, uncommitted source)

| Command | Result |
|---|---|
| `bun test packages/assistant/src/capabilities/impact.test.ts` | 10 pass, 19 assertions |
| `bun test packages/assistant/src/capabilities` | 14 pass, 29 assertions |
| `env -i … CI=1 bun --env-file=/dev/null --cwd apps/api scripts/assistant-coverage.ts --check` | "snapshot is current" with an empty environment |
| `bun scripts/assistant-impact.ts` | pass: 1 record, no gated area |
| `CI=1 bun scripts/assistant-impact.ts --base 3147e827` | fails as expected: quote-decision commit touches capability/api/permissions without a record |
| `bun scripts/assistant-impact.ts --base 3147e827 --draft …` | drafts 3 capabilities, 3 procedures, feature/capability/api/permissions docs |
| `bunx biome check --write` on owned files | formatted, clean |

Regression definitions in `impact.test.ts`: area classification (tests ignored),
escaped-pipe coverage parsing, passing reviewed record, missing record, ungated
change, unnamed row/stale rollout/wrong status, schema/permission doc decisions,
Brain local-only rules incl. CI notes, malformed/name mismatch/executed-without-result,
draft contents.

## For the coordinator

```bash
bun test packages/assistant/src/capabilities
```

```bash
CI=1 bun scripts/assistant-impact.ts --base 3147e827
```

Not verified: the workflow has never run on GitHub (no push authorized); `bun
install --frozen-lockfile` in a clean runner is unverified. On push to `main` the
base is `github.event.before`. No web or native UI, API, permission, schema,
runtime or rollout impact. No platform screenshots apply.

## Open decisions

- Whether to backfill records for already-committed packets (the gate only checks
  each change's own diff, so history is unaffected).
- ~~Whether client-only UI should require a record~~ — resolved by review repair 2:
  web/mobile feature source now needs a `feature` decision.

## Review repairs — [coordinator review](2026-10-12-h02-coordinator-review.md)

1. **Declared change reconciled with coverage.** Each capability row's `change`
   must equal the generated diff (`unchanged` for an untouched row) and every
   non-removed row needs the current coverage `rollout`. The coordinator probe now
   reports `customers.read is declared unchanged but coverage shows added` and
   `customers.read needs its current rollout (planned)`.
2. **Feature behavior gated.** New `domain` area (other `apps/api/src/**`,
   `packages/*/src/**`: commands, repositories, services) and `client` area
   (`apps/*/src/**`, `packages/ui/src/**`) need a record with a `feature` decision;
   `capability` now covers all assistant adapters/contracts
   (`packages/assistant/src/{capabilities,general}/**`, `apps/api/src/assistant/**`),
   `api` adds `apps/api/src/schemas/**`, `permissions` covers all of
   `packages/auth/src/**` and `apps/api/src/utils/staff-*.ts`. Any gated change
   also needs an explicit assistant decision (capability rows or
   `noAssistantImpact`). The `service-intake.ts` probe now fails with
   "Changes touch domain but add no impact record". Deliberate exemptions are
   listed in `impactExemptions` with reasons: tests/fixtures/test helpers,
   Markdown and static assets, the gate tooling; configuration and build tooling
   outside the source trees stay ungated. `--draft` adds a `noAssistantImpact`
   TODO when no machine rows changed.

Checks run after repair: `bun test packages/assistant/src/capabilities` 16 pass /
35 assertions (new: classification incl. exemptions, domain/client decision,
declared-change reconciliation); `bun artifacts/assistant-operations-parallel/h02-review-probes.ts`
prints the required errors for both probes; `bun scripts/assistant-impact.ts`
passes over the working tree with the A04 and S05 records.

Note for the shared checkout: the local default (`--base HEAD`) diffs the whole
working tree, so other workers' uncommitted dashboard files count as `client`
changes. CI diffs only the PR's commits.
