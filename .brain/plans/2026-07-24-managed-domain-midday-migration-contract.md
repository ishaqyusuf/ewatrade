# Managed Domain Midday Migration Contract

Date: 2026-07-24
Mode: Implementation
Status: Source implemented; deployment blocked

## 1. Reference Compared

### EwaTrade target

- `apps/dashboard/src/app/(shell)/settings/page.tsx`
- `apps/dashboard/src/components/dashboard/retail-ops-subscription-settings.tsx`
- `apps/dashboard/src/components/dashboard/dashboard-sheet.tsx`
- `apps/dashboard/src/components/dashboard/dashboard-table.tsx`
- `apps/dashboard/src/hooks/use-catalog-item-params.ts`
- `apps/dashboard/src/hooks/use-order-params.ts`
- `apps/dashboard/src/app/(shell)/layout.tsx`
- `apps/dashboard/src/trpc/server.tsx`
- `apps/api/src/trpc/init.ts`
- `apps/api/src/trpc/routers/_app.ts`
- `apps/api/src/trpc/routers/retail-ops-subscriptions.ts`
- `packages/db/src/queries/retail-ops-subscriptions.ts`
- `packages/jobs/src/index.ts`
- `packages/jobs/src/trigger.ts`
- `packages/utils/src/vercel.ts`
- `apps/mobile/src/components/mobile/admin-tabs/admin-more-screen.tsx`
- `apps/mobile/src/components/mobile/subscription-plan-sheet.tsx`
- `apps/mobile/src/components/mobile/workflow-modal-screen.tsx`
- `apps/mobile/src/app/_layout.tsx`
- `apps/marketing/src/components/signup/step-workspace.tsx`
- `apps/marketing/src/app/api/auth/signup/route.ts`

### Midday source of truth

- `apps/dashboard/src/app/[locale]/(app)/(sidebar)/invoices/page.tsx`
- `apps/dashboard/src/components/invoice-header.tsx`
- `apps/dashboard/src/components/open-invoice-sheet.tsx`
- `apps/dashboard/src/components/invoice-search-filter.tsx`
- `apps/dashboard/src/components/sheets/invoice-sheet.tsx`
- `apps/dashboard/src/components/invoice-sheet-header.tsx`
- `apps/dashboard/src/components/invoice-content.tsx`
- `apps/dashboard/src/components/invoice/form-context.tsx`
- `apps/dashboard/src/hooks/use-invoice-params.ts`
- `apps/dashboard/src/hooks/use-invoice-filter-params.ts`
- `apps/dashboard/src/components/tables/invoices/data-table.tsx`
- `apps/dashboard/src/components/tables/invoices/columns.tsx`
- `apps/dashboard/src/components/tables/invoices/table-header.tsx`
- `apps/dashboard/src/components/tables/invoices/actions-menu.tsx`
- `apps/dashboard/src/components/tables/invoices/bottom-bar.tsx`
- `apps/dashboard/src/components/tables/invoices/skeleton.tsx`
- `apps/dashboard/src/components/tables/invoices/empty-states.tsx`
- `apps/dashboard/src/app/[locale]/(app)/(sidebar)/settings/page.tsx`
- `apps/dashboard/src/app/[locale]/(app)/(sidebar)/settings/layout.tsx`
- `apps/dashboard/src/app/[locale]/(app)/(sidebar)/settings/billing/page.tsx`
- `apps/dashboard/src/components/sheets/global-sheets.tsx`
- `apps/dashboard/src/components/sheets/global-sheets-provider.tsx`
- related Midday API schemas, routers, query modules, and job boundaries

## 2. Migration Principle

The domain workspace follows Midday's settings composition for navigation and
its invoices pattern for a query-backed workspace with a dedicated open button,
URL-owned create/detail modes, a globally mounted sheet, a typed form context,
focused table files, exact mutation invalidation, explicit empty/loading/error
states, package-owned provider logic, query-owned persistence, and job-owned
side effects.

