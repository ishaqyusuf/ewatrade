# ADR-0027: Tenant-Owned Multi-Pharmacy WhatsApp Connections

## Status

Accepted for the Prescription Commerce implementation direction on 2026-08-08.
Production remains gated by pharmacy/provider onboarding, privacy, media, and
operating acceptance in `.brain/features/prescription-commerce.md`.

## Context

Midday provides the closest local WhatsApp reference. It uses one
platform-owned WhatsApp Business sender configured through global environment
values, then links each incoming user identity to a Midday team. EwaTrade
Prescription Commerce serves unrelated pharmacies whose customers send
sensitive prescription media. Reusing one platform sender as every pharmacy's
permanent public identity would create branding, routing, billing, support, and
cross-Tenant isolation risks.

The implementation must also support independent pharmacies, pharmacy groups,
and branches without deploying one webhook or application per business. It
must preserve the provider-neutral Communications boundary so a Business
Solution Provider can be adopted later without moving prescription workflow
rules into provider code.

## Decision

- The pharmacy or pharmacy group owns its WhatsApp Business Account and public
  business number. A shared EwaTrade number may be used only for a bounded
  single-pharmacy test, not as the permanent multi-pharmacy identity.
- The initial adapter uses Meta WhatsApp Cloud API directly, following Midday's
  transport pattern. Midday's single sender and global phone-number/access-token
  configuration are not copied as EwaTrade's tenant model.
- The first pilot may be onboarded manually. Repeatable onboarding uses Meta
  Embedded Signup directly or through an approved Business Solution Provider.
- EwaTrade operates one Meta application and verified webhook surface. The
  webhook recipient phone-number id resolves one durable Tenant-owned WhatsApp
  Connection before any customer or request lookup occurs.
- A Tenant WhatsApp Connection owns WABA/provider identifiers, display identity,
  connection state, billing owner, credential reference, template approvals,
  and Store bindings. Credentials are encrypted or stored in a managed secret
  system and are never exposed to clients.
- Embedded Signup discovery is stored as a short-lived encrypted server-side
  session. The administrator explicitly selects the authorized number and a
  consented test recipient before a connection is staged.
- A Store owns its Prescription Channel configuration and binds it to a Tenant
  WhatsApp Connection. A central group number may bind multiple Stores only
  when bounded channel context or explicit customer choice resolves the Store;
  ambiguous routing fails closed.
- Conversation and idempotency scope includes the connection, customer
  WhatsApp id, and request or channel context. Customer phone number alone is
  never a global identity or merge key.
- Provider-specific onboarding, templates, message windows, buttons, delivery
  receipts, media retrieval, and fees stay behind Communications. Prescription
  Operations consumes verified provider-neutral commands and facts.
- Fulfilment is selected before payment whenever it changes fee, promise, or
  eligibility. `Review & pay` opens a scoped EwaTrade page and hosted checkout;
  WhatsApp button or navigation events never establish payment.
- External message rates and optional provider surcharges are metered by
  connection and billing owner but are not hardcoded into prescription domain
  logic or customer medicine prices.
- Connection replacement and credential rotation are two-phase changes. The
  previous active Store route and credential remain in use until a readiness
  job promotes the pending replacement. Failure preserves the old route.
- A Store public WhatsApp link carries only an opaque channel token. For a
  central group number, that token or an explicit Store choice is required
  before content persistence; unresolved traffic creates a redacted routing
  alert and stops.

## Consequences

- Independent pharmacies retain the expected customer-facing identity and can
  own or reconcile their provider billing.
- One EwaTrade application and webhook can scale across pharmacies without
  weakening Tenant and Store isolation.
- Multi-branch groups may choose centralised or branch-specific numbers while
  using the same domain contracts.
- Direct Meta integration has lower provider markup but requires EwaTrade to
  own Embedded Signup, credential lifecycle, webhook routing, template status,
  provider health, and support. A later BSP can reduce some operational burden
  at additional cost without changing Prescription Operations.
- Implementation and acceptance tests must cover unknown recipient ids,
  signature failure, revoked credentials, duplicate events, ambiguous Store
  context, the same customer across pharmacies, and cross-Tenant bindings.
