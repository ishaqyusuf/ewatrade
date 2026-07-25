# ADR-0019: Managed Domain Provider Boundary

## Status

Accepted

## Context

EwaTrade needs a simple domain purchase experience for Nigerian merchants
without making Vercel or EwaTrade the legal domain owner. `.com.ng` and `.com`
have different registrar strengths, provider writes can have ambiguous
outcomes, and payment success is independent from registration and hosting
success.

## Decision

- Route `.com.ng` registration to GO54 and `.com` registration to
  Openprovider through one `@ewatrade/domains` contract.
- Keep the merchant as registrant and encrypt the registrar contact payload.
- Use Paystack only for NGN hosted checkout and refunds.
- Use Vercel only for project-domain attachment, DNS and SSL hosting.
- Persist quote, payment, registration, managed-domain and connection state as
  separate records.
- Execute registrar writes and hosting attachment in jobs, never in clients.
- Treat payment callbacks as refetch hints; signed webhooks own payment facts.
- Classify provider timeouts as uncertain, reconcile against that same
  provider, and never fail over or register again while the result is unknown.
- Normalize registrar lifecycle responses at the provider boundary. Only an
  authoritative active state can complete an uncertain order or activate a
  managed domain; unknown provider states remain non-active.
- Request a refund after a definite post-payment registrar rejection.
- Persist signed refund progress/failure events idempotently so a pending
  refund remains operationally visible.
- Activate a custom `TenantHostname` only after ownership and Vercel
  verification succeed.
- Preserve the free EwaTrade storefront hostname as a fallback.

## Consequences

- Provider choice can change without changing dashboard/mobile contracts.
- Registration success cannot be downgraded by a later Vercel failure.
- Provider and payment outages remain visible and resumable rather than being
  flattened into one success/failure flag.
- Registrar-specific payloads, status codes, customer handles and premium-fee
  acceptance remain isolated behind the package contract.
- EwaTrade must operate funded registrar wallets, renewal communications,
  refund review, reconciliation alerts and registrant privacy controls.
- GO54/Openprovider commercial acceptance and live canaries remain launch
  gates, not assumptions encoded by the source implementation.
