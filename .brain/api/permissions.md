# API Permissions

## Principles

- Authentication, tenant membership and tenant/Store scope are enforced before
  repository calls.
- An authenticated account may create a separate merchant Tenant and becomes
  that Tenant's active owner. This account-level action does not copy access,
  records, subscription state, or settings from the currently selected Tenant.
- Public procedures accept opaque scoped tokens and return allowlisted
  projections only.
- Payment state and work state use separate permissions and never imply one
  another.
- Workspace availability affects navigation discovery only. Direct-route and
  mutation authorization continue to use authenticated role, tenant, Store,
  subscription, and semantic policy.

## Catalog And Inventory

- Catalog readers require a tenant member role allowed to read Catalog data.
- Catalog creation, Offering availability, archive and unit-version mutation
  require Catalog-management capability.
- Inventory reporting requires inventory read capability.
- Inventory posting, reservations, counts, transformations, custody, transfers,
  closeout and corrections require the corresponding operator/manager
  capability; destructive/manager review actions are not available publicly.

### Progressive Catalog

- Progressive draft capture requires an authorized Store capability plus
  source-line read access; it does not grant general Catalog management or
  public publication.
- An attendant may link an existing Offering, create an allowed private draft
  and select/enter a Quote price. Promoting a reusable Catalog price,
  activating/publishing an Offering and graduating to managed inventory require
  the corresponding Catalog-management permission and explicit confirmation.
- Opening stock remains an Inventory command with verified quantity and Stock
  Operation attribution. Request, Quote and sales-history read permission can
  never create or alter stock.
- Prescription lines require human verification before draft/link access and
  pharmacist release before regulated availability or Quote commitment. OCR,
  ordinary Tenant membership and technical WhatsApp readiness grant neither.
- Match, suggestion, draft, link and availability repositories re-evaluate the
  active Store profile and exact vertical/channel/subject policy. Reusable
  Tenant-wide price promotion additionally requires sales-management authority;
  the client cannot widen history or affected-Store scope.

## Commercial Orders

- Order creation/list/read require commercial/POS capability.
- Recording a payment or refund requires authenticated commercial/POS
  capability and a tenant-owned Order.
- The received-payments directory requires the same authenticated
  commercial/POS capability and never crosses the active Tenant.
- Product fulfillment and returns require inventory/commercial authorization
  and tenant-owned Order/Balance context.

## Global Search

- Global search requires authenticated commercial/POS capability and resolves
  every entity inside the active Tenant.
- Orders, Customers, Catalog Items, and Service Jobs are available to
  operational sales roles. Staff results are included only for roles with
  sales-operations management capability.
- Search results grant no additional mutation authority; destination screens
  and quick-create actions reapply their normal procedure permissions.

## Customers

- Customer directory reads and creation require authenticated commercial/POS
  capability and are always tenant-scoped.
- Standalone Customer directory writes are online-only. Replaying a named
  offline Order may create or reuse a tenant Customer while preserving the
  Order's immutable customer snapshot.

## Prescription Commerce

- Owner/Admin configure and activate each Store, assign prescription roles,
  connect/rotate/suspend/revoke WhatsApp senders, manage Store bindings,
  resolve incidents, approve manual delivery fees, and operate privacy requests.
- A verified pharmacist assignment requires a credential reference and is the
  only role permitted to release prescription review, substitutions, restricted
  item decisions, and a customer Quote.
- Prescription attendants may intake, inspect cleared media, resolve OCR lines,
  and prepare work but cannot release a Quote or bypass the pharmacist gate.
- Operational roles may act only inside the active Tenant/Store and current
  request state. Every professional or fulfilment transition re-checks role,
  revision, and state server-side.
- Sensitive pickup/delivery queue projections require an active Store
  attendant/pharmacist role or personal audited break-glass; ordinary Store
  membership alone is insufficient.
- Any authenticated Store member may resolve only their own Prescription
  workspace-access projection. It reveals no role assignment, incident detail,
  or patient data and does not replace the guarded operational read.
