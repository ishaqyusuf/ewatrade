# Service Commerce Midday Migration Contract

**Status:** amended implementation contract approved on 2026-08-09

**Source baseline:** Midday workspace inspected on 2026-08-09

**Target:** EwaTrade Service Commerce platform extraction

## Purpose

This contract translates the Service Commerce direction plus ADR-0030's
Progressive Catalog/thin-Pharmacy amendment into the repository's required
Midday implementation shape. The revised 15-ticket source batch was
owner-approved on 2026-08-09; each ticket must still satisfy its blockers, and
production database/provider operations remain separately authorized.

## Canonical Midday References

- Invoice server composition and bounded prefetch:
  `midday/apps/dashboard/src/app/[locale]/(app)/(sidebar)/invoices/page.tsx`
- Typed URL controller state:
  `midday/apps/dashboard/src/hooks/use-invoice-params.ts`
- Typed shareable filters:
  `midday/apps/dashboard/src/hooks/use-invoice-filter-params.ts`
- Global sheet ownership:
  `midday/apps/dashboard/src/components/sheets/global-sheets.tsx`
  and `global-sheets-provider.tsx`
- Focused table loading/empty/action composition:
  `midday/apps/dashboard/src/components/tables/invoices/`
- Thin WhatsApp webhook transport:
  `midday/apps/api/src/rest/routers/webhooks/whatsapp/index.ts`
- Job enqueue/deduplication boundary:
  `midday/packages/job-client/src/index.ts`
- Typed identifier-driven notification task:
  `midday/packages/jobs/src/tasks/notifications/notifications.ts`

These are architectural references, not files to copy wholesale. EwaTrade's
Tenant/Store authorization, business-owned WhatsApp Connections, vertical
policy and existing bounded contexts override Midday's single-team/global-
sender assumptions.

### Exact Midday Files Inspected

The planning pass read these exact analogue files; implementation does not
require another Midday discovery pass:

- Route/composition: `apps/dashboard/src/app/[locale]/(app)/(sidebar)/invoices/page.tsx`
- Header/open/search: `apps/dashboard/src/components/invoice-header.tsx`,
  `open-invoice-sheet.tsx`, `invoice-search-filter.tsx`
- URL state: `apps/dashboard/src/hooks/use-invoice-params.ts`,
  `use-invoice-filter-params.ts`
- Sheet ownership: `apps/dashboard/src/components/sheets/global-sheets.tsx`,
  `global-sheets-provider.tsx`, `invoice-sheet.tsx`
- Sheet content/form: `apps/dashboard/src/components/invoice-sheet-header.tsx`,
  `invoice-content.tsx`, `invoice/form-context.tsx`
- Queue/table: `apps/dashboard/src/components/tables/invoices/data-table.tsx`,
  `columns.tsx`, `table-header.tsx`, `actions-menu.tsx`, `bottom-bar.tsx`,
  `skeleton.tsx`, `empty-states.tsx`
- API/schema/query: `apps/api/src/schemas/invoice.ts`,
  `apps/api/src/trpc/routers/invoice.ts`,
  `packages/db/src/queries/invoices.ts`
- Webhook/jobs: `apps/api/src/rest/routers/webhooks/whatsapp/index.ts`,
  `packages/job-client/src/index.ts`,
  `packages/jobs/src/tasks/notifications/notifications.ts`

Observed rules carried forward are server prefetch/hydration, shared
loader/hook URL parsers, globally mounted sheets, focused form context,
lightweight infinite lists plus separate detail, allowlisted sorting/filtering,
explicit empty/filtered-empty states, row actions with exact invalidation,
deliberate bulk actions, thin API orchestration, scoped repository predicates,
thin webhook transport and deduplicated identifier-driven jobs.

## Current EwaTrade Source Ownership Inspected

- Dashboard routes: `apps/dashboard/src/app/(shell)/services/page.tsx`,
  `apps/dashboard/src/app/(shell)/prescriptions/page.tsx`,
  `apps/dashboard/src/app/(shell)/prescriptions/reports/page.tsx`,
  `apps/dashboard/src/app/(shell)/settings/prescriptions/page.tsx`.
- Service composition: `apps/dashboard/src/components/dashboard/service-jobs-page.tsx`,
  `apps/dashboard/src/components/service-work/*`,
  `apps/dashboard/src/components/tables/service-work/*`,
  `apps/dashboard/src/components/sheets/service-*.tsx`,
  `apps/dashboard/src/hooks/use-service-work-params.ts`.
