# Five-Business Generic Operations QA Matrix

## Purpose

Prove that the catalog, commercial-order, inventory, service-work, public
customer, reporting, offline, and permission flows behave as generic platform
capabilities. Business examples are test fixtures only; no industry, product,
container, or service name may select a runtime branch.

## Execution Order

1. Start one supported local stack from the repository root:
   `bun run dev --local -f mobile api jobs dashboard marketing storefront pos`
2. Test the mobile application first for all five businesses.
3. Test authenticated web, public storefront, POS, and marketing surfaces after
   mobile coverage is complete.
4. Fix each confirmed defect in the main worktree, rerun the failing scenario,
   then rerun the nearest regression guard before continuing.
5. Keep mobile evidence private unless trusted storage and media-safety
   infrastructure are configured. Public evidence publication must fail closed.

## Business Fixtures

### B1 — Bulk And Packaged Goods Merchant

- Catalog: a Product with one canonical mass unit and full, half, quarter, and
  kilogram selling choices expressed as configured Product Unit Offerings.
- Stock: receive 1,000 full packages; explicitly transform 50 full packages
  into 100 half packages without creating or destroying canonical quantity.
- Commercial: mixed sales in full, half, quarter, and kilogram quantities.
- Inventory: opening stock, receipt, count, adjustment, correction,
  transformation, transfer, custody, closeout, fulfillment, and return.
- Proof: exact decimal-string quantities, immutable Offering snapshots, separate
  Packaged Stock balances, and no `feed`, `bag`, or other fixture-specific
  runtime discriminator.

### B2 — Fashion And Apparel Retailer

- Catalog: Product variants for size and colour, Store availability, SKU and
  barcode identifiers, fixed prices, and piece-based inventory.
- Commercial: mixed-variant sale, partial fulfillment, return, and low-stock
  behavior.
- Inventory: receipt at one Store, transfer to another Store, count variance,
  custody handoff, and reporting by Offering and Store.
- Proof: variants represent customer choices while inventory units and
  commercial Offerings remain independent concepts.

### B3 — Laundry And Garment-Care Service

- Catalog: Service Items such as Agbada, Shirt, Trouser, and Suit; size is a
  customer-facing variant and each concrete Service Offering owns its price.
- Intake: select multiple concrete Offerings and quantities; customer, promised
  date, instructions, and photo/video capture are optional.
- Work: charge-only and tracked lines, automatic or gated authorization,
  assignment, partial readiness, blocked work, split, completion, rework, and
  private evidence.
- Proof: the shortest intake path remains select items and confirm; optional
  commitments/evidence do not block intake; Service Offerings never affect
  inventory.

### B4 — Electronics Repair And Accessories Business

- Catalog: stocked accessory Products plus diagnostic and repair Services in
  the same generic catalog.
- Commercial: one mixed Product/Service order with immutable snapshots.
- Work: authorization-required repair, operator assignment, exception,
  reschedule, customer-safe update, and linked rework.
- Inventory: reserve, fulfill, and return the Product line independently of the
  Service Job Line.
- Proof: one order may contain both item kinds without merging inventory truth,
  monetary truth, or work-state truth.

### B5 — Consulting And Professional Services Business

- Catalog: charge-only consultation and tracked fixed/quote-priced project
  Offerings, Store availability, and no inventory relationship.
- Public customer flow: Store-scoped Request Form, Request submission,
  information request, immutable Quote versions, current-version acceptance,
  and idempotent order/work creation.
- Work/customer access: due commitment, note, assignment, approved update,
  scoped tracking, revocation, and reporting.
- Proof: the business uses the same Service domain without garment, repair, or
  appointment assumptions; business subdomains expose storefront/customer
  pages only, never an authenticated dashboard.

## Cross-Business Mobile Coverage

- Fresh install/launch, unauthenticated routing, owner sign-up, OTP verification,
  sign-in, sign-out, session restoration, and generic onboarding.
- Catalog list/search/create for Product and Service, simple and advanced setup,
  validation, Store availability, variants, units, prices, and identifiers.
- Mixed order creation, order detail, fulfillment state, and retained Offering
  snapshots.
- Inventory balances/history plus receipt, count, adjustment, transformation,
  Store transfer, custody, closeout, return, reports, and reconciliation.
- Service intake, queue, Job workspace, self-assignment, line transitions,
  notes, exceptions, partial readiness, private photo/video evidence, and
  conflict/revision feedback.
- Offline command creation, provisional status, dependency-aware replay,
  idempotency, incompatible-state discard, and visible conflicts.
- Role and status enforcement for owner, manager, cashier, and operator where
  the mobile surface exposes the action.
- Loading, empty, error, keyboard, back-navigation, destructive confirmation,
  accessibility-label, and relaunch behavior.

## Cross-Business Web And Public Coverage

- Shared-host registration and authenticated dashboard routes.
- Catalog, Inventory, Orders, Service Work, Requests, Quotes, Reports, staff,
  settings, and billing navigation with loading, empty, error, and URL-backed
  sheet/search state.
- Dashboard parity for every manager workflow exposed on mobile plus advanced
  configuration history, Draft publication, explicit Stock Transition,
  assignment to others, evidence governance, and customer tracking access.
- Storefront subdomain/public routing for catalog or request forms, Quote
  acceptance, and scoped tracking; authenticated dashboard paths must not be
  served from a business subdomain.
- POS mixed Product/Service ordering where supported.
- Marketing registration entry and redirect to the shared dashboard host.
- Permission rejection for unauthorized roles and cross-tenant identifiers.
- Responsive desktop/mobile web layouts, browser refresh, direct-link recovery,
  and safe not-found behavior.

## Fixture And Evidence Rules

- Create each business through the real owner sign-up/auth boundary and seed its
  operational data through current tRPC procedures, not direct database writes.
- Use unique deterministic QA emails and names so scenarios are repeatable.
- Authenticate device/browser sessions with current session contracts only.
- Record business, tenant, Store, user, order, operation, Job, Request, Quote,
  and tracking identifiers in local ignored evidence; never log OTP hashes,
  production credentials, or customer-sensitive media.
- Capture command output, emulator screenshots/UI hierarchy, browser console and
  request failures, and before/after data assertions for every repaired defect.
- A scenario passes only when the visible UI result and the authoritative API
  or database projection agree.

## Exit Criteria

- All five fixtures complete their assigned scenarios on mobile first and then
  web/public surfaces.
- All current source guards, focused tests, typechecks, and relevant database/API
  integration tests pass after repairs.
- No legacy retail/feed/bag/dry-cleaning runtime compatibility path is restored.
- Brain feature, API, database, decision, and task documents match the tested
  behavior, with unresolved external-infrastructure limits called out explicitly.
