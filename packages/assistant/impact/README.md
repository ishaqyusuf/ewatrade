# Assistant impact records

A change to merchant behavior is not done until its assistant support or
deliberate exclusion is recorded here (Brain plan ticket H02). Gated areas:

| Area | Paths | Required documentation decision |
|---|---|---|
| schema | `packages/db/prisma/**` | `schema` |
| permissions | `packages/auth/src/**`, `apps/api/src/utils/staff-*.ts`, `apps/api/src/trpc/{init,finance-procedure}.ts`, routers named `*permission*` | `permissions` |
| capability | `packages/assistant/src/{capabilities,general}/**`, `apps/api/src/assistant/**` | `capability` |
| api | `apps/api/src/trpc/routers/**`, `apps/api/src/schemas/**` | `api` |
| domain | other `apps/api/src/**`, `packages/*/src/**` (commands, queries, services) | `feature` |
| client | `apps/*/src/**` (dashboard, mobile …), `packages/ui/src/**` | `feature` |

`feature` is always required. Every record set for a gated change must also state
the assistant decision: capability rows (an `unchanged` row with a note is fine)
or `noAssistantImpact` with the reason.

Deliberate exemptions (no record): tests, fixtures and test helpers; Markdown and
static assets (images, fonts, media, `assets/`); the gate/coverage tooling itself;
configuration, build and release tooling outside the source trees above.

## Workflow

1. Change the code, then regenerate coverage:
   `bun --cwd apps/api assistant:coverage`.
2. Print a starting record from the machine-known rows:
   `bun assistant:impact --draft 2026-10-12-short-name > packages/assistant/impact/2026-10-12-short-name.json`.
3. Replace every `TODO` with reviewed rationale: tickets, summary, each changed
   capability (its `change` must equal the coverage diff and its `rollout` the
   current coverage rollout) and each changed merchant procedure (supported,
   planned, form-only or excluded, with reason).
4. Record each documentation decision: `feature` always, plus `api`, `schema`,
   `permissions` and `capability` when those areas changed.
5. List evidence. `executed: false` marks a definition (test, fixture, checklist);
   `executed: true` needs the exact result. Acceptance is never inferred.
6. Check: `bun assistant:impact` (uncommitted work) or
   `bun assistant:impact --base main` (everything on the branch).

## Brain files

`.brain/` is ignored by git. Brain documents are recorded as `local_only`: the
gate checks they exist on a developer machine and only prints a note in CI,
where they are absent. Never force-add Brain files to satisfy the gate.

## What the gate does not do

It does not decide whether a capability is safe, accepted or enabled, and it
does not run tests. Coverage freshness is a separate check
(`bun --cwd apps/api assistant:coverage --check`).