- Prescription composition: `apps/dashboard/src/components/prescriptions/*`,
  `apps/dashboard/src/components/tables/prescriptions/*`,
  `apps/dashboard/src/components/sheets/prescription-request-sheet.tsx`,
  `apps/dashboard/src/hooks/use-prescription-*.ts`, and the existing
  `GlobalSheets` registration.
- Public surfaces: `apps/storefront/src/app/service-{request,quote,tracking}/[token]/page.tsx`
  and `apps/storefront/src/app/prescription*/[token]/page.tsx`.
- API: `apps/api/src/schemas/services.ts`, `schemas/prescriptions.ts`,
  `trpc/routers/services.ts`, `service-access.ts`, `service-communications.ts`,
  `service-permissions.ts`, `service-reporting.ts`, `prescriptions.ts`,
  `prescription-access.ts`, and `trpc/routers/_app.ts`.
- Domain packages: `packages/prescriptions/src/{schemas,quotes,fulfillment,providers}.ts`
  and `packages/communications/src/whatsapp.ts`. Generic Service rules are
  currently split across API and DB query modules rather than one reusable
  domain package.
- Progressive Catalog foundation: `CatalogItem`, `SellableVariant` and
  `SellableOffering` already support private `DRAFT` status;
  `CommerceQuoteLine` already stores immutable names/prices and optional
  Offering linkage; `CatalogPriceChange` records explicit reusable price
  changes; `CommercialOrderLine` requires an Offering; Product inventory uses
  separate Unit Configuration, Balance Source, reservation and Stock Operation
  facts. There is no current source-link/verified-alias, historical suggestion,
  procure-to-order availability or graduation workflow.
- Persistence: `packages/db/prisma/models/{service-operations,commerce-quotes,commercial-orders,prescription-commerce,prescription-operations}.prisma`
  plus `packages/db/src/queries/{service-public,service-work,service-settings,service-reporting,commerce-quotes,commercial-orders,prescription-requests,prescription-payments,prescription-fulfillment,prescription-reporting,prescription-compliance,whatsapp-connections}.ts`.
- Jobs: `packages/jobs/src/{tasks,handlers}/service-notification-dispatch.ts`,
  `prescription-whatsapp-inbound.ts`, `prescription-communication-dispatch.ts`,
  `whatsapp-connection-test.ts`, media/transcription/privacy/retention tasks and
  commercial-order reminders.
- Acceptance: focused specs under
  `packages/db/src/queries/acceptance/service-commerce/` plus Service,
  Prescription, Communications, DB and job tests.

### Completed Ticket 01 Compatibility Prefactor

Ticket 01 creates `packages/service-commerce`, defines the exact three-source
contract (`service | prescription | commerce_inquiry`), exposes the minimal
channel/capability/readiness/action/fulfilment vocabulary, and validates source
references at the adapter boundary. It also splits the broad Neon acceptance
file into `packages/db/src/queries/acceptance/service-commerce/` with a shared
run-owned fixture and bounded atomic cleanup. The compatibility matrix passed
on the verified `.env.local` Neon profile before the source contract was
reconciled; focused contract tests and both affected package typechecks pass
after reconciliation. No caller ownership, persistence model, production
schema, provider configuration, or contraction changes in Ticket 01.

Current divergence to remove deliberately: the Service workspace owns local
sheet instances and manually edits `URLSearchParams`; Prescription already has
the stronger `nuqs`/global-sheet pattern. Generic Service contracts/rules are
also spread across API/DB rather than a focused reusable package.

## Concrete Target Filesystem Plan

### Create

- `packages/service-commerce/package.json`, `tsconfig.json`, `src/index.ts`
- `packages/service-commerce/src/schemas/index.ts` as a thin barrel over
  `source.ts`, `capability.ts`, `catalog-adoption.ts`, `action.ts`, `booking.ts`
  and `fulfillment.ts`
- `packages/service-commerce/src/sources.ts`: exhaustive adapters and exact
  Product cart/Order versus approved narrow Commerce Inquiry boundary
- `packages/service-commerce/src/capabilities.ts`: Store readiness and vertical
  policy inputs/results
- `packages/service-commerce/src/catalog-adoption.ts`: draft resolution,
  verified matching, price-suggestion precedence, availability commitments and
  graduation rules
