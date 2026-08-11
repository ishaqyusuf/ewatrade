# Service Commerce Live Canary Preflight

## Purpose

Use this offline preflight before requesting authority to touch a live provider
or production database. It checks only redacted configuration and evidence
presence. It performs no database query, network request, provider call,
customer lookup, credential resolution, migration, or Store mutation.

A `READY` result means only that the offline preflight inputs are present.
Every result includes `executionAuthorized: false`; live execution still needs
an owner-approved change window, named operator, rollback action and recorded
provider-specific evidence.

## Command

Run the source checks first:

```sh
bun test packages/service-commerce/src/live-canary.test.ts scripts/service-commerce-live-canary.test.ts
```

Then load the intended production environment and attest only presence facts:

```sh
APP_ENV=production DATABASE_PROFILE_VERIFIED=1 bun --env-file=.env.production scripts/service-commerce-live-canary.ts \
  --kind meta_whatsapp \
  --production-profile-confirmed \
  --tenant-reference-present \
  --store-reference-present \
  --connection-reference-present \
  --consented-test-recipient-present \
  --neutral-template-approval-present
```

The command accepts no Tenant, Store, Connection, recipient, credential,
approval-document or provider-operation value. Output contains only the
allowlisted kind, missing environment-key names, bounded evidence labels,
reason codes and `READY`/`BLOCKED` status. Secret values are never returned or
logged.

## Allowlisted Gates

- `meta_whatsapp` can become offline-preflight `READY` when the production
  profile, hosted PostgreSQL target, Trigger/Meta/webhook/encryption/Redis key
  presence and neutral test evidence are all present. This does not run the
  existing WhatsApp Connection test or send a message.
- `payment` remains `BLOCKED` with
  `PAYMENT_CANARY_ADAPTER_UNSUPPORTED`; no production-safe Paystack
  transaction/refund/reconciliation canary exists.
- `generic_media_safety` remains `BLOCKED`; the production private-storage and
  safety adapters are not configured implementations yet.
- `pharmacy_media_ocr` remains `BLOCKED`; it also requires an approval-reference
  presence fact, which is not a legal, licence, policy or privacy conclusion.
  Production private-media, safety and OCR adapters remain absent.
- `courier_manual` remains `BLOCKED`; fulfilment is manual and must be proven
  through an approved operating procedure rather than an invented provider
  integration.

## Current Meta Policy And Pricing Review

Reviewed on 2026-08-11 against Meta's current
[WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/) and
[WhatsApp Business Platform Pricing](https://whatsappbusiness.com/products/platform-pricing/).
This is a dated release-readiness snapshot, not a permanent authorization:
Meta states that policy may change, and the live-window operator must re-open
both sources before any provider action.

- Platform messages are priced when delivered, using the recipient market and
  message category. The current categories are marketing, utility,
  authentication and service. Service messages and utility replies in the
  user-initiated service window are currently free; qualifying click-to-WhatsApp
  or Facebook Page entry points have a 72-hour free window. Exact Nigeria rates
  and volume tiers remain dynamic provider facts and must be captured from the
  current rate card at the authorized live window; EwaTrade must not hardcode or
  estimate them.
- A business may contact only opted-in recipients, must honor opt-out, and may
  initiate outside the 24-hour customer-service window only with an approved
  template used for its designated purpose. Automation must retain a clear
  human-escalation path.
- Prescription drugs and medical or healthcare products remain regulated or
  restricted categories. Nigeria does not appear in the current allowed-country
  list for over-the-counter drug messaging. EwaTrade therefore keeps Nigeria
  Pharmacy WhatsApp prohibited by default; technical Connection readiness,
  templates, a local licence or an internal approval cannot independently
  activate it.
- Generic Service Commerce still requires current Store policy decisions for
  WhatsApp and intake, technical Connection readiness, the intended template
  profile, billing ownership and a consented test recipient. None of those facts
  authorize Pharmacy or substitute for the live-window policy/rate review.

This review performed no provider, database or customer operation and is not
legal advice. The live release remains blocked until its separately authorized
window revalidates the official policy, selected Nigeria rate card, template
status, scoped Connection and rollback evidence.

## Live Execution Evidence

For an authorized live canary, record the canary kind, operator, Tenant/Store
scope, approved time window, safe result code, rollback action and evidence
reference outside logs containing secrets or customer content. Meta testing
must use the existing scoped Connection test, the configured consented test
recipient and its neutral text. Review approved-template status as separate
evidence: the current Connection test observes template readiness but does not
send a template, and technical Connection readiness alone does not prove the
template gate. Pharmacy WhatsApp additionally uses the separate policy release
gate; technical readiness can never override it.

Stop on any target mismatch, missing approval, missing/empty environment key,
non-production profile, local/invalid database URL, unsupported adapter,
provider error or redaction concern. Do not convert this preflight into an
`--execute` mode without a separately reviewed provider-specific contract.
