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
  `PrescriptionRequest` remain distinct sources; `CommerceInquiry` is the
  narrow Product clarification/Quote source; a universal request table and
  arbitrary workflow engine are explicit non-goals.
- Progressive Catalog resolves verified source lines against existing or
  private `DRAFT` Catalog graphs, projects attributable price history, and
  requires explicit commands for reusable price promotion, publication and
  managed-inventory graduation. Quotes never invent stock; exact reservations
  and opening counts remain Inventory-owned ledger operations.
- Customer Channels owns multiple Tenant Connections, explicit Store bindings
  and stable `/r/[token]` entry links/QR codes. Generic request media owns
  private assets, typed source attachments, safety/retry/grants and Human-
  Verified Observations; verticals add interpretation and policy extensions.
- Newly published Store entry links use the shared `chat.ewatrade.com` origin.
  The same Storefront application serves that global customer host without
  deriving a Tenant slug from it, while previously printed Storefront
  `/r/[token]` links remain compatibility adapters during expansion.
- Store operational assignments compose attendant and quotation-approver
  capabilities from active Tenant memberships. Commerce owns the Store release
  policy and exact Quote-Version approval; channel transports cannot decide or
  bypass it. Pharmacy professional release remains a separate gate.
- Commerce Quote owns exact mutually exclusive Offer Options. Unselected
  alternatives are not payable lines and cannot reach Order, reservation or
  payment; existing simple Quotes expand as one default option.
- Pharmacy uses the single shared commerce workspace and retains only its
  regulated source, clinical media/OCR interpretation, professional-release,
  substitution, privacy/retention, break-glass and policy extensions. Duplicate Pharmacy
  channel, Quote, payment, fulfilment and reporting orchestration is a
  post-acceptance contraction target, not a permanent second platform.
- Booking is a first-class capability with resource availability, contention,
  schedule, payment policy, reschedule/cancel and reminder semantics. It is not
  stored as generic metadata or embedded in Prescription Commerce.
- Shared Service Commerce reporting reads canonical occurrence facts from each
  owning aggregate and adds only an immutable external usage/cost ledger. It
  uses bounded aggregate-only Tenant/Store queries, explicit historical-unknown
  markers and separated provider costs; it does not create a universal event
  store, copy customer content or infer history from mutable current state.
  Repository-owned report authorization appends one safe immutable read audit
  before any aggregate facts are queried or returned. The authorization
  transaction also locks the accepted Membership and atomically enforces the
  actor/Tenant rolling report budget before aggregate queries begin. Manager
  authority is re-read after lock acquisition, so a revocation committed before
  that re-read fails closed. The bounded authorization transaction releases
  before aggregate queries and is not a snapshot-wide lifecycle lock.
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

- The existing EwaTrade binary contains two isolated shells. Verified Store
  Entry Universal/App Links open the unauthenticated Customer shell before
  Business onboarding or app-lock routing. Customer conversation credentials
  and installation binding live only in operating-system secure storage and
  use a separate tRPC client/cache; Business and Customer credentials never
  authorize the other shell.
- A ten-minute, digest-only Conversation Transfer may add a mobile Guest
  participant while leaving the original web participant usable. Claim binds
  the first installation and redeem binds a caller-staged target credential, so
  a lost response is replayable without persisting a recoverable bearer. Links
  contain only the published Store token and an opaque transfer fragment.
- The mobile application uses one floating bottom-tab shell with a central
  create action and full-screen modal routes for workflows exceeding roughly
  half a phone screen.
- Optional advanced Catalog and Service inputs are progressively revealed.
  Keyboard-sticky inline composition is reused for compact repeated-value
  entry; ordinary forms remain keyboard-safe.

## Observability Boundary

- Each independently deployed application owns a separate Sentry project.
- `@ewatrade/errors` owns stable classification, public messages, retry and
  reportability policy, HTTP status, and opaque error references. API and tRPC
  responses expose only that safe contract plus an opaque request id.
- `@ewatrade/observability` enables outbound diagnostics only when the code
  authorization, deployment environment, Node environment, DSN, and release
  all prove an exact production runtime. Development and preview never
  transmit diagnostics even when credentials are present.
- Events are rebuilt from an allowlist containing only runtime, stable error
  code, bounded operation identifiers, server-minted request identifiers,
  release/symbolication metadata,
  sanitized stack frames, and the opaque error reference. Request, user,
  breadcrumb, context, payload, provider, commerce, customer, message, media,
  device, and tenant content is never copied into the outbound event.
- Expected authentication, validation, customer-access, quote, module/role,
  rate-limit, offline, idempotency, and stock conflicts remain actionable in
  product UX but are normally non-reportable. Systemic database and provider
  failures are reportable through safe wrappers.
- API, dashboard, marketing, storefront, POS, jobs, and mobile initialize at
  their runtime boundaries. The desktop wrapper inherits dashboard web
  telemetry and has no second native telemetry runtime.
- `apps/mobile` retains the `cipron-concepts/ewatrade-mobile` project identity,
  Expo plugin, Metro integration, native release/symbol upload, root wrapping,
  and OTA flush behavior under the shared production-only policy.
- The public DSN may be provided through `EXPO_PUBLIC_SENTRY_DSN`. The private
  `SENTRY_AUTH_TOKEN` is build-time only, must remain outside version control,
  and is used solely for source-map and debug-symbol uploads.
- Default PII collection, tracing, breadcrumbs, Session Replay, user feedback,
  and SDK logs remain disabled. Expanding collection requires a separate
  privacy, retention, and product decision.

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
- Service Commerce migration work is authorized under ADR-0030 plus ADR-0031's
  approved 17-ticket dependency frontier; production schema/provider
  operations remain separately authorized.

## Open Items
- If cross-device or public Service Evidence is enabled, configure managed
  object storage and trusted media verification. Device-retained private
  evidence remains usable without that deployment integration.
- Run behavioral cross-surface validation in the separate owner-requested
  testing goal.