- `packages/service-commerce/src/actions.ts`: state-aware opaque action rules
- `packages/service-commerce/src/bookings.ts`: availability, contention and
  lifecycle rules
- `packages/service-commerce/src/fulfillment.ts`: shared pickup/delivery rules
- Matching focused `*.test.ts` files beside every domain module
- `packages/db/prisma/models/service-commerce.prisma`: Store capability,
  vertical eligibility, opaque action, usage/cost facts and narrow Commerce
  Inquiry records
- `packages/db/prisma/models/catalog-adoption.prisma`: source-to-draft links,
  verified aliases, availability attestations, explicit Catalog price-decision
  attribution and graduation audit without duplicating Catalog Items
- `packages/db/prisma/models/service-bookings.prisma`: booking/resource,
  availability, exception, hold, event and policy snapshots
- `packages/db/src/queries/service-commerce-access.ts`
- `packages/db/src/queries/service-commerce-sources.ts`
- `packages/db/src/queries/service-commerce-catalog.ts`
- `packages/db/src/queries/service-commerce-bookings.ts`
- `packages/db/src/queries/service-commerce-fulfillment.ts`
- `packages/db/src/queries/service-commerce-reporting.ts`
- `apps/api/src/schemas/service-commerce.ts`
- `apps/api/src/trpc/routers/service-commerce/index.ts` as a thin composed
  router over `access.ts`, `queue.ts`, `catalog.ts`, `actions.ts`, `bookings.ts`,
  `fulfillment.ts` and `reporting.ts`
- `apps/dashboard/src/app/(shell)/service-commerce/page.tsx`
- `apps/dashboard/src/app/(shell)/service-commerce/reports/page.tsx`
- `apps/dashboard/src/app/(shell)/settings/service-commerce/page.tsx`
- `apps/dashboard/src/hooks/use-service-commerce-params.ts`
- `apps/dashboard/src/hooks/use-service-commerce-filter-params.ts`
- `apps/dashboard/src/components/service-commerce/{service-commerce-header,open-service-commerce-sheet,service-commerce-search-filter,service-commerce-sheet-header,service-commerce-sheet-content,form-context,service-commerce-workspace,service-commerce-setup,service-commerce-report}.tsx`
- `apps/dashboard/src/components/service-commerce/catalog-adoption/{catalog-match,price-suggestions,draft-catalog-form,inventory-graduation-form}.tsx`
- `apps/dashboard/src/components/service-commerce/service-commerce-controllers.ts`
  as the single exhaustive mode-to-controller/schema/id map
- `apps/dashboard/src/components/sheets/service-commerce-sheet.tsx`
- `apps/dashboard/src/components/tables/service-commerce/{columns,data-table,table-header,actions-menu,skeleton,empty-states}.tsx`
- `apps/storefront/src/app/request/[token]/page.tsx`,
  `apps/storefront/src/app/action/[token]/page.tsx`, and
  `apps/storefront/src/app/booking/[token]/page.tsx` as allowlisted shared
  dispatch/public projections for proven adapters only, while old vertical URLs
  stay compatible
- `packages/jobs/src/tasks/service-commerce-notification-dispatch.ts` and
  `service-commerce-booking-reminders.ts`
- `packages/jobs/src/handlers/service-commerce-notification-dispatch.ts` and
  `service-commerce-booking-reminders.ts`, with focused tests
- Focused dashboard component tests and split Neon acceptance specs under
  `packages/db/src/queries/acceptance/service-commerce/`.

### Modify In Place

- `apps/api/src/trpc/routers/_app.ts`: register the new thin router.
- Existing Service/Prescription API schemas and routers: delegate only shared
  contracts/commands while retaining vertical entrypoints during compatibility.
- `packages/db/src/queries/index.ts`: export focused new query modules.
- Existing Commerce Quote/Order, Service and Prescription query modules:
  delegate shared seams without moving source-specific rules.
- `packages/db/src/queries/whatsapp-connections.ts` and tests: generalize
  connection/binding naming behind compatible exports and retain whole-route
  cross-Tenant rejection.
- `packages/communications/src/whatsapp.ts`: keep provider transport/parsing
  only; domain routing remains outside the adapter.
- `apps/api/src/communications/{whatsapp-runtime,whatsapp-webhook,whatsapp-embedded-signup}.ts`:
  resolve the generalized Connection/Binding and dispatch verified facts.
- `apps/dashboard/src/components/sheets/global-sheets.tsx`: mount the shared
  Service Commerce controller once.
