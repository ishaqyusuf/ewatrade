# ADR-0012: Generic Service Operations Bounded Contexts

## Status

Accepted and implemented. The clean local database cutover is complete.
Behavioral validation is intentionally assigned to a separate testing goal.
Optional media is durable on the capturing device and private; managed upload,
trusted availability and public publication remain dormant until an external
storage/safety integration is configured.

## Context

The early generic Service implementation reused Product/ProductVariant storage,
classified Services as `IMMEDIATE | TRACKED`, created one Service Job per
Commercial Order, and placed status, assignment, due time, URL evidence,
notifications, requests, and reports around that singular Job. It also retained
legacy ids and a dry-cleaning migration path.

Those choices cannot accurately represent unconfirmed requests, versioned
quotes, direct intake, charge-only Services, split work, partial readiness,
line-level progress, rework, managed evidence, or offline execution. The
project is early and its development Service data is disposable, so preserving
the prototype would add permanent complexity without protecting production
history.

## Decision

- Catalog owns Service Items, Sellable Variants, Service Offerings, pricing
  policy, and Store Offering Availability.
- Commerce owns versioned Quotes, Commercial Orders, Offering Snapshots, all
  monetary facts, payment state, cancellation, and refunds.
- Service Operations begins at Intake/work orchestration and owns Service Work
  Policy, Service Jobs, Job Lines and allocations, assignments, due
  commitments, evidence, events, and exception/rework history.
- Service Request is unconfirmed intent and creates neither an Order nor work.
  An accepted Quote or confirmed direct Intake may idempotently create a
  Commercial Order.
- Charge-only Service lines create no work. Tracked lines create exact work
  allocations. One Job per confirmed Order/Intake is the default, while one
  Order may have multiple Jobs and one Order line may be split across Job
  Lines.
- Job Line progress is authoritative for partial-work behavior; Job status is a
  derived operational summary. Payment state never substitutes for work state.
- Customer Access exposes only scoped, revocable, allowlisted public
  projections. Service Evidence is private unless explicitly published.
- Communications separates Notification Intent, message rendering, and
  provider delivery facts.
- Authenticated registration and dashboards remain on the shared primary app
  host. Business subdomains are reserved for future public storefront flows.
- The replacement uses service-specific capabilities, versioned idempotent
  commands, typed stale-state conflicts, and an explicit offline subset.
- The prototype Service schema, legacy ids/readers, metadata fallbacks,
  singular Job relations, direct request conversion, duplicate public-route
  ownership, old offline records, and compatibility tests are deleted through
  a destructive early-stage cutover. No legacy Service data is preserved.

## Consequences

- ADR-0008 remains authoritative for item-level Product/Service classification,
  mixed Commercial Orders, and Service exclusion from inventory, but its
  prototype Service Operations and migration decisions are superseded.
- Catalog, Commerce, Service Operations, Customer Access, Communications, and
  Reporting have distinct source-of-truth responsibilities.
- The database and API must support zero-to-many Jobs per Order and exact work
  allocation rather than singular compatibility relations.
- Dashboard, mobile, and public flows must be rebuilt around Setup, Intake,
  Work Queue/Job Workspace, Requests/Quotes, Customer Tracking, and Reports.
- Development data, local caches, and queued Service events may be reset during
  implementation.
- The lifecycle, schema, permissions, offline envelopes, dashboard/mobile/public
  UX and reporting projections are implemented. The local prototype data reset
  and generated cutover migration are complete.
- Device-retained evidence is useful as an optional private work record without
  pretending it has uploaded. Publication continues to fail closed until
  trusted infrastructure supplies verified availability and safety metadata.
- Behavioral QA remains a separate owner-requested goal.