The adaptation preserves domain meaning:

- the row is a storefront domain, not an invoice;
- create mode is a staged Search → Registrant → Review → Checkout flow;
- details mode manages connection status, retry and storefront access;
- external-domain connection is a separate ownership-verification mode;
- registrar operations never execute in React components or request handlers.

## 3. Filesystem Plan

### Database and reusable domain package

- Create `packages/db/prisma/models/domains.prisma`.
- Update tenant, store, and site relations in existing Prisma model files.
- Add domain enums to `packages/db/prisma/models/enums.prisma`.
- Create `packages/db/src/queries/domains.ts` and export it from the query
  barrel.
- Create `packages/domains/` with explicit exports for:
  - normalization and validation;
  - pricing and quote rules;
  - encrypted registrant payloads;
  - registrar contracts and routing;
  - GO54;
  - Openprovider;
  - Paystack;
  - Vercel connection and DNS ownership verification.
- Add `@ewatrade/domains` dependencies only to API and jobs.

### API and jobs

- Create `apps/api/src/schemas/domains.ts`.
- Create `apps/api/src/trpc/routers/domains.ts`.
- Register the router in `apps/api/src/trpc/routers/_app.ts`.
- Create the signed Paystack webhook route. Registrar recovery uses scheduled
  authoritative reads and does not depend on provider webhooks.
- Create domain registration, connection and reconciliation handlers and
  Trigger.dev task entrypoints under `packages/jobs/src/`.
- Export lightweight job trigger functions from `packages/jobs/src/index.ts`.

### Dashboard

- Create `apps/dashboard/src/app/(shell)/settings/layout.tsx`.
- Create `apps/dashboard/src/app/(shell)/settings/domains/page.tsx`.
- Move the existing subscription screen to
  `apps/dashboard/src/app/(shell)/settings/billing/page.tsx`.
- Keep `apps/dashboard/src/app/(shell)/settings/page.tsx` as the general
  business/store/account settings route.
- Create `apps/dashboard/src/components/settings/settings-navigation.tsx`.
- Create `apps/dashboard/src/components/domains/domain-header.tsx`.
- Create `apps/dashboard/src/components/domains/open-domain-sheet.tsx`.
- Create `apps/dashboard/src/components/domains/domain-search-filter.tsx`.
- Create `apps/dashboard/src/components/domains/domain-content.tsx`.
- Create `apps/dashboard/src/components/domains/domain-sheet-header.tsx`.
- Create `apps/dashboard/src/components/domains/domain/form-context.tsx`.
- Create focused purchase, registrant, review, progress, details, and external
  connection components under `components/domains/`.
- Create `apps/dashboard/src/components/sheets/domain-sheet.tsx`.
- Create `apps/dashboard/src/components/sheets/global-sheets.tsx` and
  `global-sheets-provider.tsx`, then mount the provider in the shell layout.
- Create `apps/dashboard/src/hooks/use-domain-params.ts`.
- Create `apps/dashboard/src/hooks/use-domain-filter-params.ts`.
- Create the domain table folder with `columns.tsx`, `data-table.tsx`,
  `table-header.tsx`, `actions-menu.tsx`, `skeleton.tsx`, and
  `empty-states.tsx`.

### Mobile and signup

- Create `apps/mobile/src/app/domain-management-modal.tsx`.
- Register the owner/admin-protected route in the mobile root layout.
- Create a flat, keyboard-safe domain management workflow under
  `apps/mobile/src/components/mobile/domains/`.
- Add `Website & domain` to the More menu through the existing navigation
  model, not a local hard-coded row.
- Add a focused mobile domain-flow QA guard.
- Remove the raw custom-domain field and payload from marketing signup.
- Remove unverified custom `TenantHostname` writes and custom Vercel
  provisioning from the signup route.

### Documentation and environment

- Document GO54, Openprovider, Paystack, Vercel, encryption, pricing, and
  callback environment keys in env examples.