- Existing Services/Prescriptions routes, components, hooks and public pages:
  use compatible shared projections/commands incrementally and retain their
  vertical-specific UI and URLs until switch approval.
- Existing Catalog creation, price-history and inventory query modules: expose
  authorized draft-create, explicit price-promotion and graduation seams while
  retaining Catalog ownership and Stock Operation authority.
- Existing jobs: adapt notification/WhatsApp identifiers to shared Connection
  and source refs while prescription media/OCR/privacy jobs remain vertical.
- Brain/API/database/runbook docs in the same ticket that changes their truth.

### Replace Or Move During Approved Switch

- Replace manual `apps/dashboard/src/hooks/use-service-work-params.ts` with
  shared `nuqs` parsers/loaders; retain a temporary export adapter while old
  callers remain.
- Move reusable Service Request/Quote presentation out of
  `apps/dashboard/src/components/service-work/` into
  `apps/dashboard/src/components/service-commerce/`; keep Job/work execution
  components in `service-work`.
- Move generalized WhatsApp connection/readiness contracts out of
  prescription-named exports while leaving Pharmacy channel policy and setup
  copy in `components/prescriptions/`.
- Move request/Quote-driven draft matching and price suggestion into the shared
  Catalog-adoption controller. Prescription components retain only verified
  line review and pharmacist release inputs.
- Further split the completed Ticket 01 acceptance directory only as later
  behavior lands: Ticket 08 separates fixed/manual delivery concerns, and
  Tickets 10/12/13 add Pharmacy-adaptation and cross-vertical specs. The deleted
  `prescription-commerce.integration.test.ts` monolith must not be recreated;
  all specs continue to use the centralized run-owned atomic teardown boundary.

### Delete Only After Ticket 13 Switch/Contraction Approval

- Local Service sheet mounts in `service-jobs-page.tsx` after the shared sheet
  is globally mounted and browser-tested.
- Superseded `apps/dashboard/src/components/sheets/service-{intake,request,quote,settings}-sheet.tsx`
  only after focused replacements pass compatibility.
- The manual `use-service-work-params.ts` adapter only after all callers and URL
  compatibility tests move.
- Prescription-named WhatsApp compatibility exports only after Pharmacy and
  appointment verticals pass and no external caller remains.
- Duplicate Prescription Quote/payment/pickup/delivery/reporting orchestration
  after the shared workspace and source adapter pass Pharmacy acceptance;
  `PrescriptionRequest`, private media/review/privacy records and regulated
  policy are not contraction targets.
- No source aggregate, production table, public URL or completed Pharmacy
  ticket is deleted by default; each needs reconciliation and owner-approved
  contraction.

## Intentional Midday Omissions

- Invoice summary score cards are not copied until Service Commerce reporting
  defines useful authoritative metrics.
- Invoice column drag/resize persistence is optional; queue correctness,
  accessibility and mobile behavior precede personalization.
- Bulk actions are omitted unless one safe homogeneous action has a server
  capability and per-row result contract. Selection alone does not justify a
  bulk mutation.
- Invoice PDF/editor/template behavior is irrelevant to Requests/bookings and
  is not migrated.
- Midday's global team sender and permissive public invoice-token lookup are
  rejected in favor of Tenant Connection + Store binding and allowlisted opaque
  public projections.

## Required Workspace Shape

- Dashboard/application code authenticates, resolves Tenant/Store, loads
  safe URL state, prefetches typed bounded queries and composes workspaces.
- Reusable Service Commerce schemas, capability/action rules, source adapters,
  Progressive Catalog rules, booking rules, fulfilment rules and provider
  contracts live in focused packages with thin barrel exports.
- API schemas are shared Zod contracts. tRPC/Hono procedures authorize and
  orchestrate; they do not own domain derivation or database transactions.
- Query modules own persistence and must accept explicit Tenant/Store context
  at every private repository boundary.
- Multi-write lifecycle commands are bounded, atomic, idempotent and safe under
  fresh concurrency as well as replay.
- Jobs carry identifiers and small non-sensitive facts only, re-authorize and
  reload current state at execution, own provider writes and record retryable
  results.
- Communications owns direct Meta/BSP transports, signature verification,
  templates, windows, attempts and receipts. Channel adapters cannot own
  Request, Quote, booking, payment or fulfilment truth.

## Dashboard Contract

- Server routes prefetch access/readiness and only the private data permitted
  under resolved Tenant/Store context. Uncertain access fails closed into an
  explicit client/route error and retry path.
