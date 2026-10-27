# Payment-report notification plan policy

27 October 2026. Design and integration proposal; **not an implemented API**.
Owning chat: `01a17da9-5333-74b2-b9c2-181c2ec4cd20`.
Bank account/report/delivery owner: `01a17856-d3d7-7301-9205-4d041e5117eb`.
Design selection is required before product UI implementation. No deployment,
provider activation, real send or existing Business configuration change follows
from this document.

## Existing authority and reuse

- Plan keys are `free`, `starter`, `growth`, `pro` in
  `packages/db/src/queries/retail-ops-subscription-plans.ts`. Do not add a tier,
  price, or infer payment-notification eligibility from `customerMessages`.
- `getRetailOpsTenantPlan` and `resolveRetailOpsPlanId` in
  `packages/db/src/queries/retail-ops-subscriptions.ts` own current effective plan,
  existing launch/manual grants and paid lifetime projections. Owner-wide billing
  is staged, without a live adapter; it is not a new entitlement authority here.
- The existing order period helper uses UTC calendar months; limits convention
  is explicit `null` unlimited and zero no allowance. Use the same convention.
- `packages/db/prisma/models/system-configuration.prisma` has revisioned JSON
  configuration; `billing.prisma` has durable plans. Neither is an existing
  payment notification quota ledger. Do not use a JSON counter for concurrency.
- Sibling Oversight `packages/db/src/queries/qa-policy.ts` demonstrates fresh
  active-owner/EwaTrade access checks inside the save transaction, revision
  comparison and atomic audit. Preserve that pattern and its unrelated changes.
- EwaTrade `packages/oversight/src/routes.ts` is read-only portfolio access.
  Its read key must not authorize new configuration writes. Existing
  `packages/utils/src/qa-policy-server.ts` is a server-only policy read example;
  its stale-success grace must not silently become dispatch authorization.
- Existing Activity tables and notification transports are not proof that their
  broader rollout is enabled. This feature must not enable generic Activity,
  campaigns, customer messages, reminders or the ordinary WhatsApp assistant.

## Scope and configuration

Configure both channels independently for **each** existing tier. The initial
valid policy is all four tiers with Email disabled/0 and WhatsApp disabled/0.
No missing-row, parse-error, unavailable-service or unknown-plan path grants
sending. Missing numeric fields never mean unlimited. Require an explicit
Unlimited choice to write `null`, otherwise a nonnegative safe integer.

Limits apply per Business (`Tenant`), per channel, per UTC calendar month. One
external recipient delivery consumes one unit; a report with three selected
staff needs three units. A tier edit, plan change, fallback or cap reduction
never resets that Business's period usage/reservations. Lowering a cap below
used plus reserved blocks new reservations while preserving history. New month
starts a new period row; no destructive reset or usage-reset button.

Policy save requires a reason, current revision and fresh active owner assigned
to EwaTrade. Audit actor, old/new values, revision and command id atomically.
Reject stale revisions; preserve drafts until latest policy has been reviewed.
Support/viewer/privacy roles and other project owners cannot change this policy.
Credentials remain server-only. Schema/storage and cross-repository propagation
must be agreed before edits; no new transport key is activated by this task.

## Proposed integration surface

Proposed files owned here (not present yet):

- `packages/utils/src/payment-report-notification-policy.ts`: pure strict policy
  and versioned public read types, no database/provider import.
- `packages/db/src/queries/payment-report-notifications/eligibility.ts`:
  server-derived plan, membership and monthly ledger projection.
- `packages/db/src/queries/payment-report-notifications/quota.ts`: root and
  explicit `InTransaction` reservation/settlement commands.
- `packages/db/src/queries/payment-report-notifications/policy-changes.ts`:
  revision application, affected-Business enumeration, deduplicated notices.

Parent owns `businessBanking.notificationEligibility` in
`apps/api/src/trpc/routers/business-banking.ts`, alongside existing report routes. Query accepts no client tenant, plan, cap,
usage or policy revision as authority. Derive Tenant and actor from current
session/context and revalidate current Finance/bank settings management access.
Selected bank account input, if later needed, must be resolved in that Tenant.

