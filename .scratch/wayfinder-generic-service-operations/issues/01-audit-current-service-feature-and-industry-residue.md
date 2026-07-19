# Audit The Current Service Feature And Industry Residue

Parent: [Wayfinder: Generic Service Catalog And Work Operations](../map.md)

Type: research

Status: resolved

Blocked by: None

## Question

What Service catalog, sale, job, request, tracking, evidence, assignment,
notification, reporting, navigation, QA, migration, and dry-cleaning-era code
exists today, which assumptions conflict or overlap, and what must be deleted or
replaced in a clean reimplementation?

## Comments

Produce a delete/replace inventory across Service profiles, offerings, orders,
jobs, lines, events, evidence, requests, public tracking, notifications,
reporting, navigation, offline state, seeds, fixtures, tests, and Brain
documentation.

Identify every dry-cleaning assumption and every generic-looking assumption
that still hardcodes the current prototype, including fulfillment modes,
one-job-per-order behavior, status enums, metadata readers, public routes, and
notification payloads.

The output must state the replacement owner for every active behavior and
preserve nothing solely for compatibility.

## Resolution

### Root cause

The current Service feature is a useful prototype, but its database shape has
made several workflow choices permanent before the domain was defined.
`ServiceItemProfile` treats every Service as either `IMMEDIATE` or `TRACKED`.
Creating a sale then creates exactly one `ServiceJob` for the whole Order and
exactly one `ServiceJobLine` for each Service Order line. Status, assignment,
due date, evidence, and notifications operate on that whole Job. This cannot
represent split work, partial readiness, line-level ownership, rework, a
quote-before-order flow, or offline intake without metadata workarounds.

The prototype also carries compatibility identities and migration code from
the retired dry-cleaning implementation. Generic names alone do not make those
assumptions generic. The replacement must begin from the shared Service
Offering and Commercial Order contracts, then model work independently.

### Deletion and replacement matrix