- `nuqs` parser schemas are shared by server `createLoader` functions and
  client `useQueryStates` hooks. Safe Store scope, filters, selection and sheet
  mode survive refresh/share; customer content and bearer capabilities never
  enter the URL.
- Globally mounted sheets own create/detail/success controller state. Each mode
  has a focused content/header/form composition and stale ids fail closed.
- Tables use lightweight paginated projections with explicit loading, error,
  retry, empty and filtered-empty states. Authorized detail is fetched
  separately.
- React Hook Form contexts own editable drafts; shared package Zod schemas own
  fields and command-boundary refinements.
- Mutations show pending/error state, await exact invalidation/refetch and only
  then present success. Professional, financial, booking and fulfilment
  commitments use explicit confirmation where consequence warrants it.
- Desktop/mobile browser QA covers keyboard/scroll, screen-reader names,
  focus/escape, stale/error recovery, URL behavior and permission changes.

### Route, Header And Open Control

- `service-commerce/page.tsx` authenticates, resolves active Tenant/Store,
  loads the exact parsers below, fetches `workspaceAccess`, and prefetches
  `queue` only when access/readiness permits. Access-fetch failure renders a
  retry boundary and never speculatively loads private queue data.
- `service-commerce-header.tsx` shows Store name, capability readiness text,
  Catalog adoption mode, unresolved draft count, pending restriction count and
  links to setup/reporting. It composes
  `service-commerce-search-filter.tsx` and
  `open-service-commerce-sheet.tsx`; it does not calculate policy.
- The primary open control is `New request`. It is rendered only from the
  server `canCreateAssistedRequest` capability and writes
  `{ serviceCommerceSheet: "intake" }`. The button has a visible label on
  mobile/desktop and an accessible name; it does not mutate data directly.
- Setup/connection opens are separate header actions and use `setup` or
  `connection`. Pharmacy professional actions stay inside Pharmacy detail,
  never the generic header.

### Exact URL State

`use-service-commerce-params.ts` and its server loader own:

- `serviceCommerceSheet`: enum `intake | request | quote | catalog_draft |
  inventory_graduation | booking | fulfillment | connection | setup | success`
- `sourceKind`: exact enum `service | prescription | commerce_inquiry`; absent
  for exact Product cart/Order flows. `commerce_inquiry` is restricted to
  Product demand requiring identification, availability confirmation or Quote.
- `sourceId`, `sourceLineId`, `catalogItemId`, `offeringId`, `quoteId`,
  `bookingId`, `orderId`: opaque strings used only with the matching
  mode/source; mutually irrelevant ids are cleared on transitions
- `successKind`: enum `request | catalog_draft | catalog_price |
  inventory_graduation | quote | booking | payment | pickup | delivery`
  and `successId`: revalidated by an authorized detail/status query before any
  success copy renders

`use-service-commerce-filter-params.ts` and its server loader own:

- `q`: trimmed string, maximum 100 characters
- `statuses`: array of shared queue-status enum values
- `sourceKinds`: array of the source enum above
- `channels`: array of `web | staff | whatsapp`
- `fulfillment`: array of `none | service | pickup | delivery`
- `catalogStates`: array of `unresolved | draft | linked | graduated`
- `assignees`: array of opaque user ids returned by the scoped filter-options
  query
- `start`, `end`: ISO date-only values interpreted as a Store-timezone
  half-open range
- `sort`: exactly one of `updated_at | created_at | status | customer | promised_at`
- `direction`: `asc | desc`
- `storeId`: optional shareable Store scope only when `workspaceAccess`
  authorizes Tenant-wide management; otherwise server context overwrites it

No phone, name, message, address, prescription, free-form notes, provider id or
bearer capability enters URL state. Invalid enum/date combinations normalize to
null and do not reach repository filters.

Closing a sheet clears `serviceCommerceSheet`, every entity/success id and
`successKind`, resets the active RHF draft, and invalidates only detail/default
queries touched by that sheet. It preserves queue filters, sort and authorized
Store scope. Switching mode atomically replaces the mode-specific ids. Refresh
or stale/mismatched mode/id/source/permission fails closed to a recoverable
not-found/forbidden state; it never falls through to another mode.

### Sheet, Form And Current-File Moves

