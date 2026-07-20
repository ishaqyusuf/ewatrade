# Generic Service Catalog And Work Operations

## Status

Implementation, the clean local database cutover and the owner-requested
behavioral testing are complete.

## Sources Of Truth

- Wayfinder: `.scratch/wayfinder-generic-service-operations/map.md`
- Specification: `.scratch/wayfinder-generic-service-operations/spec.md`
- Tickets: `.scratch/generic-service-operations-implementation/issues/`
- Decision: `.brain/decisions/ADR-0012-generic-service-operations-bounded-contexts.md`

## Implemented Boundaries

- Catalog owns Service Item classification, variants, Service Offerings,
  pricing policy, Store availability and Work/Authorization Policy.
- Commerce owns versioned Quotes, Commercial Orders, immutable Offering
  Snapshots and monetary/payment state.
- Service Operations owns Intake, Jobs, exact Job Line allocations, work state,
  assignments, due commitments, notes, exceptions, evidence and rework.
- Customer Access owns public Request Forms, Requests, Quote acceptance and
  scoped/revocable tracking projections.
- Communications owns Notification Intents, Manual Shares and Delivery
  Attempts. Reporting projects Commerce and Service truth.

## Implemented Flows

### Service Commerce Completion

- Every concrete garment/service/size combination remains its own fixed-price
  Service Offering, so Shirt · Washing · Small and Shirt · Ironing · Large may
  carry independent prices without embedding dry-cleaning concepts in the
  domain.
- Store settings configure optional standard/express service, percentage or
  fixed express surcharge, express turnaround, default customer channel,
  ready notifications and due reminders.
- Intake accepts an optional assignee, promised pickup time, notification
  channel and initial cash/bank/card/POS payment. Commerce retains an append-only
  payment history, paid total, balance and partial/paid status.
- Work can be advanced individually or in manager batches. Batch delay revises
  promises and reminders; batch start/ready keeps per-line work history.
- Ready work is not completed directly. Customer handoff is an explicit,
  revision-guarded command that requires every active line to be ready and the
  Commercial Order balance to be settled, optionally recording that final
  payment atomically.
- SMS and WhatsApp intents may be immediate or scheduled. A recurring job
  dispatches due intents through configured provider-neutral webhooks and
  records delivery attempts. Ready and due reminders are automated when enabled.

### Direct Intake

1. Staff selects concrete Service Offerings and exact quantities.
2. Customer, requested/promised date, instructions and evidence are optional.
   Mobile intake progressively reveals private photo/video capture for tracked
   work without adding fields to the shortest path.
3. Confirmation atomically creates a Commercial Order.
4. Charge-only lines stop at the Order; tracked lines create authorized or
   gated Job Line allocations in a default Job.
5. Job Line state supports queued, in progress, blocked, ready, completed and
   cancelled work, including partial readiness.

### Customer Request And Quote

1. A manager creates a Store-scoped Request Form and public link.
2. A customer submits unconfirmed intent without creating work or an Order.
3. Staff may request more information, decline, or issue an immutable Quote
   Version with expiry and Offering snapshots.
4. Only the current Quote version may be accepted; acceptance is idempotent and
   creates the Commercial Order/work graph once.
5. Scoped tracking exposes only allowlisted milestones, current promises,
   approved messages and explicitly published evidence.

### Work Operations

- Operator: queue/read, Intake, self-assignment, line transitions, notes,
  exceptions and private evidence capture.
- Manager: assignment to others, rescheduling, manual authorization, line
  splitting, linked rework, Request/Quote management, tracking access, customer
  updates, evidence publication/revocation and reporting.
- Assignment and promise changes retain full history and optimistic revision
  checks.

## Evidence Safety

- Evidence is attached to a Job or Job Line with purpose, media type, uploader,
  capture/upload state, label and audit history.
- Capture is optional and never blocks Intake or work.
- Mobile camera/video capture copies the selected asset into the app documents
  directory and records private `LOCAL` evidence online or through offline
  replay. It never labels a device-only file as uploaded.
- Evidence captured during offline Intake is queued after the Intake command
  with an explicit dependency and resolves the created Job by the stable
  Intake client id. It cannot attach to charge-only work because no Job exists.
- Client procedures cannot declare an asset safe or available. Publication
  requires trusted infrastructure to set a safe public asset id and safety
  metadata, after which a manager must explicitly publish it.
- Revocation preserves an audited tombstone and public tracking excludes local,
  queued, uploading, failed, private or revoked evidence.
- Object storage and trusted media-safety processing are intentionally not
  selected in this implementation. Until deployment supplies that integration,
  evidence remains private and publication fails closed.

## User Surfaces

- Dashboard: Service setup, direct Intake, work queue/Job workspace, assignments,
  promises, notes, exceptions, split/rework, Requests, versioned Quotes,
  customer-safe updates, evidence governance, tracking links and reports.
- Dashboard Service Work follows the Midday workspace structure: server
  prefetch/hydration, URL-addressable Intake/Request/Quote/Job sheets,
  domain-owned queue states, focused forms/workspaces, exact invalidation,
  Suspense loading and route-level recovery.
- Mobile: generic Service setup, direct Intake, work queue/Job workspace,
  self-assignment, notes, progress, camera/video evidence and offline command
  queue/conflict review.
- Storefront: public Request Form/submission, current Quote review/acceptance and
  safe tracking routes. Business subdomains never expose authenticated pages.

## Behavioral Validation

- Garment-care direct Intake selected multiple concrete services and
  quantities, accepted optional customer/requested/promised/instructions/
  condition fields and created one Order with tracked work.
- Mobile service Intake and work forms were reviewed with the Android keyboard
  visible; the focused phone input remained above the keyboard and the sheet
  retained scrollable bottom space.
- A professional-service browser flow completed Request submission, immutable
  Quote issuance, public Quote review, idempotent acceptance and confirmed
  Order creation.
- A customer tracking link exposed only customer-safe service labels,
  milestones and the promised time formatted in the tenant timezone.
- Public Request, Quote and tracking pages run on the dedicated storefront
  surface. Local marketing links redirect once to the port-free
  `ewatrade-storefront.localhost` host.
- Dashboard work queues, Intake, Job workspace, customer Requests, private
  evidence controls and Reports were rendered at desktop and mobile widths with
  flat dividers and corrected padding.

## Clean Cutover And Remaining Gates

- Removed the prototype Product-backed Service model, dry-cleaning/business
  template runtime, legacy identifiers/readers, direct Request conversion,
  singular Job assumptions, URL-only evidence contract, old public Product link
  routes and obsolete QA fixtures.
- Prisma generated and applied the clean destructive cutover after the approved
  local development reset; local push, neutral seed and migration status pass.
- Configure managed object storage/media-safety infrastructure only if
  cross-device evidence availability and public evidence publication are
  enabled. The current optional local evidence flow does not depend on it.

## Non-Goals

- Industry-specific Service types or permissions.
- Service inventory or automatic consumable deduction.
- Appointments, calendars, resource capacity, recurring work or arbitrary
  workflow builders.
- Provider-hosted checkout, calendars, or media storage. Payments are recorded
  operationally; SMS and WhatsApp delivery use configured provider-neutral
  webhooks rather than a provider-specific SDK.
- Legacy compatibility or preservation of development Service records.
