# Product And Service Catalog Items

## Purpose

Provide one neutral merchant catalog in which every sellable item is explicitly a Product or Service. Both kinds have prices. Products participate in stock; Services never participate in stock.

## Status

Implemented on 2026-07-18.

The earlier Product/Service prototype has been cleanly replaced by the approved
generic Catalog, Offering, Commercial Order, Inventory, and Service Operations
architecture. Catalog classification, mixed Commercial Orders, and categorical
Service exclusion from inventory remain valid. See
`.brain/features/generic-service-operations.md` and
`.brain/decisions/ADR-0012-generic-service-operations-bounded-contexts.md`. The
current inventory contract is documented in
`.brain/features/generic-catalog-inventory-units-stock-operations.md` and
ADR-0013.

## Historical Planning Inputs

- Ready-for-agent specification: `.scratch/wayfinder-catalog-items-product-service/spec.md`
- Wayfinder map: `.scratch/wayfinder-catalog-items-product-service/map.md`
- Architecture decision: `.brain/decisions/ADR-0008-item-level-product-service-catalog.md`

## Approved Product Rules

- Stores are neutral and can contain Product items, Service items, or both.
- The merchant selects Product or Service when creating an item.
- Product and Service items share catalog fields and pricing.
- Product items are stock-managed in the initial two-kind model.
- Service items never create or mutate inventory, reservations, stock movements, stock wallets, reorder state, closeout stock lines, or unit conversions.
- Item kind becomes immutable after operational use.
- Orders may contain Product-only, Service-only, or mixed lines.
- Product lines apply stock effects. Service lines create generic Service Jobs.
- Payment state belongs to the Order. Service progress belongs to the Service Job.
- Dry cleaning is an example service category, not a business type or runtime namespace.
- Authorization remains tenant/store/role/subscription based; item kind validates whether an operation is semantically valid.

## Approved Mobile Direction

- The current Set up Item flow becomes a shared Add Item flow.
- Add Item starts with a Product/Service selector.
- Dashboard and mobile Add Item place a full-width `Choose a quick setup`
  action at the top. Its full-screen picker searches optional JSON-backed
  Product/Service recipes by title, description, and tags; applying one only
  prefills the editable draft and never saves automatically.
- Product reuses the existing price, unit, variant, image, opening-stock, and conversion controls.
- Product always shows a compact `Unit` section explaining that customers may
  buy in units such as Bag, Carton, Piece, or Kilogram. `Add unit` opens a
  keyboard-aware detached bottom sheet for the unit name, exact factor, selling
  price default and stock behavior. New units allow quantities with up to two
  decimal places without exposing precision controls in the setup flow. Saved
  units render as flat divider rows with explicit edit and delete actions;
  editing reuses the same sheet.
- The generic Product/Service form calls customer choices `Options`. A
  keyboard-sticky composer first collects a suggested or custom option name,
  then contextual values through selected removable pills, suggestions,
  comma-separated entry, and an explicit check action. `Unit` is not an option
  suggestion because selling units have their own flat section and editor.
- Option names and selected values use a flat divider list. Generated
  combinations are also list-only: every row summarizes its combination title,
  counted-in unit, stock/type, price, and description, with a menu button in
  place of destructive inline actions.
- A combination menu exposes Edit and Disable/Enable. Edit opens a compact,
  keyboard-safe floating sheet for quantity, price, and an optionally revealed
  description. `More` expands that sheet to full screen for image, SKU,
  barcode, per-unit price, Service quote, and Store availability controls. A
  rounded bottom-right check remains above the keyboard and commits the draft.
  Per-variant quantity persists as opening stock for that specific variant.
  Blank unit overrides use the unit default and then the combination's
  counted-unit price; each persisted variant-unit Offering still receives its
  own fixed price.
- Service uses the shared name, price, variant, and image controls, hides all stock controls, and may collect turnaround and instructions.
- Helper-selected Product variants retain independently editable prices for
  every selling unit, while helper-selected Service combinations retain
  independently editable Offering prices. Express remains a Store setting, not
  a Catalog option or variant.