- `service-commerce-sheet.tsx` is mounted once by `GlobalSheets`, reads the URL
  controller, and uses the one exhaustive map in
  `service-commerce-controllers.ts` to select a focused controller, required id
  and form schema per explicit mode.
- `service-commerce-sheet-header.tsx` receives the authorized mode projection
  and renders readiness/current-version context; it performs no fetching or
  state inference.
- `service-commerce-sheet-content.tsx` handles loading/error/retry and delegates
  to focused intake, request, quote, Catalog draft, inventory graduation,
  booking, fulfilment, connection, setup or revalidated-success content.
  Unsupported combinations return a closed/error
  state.
- `form-context.tsx` creates one RHF provider for the active editable command
  using the matching shared Zod schema. Source-specific draft fields render
  through typed adapter slots; Pharmacy media/review context remains in the
  Prescription package/component tree.
- `catalog_draft` resolves one verified source line, displays ranked existing
  Offering matches, and creates/links a private draft only after confirmation.
  `inventory_graduation` edits missing Catalog/inventory facts and submits one
  explicit graduation command; neither mode publishes implicitly.
- Move `service-intake-form.tsx`, `service-request-form.tsx` and
  `service-quote-form.tsx` presentation into focused shared content only after
  compatibility tests. `service-job-workspace.tsx` stays in Service Work.
- `prescription-intake-form.tsx`, media viewer, review workspace and
  professional confirmation remain in `components/prescriptions`; they may be
  embedded by the `prescription` source controller but are not generalized.
- Retire local `service-{intake,request,quote,settings}-sheet.tsx` mounts only
  after the global controller has URL, close/reset and browser parity. Booking,
  fulfilment and connection get new focused forms rather than one polymorphic
  form with hidden fields.

### Queue, Filters, Columns And Row Actions

- `queue` is an infinite lightweight projection; `data-table.tsx` uses the same
  server-loaded parsers, stable query key, Suspense skeleton and explicit empty
  versus filtered-empty recovery.
- Exact initial column ids are `reference`, `customer`, `source`, `status`,
  `nextAction`, `commercial`, `fulfillment`, `assignee`, `updatedAt`, `actions`.
  `reference` and `customer` are sticky on desktop only; private content is not
  a column. `commercial` displays allowlisted Quote/payment/booking summary,
  never provider ids. It also shows an allowlisted unresolved/draft/linked/
  graduated Catalog badge. `nextAction` is server-projected.
- Row click opens the server-projected default detail mode and writes only
  `sourceKind`, `sourceId` and the matching sheet. Links, menu triggers, action
  buttons and customer controls call `stopPropagation`; keyboard Enter/Space
  opens the same detail and focus is restored on close.
- `actions-menu.tsx` renders only row `allowedActions`. Consequential release,
  acceptance, booking, payment/refund, pickup/delivery and cancellation actions
  open a confirmed controller or scoped public/provider page; they never fire
  from the menu without confirmation.
- `Resolve Catalog` appears only when the server projects an unresolved
  verified line and the actor can manage progressive Catalog. `Update Catalog
  price` is separate from editing the Quote and always opens confirmation with
  affected Offering/Store scope, prior price and suggestion source.
- `table-header.tsx` maps only the sort allowlist above. Unknown column sort
  metadata is inert. Filters use scoped option queries; clearing filters keeps
  sort/Store and returns the unfiltered queue.
- There is no select checkbox or bulk bottom bar in the first migration. No
  homogeneous bulk command is currently safe across source kinds and vertical
  policies. Do not create `bottom-bar.tsx` until a later approved ticket defines
  one server capability with per-row outcomes.
- `skeleton.tsx` mirrors the ten visible columns without fake data.
  `empty-states.tsx` has `EmptyQueue` with the authorized `New request` control,
  `NoResults` with filter reset, and `Unavailable` with setup/retry guidance.

### API, Pagination And Invalidation Contract

`apps/api/src/trpc/routers/service-commerce/index.ts` composes focused thin
subrouters that expose these procedures over shared schemas and explicit
repository commands:

- `workspaceAccess({ storeId? }) -> { tenantId, store, stores?, capabilities,
  restrictions, catalogAdoption, canCreateAssistedRequest, canManage,
  canReport }`; tenant id is server/private output and never a public
  projection.
- `filterOptions({ storeId }) -> { assignees, statuses, sourceKinds, channels,
  fulfillment, catalogStates }`, scoped to authorized options only.
