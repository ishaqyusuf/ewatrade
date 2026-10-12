# H05 rollout readiness — source packet handoff

12 October 2026. Implementation-agent packet 1 for H05, **ready for coordinator
review**. Readiness source and documentation only: no enabling, canary run,
deployment or acceptance is claimed. Overall 13/45 unchanged.

## Current controls (inventory)

- **Capability/version/exclusion inventory**: `packages/assistant/src/capabilities/COVERAGE.md`,
  generated from the manifest and every router procedure (capability ID, version,
  mode, tool, roles, scoped-staff grant, clients, rollout, procedures; every
  merchant procedure supported/planned/form-only/excluded with reason). Kept
  current by `assistant:coverage --check` (H01) and named per change by impact
  records (H02).
- **Availability**: `generalCapabilityEnabled` = `rollout !== "planned"`; the
  owner removed env on/off switches and the capability pilot list on 11 Oct 2026
  (`304589ff`, "always on now"). This packet does **not** reintroduce them.
- **Rollback lever**: set a capability's `rollout` to `planned` and release.

## Defect fixed: rollback broke recovery

Before: `decideGeneralProposal` ran the full `assertCapability` (including
rollout) before its replay branches. After a rollback, (1) a lost-response
Confirm on an already **completed** proposal was refused instead of returning
its saved receipt, (2) a leftover **pending** draft could not be cancelled, and
(3) the pending draft still showed a live approval, so Confirm failed only on
click.

After:
- `assertCapability` = scope + rollout + `assertCapabilityAuthority` (client,
  role ceiling, canonical domain check, scoped Store grant — unchanged order).
- Decide uses `assertGeneralActionAuthority` for completed replay, cancelled
  replay and cancel; `confirm` of a pending draft still requires the full
  `assertGeneralAction` before approval verification and execution.
- `generalProposalWithReview` returns a pending draft of a rolled-back capability
  with no approval token and "This action is paused in the assistant. Nothing has
  changed; cancel the draft or use the form." — without calling the adapter's
  domain review.
- Saved receipts (`COMPLETED`) were and remain projected unchanged.

Rollback never widens access: authority still re-reads role, client and grants.

## Canary — owner decision needed

With switches removed, there is no tenant-scoped canary. Options:
1. **Recommended**: treat Preview (`bun release --preview` on a branch) as the
   canary for a capability's `source → enabled` step; promote by merging; roll
   back by `rollout: "planned"` + release. No new runtime controls.
2. Reintroduce a tenant allowlist for `pilot` capabilities — contradicts the
   11 Oct decision; only with explicit owner approval.

## Owned paths

- `apps/api/src/assistant/general-context.ts` (split; `assertGeneralActionAuthority`)
- `apps/api/src/assistant/general-proposals.ts` (decide order; paused projection; two imports)
- `apps/api/src/assistant/general-rollback-readiness.test.ts` (new)
- `packages/assistant/impact/2026-10-12-h05-rollback-readiness.json`

## Checks actually run (local, uncommitted)

| Command | Result |
|---|---|
| `EWATRADE_DATABASE_URL=<unreachable placeholder> bun --env-file=/dev/null test apps/api/src/assistant/general-rollback-readiness.test.ts general-rollout.test.ts general-held-credit-refund.test.ts` | 6 pass (no connection) |
| `bunx tsc --noEmit -p apps/api`, filtered to touched files | 0 diagnostics |

Not run: `general-proposals.integration.test.ts` (needs the guarded database
profile). Coordinator checks: run it once on the verified profile; then a
connected rollback drill: draft a pending and complete a second proposal for one
source capability, set it `planned` locally, reload → pending shows paused with
no Confirm, Cancel succeeds, completed receipt Opens, lost-response Confirm on
the completed one returns the same receipt; restore `rollout`.