- Update Brain database, API, permissions, feature, decision, task, and
  migration documentation after the implementation is validated.

## 4. Route/Page Plan

- `settings/layout.tsx` owns the Midday-style secondary settings navigation.
- `/settings` authenticates and composes general settings only.
- `/settings/billing` prefetches subscription state and composes billing.
- `/settings/domains` authenticates, resolves the active store, loads URL
  filters, prefetches the bounded domain list and current registrant summary,
  hydrates the client workspace, and renders header/table/global sheet only.
- Route entrypoints contain no provider calls or form logic.
- Domain data sections use `HydrateClient`, `Suspense`, a domain skeleton, and
  the repository's route error boundary pattern.

## 5. Header And Open Button Plan

- Header owns title, explanatory copy, search/filter, and two explicit actions:
  `Buy domain` and `Connect existing`.
- `OpenDomainSheet` changes URL state to `domainMode=buy` or
  `domainMode=connect`.
- No domain provider selector is exposed; routing is by supported TLD.
- Column visibility is omitted because the bounded MVP table has six stable
  domain fields and no user value is gained from hiding them.

## 6. Sheet Plan

- `DomainSheet` is always mounted through `GlobalSheetsProvider`.
- URL params own `domainMode`, `domainId`, `domainOrderId`, and purchase step.
- Modes are `buy`, `connect`, `details`, and `progress`.
- Closing clears domain-only params, resets the domain form context, and
  invalidates the list, detail, order, and registrant queries.
- `DomainContent` routes modes to focused content components.
- `DomainSheetHeader` provides mode- and state-specific titles/copy.
- Purchase form context owns normalized search input, selected quote,
  registrant draft, terms acceptance, and active order.
- Provider results and durable order state remain TanStack Query server state.

## 7. Form-To-Sheet Plan

- Domain search, registrant collection, review, checkout handoff, and
  external-domain verification live in the domain sheet.
- The current signup custom-domain input is retired rather than reused.
- Registrant save validates before mutation and invalidates the registrant
  query.
- Checkout success opens the provider URL and switches the sheet to durable
  progress mode; provider callbacks are hints only and always refetch order
  state.
- Errors stay in the owning step and preserve entered non-secret values.

## 8. Filter/Search/URL State Plan

- `domainQuery` filters hostname/provider/status text.
- `domainStatuses` supports connection/lifecycle filtering.
- `domainMode`, `domainId`, `domainOrderId`, and `domainStep` own navigable
  sheet state.
- Escape clears the search/filter dropdown where supported by the existing UI
  dependency set.
- Search is server-backed only for registrar availability; the portfolio
  search is local over the bounded domain list.

## 9. Table Plan

- The domain portfolio query is bounded because MVP supports one primary
  custom storefront domain per Store.
- The table uses stable row IDs, row click to details, explicit actions,
  domain-specific empty/no-results/loading/error states, and semantic statuses.
- Infinite pagination, virtualization, column drag/reorder, resizing, sticky
  columns, and persisted column visibility are intentionally omitted because
  the business invariant keeps the list small and fixed. These features become
  required if multi-domain portfolios are introduced.
- Selection and bulk operations are intentionally omitted because renewal,
  disconnect, and transfer are owner-sensitive single-domain actions.

## 10. Columns And Row Actions Plan

Columns:

- Domain
- Store
- Registrar
- Connection
- Renewal/expiry
- Actions

Row click opens details. Interactive links and action triggers stop
propagation. Launch actions include manage, retry connection when eligible and
copy storefront URL. Renewal charging/actions, transfer initiation and delete
are intentionally unavailable.

## 11. Bottom Bar / Bulk Actions Plan

The Midday invoice bottom bar is intentionally omitted. There is no safe
domain-level bulk action in the MVP, and the one-primary-domain-per-store
invariant keeps selection unnecessary.

## 12. API/Data Plan