- `queue({ storeId, cursor?, limit, q?, statuses?, sourceKinds?, channels?,
  fulfillment?, catalogStates?, assignees?, start?, end?, sort, direction }) ->
  { data, meta: { cursor? } }`; `limit` defaults to 50 and is capped at 100.
- `detail({ storeId, source: { kind, id } })` returns the source-owned
  authorized detail plus common `allowedActions`; heavy/private fields remain
  source-specific and purpose-audited.
- `catalogMatches({ storeId, source, sourceLineId })` returns existing/draft
  Offerings ranked by verified aliases and allowlisted similarity; raw private
  source content is not returned outside its authorized detail.
- `priceSuggestions({ storeId, source, sourceLineId, offeringId? })` returns
  attributable Store-first current/accepted/completed price facts with currency
  and effective time; unknown is explicit.
- `createDraftCatalog`, `linkCatalogOffering`, `promoteCatalogPrice` and
  `graduateCatalogOffering` are separate confirmed mutations. They never run as
  a side effect of opening or saving a Quote draft.
- `report({ storeId?, start, end })` returns allowlisted aggregate lifecycle,
  Progressive Catalog capture/graduation, usage, cost-known/unknown and
  reliability projections.
- `submitIntake`, `executeAction`, booking commands and fulfilment commands use
  discriminated shared inputs and delegate to one source/domain command. There
  is no generic free-form mutation.

Repository pagination uses a stable `(allowlistedSortValue, id)` cursor and
adds Tenant + Store predicates before filters. Search targets only reference,
allowlisted customer display fields and source-approved search text. Date
filters use canonical lifecycle/queue timestamps and `[start,end)`. Assignee,
status, source, channel, fulfilment and Catalog-state values are validated
shared enums; an empty/invalid allowlist never broadens a query.

After an awaited successful mutation, invalidate exact keys in this order:

1. affected `detail({ storeId, source })` and source-owned detail/history;
2. `queue` prefixes for the affected Store and any authorized Tenant-wide view;
3. `workspaceAccess` only when setup/readiness/connection/policy changed;
4. `filterOptions` only when assignee/capability options changed;
5. Catalog match/price/adoption queries plus Catalog lists only when a draft,
   alias, reusable price, availability or graduation fact changed;
6. `report` only for lifecycle, payment, booking, fulfilment, usage/cost events;
7. current public status/Quote/booking capability where customer state changed.

Refetch/invalidation completes before success mode/toast. Errors remain visible
with retry and preserve safe draft data. Optimistic writes are limited to
reversible presentation state; authoritative lifecycle state always refetches.

## Service Commerce Domain Contract

- `ServiceRequest`, `PrescriptionRequest` and the narrow Commerce-owned
  `CommerceInquiry` stay authoritative. One exhaustive typed source registry
  exposes shared references/projections/commands; UI components never traverse
  or infer vertical policy.
- Exact Product selections reuse cart/Commercial Order commands. Clarification/
  Quote-needed Product demand uses `commerce_inquiry`, a separate typed source
  rather than a universal request model.
- Commerce Inquiry owns Product-demand lines and the exact lifecycle `received |
  needs_clarification | ready_to_quote | quoted | converted | declined |
  withdrawn | expired`. Draft Catalog resolution cannot convert it; only
  current Quote acceptance creates the Order and terminal conversion.
- Progressive Catalog reuses private draft Catalog records. Source links and
  verified aliases enable future matching; Quote prices remain immutable
  transaction facts; Catalog price promotion is explicit; stock is never
  inferred from demand or sales.
- Store capability/readiness and vertical/jurisdiction eligibility are server
  projections. Clients do not reconstruct authorization from roles/settings.
- Commerce Quote/Order/payment rules remain in Commerce. Booking owns schedule
  and resource contention. Fulfilment owns pickup/delivery. Vertical adapters
  supply additional eligibility/release requirements.
- Customer actions are exhaustive server projections bound to current source
  version, Store, capability and policy. Opaque action tokens are short-lived,
  purpose-limited and idempotent.
- Public projections are allowlisted and must not expose Tenant ids, internal
  source ids, provider operation ids, credentials, private media, addresses or
  professional/audit details.

## WhatsApp Contract

- Preserve the Midday thin webhook shape: verify/parse transport, resolve the
  recipient connection, hand verified facts to the correct application/domain
  command and return provider-appropriate acknowledgement.
- Replace Midday's one global sender with Tenant WhatsApp Connection + explicit
  Store Binding. Every recipient id resolves Connection/Tenant before customer
  or source lookup; any corrupt active cross-Tenant binding rejects the route.