| Surface | Current behavior | Classification | Clean replacement owner |
| --- | --- | --- | --- |
| Service catalog profile | `ServiceItemProfile` is attached to `Product` and stores `IMMEDIATE | TRACKED`, turnaround, instructions, and metadata | Replace | Shared Service Offering plus an explicit Service Work Policy owned by Service Operations |
| Catalog identity | Service repositories and snapshots use `Product` and `ProductVariant` ids | Replace | Catalog Item, Sellable Variant, Service Offering, and immutable Offering Snapshot from the shared Catalog specification |
| Commercial creation | A sale creates a Service Job whenever any Service line is present | Replace | Commercial Order creation records money only; confirmed tracked work creates work allocations through Service Intake/Job orchestration |
| Order-to-work cardinality | `ServiceJob.orderId` is unique and `Order.serviceJob` is singular | Replace | One Commercial Order may create zero, one, or many Service Jobs |
| Line-to-work cardinality | `ServiceJobLine.orderItemId` is unique | Replace | One Service Order line may be allocated across one or more Service Job Lines with exact allocated quantity |
| Work lifecycle | Whole Job uses `RECEIVED`, `IN_PROGRESS`, `READY`, `COMPLETED`, or `CANCELLED` | Replace | Line-authoritative generic work lifecycle with a derived Job summary and explicit partial-work semantics |
| Immediate Services | All-immediate orders create already-completed Jobs | Delete | Charge-only Services create no work record; tracked Services enter the explicit work flow |
| Assignment | One nullable `assignedUserId` exists on the whole Job | Replace | Audited Job default assignment plus optional line override; capability checks own who may assign |
| Due work | One mutable `dueAt` exists on the Job and `delay` mutates it | Replace | Versioned Due Commitment with reason, actor, history, and queue projections; differently due work belongs in separate Jobs |
| Instructions | Catalog instructions and general event notes carry multiple meanings | Replace | Offering preparation guidance, Intake Instructions, internal Work Notes, and Customer Messages are separate concepts |
| Evidence | Job-level evidence is a manually entered URL with optional label/media type | Replace | Managed Evidence Asset with upload state, purpose, visibility, Job/Line association, publication, revocation, and audit history |
| Evidence privacy | Public tracking currently omits evidence only because the projection does not select it | Replace | Private-by-default evidence policy; customer tracking may expose only explicitly published assets |
| Events | A limited Job event enum records creation, assignment, status, delay, note, and evidence | Replace | Immutable Service Work Event stream carrying target, revision, actor, happened-at time, reason, and typed payload |
| Cancellation and refund | Cancelling an Order line updates a Job Line and may cancel the whole Job; completed Jobs block cancellation | Replace | Commercial cancellation/refund remains in Commerce; operational cancellation records an allocation outcome and linkage without becoming a payment rule |
| Rework and rejection | No explicit representation | Add | Explicit rework/exception history; completed history is not silently reopened |
| Customer request | A public request snapshots current prices and totals before merchant review | Replace | Service Request records intent; a separately versioned Quote owns proposed prices and expiry |
| Request conversion | Request has a singular `convertedOrderId` and direct convert-to-sale operation | Replace | Accepted Quote or confirmed staff Intake creates a Commercial Order idempotently |
| Request links | Store-wide opaque link exposes the current Service catalog | Replace | Storefront-owned Request Form configuration scoped to Store, allowed offerings, status, and optional expiry |
| Public routes | Marketing and Storefront contain duplicated request pages; tracking is on Marketing | Delete and replace | Public Service request, quote approval, and tracking are owned by the future business storefront host; authenticated operations remain on the primary application host |
| Public tracking | A Job token exposes a safe but fixed status/order/payment projection | Replace | Rotatable/revocable Customer Tracking Access and a purpose-built customer-safe projection independent of internal status names |
| Notifications | Job-only READY/DELAY intents combine manual copy, channel, provider id, and delivery status | Replace | Notification Intent, rendered Customer Message, and provider Delivery Attempt are separate; work events trigger deduplicated intents |
| Authorization | POS ability operates Jobs; sales-management ability manages requests and reports | Replace | Service-specific capabilities for intake, work update, assignment, evidence, customer publication, quote, request, notification, and reports |
| Error contracts | Most domain errors collapse to `NOT_FOUND` or `CONFLICT` | Replace | Stable typed domain errors for scope, revision, transition, allocation, authorization, evidence, and idempotency failures |
| API namespace | All Service operations live under generic `retailOps` procedures | Replace | Explicit Service Operations API boundary consuming, but not owning, Catalog and Commerce |
| Offline behavior | Mobile declares Service Jobs online-only; no Service commands exist in the offline event store | Replace | Versioned offline intake/work events, local evidence capture, deterministic replay, and visible conflict review for the approved offline subset |
| Mobile work UI | Linear next-status action, whole-job “assign to me,” URL evidence, and delay form | Replace | Queue and Job workspace supporting line work, partial readiness, audited assignment, managed capture, due commitments, and offline state |
| Dashboard work UI | One page combines Jobs, requests, links, reports, and whole-job editing | Replace | Service Setup, Intake, Work Queue/Job, Requests/Quotes, Customer Tracking, and Reports as distinct workflows |
| Reports | Prototype calculates due, delay, completion, popularity, request conversion, and net revenue from the coupled model | Replace | Work reports derive from allocations/events/due commitments; revenue/refunds derive only from immutable Commerce snapshots |
| Navigation/capabilities | Service visibility is inherited from broad Retail Ops and template behavior | Replace | Business capability enables Service surfaces; no industry type or subdomain dashboard branch |
| Legacy schema | `legacyId` fields and uniqueness constraints remain across Jobs, Evidence, Requests, Links, and Notification Intents | Delete | No legacy identifiers or compatibility constraints |
| Legacy migration | `legacy-service-operations-migration.ts` and its tests preserve the retired representation | Delete | Destructive early-stage schema reset with no backfill or dual-read path |
| Metadata | General `metadata` fields absorb unsupported workflow distinctions | Delete as fallback | First-class columns/relations for approved semantics; metadata may not carry a hidden compatibility model |
| Tests and source checks | Tests assert the prototype assignment, tracking, ready notification, conversion, report, migration, and online-only UI | Delete and replace | Domain invariant, permission, idempotency, offline conflict, privacy, split-work, partial-readiness, public-flow, and neutral end-to-end tests |
| Brain documentation | Active feature and ADR material describes compatibility table names, one generic Job per Order, online-only Service, and migration preservation | Replace or supersede | New Service Operations feature spec and ADR; historical documents must be marked superseded where they conflict |