```ts
type Channel = "email" | "whatsapp"
type ChannelEligibility = {
  available: boolean
  enabled: boolean
  budget:
    | { kind: "limited"; limit: number }
    | { kind: "unlimited"; limit: null }
    | { kind: "unknown"; limit: null }
  used: number | null
  reserved: number | null
  remaining: number | null
  reason:
    | "available" | "policy_missing" | "policy_invalid"
    | "plan_disabled" | "quota_exhausted" | "unavailable"
}
type PaymentReportNotificationEligibility = {
  schemaVersion: 1
  scope: "payment_report"
  policyRevision: number | null
  planId: "free" | "starter" | "growth" | "pro" | null
  period: { startsAt: string; resetsAt: string; timeZone: "UTC" }
  channels: Record<Channel, ChannelEligibility>
}
```

An unauthorized caller receives the normal authorization error, never another
Business's usage. `null` usage means unavailable, never zero. `null` remaining
means unlimited only when budget kind is explicitly `unlimited` and the response
is available; otherwise it is unknown. Parent UI adds local loading state and
requires `available === true`, never just a nonzero cap. Show loading,
plan-disabled, exhausted and unavailable reasons. Availability is advisory;
revalidate at bank settings save, reservation and immediately before dispatch.

## Reservation and outcome contract

Persistence must enforce a unique **logical recipient delivery** keyed by
Tenant/report/current recipient identity and notification purpose. Channel is
bound on its first authorized reservation: putting channel in the only unique
key would permit a second send after fallback/channel change. Report replay,
worker retry and changed contact details must recover the same logical intent,
not manufacture another quota unit or another channel delivery.

Under a consistent Tenant/channel/UTC-month lock, resolve fresh effective policy
and authority, validate bank/report/recipient relations, lock/recover intent,
and atomically reserve capacity only when `used + reserved + requested <= cap`
(or explicit unlimited). Reserve the complete eligible recipient group before
starting dispatch; insufficient group capacity does not silently pick staff.
Use the original reservation period for settlement across a month boundary.

States distinguish reserved-not-started, dispatching, accepted, definitively
rejected, cancelled-before-start and unknown-outcome. A durable fenced claim must
precede provider I/O, which runs outside database transactions. Provider acceptance
moves reserved to used exactly once; duplicate settlement is a no-op. Only
provable nonacceptance/cancellation before I/O can release a unit. Timeout, worker
crash after starting, lost response or expired worker lease retains capacity and
requires provider reconciliation; never blindly release and resend. A safe retry
uses the same logical intent/provider idempotency binding. A completed intent
never switches channel. Membership removal and current review permissions are
rechecked; an alert grants no new payment-review access.

Use the bounded existing own-transaction helpers. Serialization retry repeats
only rolled-back database work, never transport calls. SQL multi-session tests
must prove the cap and uniqueness; memory tests cannot certify SQL concurrency.

## Policy revision notices and fallback

Every effective policy change must create one durable in-app Business notice per
`(tenantId, policyRevision)` for each affected active Business already using bank
payment alerts. This means a Business with configured bank alert recipients,
including one currently blocked by cap/policy; no generic promotional campaign.
Compare old/new **effective** entitlements at application time using current plan,
not the tier label alone. Include cap changes even when both states stay enabled.
An unchanged effective entitlement produces no notice. Keep prior reservations.

Enumerate affected Businesses with a durable cursor and resumable change job;
policy application and durable job creation must be atomic in their authority.
Do not rely on the browser remaining open or on a provider delivery to fan out.
Cross-database desired/applied revisions and propagation status must be explicit:
a failed sync is pending/failed, not a completed notification claim. Process each
committed revision in order, deduplicate replay, and do not drop intermediate
change notices. A freshly disabled policy blocks dispatch on refresh failure;
there is no indefinite stale grant. An already accepted/in-flight external send
cannot be recalled by a later policy edit; UI must not promise that it can.

Notice audience: current Business Owner/Admin; selected current bank alert staff
may read the notice only within their current Business/Store/payment-review
scope. One Business event may have per-member read receipts; that is not duplicate
Business notices. Removed/revoked members and other Businesses cannot read it.
Do not grant Finance administration merely to deliver a notice. Read-time access
checks remain required even if recipients were eligible when the event was saved.

