# Managed Storefront Domains

## Status

Source implemented; database deployment and live provider acceptance are
blocked.

## Scope

Business owners and administrators can manage a storefront domain from the web
dashboard or mobile app:

- buy a standard-price `.com.ng` through GO54;
- buy a standard-price `.com` through Openprovider;
- connect an already-owned `.com.ng` or `.com` after TXT ownership
  verification;
- follow durable payment, registration, DNS and SSL state;
- keep the free EwaTrade storefront hostname throughout setup or failure.

Premium names, other TLDs, automatic renewal charging, and transfer initiation
are not enabled in the launch UI.

## User Experience

Dashboard settings are split into General, Domains and Billing. The Domains
workspace uses a bounded table and URL-owned sheet modes for buy, connect,
details and progress.

Mobile exposes `Website & domain` to owners/admins in More. The protected
full-screen workflow is flat, keyboard-safe and follows the same search,
registrant, review, hosted checkout, ownership verification and durable
progress contract.

Marketing signup only reserves the free EwaTrade storefront hostname. It no
longer accepts a raw custom domain or writes unverified custom hostname rows.

## Provider Routing

- `.com.ng` routes to GO54.
- `.com` routes to Openprovider.
- Provider choice is server-owned and is not shown as a user decision.
- Vercel attaches the verified hostname and supplies DNS/SSL hosting; it is not
  the registrar.
- Paystack collects the NGN retail amount through hosted checkout.

## Data And Security

- Quotes snapshot wholesale cost, provider currency, exchange rate, retail
  price and renewal indication for 15 minutes. Currency conversion uses the
  configured rate for the registrar account currency rather than assuming USD.
- Registrant data is encrypted with AES-256-GCM. Only masked owner summary
  fields are returned to clients.
- Domain Orders have tenant-scoped idempotency keys and exact payment
  references.
- Registrar attempts record request fingerprints and distinguish definite
  failure from uncertain outcome.
- Paystack webhooks are verified from the raw request body with SHA-512.
- A definitive registrar failure moves the paid order to refund pending and
  requests a Paystack refund. The signed refund webhook closes the state.
- An uncertain registrar result is never retried blindly. Scheduled
  reconciliation asks the same registrar for authoritative state. Provider
  statuses are normalized and an unknown status can never promote a domain to
  active.
- Delayed payment callbacks restore the exact order progress view, but signed
  webhooks remain the only source of payment/refund facts. Pending and failed
  refund webhook events are retained idempotently for operations review.
- A hostname already owned by another tenant cannot be reassigned.
- `TenantHostname` becomes a primary custom storefront projection only after
  Vercel reports the connection verified.
- Vercel ownership challenges are persisted and shown as a copyable DNS record
  in both dashboard and mobile flows.
- Registrant and checkout consent require the current immutable policy version;
  the review UI links to the selected registrar's registrant policy.

## Operations

The 15-minute reconciliation schedule:

- retries pending/failed Vercel connection checks;
- recovers paid registration orders with uncertain provider outcomes;
- refreshes managed domains that are within 45 days of expiry.

Production checkout must remain disabled until GO54/Openprovider accounts,
Paystack, Vercel, encryption, pricing/FX and callbacks are configured and both
live canaries have passed.

## Validation State

Completed:

- Prisma formatting/generation, generated local migration
  `20260724174525_managed_domains`, local application, local schema push and
  migrate-deploy verification;
- 41 focused domain adapter, signing, pricing, encryption, query-safety,
  job-fault, API-schema, callback and refund-event tests;
- repository-wide tests: 251 pass, with four unrelated existing Retail Ops
  fixture failures;
- DB, domains, jobs, API, dashboard, marketing and mobile TypeScript;
- targeted Biome checks;
- mobile domain, NativeWind and keyboard guards;
- desktop and 390px browser review of the signup handoff.

Blocked:

- authenticated dashboard browser QA because the available headless browser
  runtime could not reach the host-bound local dashboard;
- production and remote-development schema pushes because elevated shared
  database writes were not approved;
- Android emulator domain-flow QA;
- live GO54/Openprovider/Paystack/Vercel canaries and legal/commercial
  acceptance.

## References

- Plan: `.brain/plans/2026-07-24-managed-domain-purchasing.md`
- Midday contract:
  `.brain/plans/2026-07-24-managed-domain-midday-migration-contract.md`
- Decision: `.brain/decisions/ADR-0019-managed-domain-provider-boundary.md`
