# Service Commerce Policy Release Gate

## Purpose

Use this gate before activating a Service Commerce vertical/channel for a real
Store. Technical setup, provider readiness, tests and a green dashboard never
constitute legal, licence, Meta or operating approval.

## Required Review

1. Confirm the Store's current two-letter jurisdiction directly; do not infer
   it from Tenant metadata or a provider number.
2. Name the exact vertical, channel and subject. Review Progressive draft
   capture, Catalog publication, procure-to-order, price promotion and managed
   inventory graduation separately.
3. Recheck the current official
   [WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/)
   and [WhatsApp Business Platform Pricing](https://whatsappbusiness.com/products/platform-pricing/).
   The last implementation review was 2026-08-10; these sources are volatile
   and must be reviewed again for every release/activation.
4. Obtain the applicable licence/evidence and written provider/legal approval.
   Record only a private reference, never the document contents in a public
   URL, task payload, log, provider message or generic profile audit.
5. Have an active Tenant Owner/Admin reviewer set the decision through the
   protected revisioned Service Commerce policy command with effective/expiry
   dates, bounded reason and expected revision.
6. Verify the safe workspace projection and the actual public/job boundary.
   For WhatsApp, confirm that inbound content persistence, job claim and the
   final provider-send authorization all return `allowed`.

## Nigeria Pharmacy WhatsApp

This combination is default `prohibited`. A healthy WABA, number, webhook,
template, Connection or Store Binding cannot override it. Activation requires
an explicit unexpired decision with a written approval reference. Synthetic QA
approval references are test fixtures only and must never be copied into a real
Store decision.

## Stop And Roll Back

- Stop activation for missing/changed jurisdiction, absent/ambiguous evidence,
  pending or expired approval, revocation, stale revision, provider-policy
  change or any discrepancy between stored scope and the intended operation.
- Revoke the exact decision with its current revision and reason; deactivate
  the Store profile/channel where applicable. Existing customer content and
  lifecycle history remain intact.
- Do not delete or rewrite policy audit events. Escalate evidence access through
  the separately audited protected detail command.
- Production schema rollout, live Meta/provider canaries and the first real
  business activation require their own authorization and are not implied by
  development Neon acceptance.

## Current Evidence

Ticket 11 source acceptance passed the dedicated verified-Neon policy test with
9 assertions and all 10 existing Service/Inquiry/profile/pickup/delivery
compatibility scenarios. The combined final run hit one transient Neon
transaction-start `P2028` on manual-fee delivery; its isolated rerun passed
with 17 assertions. This proves deterministic development behavior, not current
policy approval for any real pharmacy or provider account.