- Once multiple variant values exist, Add Item uses `Variants | Inventory` for Products and `Variants | Pricing` for Services. The second tab owns sellable-row prices and media for both kinds, plus stock for Products only, and exposes the final Add item action.
- Existing Products migrate automatically and display a Product badge.
- Existing dry-cleaning service items migrate automatically and display a Service badge.
- The sale picker shows availability for Product items and no stock availability for Service items.
- The existing Service Orders surface becomes generic Service Jobs and no longer owns service-item creation.
- Inventory and stock-derived metrics use Product items only.
- Mixed stores can use Inventory and Service Jobs from the same workspace.

## Superseded Prototype Model

This section describes the removed prototype and is retained only for historical
context. It is not the current runtime or target architecture.

- The existing `Product` and `ProductVariant` tables remain the compatibility storage for the canonical Catalog Item and its sellable variants.
- `CatalogItemKind` classifies every item as `PRODUCT` or `SERVICE`; existing records backfill to `PRODUCT`.
- `ServiceItemProfile` owns optional turnaround and instructions for Service items.
- Orders snapshot line kind and support Product-only, Service-only, or mixed lines in one atomic, idempotent sale.
- Product lines apply inventory effects. Service lines never inspect stock and create one generic `ServiceJob` per commercial order.
- Service Jobs have relational lines, events, private evidence, assignment, delays, request links, requests, notification intents, cancellation, and reporting.
- Product cancellation records an inventory reversal. Service cancellation records operational history. Refunds remain explicit payment events and reduce net service revenue.
- The legacy metadata migration is bounded, resumable, tenant/store-scoped, idempotent, and omits private values from reports.

## Experience Gating

- Dashboard Catalog navigation appears after the active Store has any Product
  or Service history. Authorized Product and Service creation paths remain
  available from setup and global Add actions before Catalog is revealed.
- Product filters and Inventory appear after Product history. Service filters
  appear after Service history. A type filter is not advertised when the Store
  has zero history for that kind.
- Dashboard Sales navigation appears after the first Commercial Order. Direct
  first-order creation is permitted once an active fixed-price Offering exists.
- Dashboard Service Jobs navigation appears only after the first tracked
  Service Job; a Service Catalog item by itself does not reveal operational
  work.
- Mobile bottom tabs do not participate in record-derived revealing.
  Role-authorized Catalog, Work, and Reports tabs remain visible before their
  first records and open the corresponding empty or first-record experience.
- A mixed Store reveals each operational area independently. Archived items
  retain historical revelation.
- Mobile owner/admin and attendant homes combine the same authoritative
  contract with pending offline projections. Product-only actions include
  stock and inventory; tracked Service operations reveal Work dashboard
  content and metrics.
- Service checkout uses the normal priced-item order flow without stock or cashier-session requirements.

## Enforcement And Compatibility

- Repository transactions, not UI hiding, enforce Product-only stock operations and return stable kind-mismatch errors.
- Historical order lines retain their kind and price snapshots when catalog records change or are archived.
- Product share links remain Product-only. Public service request and tracking links use opaque tokens and expose only approved customer-safe fields.
- Product offline sync remains supported. Generic Service mutations are online-only.
- Business-template and dry-cleaning-specific runtime contracts are removed. Historical migration readers remain only in the explicit migration module.

## Verification

- 190 focused API, database, dashboard, and mobile tests passed.
- Full workspace typecheck passed.
- Product, Service, mixed-sale, stock rejection, cancellation, refund, request, tracking privacy, report, migration, and navigation behavior are covered.
- Dashboard browser QA covered empty, Product-only, Service-only, and mixed navigation, direct route gates, public request/tracking, and service reporting.
- Android QA covered the tailored Service-only home, generic Service Jobs, Service item selection, price/quantity totals, and successful service order creation.
- Prisma migrate and push checks passed; the legacy migration dry-run and apply were idempotent.

## Deferred

- Digital goods or another item kind.
- Non-stock physical products.
- Appointment calendars and resource booking.
- Arbitrary service workflow builders.
- Offline Service Job mutations.
- Provider-native SMS/WhatsApp delivery.
- Durable cloud evidence upload.
