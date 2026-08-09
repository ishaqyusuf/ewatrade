# System Architecture

## Purpose
Describe the intended technical architecture and responsibility boundaries for the platform.

## How To Use
- Update when the stack, layering, or service boundaries change.
- Keep this doc implementation-aware but concise.

## Architecture Direction
- Workspace shape: follow the `midday` project monorepo pattern with `apps/*` and `packages/*` as the primary structure, with any future tooling packages added only when needed.
- Frontends: Next.js web applications and an Expo mobile application.
- Dashboard feature routes follow the Midday workspace pattern: authenticate
  and resolve tenant/store on the server, prefetch typed bounded queries,
  hydrate focused client workspaces, keep navigable search/filter/sheet state
  in URL hooks, and colocate domain tables, sheet shells, forms, loading/empty
  states and route recovery by responsibility.
- Desktop wrapper: a private Tauri package may wrap the dashboard URL for internal desktop builds, but dashboard workflows remain implemented in the web dashboard.
- Backend entry points: Hono-based HTTP services with typed tRPC procedures where shared end-to-end contracts are needed.
- Domain flow: client -> API layer -> service layer -> repository layer -> database.
- Async work: Trigger.dev for jobs and workflow orchestration.
- Auth: Better Auth for identity, sessions, and tenant-aware access control.

## Data Access Strategy
- `Prisma` is the source of truth for schema modeling, generated types, and migrations.
- Current repositories use the generated Prisma client behind explicit query
  modules. UI and API layers do not access the database directly.

## Operational Boundaries
- Catalog separates item kind, customer options, commercial Offerings, Product
  unit configuration, Store availability and price history.
- Inventory uses exact decimal strings, immutable configuration versions,
  explicit Balance Sources, reservations and atomic Stock Operations.
- Commerce owns Commercial Orders and immutable Offering Snapshots. Product
  fulfillment and Service work are downstream effects, not Order-line types.
  A tenant Customer directory supports pre-Order contact creation while Orders
  retain immutable customer snapshots instead of mutable profile relations.
- Service Operations owns Intake, Job/Line allocation, work state, assignments,
  promises, notes, exceptions, evidence and rework. Customer Access owns public
  Requests, Quote acceptance and safe tracking projections.
- Service Commerce composes Catalog, Customer, Customer Access, Commerce,
  Service Operations, Fulfilment, Communications and Reporting through typed
  capability and source-adapter contracts. `ServiceRequest` and
  `PrescriptionRequest` remain distinct sources; a universal request table and
  arbitrary workflow engine are explicit non-goals.
- Booking is a first-class capability with resource availability, contention,
  schedule, payment policy, reschedule/cancel and reminder semantics. It is not
  stored as generic metadata or embedded in Prescription Commerce.
- Managed Domains owns immutable quotes, encrypted registrant profiles,
  payment/registration orders, registrar lifecycle and independent
  ownership/DNS/SSL connections. `@ewatrade/domains` owns external adapters;
  query modules own persistence; jobs own provider writes and reconciliation.

## Offline Sync Boundary
- Tenant owners/admins control offline checkout through
  `Tenant.metadata.offlineOperationsEnabled` and optional staff approval
  through `Tenant.metadata.offlineApprovalRequired`; API device registration,
  replay and management review enforce the current values.
- Mobile queues only `commercial_order` after a user has authenticated once.
  The command may carry immutable customer facts and an optional initial
  payment that replay applies atomically with the Order.
- Commands use tenant-scoped client ids, payload hashes, schema/event versions,
  dependencies and typed conflict results.
- Staff replay either applies immediately or uses the existing
  `REVIEW_REQUIRED` state with a null conflict code until Owner/Admin/Manager
  approval. Approval executes the original staff-authored command atomically;
  a semantic failure becomes a typed conflict.
- Durable `OfflineDevice`, `OfflineCommand`, `OfflineConflictReview` and
  `OfflineDeviceRevocation` records are authoritative. The removed generic
  sync-run/event and metadata fallbacks are not read.
- Catalog, inventory, closeout, Staff, Service, standalone Customer and later
  payment mutations remain online-only, as do public Requests, Quotes,
  evidence publication and provider delivery.

## Mobile Interaction Boundary

- The mobile application uses one floating bottom-tab shell with a central
  create action and full-screen modal routes for workflows exceeding roughly
  half a phone screen.