- Zod schemas validate normalized supported domains, quote IDs, registrant
  data, terms versions, store/site ownership, order idempotency, filters, and
  lifecycle commands.
- Protected tRPC procedures explicitly require tenant context and owner/admin
  permissions.
- REST routes receive signed Paystack webhooks. Registrar lifecycle recovery
  uses scheduled authoritative reconciliation reads because the launch
  implementation does not depend on registrar webhooks.
- Queries own tenant/store scoping, immutable quote snapshots, legal
  transitions, operation attempts, hostname projection, and event audit.
- `@ewatrade/domains` owns provider contracts, response normalization,
  pricing, encryption, and external clients.
- Jobs own paid-order registration, DNS/Vercel provisioning, refund, and
  reconciliation. Managed-domain expiry state is refreshed inside the 45-day
  window; renewal charging and transfer actions remain gated follow-up work.
- Search/quote is synchronous and bounded; provider writes are job-driven.
- Every provider write has an EwaTrade operation idempotency key and unknown
  outcomes reconcile before retry or failover.

## 13. Testing And QA Plan

- Package tests for domain parsing, provider routing, HMAC/auth, provider
  response normalization, pricing, encryption, webhook signatures, and error
  classification.
- Query tests for cross-tenant hostname isolation, authoritative status
  mapping, payment replay and idempotent refund-event persistence.
- API schema tests for normalized supported TLDs and immutable consent/terms
  versions, plus callback restoration tests.
- Job fault tests for definite and uncertain registration outcomes.
- Dashboard typecheck/lint plus browser QA on the port-free
  `http://ewatrade-dashboard.localhost/settings/domains` URL.
- Mobile typecheck, NativeWind/theme/keyboard guards, focused domain guard, and
  Android emulator QA in light/dark modes with the keyboard and browser
  checkout handoff.
- Prisma migration workflow followed by local, production, and attempted
  remote pushes as required by repository policy.

## 14. Open Questions

The following are deployment gates, not code-architecture questions:

- GO54 staging credentials, wholesale pricing, rate limits, and contract
  confirmation are not present in the repository.
- Openprovider's replacement OT&E environment must be confirmed operational.
- Live Paystack credentials and approved callback URLs are not present.
- Live canary purchases remain explicitly owner-approved, non-refundable
  external actions and are not authorized by implementation alone.

## 15. Conformance Audit

Implemented:

- settings layout and General/Domains/Billing route ownership;
- URL-owned buy/connect/details/progress sheet state;
- global domain sheet mounting;
- typed form context and focused content components;
- bounded table with explicit empty/loading/status/action ownership;
- query-owned persistence and package-owned providers;
- job-owned registrar/Vercel/refund/reconciliation effects;
- normalized registrar lifecycle states that never treat unknown as active;
- durable callback restoration, Vercel DNS challenge display and refund event
  visibility;
- owner/admin API and mobile route protection;
- mobile flat keyboard-safe workflow and focused QA guard;
- signup custom-domain retirement.

Intentional launch deferrals:

- automatic renewal charging, renewal action and transfer initiation;
- Openprovider webhook ingestion, because scheduled provider reconciliation is
  the implemented source-independent recovery contract;
- table virtualization, infinite pagination, selection and bulk actions,
  because one primary domain per Store keeps the portfolio bounded.

Validation blockers:

- authenticated dashboard QA: the dashboard and local database start
  successfully, but the available headless browser runtime cannot reach the
  host-bound development server;
- production/remote schema push: elevated shared-database write denied;
- Android emulator QA and live provider canaries: not run.

Validated source:

- 41 focused domain tests pass;
- Prisma migration `20260724174525_managed_domains` was generated/applied
  locally; schema push and migrate-deploy report no pending changes;
- domains, DB, jobs, API, dashboard and mobile TypeScript pass;
- targeted Biome and mobile domain/NativeWind/keyboard guards pass;
- the repository-wide suite has 251 passing tests and four unrelated existing
  Retail Ops fixture failures, so it is not claimed fully green.