### Concrete active surfaces found

- Schema and relations:
  `packages/db/prisma/models/service-operations.prisma`,
  `commerce.prisma`, `customers.prisma`, `base.prisma`, and `enums.prisma`.
- Catalog, sale, work, request, public tracking, notification, and reporting
  repositories: `packages/db/src/queries/retail-ops-products.ts`,
  `retail-ops-sales.ts`, and `retail-ops-service-jobs.ts`.
- Compatibility path:
  `packages/db/src/queries/legacy-service-operations-migration.ts` and its
  tests.
- API: `apps/api/src/schemas/retail-ops.ts`,
  `apps/api/src/trpc/routers/retail-ops-service-jobs.ts`, the sales router,
  and the aggregate Retail Ops router.
- Dashboard:
  `apps/dashboard/src/components/dashboard/service-jobs-page.tsx`, Service
  setup/catalog surfaces, navigation, capabilities, and reports.
- Mobile:
  `apps/mobile/src/components/mobile/service-jobs-sheet.tsx`, Service catalog
  setup, sale creation, dashboard navigation, local Retail Ops storage/sync,
  reports, and `apps/mobile/scripts/check-service-jobs-flow.mjs`.
- Public:
  duplicated Service request pages in Marketing and Storefront plus the
  Marketing Service tracking page.
- Active documentation:
  `.brain/features/product-service-catalog-items.md`,
  `.brain/features/business-type-onboarding-dry-cleaning.md`,
  `.brain/decisions/ADR-0008-item-level-product-service-catalog.md`, active
  API/database/permission documents, and the Service architecture plan.

### Neutral behavior to retain

- Tenant/business and Store scoping.
- Service exclusion from inventory.
- Commercial price, discount, tax, payment, receipt, cancellation, and refund
  ownership in Commerce.
- Immutable Offering/Order snapshots as a principle, rebound to the approved
  shared catalog identities.
- Opaque public tokens, strengthened with rotation, revocation, expiry where
  appropriate, and rate limits.
- Transactional/idempotent command handling.
- Immutable actor/time/reason audit history.
- Privacy-safe public projections.
- Notification intent and provider delivery separation as a principle, with a
  redesigned schema.
- Primary application host for registration and authenticated dashboards;
  business subdomains are reserved for future public storefronts.

### Clean-cutover search gates

After implementation, runtime searches must find no:

- `ServiceFulfillmentMode`, `IMMEDIATE` Service completion branch, or
  `ServiceItemProfile`;
- singular `Order.serviceJob`, unique `ServiceJob.orderId`, or unique
  `ServiceJobLine.orderItemId`;
- compatibility `legacyId` or legacy Service migration reader;
- Product/ProductVariant identities used as the Service operation contract;
- URL-only evidence command or customer visibility encoded in metadata;
- direct Request-to-sale conversion that bypasses a confirmed Intake or
  accepted Quote;
- Service work authorization derived from broad POS/sales permissions;
- duplicate Marketing/Storefront request route ownership;
- online-only Service Jobs contract or unversioned offline Service event;
- dry-cleaning, laundry, garment, bag, feed, repair, salon, or other industry
  names in runtime schema enums, API namespaces, permission keys, or workflow
  branches.

Industry examples may remain only in tests, documentation, demos, or optional
fixtures that prove the model without defining it.

## Approved Pipeline Comment

> *This was generated by AI during Wayfinder issue commenting.*

Proposed answer: Treat the active Service feature as an early prototype and
replace its catalog profile, singular Order-to-Job shape, whole-Job controls,
priced Request conversion, URL evidence, broad Retail Ops permissions,
online-only mobile contract, duplicated public routes, legacy ids, migration
reader, metadata fallbacks, reports, fixtures, and tests. Retain only tenant and
Store scoping, Service exclusion from inventory, Commerce ownership of money,
immutable snapshots, opaque public access, idempotency, audit history, and
privacy-safe projections as principles rebound to the new identities.

Why: The audit found structural coupling, not merely industry terminology.
Preserving it would make one Job per Order, one Job Line per Order line, and
whole-Job-only work behavior permanent.

Assumptions / risk: Development Service data is disposable. No production
history, legacy client, or public link requires compatibility preservation.