- Optional advanced Catalog and Service inputs are progressively revealed.
  Keyboard-sticky inline composition is reused for compact repeated-value
  entry; ordinary forms remain keyboard-safe.

## Observability Boundary

- Each independently deployed application owns a separate Sentry project.
- `apps/mobile` reports to `cipron-concepts/ewatrade-mobile` and identifies
  development, preview, and production through the Sentry environment field.
- The public DSN may be provided through `EXPO_PUBLIC_SENTRY_DSN`. The private
  `SENTRY_AUTH_TOKEN` is build-time only, must remain outside version control,
  and is used solely for source-map and debug-symbol uploads.
- Mobile default PII collection, Session Replay, user feedback, and SDK logs
  remain disabled until an explicit privacy and retention decision enables
  them.

## Multi-Tenancy
- Every tenant-owned entity carries a tenant identifier.
- Merchant tenants and dispatch tenants are isolated in storage and authorization.
- Public marketplace reads must only expose explicitly public data.

## Business WhatsApp Connection Boundary

- A Tenant owns each business WhatsApp Connection, including WABA/number,
  sender identity, credential reference, template state, billing owner,
  lifecycle and Store bindings. EwaTrade may share one Meta application and
  webhook, but unrelated businesses never share a permanent customer-facing
  sender identity.
- Direct Meta Cloud API remains the initial provider transport following
  Midday's webhook/job separation. Twilio or a BSP is optional behind
  Communications and cannot own Tenant routing or business workflow truth.
- Web, staff and WhatsApp are channel adapters. The resolved Store capability,
  vertical policy and source aggregate determine available Quote, booking,
  payment, pickup, delivery and human-escalation actions.
- Store capability and vertical/jurisdiction policy are server projections.
  Unknown, inactive, ambiguous, prohibited and cross-Tenant routes fail closed
  before customer content is persisted.

### Pharmacy WhatsApp Extension

- The pharmacy or pharmacy group owns its WhatsApp Business Account and public
  number. EwaTrade uses one Meta application and verified webhook surface for
  connected pharmacies; the recipient provider phone-number id resolves one
  Tenant-owned WhatsApp Connection before Store, customer, or request lookup.
- Store Prescription Channels bind to reusable Tenant connections. A central
  group number may serve several Stores only when bounded channel context or
  explicit customer choice resolves the Store; ambiguous and cross-Tenant
  routing fails closed.
- The initial provider adapter follows Midday's direct Meta Cloud API transport
  pattern, but Midday's one global sender is not the EwaTrade Tenant model.
  Embedded Signup, credentials, templates, windows, buttons, media, receipts,
  and provider fees remain behind Communications so an approved BSP can be
  adopted without coupling Prescription Operations to it.
- Conversation state scope includes Connection, customer WhatsApp id, and
  explicit Store context. A separate short-lived selection pointer contains
  only Tenant/Store identity for central-number follow-ups; customer phone
  number alone is never a global identity or sensitive-request merge key.
- Pharmacy provider credentials use encrypted or managed-secret references and
  never enter client configuration, logs, analytics, or prescription domain
  payloads.
- Dashboard surfaces follow the Midday invoice boundary: thin authenticated
  server route, feature composition, `nuqs`-typed URL sheet/filter state,
  globally mounted sheets, shared Zod form fields, paginated
  lightweight queue, separate authorized detail, tRPC orchestration, query
  modules for persistence, provider-neutral packages, and identifier-only
  durable jobs.
- Sender replacement and credential rotation are staged. The working binding
  remains active until readiness promotes the pending route; failed readiness
  cannot silently interrupt an existing pharmacy number.
- Pharmacy WhatsApp remains independently gated by current Meta regulated-
  vertical policy, Nigerian law/licensing, privacy and operating approval even
  when the underlying Connection is technically ready.

## Explicit Non-Goals
- No Supabase dependency in the current architecture.
- No direct client access to the database.
- No universal customer-request table or arbitrary workflow engine.
- No platform code migration before owner approval of the proposed Service
  Commerce tickets.

## Open Items
- If cross-device or public Service Evidence is enabled, configure managed
  object storage and trusted media verification. Device-retained private
  evidence remains usable without that deployment integration.
- Run behavioral cross-surface validation in the separate owner-requested
  testing goal.
