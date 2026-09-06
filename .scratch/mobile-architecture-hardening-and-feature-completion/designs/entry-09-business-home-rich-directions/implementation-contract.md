# EWA-BIZ-001 Business Home, Option A Implementation Contract

## Approved Direction

Option A, **Market Ledger**, approved by the owner on 2026-09-06.

## Production Surface

- `/dashboard` compatibility redirect.
- `/(admin-tabs)/admin-home` embedded Business Home.
- `OperationsDashboardSurface` remains the behavior owner.
- The deterministic Business Home QA route must compose the same production
  Market Ledger primitives and make no API, database, credential, or mutation
  request.

## Locked Visual Contract

- Paprika Business masthead begins at the top physical screen edge and fills
  the Android status-bar background.
- The masthead contains the owner greeting, Business switch affordance, Store
  name, sync-alert action, and global-search action.
- Once the masthead has fully scrolled above the status bar, the status-bar
  background changes to the Market Day canvas and restores paprika when the
  masthead returns.
- The setup branch reads as one ruled market ledger: date/sync line, explicit
  setup progress, three ordered setup actions, Store facts, then recent orders.
- The operational branch retains the same ledger grammar for inventory/work,
  recent orders, revenue, and available owner/attendant actions.
- Recent-order loading, empty, pending-sync, and populated states stay inside
  the same ruled section rather than returning to a generic rounded card stack.
- The existing floating Business navigation and central Create action remain
  persistent, role-aware, and behaviorally unchanged.

## Locked Market Day Tokens

- Light canvas `#FFF4D6`, field `#FFFAF0`, ink `#17372D`, muted ink `#647168`.
- Dark canvas `#091C19`, field `#13302B`, ink `#FFF4D6`, muted ink `#B7C8BF`.
- Palm `#17684F`, Light paprika `#E94F2F`, Dark paprika `#FF654B`, marigold
  `#FFBD3E` / `#FFCA56`, and sky `#79C8E8` / `#6BB8D7` come from the shared
  `useMarketDayPalette` hook. No screen-local theme fork is allowed.
- Editorial display type is restricted to the greeting, progress fraction,
  and major facts. Operational copy remains in the app body face.
- Rules, numbering, and the empty till seal encode real Store state. They are
  not decorative card chrome.

## Behavior That Must Not Change

- Owner versus attendant visibility and navigation.
- Store setup versus operational overview branching.
- Offline provisional command counts and warnings.
- Loading, empty, pending-sync, populated-order, and disabled action states.
- Business switching, global search, sync status, Catalog, Work, Reports,
  Create, personal-conversation, order-list, and order-detail navigation.
- Product, Service, Customer, Order, Stock Entry, and Staff create eligibility.
- Pull-to-refresh, bottom-tab hide/show behavior, and query ownership.

## Responsive And Accessibility Contract

- Every press target is at least 44 × 44 points.
- Standard text keeps the compact three-column fact ledger.
- At the shared large-text breakpoint, the hero can grow, setup progress stacks,
  fact rows become vertical ledgers, fixed icons top-align with wrapping copy,
  and no essential text is truncated.
- The measured hero height, not a device constant, controls the status-bar color
  transition.
- Light/Dark, 100%/200% system text, compact Android viewport, scroll
  reachability, disabled search, and applicable dashboard states require native
  evidence.

## Validation Seams

- Existing `qa:dashboard-redesign` protects route, role, feature, action, and
  navigation behavior.
- Existing app-shell, large-text, NativeWind, keyboard, and design-system checks
  protect shared mobile contracts.
- A development-only Business Home route provides deterministic native visual
  states through the same production Market Ledger primitives.
- This is a visual translation with no new business algorithm. Existing public
  behavior checks plus native state screenshots are the correct seam; a new
  implementation-detail unit test is not part of this contract.