- Only an active Store attendant can create a corrected transcription revision.
  Manager privacy verification persists verifier identity and a bounded
  evidence reference before execution.
- Owner/Admin may create a personal emergency grant only with a reason and an
  expiry no more than 60 minutes away. It permits audited queue/detail/media
  access inside that Store only, is shown conspicuously, and requires a
  post-use review reason. It does not grant pharmacist release authority.
- Compliance personnel are represented by the existing Owner/Admin setup
  permission and can query purpose-labelled sensitive-access history. Tenant
  and Store predicates are mandatory at every access-event boundary.
- Public customers receive no ambient read permission. Every route/action is
  limited by a single-purpose opaque capability and an allowlisted projection.
- WhatsApp webhooks use verified Meta signatures; payment callbacks use verified
  provider signatures; neither inherits user-session authority.
- Jobs receive identifiers, reload the authoritative Tenant/Store entity, and
  fail closed for revoked credentials, inactive bindings, privacy restriction,
  legal hold, stale revision, or ambiguous routing.
- WhatsApp inbound resolution accepts only active bindings whose binding and
  Store Tenant both match the recipient `phone_number_id` Connection Tenant.
  A cross-Tenant or empty binding set fails before customer content is read.
- Credential revocation suspends bindings with explicit Connection and Tenant
  predicates; it cannot disable another Tenant's sender binding.
- Sensitive media access is short-lived and authorized. Credentials, raw
  capability tokens, prescription text, delivery address, pickup code, and
  customer contact are excluded from routine logs, analytics, and audit detail.

## Customer Channels And Generic Media

- Public intake re-resolves the current opaque entry, Store, active attendant,
  enabled channel and policy before accepting content. A public caller cannot
  supply Tenant or Store authority.
- Staff intake requires an authenticated Tenant membership plus an active
  Store attendant assignment; Pharmacy sources then compose their existing
  Store-role/professional checks. The internal WhatsApp procedure requires the
  internal API key and a currently claimed inbound event whose provider/store
  routing is revalidated by the repository and job.
- Owner/Admin manages provider connections, Store bindings and entry-point
  lifecycle. Store team assignment accepts only an already accepted active
  Tenant Membership and never creates identity, role or professional authority.
- An active Store attendant may access only their Store's current source-bound
  attachment metadata, request a short-lived viewer grant and record a human
  observation. Every path carries Tenant plus Store predicates and rechecks
  source revision, capability, provider readiness and vertical policy.
- Public entry tokens are opaque single-purpose capabilities. Public projections
  reveal only current allowed start actions and never Tenant/Store ids,
  credentials, provider media ids, object keys or private customer content.
- Staff upload verifies bytes server-side before storage. WhatsApp retrieval
  reloads the active scoped Connection/Binding at job time. Safety and retention
  jobs receive identifiers only; unknown/revoked/cross-scope facts fail closed.
- Media is not viewable before `SAFE`. Viewer grants expire after 60 seconds and
  are one-time in the development provider. Observation authority is human and
  attributable; automated classification remains non-authoritative.

## Services

- Operators may create/confirm Intake, read the queue/Job, self-assign, progress
  work, collect payment, complete an explicit paid customer handoff, add
  internal notes/exceptions and capture private evidence.
- Assigning another user, manual authorization, rescheduling, splitting,
  rework, Request/Quote disposition, tracking access, customer communication,
  batch work changes, Service settings, evidence publication/revocation and
  Service reporting require manager capability.
- Operator-facing evidence upload status cannot declare `AVAILABLE` or provide
  safety/public identifiers.
- Request Form reads/submission, current Quote reads/acceptance and Tracking
  reads are public only through valid opaque, active and unexpired tokens.

## Service Commerce

- Any active Tenant member may receive the allowlisted profile/readiness
  projection for an authorized Store; this read does not grant operation or
  configuration authority.
- Owner/Admin may configure and activate Service Commerce for an authorized
  Store. Manager/Cashier/Operator may operate capabilities only when the
  returned server state allows them. Member/Support remain non-operational.