A newly enabled WhatsApp entitlement says “You can now configure WhatsApp payment
notifications.” It does not auto-enable or change saved channel preference.

If a bank selected WhatsApp and policy disables it, preserve saved preference and
show effective delivery separately. Email fallback is allowed only when Email is
currently enabled, sufficient capacity can be reserved for the whole selected
current authorized group, and **every** selected recipient has a valid verified
email. At most one channel is bound to each logical delivery. Once an intent has
started/unknown/accepted WhatsApp, it cannot be retried via Email. If any fallback
precondition fails, keep in-app review/action required; never promise Email or
partially split a group. Quota exhaustion alone does not authorize a channel switch.

Example notices reflect eligibility truth: “WhatsApp payment notifications are
no longer available. Eligible new alerts will use Email.” versus “WhatsApp payment
notifications are paused. Review bank notification settings.” A global plan save
cannot guarantee future per-send capacity, so avoid unconditional “will be sent”.

## Assistant impact

Oversight plan policy edits are privileged office configuration and excluded from
merchant assistant tools. Bank recipient/channel setup remains form-only. The
eligibility reader is an authenticated app integration, not a new prompt tool.
Policy notices do not grant an assistant or a recipient new payment permissions.
The parent payment-link/report capabilities retain their existing canonical
commands and review boundary. This proposal changes no manifest or runtime
capability; implementation must record H02 and run the existing H01/H02 gates.

## Acceptance checklist

- [x] Inspect current authority and preserve checkout/other owners' work.
- [x] Publish and verify three Oversight design directions with change notices.
- [ ] Record the owner's exact selected revision and agree schema/router seams.
- [ ] Implement audited policy, eligibility, quota and durable change notices.
- [ ] Verify permissions, missing/invalid config, all tiers, reset/cap reductions,
  current membership, fallback group/contacts, retries/unknown outcomes, revision
  replay and real SQL concurrency with test transports only.
- [ ] Complete scoped types/source checks, assistant-impact/Brain records and
  local commits; record implementation evidence against the selected revision.

Progress here is 2/6 milestones; no product or release acceptance. Product
runtime checks have not run. `qa:doctor --offline` passes setup only. Whole-checkout `test:quick --plan`
currently reports unmapped unrelated onboarding preview paths; do not report green
or change their mapping under this task. No provider or database action performed.


## Published design checkpoint

Canonical review: https://workshop.localhost/oversight/plans/payment-notifications.
All v1/v2 history is retained. Owner selection and implementation are unset.
Current exact immutable revisions (all v3):

| Direction | Revision | Tradeoff |
| --- | --- | --- |
| 01 Table + edit modal (recommended) | `c48516ad-f623-4eaa-b814-cf5cf95ab3d9` | Four-tier overview with focused audited edits. |
| 02 Tier rail + channel detail | `1fa01938-51a4-491c-8905-0f7b94c12a65` | Inspect and edit one tier at a time. |
| 03 Channel matrix + review panel | `944bb9f0-45cf-4fe3-b0c5-ec5ed4dd10c4` | Compare all channels/tiers while editing. |

The separate Claude Opus5.5/high CLI request (session
`0f49fd6f-bc07-4f23-b382-c97f07c3843e`) produced no output after more than ten
minutes and was terminated (exit143). No other model was substituted. Codex
used the owner's standing fallback to author the previews. The requested flags
were exact; no returned model/output verification was possible. Parent banking
Claude session and Workshop were untouched.

Focused archived-preview browser review: all three directions render; table edit,
negative-cap refusal, required-reason refusal, actual-draft notice, simulated save
and retained usage, tier switching, explicit Unlimited, matrix change summary,
Escape/reset, quota exhausted246used+4reserved/250, unknown loading/unavailable
values, conflict refusal, owner-access refusal and four change-notice examples
were exercised. Fanout completion is simulated only. No real API/provider calls
or merchant changes are part of these artifacts. Shared viewer remains running.

Documentation-only fast checks pass45tests/175assertions and QA tooling types.
This is the explicit owned-document scope, not feature/SQL/full-checkout proof.
JavaScript syntax and bundled relative assets were checked. API, atomic SQL,
actual policy propagation, recipient permission, provider outcome/reconciliation,
app UI and release acceptance remain future implementation checks.
