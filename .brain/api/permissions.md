# API Permissions

## Principles

- Authentication, tenant membership and tenant/Store scope are enforced before
  repository calls.
- Public procedures accept opaque scoped tokens and return allowlisted
  projections only.
- Payment state and work state use separate permissions and never imply one
  another.

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
- Product fulfillment and returns require inventory/commercial authorization
  and tenant-owned Order/Balance context.

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

- Devices register under an authenticated tenant/Store context.
- Replay re-runs the same server authorization and semantic validation as
  online commands.
- Conflict review requires authenticated operational capability and records the
  reviewer.