- Conversation/idempotency keys include Connection, provider customer id and
  explicit Store/source context. A phone number is not global identity.
- Manual and Embedded Signup create pending connections/bindings. Identifier-
  only readiness jobs verify credential, WABA/number, webhook, templates,
  billing owner and neutral outbound capability before atomic promotion.
- Direct Meta is the initial adapter. Twilio/BSP support may implement the same
  provider contract; no domain layer imports a provider-specific SDK.
- Current provider policy and pricing are release inputs, not constants. The
  pharmacy vertical remains separately policy-gated.

## Migration Sequence And File Ownership

1. Prefactor: document ownership, create compatibility tests, split oversized
   acceptance fixtures and centralize bounded run-owned cleanup.
2. Expand: add shared package contracts, server capability/policy projections,
   Commerce Inquiry and Progressive Catalog seams while old Pharmacy/Service
   exports remain authoritative.
3. Adapt: route callers through source adapters, generalized Connection/Binding,
   Progressive Catalog, reusable Commerce/Fulfilment seams and booking.
4. Graduate: prove progressive Catalog records can become managed inventory
   without losing linked request/Quote/Order/price history.
5. Prove: run Pharmacy and appointment vertical acceptance on `.env.local`
   Neon plus authenticated desktop/mobile browser QA.
6. Switch: change ownership only after compatibility and rollback evidence.
7. Contract: remove old names/models/exports only under separately approved
   production reconciliation and rollout tickets.

### Rollback Conditions

- Prefactor/expand stops when the shared contract suite, current Service path,
  or current Pharmacy pickup/delivery compatibility matrix regresses. Because
  Ticket 01 has no caller or schema switch, rollback is removal of the unused
  new export/package change while the authoritative vertical entrypoints remain
  untouched; the split tests may remain if they preserve the same evidence.
- Adapt/graduate/prove stops on any Tenant/Store isolation failure, projection
  privacy leak, incompatible public URL/result, concurrency/idempotency
  regression, history loss, invented stock, policy bypass, or failed required
  desktop/mobile/Neon acceptance. Disable the new Store capability, stop its
  identifier-only jobs, retain compatibility exports/readers and reconcile
  additive data before another attempt. Never roll back by deleting customer,
  Quote, Order, audit, Catalog-price or inventory-ledger history.
- Switch is reversed to the compatibility entrypoint if monitored Service or
  Pharmacy outcomes diverge, authorization/readiness becomes uncertain, or a
  required provider canary fails. The old path remains deployable until the
  observation window and reconciliation report pass; no old export or column
  is removed in the switch phase.
- Contract does not start until every old caller is absent, production
  reconciliation is clean, rollback observation has passed and the owner has
  separately approved removal. A failed contraction deploy restores the prior
  application artifact and compatible reader/export; destructive schema
  cleanup is not retried until the discrepancy is understood and reconciled.

Approved target ownership:

- `packages/*`: focused Service Commerce contracts/rules/adapters.
- `packages/db/src/queries/*`: source, booking, fulfilment, connection and
  reporting repositories split by lifecycle responsibility.
- `apps/api/src/schemas/*`: shared contract re-exports or API composition only.
- `apps/api/src/trpc/routers/*`: thin authorized orchestration.
- `apps/dashboard/src/app/(shell)/*`: server composition/prefetch.
- `apps/dashboard/src/components/*`: focused workspaces/tables/global sheets.
- `packages/jobs` and app job entrypoints: identifier-only durable work.

## Verification Gates

- Focused unit, repository, API, job and compatibility suites.
- Fresh concurrency plus replay for Quote acceptance, booking contention,
  payment callbacks, pickup handoff and delivery completion.
- Progressive Catalog capture, private-state/publication, price suggestion and
  promotion, Tenant/Store/currency isolation, procure-to-order expiry and
  inventory graduation with history preservation.
- Deterministic cross-channel/cross-vertical Neon seam using only the verified
  `.env.local` development profile; local Docker/PostgreSQL is prohibited.
- Authenticated desktop/mobile and public browser acceptance.
- Tenant/Store isolation, policy expiry, stale capabilities, provider failure,
  privacy/log/secret and redacted observability tests.
- Live provider and production database steps remain separately approved.

No phase is complete merely because types compile. Brain, contracts, tickets,
tests and observed acceptance must all describe the same current state.
