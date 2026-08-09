# 17 - Embedded Signup And Repeatable Pharmacy Onboarding

**What to build:** Add self-service Meta Embedded Signup so each pharmacy owner can authorize their own WhatsApp Business account, select numbers, bind them to stores, validate readiness, and manage the connection lifecycle without engineering intervention. Build the setup surface and backend with Midday's compositional dashboard, typed API, query-module, shared-provider-package, and durable-job boundaries.

**Blocked by:** 15 - Manual Pharmacy WhatsApp Connection And Inbound Intake

**Status:** implemented-source; live Embedded Signup canary pending

**Verification note (2026-08-09):** the Midday-composed setup surface, protected
typed API, thin signed callback, Communications exchange/discovery, digested
one-use Store/user/Tenant session, repository binding lifecycle, and durable
readiness job are source-complete. Focused tests now reject tampered and expired
callback state, require an unconsumed scoped signup capability, and verify
pending-credential readiness/failure behavior. Live Embedded Signup plus the
full partial/repeated/conflict/recovery component-integration matrix remain open.

- [x] An authorized owner/admin can launch Embedded Signup from a store-scoped setup wizard and return through a state-validated callback.
- [x] The dashboard follows Midday's app-integration composition: route/page code stays thin, feature components own the setup flow, typed tRPC hooks own queries/mutations, and loading, error, empty, connected, reconnecting, and revoked states are explicit with correct cache invalidation.
- [x] Zod schemas define every setup boundary; protected API procedures authorize tenant/store ownership and orchestrate database queries, provider-package functions, and jobs without embedding reusable onboarding logic in routers.
- [x] The Embedded Signup callback is a thin server route that validates signed state before provider exchange and delegates reusable Meta authorization/discovery behavior to the shared Communications package.
- [x] The wizard discovers authorized WABAs and phone numbers and supports one central number or explicit branch-to-number bindings without ambiguity.
- [x] Credentials and identifiers are exchanged server-side, encrypted or referenced securely, minimally scoped, and never exposed to browser logs or analytics.
- [x] WhatsApp Connection reads and writes go through tenant-scoped database/repository query APIs with deliberate package exports; dashboard code never reads provider credentials or database models directly.
- [x] Setup shows business verification, number, template, webhook, billing-owner, and test-message readiness with actionable failures.
- [x] Slow or retryable subscription, template-readiness, and connection-test work runs as durable jobs with identifier-only payloads and persisted status that the setup UI can refresh safely.
- [x] Activation requires a successful connection test and preserves existing routing until a replacement binding is fully ready.
- [x] Owners can rotate credentials, reconnect, suspend, revoke, or remove bindings with audit history and safe handling of in-flight work.
- [x] Multiple pharmacies can independently onboard under the one EwaTrade Meta application while retaining their own sender identity and Meta conversation billing.
- [x] The initial production adapter remains direct Meta Cloud API; Twilio or another BSP can be introduced only behind the same Communications contract through a separately approved provider decision.
- [ ] Component, schema, router, query, job, provider-fake, and integration tests cover callback tampering, partial signup, repeated signup, number conflicts, cache invalidation, central/branch binding, revocation, and recovery.
