# API Contracts

## General

- All tenant-owned reads/writes resolve tenant context server-side.
- On the shared dashboard host, the active-tenant cookie is propagated through
  both server and browser tRPC clients. An explicit tenant header still has
  priority where supported.
- Store ids are validated against the active tenant.
- Exact quantities/factors are decimal strings; money is integer minor units.
- Commands use stable client ids and payload hashes for idempotency.
- Immutable snapshots preserve historical meaning; clients never reconstruct
  inventory or Order truth from current mutable Catalog data.

## Workspace Availability

- `tenant.featureAvailability` is a read-only discoverability contract, not an
  authorization grant. It reports sticky active-Store history for Catalog,
  Inventory, Orders, Service Jobs, Customers, and Reports; Staff presence is
  Tenant-wide.
- Archived Catalog items and removed, suspended, or invited operational Staff
  remain present. `hasActiveSellableItems` is a separate live prerequisite and
  only counts active fixed-price Offerings with a non-null price.
- Mobile requests send the selected business slug through `x-tenant-slug`.
  Switching a production business updates the authenticated mobile session
  profile and clears the query cache before the selected context refetches.

## Catalog

- Item kind is immutable after creation.
- Variant option combinations are separate from Offerings and units.
- Catalog creation accepts an optional description and image URL on every
  Sellable Variant. Product variants may also provide their own exact
  `openingStockQuantity`; each non-zero value creates opening stock against that
  specific variant's Canonical Shared balance. The existing item-level opening
  quantity remains the simple/default-variant path when no per-variant
  quantities are supplied. Product opening quantities are optional; omitting
  them creates no opening balance.
- Mobile and API releases must keep this strict variant object in lockstep. The
  schema regression fixture submits `description`, `imageUrl`, and
  `openingStockQuantity` together so an older strict server contract cannot be
  mistaken for a valid current release. Mobile omits absent optional variant
  keys instead of serializing them as explicit `undefined`, preventing
  SuperJSON from reconstructing unknown keys against a temporarily older
  strict server.
- Product Unit Offerings require the fixed pricing policy and a Current
  Inventory Unit, but their fixed amount may remain unset while setup is
  incomplete. An unset price is stored as null and cannot be ordered.
- Simple Product creation and the mobile Product setup default new Inventory
  Units to a two-decimal transaction scale. Catalog clients may omit a
  variant-unit price override. When a fallback exists it is materialized as
  that Offering's independent fixed-price snapshot; when no price exists the
  Offering remains visible but unavailable for sale.
- Service Offerings may be fixed or quote-required and never accept stock
  input.
- Unit Draft publication validates one factor-1 Canonical Unit, direct exact
  factors, precision, Offering replacement and any required Stock Transition.

## Inventory

- Every operation identifies an explicit Balance Source and expected revision.
- Shared/Packaged stock is never substituted automatically.
- Transformations require balanced compatible Packaged Stock endpoints.
- Corrections append reversal/replacement facts; posted operations are not
  edited in place.
- Reports serialize exact quantities and configuration context.

## Orders

- A line selects one active Store-available Offering and snapshots its price,
  quantity and semantic context at confirmation.
- Sale clients show active incomplete Product Offerings but disable selection
  with `Price not set` and/or `Out of stock`; order submission still requires a
  real fixed price and available Product stock.
- Product reservation/fulfillment and Service work creation are separate
  transactional effects.
- Mixed Product/Service Orders are supported.
- Payments and refunds append idempotent `CommercialOrderPayment` facts. The
  Order stores the derived paid amount and exposes paid, balance and payment
  status; a command cannot overpay or refund more than was collected.

## Services

- Service Request is unconfirmed intent and creates no Order/work.
- Quote Versions are immutable; only the current unexpired version may be
  accepted. Acceptance is idempotent.
- Direct Intake confirmation and Quote acceptance create the Commercial
  Order/tracked work graph atomically.
- Job Line revision guards stale work transitions, authorization, split,
  assignment and promise changes.
- Evidence is private by default. Client contracts can report local, queued,
  uploading or failed state but cannot mark an asset safe/available. Trusted
  infrastructure must supply safe asset and safety metadata before manager
  publication can succeed.
- A mobile capture stored as `LOCAL` references a file retained in that app
  installation's documents directory. It is not a cloud URL, is never returned
  publicly, and cannot be published.
- Public tracking is an allowlisted projection and never returns internal notes,
  actors, private evidence, raw storage references or private contacts.
- Public tracking includes the tenant timezone so customer promise dates are
  formatted consistently and accurately.
- Intake may select standard/express service, an optional assignee, promised
  pickup, notification channel and initial payment. Express charges are
  snapshotted into the Order total.
- Line completion is not a staff progress transition. `services.handoff` is the
  only normal collection path and atomically requires ready work plus a zero
  balance, optionally applying the final payment.
- Batch work and batch messaging accept 1–100 Jobs. Batch messaging requires a
  stable client batch id so transport retries are idempotent. Scheduled intents
  remain independent of work state; rescheduling replaces pending due
  reminders, while full-Job readiness or handoff cancels obsolete reminders.

## Offline

- Supported command payloads are versioned and dependency-aware.
- Offline Intake evidence depends on the Intake command and carries its stable
  client id so replay resolves the newly created tenant-owned Job; a missing or
  charge-only Job fails as a typed evidence conflict.
- Replay returns applied, review-required, blocked or discarded outcomes with
  typed conflict codes and authoritative state.
- Unsupported old event shapes are discarded; there is no compatibility
  reader.
- Public Requests/Quotes, payment, evidence publication and provider delivery
  are online-only.
