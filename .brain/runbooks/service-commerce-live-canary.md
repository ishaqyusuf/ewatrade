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
