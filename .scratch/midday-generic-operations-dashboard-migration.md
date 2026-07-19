# Midday Generic Operations Dashboard Migration Contract

Status: implemented in source; behavior validation deferred to the separate
testing goal.

## Reference Compared

Target:

- `apps/dashboard/src/app/(shell)/catalog/page.tsx`
- `apps/dashboard/src/app/(shell)/inventory/page.tsx`
- `apps/dashboard/src/app/(shell)/sales/page.tsx`
- `apps/dashboard/src/app/(shell)/services/page.tsx`
- current Catalog, Inventory, Orders, and Service Work client components
- current tRPC schemas, routers, and Prisma query modules for those domains

Midday source of truth:

- invoices route, header, open-sheet control, search/filter, sheet shell,
  content router, form context, URL hooks, domain table, columns, table header,
  actions menu, bottom bar, skeleton, and empty states
- Midday feature-flow, dashboard-table, state/routing, API/DB/jobs, and package
  boundary references

## Migration Principle

Use the Midday invoices workspace as the structural analogue. Adapt its thin
server routes, hydration, URL-addressable workspace state, domain-owned tables,
dedicated sheet shells, focused forms, and exact query invalidation to
EwaTrade's Catalog, Inventory, Orders, and Service Work meanings.

## Filesystem Plan

- Keep route entrypoints under `app/(shell)` and make them compositional.
- Put navigable sheet/filter state in domain hooks under `src/hooks`.
- Put domain tables under `src/components/tables/<domain>/`.
- Put sheet ownership under `src/components/sheets/`.
- Put mutation-heavy forms/workspaces under focused domain component folders.
- Retire the monolithic dashboard page components after their responsibilities
  have moved.

## Route/Page Plan

- Export metadata.
- Authenticate and resolve tenant/store on the server.
- Prefetch each route's primary queries.
- Render data sections through `HydrateClient` and `Suspense`.
- Keep headers, tables, sheets, summaries, and requests composition outside the
  route.

## Header And Open Button Plan

- Each workspace receives a focused header.
- Search and filters update URL state.
- Create/operation buttons open the matching URL-addressable sheet.
- Mobile-width header actions remain usable without duplicating controls.

## Sheet Plan

- Catalog create, Inventory operation, Order create, Service Intake, Request
  Form, Quote, Job Workspace, and Unit Configuration are dedicated sheets.
- Close clears only that domain's URL parameters.
- Forms reset on a new create session.
- Successful mutations invalidate exact affected query keys before close.

## Form-To-Sheet Plan

- Move Inventory operation state to an Inventory operation form.
- Move Order creation state to an Order form.
- Split Service Intake, Request Form, Quote, and Job Workspace out of the
  Service page.
- Keep optional Service timing/instructions/priority behind explicit reveal.

## Filter/Search/URL State Plan

- Catalog: `catalogQuery`, `catalogKind`, `catalogItem`, `productUnits`.
- Inventory: `inventoryQuery`, `inventoryOperation`.
- Orders: `orderQuery`, `orderSheet`.
- Service Work: `serviceQuery`, `serviceSheet`, `jobId`, `requestId`.
- Search survives refresh and sheet selection is bookmarkable.

## Table Plan

- Domain tables own their columns, loading, empty, and no-results states.
- Stable row identifiers and row actions are explicit.
- Current result sets are bounded by server limits; infinite virtualization is
  intentionally omitted until the APIs expose cursor responses. This omission
  does not permit unbounded reads.

## Columns And Row Actions Plan

- Catalog: item, kind, price, stock, status, unit configuration.
- Inventory: Product, balance meaning, exact on-hand/reserved/available,
  custody.
- Orders: order number, customer/items, total, state.
- Service Work: order, work lines, priority/assignment, due promise, summary.
- Interactive controls stop row navigation where both are present.

## Bottom Bar / Bulk Actions Plan

No destructive or domain-safe bulk action is part of the approved contracts.
Selection and a bottom bar are intentionally omitted until a concrete bulk
operation is approved.

## API/Data Plan

- Reuse explicit Zod schemas, protected procedures, tenant/store authorization,
  Prisma query modules, exact decimal strings, and immutable snapshots.
- UI performs no database access.
- Mutations invalidate exact Catalog, Inventory, Orders, Service Queue, Job,
  Request Form, and Request query keys.

## Testing And QA Plan

- Run dashboard and root static typechecks, Prisma generation, source guards,
  and `git diff --check`.
- Browser/device behavior and visual QA remain outside this goal by explicit
  owner instruction and must be performed in the separate testing goal.

## Open Questions

None. The accepted ADRs and specifications resolve the architecture and product
semantics.

## Implemented Result

- Catalog, Inventory, Orders, Service Work, and Reports routes are thin
  authenticated server compositions with metadata, typed server prefetch,
  hydration, Suspense loading states, and route-scoped recovery states.
- Search, filters, selected records, and open workspace sheets are URL-backed.
- Domain tables own columns plus loading, empty, and no-result states.
- Catalog Unit Configuration, Inventory Operations, Order creation, Service
  Intake, Requests, Quotes, and Job Workspaces use focused sheet/form modules.
- Successful mutations invalidate exact domain query keys.
- Bulk selection remains omitted because no approved safe bulk operation
  exists; cursor virtualization remains omitted because reads are explicitly
  bounded and do not expose cursor contracts.
