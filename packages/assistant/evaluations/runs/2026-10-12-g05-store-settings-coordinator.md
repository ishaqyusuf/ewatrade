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
