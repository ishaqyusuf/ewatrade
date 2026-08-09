# Prescription Commerce Acceptance And Rollback Runbook

## Scope And Owners

Use this runbook for a non-production test pharmacy before any production
activation. The release owner coordinates the pharmacy owner, licensed
pharmacist, privacy lead, payments owner, Meta/WABA owner, and delivery owner.
Production remains fail closed until every external gate is signed off.

## Fixtures

- Two Tenants, with one independent Store each; one group Tenant with two Stores.
- One branch-specific number per independent Store and one central group number
  bound to both group Stores through distinct opaque channel links.
- One consented Meta test recipient, approved neutral templates, Paystack test
  credentials, deterministic private-media/safety/OCR fakes, and a manual
  delivery adapter.
- Owner/Admin, attendant, verified pharmacist, courier, and unauthorized user.
- Safe sample image/PDF only. Do not use a real patient's prescription or
  contact details.

## Pharmacy Setup

1. Configure policy, pickup, delivery zones/manual review, retention, and roles.
2. Launch manual or Embedded Signup, validate callback state, explicitly select
   the WABA number and test recipient, and create a pending Store binding.
3. Run readiness. Record webhook, template, billing owner, number ownership,
   neutral outbound, and routing results. Confirm a failed replacement leaves
   the old active route unchanged.
4. Activate the Store. Confirm `hasPrescriptionCommerce` reveals the workspace
   only for the activated Store and that the public Store link uses its sender.

## Acceptance Matrix

Run web, staff-assisted, WhatsApp branch-number, and WhatsApp central-number
intake through both pickup and delivery:

`intake -> media cleared -> OCR draft -> attendant verified -> pharmacist released -> current Quote issued -> fulfilment selected -> Quote accepted -> hosted payment verified -> packed -> ready -> pickup handoff or delivered`

For each path record request/order references, state transitions, audit-event
types, job run ids, communication attempts/receipts, payment provider test
reference, and redacted screenshots. Verify the same customer at two pharmacies
has different Connection/Store-scoped Redis keys and requests. For a central
number, enter each pharmacy through its opaque channel link, verify the
short-lived routing selection lets the next plain media/text continue that
Store thread, then switch links and verify neither request state crosses over.

## Failure Injection

- Storage/OCR timeout, unsafe media, partial OCR, duplicate media/event, and
  stale transcription revision.
- Invalid Meta signature, unknown `phone_number_id`, ambiguous central binding,
  revoked credential, failed rotation/readiness, duplicate webhook, expired
  service window, missing template, and provider outage.
- Expired/stale quick action, superseded Quote, duplicated payment callback,
  amount/currency mismatch, refund retry, and notification failure.
- Manual delivery review, courier reassignment, failed/rescheduled/returned
  delivery with reason, missing proof, invalid pickup code, and pickup exception.
- Privacy restriction, access/export/correction/erasure, legal hold, retention,
  incident freeze, and blocked reactivation.

Expected result is an idempotent retry or explicit safe failure. No test may
cross Tenant/Store boundaries, leak content into URLs/logs/alerts, mark a
payment from navigation, or bypass attendant/pharmacist gates.

## Operational Evidence

Capture de-identified queue/report totals, SLA timings, usage events, routing
alerts, connection audits, incident state, provider dashboard receipts, and
database row counts. Compare source Quote and legacy-backfill counts before
contracting legacy Service Quote tables.

## 2026-08-09 Neon Development Evidence

- Database target: the non-production Neon database selected by `.env.local`.
  Local Docker/PostgreSQL was not used and is not an allowed fallback.
- Schema: `db:migrate --local` detected historical drift and requested a reset;
  the reset was refused. `db:push --local` synchronized the schema without a
  data-loss override. Prisma migration status then reported 28 migrations and
  an up-to-date schema.
- Backfill: the idempotent Service Quote backfill ran twice with zero Commerce,
  legacy, or migrated rows in the empty development dataset. This is not
  production reconciliation or authorization to contract legacy models.
- Disposable pharmacy fixture: `Nile Market QA 2157482`, with synthetic owner,
  policy, weekday opening hours, weekend closure, pickup enabled, attendant and
  externally verified pharmacist roles. No real patient data was used.
- Authenticated browser QA: Owner-without-professional-role fails closed to the
  setup CTA; after setup and activation, the empty queue renders without an
  unauthorized request. Desktop and 375-by-812 mobile intake sheets scroll to
  consent and actions. A synthetic staff-assisted request reaches explicit
  success and opens its `attendant-review` URL-owned controller.
- WhatsApp setup correctly remains unavailable without Meta credentials and
  presents manual/Embedded Signup guidance for a pharmacy-owned number. No
  external Meta message, Paystack charge, or provider mutation was performed.
- Automated Neon acceptance: a disposable pharmacy and Product completed the
  production repository flow for web, staff-assisted, and WhatsApp manual-text
  origins through attendant verification, pharmacist release, inventory-backed
  Quote, idempotent pickup acceptance, fake hosted checkout, paid callback and
  callback replay, packing, pickup-code verification, and idempotent handoff.
  The profile-attested integration test passed with 33 assertions and removed
  its run-owned synthetic Tenant/User fixture in one atomic cleanup.
  Hosted-Neon latency also proved that the shared Prisma client requires the
  bounded 10-second wait/30-second interactive-transaction policy.
- Remaining acceptance: cross-channel delivery E2E, live provider
  failure canaries, accessibility automation, load/concurrency/security,
  production Service Quote reconciliation/contraction, and production rollout.
- Automated baseline: 405 tests pass and eight database integration hooks/tests
  skip by default; five unrelated mobile-navigation/Retail-Ops mock failures
  remain tracked outside Prescription Commerce. The opt-in Prescription
  Commerce Neon test passes separately.

## Rollback

1. Suspend the affected Store binding or whole Connection; do not delete audit
   history. Preserve an older active binding during failed replacement.
2. Deactivate the Store Prescription Channel and stop dispatch/readiness tasks.
3. Revoke public/quick-action capabilities and freeze affected requests through
   incident controls. Do not reverse verified payment facts; use the refund
   workflow.
4. For schema rollout, stop before legacy contraction if reconciliation differs.
   Restore from the approved backup only under the database change owner.
5. Confirm public entrypoints fail closed and communicate the neutral downtime
   message through an approved channel.

## Incident Procedure

Open a Prescription Incident Control with type, Store, owner, and redacted
reason. Suspend routing or fulfilment as required, preserve evidence and audit
facts, notify the privacy/pharmacy/payment owner, and resolve root cause. A
Store cannot reactivate while a freeze or suspension remains active. Resume via
staged readiness and a monitored neutral canary, never by bypassing state.

## Refund Reconciliation

An `OUTCOME_UNKNOWN` refund must be reconciled against Paystack by its unique
EwaTrade merchant note, amount, and currency; do not submit another refund
immediately. After the 24-hour consistency window, one confirmed-absent result
may return to `READY`. If the second dispatch is also uncertain, the refund
becomes `NEEDS_REVIEW`: the payments owner must inspect Paystack and the Order
ledger, preserve evidence, and resolve the provider result manually. Never
change the dispatch count/state directly or create a new client refund id to
bypass this gate.

## Exit Criteria

All matrix paths and failure injections pass; accessibility/mobile and load
checks meet the approved spec; schema/backfill counts reconcile; live provider
canaries succeed; legal/privacy/retention/delivery owners sign off; rollback is
rehearsed; and no unresolved safety, privacy, pharmacy-error, or isolation
incident remains.