- No applicable shared personal exceptional-access grant exists yet;
  `exceptionalAccess` is returned false and clients cannot synthesize one from
  roles or Prescription break-glass state.
- Every profile and audit repository boundary carries Tenant plus Store.
  Expected revision, activation blockers and management authority are checked
  inside the same bounded transaction as the profile/audit writes.
- Provider and restriction readiness is server-owned. The projection reads
  Tenant/Store-scoped WhatsApp lifecycle plus current vertical/jurisdiction
  decisions; setup clients cannot write or clear a restriction, infer provider
  readiness or generically reactivate a suspended profile. The legacy profile
  allowlist can only add a restriction and cannot grant permission.
- Owner/Admin release managers may set/revoke a policy decision only for an
  authorized Store and active Tenant reviewer with optimistic revision. Safe
  list reads omit private references; evidence detail requires the same
  authority and appends an audit. Unauthorized override attempts are audited.
- Policy checks run at Store-profile and Pharmacy activation, source/public
  projection, pre-persistence media intake/re-upload, Quote/payment/fulfilment
  commands, delivery-zone/operational transitions, WhatsApp intent/content
  persistence and claim, and immediately before provider send. Channel
  projection requires both channel and intake permission. UI and provider
  adapters cannot infer an allowed outcome from technical readiness.
- Service Commerce operators may create, project, transition and Quote an
  Inquiry only for an active authorized Store whose server readiness allows
  assisted intake. The repository performs that check before any source load.
- Every source loader and Inquiry command predicates Tenant plus Store; stale,
  unsupported and cross-scope refs return no source detail. Prescription's
  shared projection selects status only and cannot become a clinical-detail
  access path.
- Public Service, Inquiry and Prescription Quote selection requires the opaque
  Quote token, an opaque Option id and an idempotent command identity. The
  repository reauthorizes the source vertical/policy inside the transaction;
  clients cannot submit Tenant/Store scope or turn selection into acceptance.
- Public Inquiry Quote read/select/accept commands deliberately collapse
  invalid source, state and token failures to an unavailable response. A
  competing valid choice is a typed conflict and creates no commercial graph.

## Offline

- Authenticated commercial/POS roles may read the Tenant offline policy;
  `OWNER` and `ADMIN` may change offline access and staff approval settings.
- Devices register under an authenticated tenant/Store context.
- Device registration and command replay are forbidden when the owner has
  disabled offline operations.
- Offline staged/conflict review is restricted to `OWNER`, `ADMIN`, and
  `MANAGER`. Existing review work remains resolvable after offline access is
  disabled.
- Replay accepts only Commercial Order creation with optional checkout payment
  and customer facts. Product, Service, inventory, closeout, Staff and
  standalone Customer mutations cannot be submitted through offline replay.
- Replay re-runs the same server authorization and semantic validation as
  online commands.
- Cashier and Operator commands are staged when the approval policy is on.
  Management-created commands apply directly.
- Approve/reject and retry/discard actions record the authenticated reviewer.
# Managed Domains

- Only active Tenant owners and administrators may list, quote, purchase,
  connect, verify or inspect domain lifecycle state.
- Store ids are checked against the active Tenant before quotes or connections
  are created.
- Registrar credentials, Paystack secrets, Vercel tokens, encrypted
  registrant payloads, provider request metadata and transfer authorization
  codes are server-only.
- A globally unique hostname that belongs to another Tenant cannot be claimed
  or updated.
- Paystack webhook access is signature-based and does not use an authenticated
  user session.
- Domain registration and reconciliation jobs operate only on persisted paid
  orders and provider attempts; clients cannot invoke a registrar write
  directly.

## Commercial Order Delivery Reminders

- Only Owner and Admin roles may read or update Store Order-reminder settings.
- Reminder delivery targets active Owner, Admin, and Manager memberships and
  does not grant them any additional Order mutation authority.
- Existing commercial/POS capability remains required for Order creation and
  Product fulfillment.
# QA maintenance

- Only platform administrators can discover/adopt QA tenants or operate purge
  runs. Purging tenants reject normal tenant operations and have sessions
  revoked.
