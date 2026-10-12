# G05 Store-setting changes — coordinator source review

12 October 2026. Current working-tree packet reviewed by Codex; not an acceptance
bookmark. Capability remains planned; roadmap 13/45 accepted (28.9%).

Reviewed strict single-section payload, Owner/Admin manifest policy, section plan
gates, before/after and business-default impact, canonical setter delegation and
central confirmation. `general-proposals.ts` refreshes session/workspace/privacy
authority in a Serializable transaction, compares the signed target revision,
claims the pending proposal and writes its completion receipt in that transaction.
The adapter's absence of a separate row lock is therefore not a demonstrated
confirmation race. Database-backed concurrency/refusal evidence is still needed.

Focused source checks: 8 pass, 25 assertions using a deliberately unreachable
placeholder database URL and mocked query contexts. Initial environment-free run
failed at the Prisma import guard (no EWATRADE_DATABASE_URL), then the correctly
configured isolated run passed. No real database or merchant setting was changed.

Snapshot SHA-256:
- apps/api/src/assistant/general-store-settings-change.ts:
  f52350381d7a731a87bfb1aa28411e213de2428eb4f35cdbd7827551ad4bc265
- packages/assistant/src/general/store-settings-change.ts:
  ea801bedb170c9fe5b3ea0fffa8f7e3fb47abedf4bec0372524d67cf03ad9f00
- apps/api/src/assistant/general-proposals.ts:
  a2d88731db27753ca9b71d3426132074ceecedf61a1cd58b4a3e5b89154963d6

Remaining: frozen packet/path ownership; signed rollback evidence for success,
changed target, role/plan/privacy refusal and replay; saved-chat original Open/Close
and Store mismatch checks on dashboard/native. Current settings must remain
labelled current; the stored completion receipt represents what was saved then.
Fix the packet's stale statement that the persistence ADR is absent: it exists
at .brain/decisions/2026-10-12-collection-payout-persistence.md.

No new runtime/provider/deployment authority, acceptance or native parity claimed.

## Signed rollback fixture source review — 12 October 2026

Claude supplied an unrun fixture, hash
69b3cfdba0f6425e0a313322a19f0d91742990312bf5841396a23ee74a3fac02:
apps/api/src/assistant/general-store-settings-change.integration-check.ts.
Root Biome and fresh full API TypeScript checks pass. Source verifies exact saved
QA scope, explicit local/signing opt-in, bounded Serializable/10s/30s transaction
options, staged real authority refusals and forced rollback. No connected run
or settings mutation was performed by root.

Before claiming full verification, strengthen the proposal fingerprint beyond
id/status/revision to include payload/hash/target/token/idempotency/result/decision
and timestamps. Signed success currently covers order_visibility only; business
receipt defaults, Store receipt overrides/removal and reminder success/replay are
unproven. The guarded runner must explain its process-only source-test capability
availability setup because settings.store.change remains planned. No persistent
rollout change is authorized. Requests sent to Claude; UI gates remain open.

Claude supplied v2, hash
ff4bf946d7ca6e0f8445d4935727e23dd352bc0136ce1eaae47ca24ed94d93f6.
Root verified the expanded full proposal fingerprint and five success/replay
cases (visibility, business receipt defaults, Store override, override removal,
reminders), plus the five existing refusal cases. The source review coverage
comments are addressed; Biome passes. The planned capability's runner setup now
specifies a process-only in-memory availability override restored in finally.
This fixture remains UNRUN; none of its connected assertions is claimed passed.

The fresh full API compile for v2 overlapped the in-progress S05 target addition
and exits2 on general-staff-activity.ts's unresolved staff-activity-target package
export. No G05 fixture diagnostic is emitted, but the integrated check is not
green. Wait for S05's frozen export/target packet before repeating compilation.
