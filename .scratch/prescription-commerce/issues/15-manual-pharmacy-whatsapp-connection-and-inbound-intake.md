# 15 - Manual Pharmacy WhatsApp Connection And Inbound Intake

**What to build:** Support the pilot onboarding path where an administrator connects each pharmacy's own WhatsApp Business account and number to EwaTrade, verifies the connection, and routes inbound messages and media into the same Prescription Request intake lifecycle. Follow Midday's direct Meta transport and app/package layering strictly, adapted from its single global sender to dynamically resolved pharmacy-owned connections.

**Blocked by:** 01 - Store Activation And Professional Roles; 04 - Public Channel Selection And Private Web Intake

**Status:** implemented-source; live Meta canary pending

**Verification note (2026-08-09):** the implementation retains Midday's thin
raw webhook, Communications-owned direct Meta adapter, normalized-event and
Redis/debounce boundaries, while resolving pharmacy Connection and Store before
state or media work. Focused tests prove signature parsing, two pharmacy senders,
central/branch selection, same-customer isolation, mixed cross-Tenant fail-closed
routing, credential revocation, identifier-only durable media intake, replay,
and retry behavior. The readiness job now directly proves pending-credential,
number/WABA, webhook, template, and outbound checks plus persisted failure.

- [x] One EwaTrade Meta application and webhook can hold multiple pharmacy-owned WhatsApp connections without sharing customer-visible sender identities.
- [x] The GET/POST webhook entrypoint follows Midday's thin REST-router pattern: initialize/register the runtime, pass the raw request to Communications, and contain no Prescription Operations logic, direct database writes, or provider-specific business rules.
- [x] A shared Communications package owns the provider-neutral inbound contract, direct Meta adapter, webhook verification, normalized message/media events, and explicit public exports; Prescription Operations consumes normalized commands/events and never imports a Meta SDK or calls Graph API directly.
- [x] WhatsApp Connection persistence and lookup live behind the shared database/repository query boundary; API procedures and REST routes validate, authorize, orchestrate, and pass tenant/store context explicitly.
- [x] The setup records WABA ID, `phone_number_id`, display number, business identity, billing owner, encrypted credential reference, connection status, and store bindings.
- [x] Runtime credentials and sender configuration are resolved server-side from the matched WhatsApp Connection; pharmacy access tokens and `phone_number_id` values are not treated as one global `WHATSAPP_ACCESS_TOKEN` or `WHATSAPP_PHONE_NUMBER_ID` configuration.
- [x] A connection test verifies credentials, authorized number ownership, webhook subscription, outbound capability, and unambiguous routing before activation.
- [x] Webhook signatures are validated and `phone_number_id` resolves to exactly one permitted tenant/store context before any message is read or persisted.
- [x] Unknown, inactive, revoked, duplicate, or ambiguous bindings fail closed and create an operational alert without leaking message content.
- [x] Conversation/thread state follows Midday's Redis-backed state and debounce pattern, but its key includes connection identity, external customer identity, and request or bounded channel context; the recipient connection is resolved before cached state can be read or reused.
- [x] Media retrieval, normalization, and other slow or retryable inbound side effects run as durable jobs with identifier-only payloads; jobs reload the connection and request context through package/query APIs before acting.
- [x] Inbound text and media create or continue the same Prescription Request lifecycle used by web intake, with idempotent event handling and source attribution.
- [x] The same customer contacting different pharmacies remains isolated by pharmacy connection and store context.
- [x] Package, query, job, API, Redis-state, and direct Meta adapter tests cover verification, inbound media, retries, duplicates, debounce, stale state, credential revocation, routing, and tenant isolation.
