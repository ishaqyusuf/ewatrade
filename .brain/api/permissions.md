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
