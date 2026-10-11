# Bill correction proposal adapters — 11 October 2026

Evidence kind: deterministic source checks. Provider/model: not-applicable.
Both planned dashboard Owner/Admin actions require exact Book/target, ISO correction
 date, nonempty reason and bookkeepingOnly=true. Client authority, command keys and
amount overrides are rejected. Fresh canonical review is fingerprinted; execution
uses existing caller-owned correction commands in the proposal transaction. The
finance_bill receipt retains the global bill-sheet route.

Schema run: 1 test, 16 assertions passed. Scoped adapter TypeScript check completed
with exit 0 during initial implementation. Coverage generation subsequently failed
because orders.activity.list and orders.activity.add are unclassified merchant
procedures outside this change; no regenerated coverage pass is claimed.

Review text names reversed accounts/sides and payable before/after, preserves original
history and states no money is refunded, recovered or transferred. Tool guidance
forbids implicit payment reversals to enable voiding and guessing omitted history.

Correction editor, assistant proposal database acceptance, full dashboard flow and
live-model evaluation remain pending. Earlier canonical correction integration is
separate evidence in bill-correction-review.md. E04 remains incomplete. No mobile,
persistent rollout activation or deployment; no UI screenshot generated in this pass.
