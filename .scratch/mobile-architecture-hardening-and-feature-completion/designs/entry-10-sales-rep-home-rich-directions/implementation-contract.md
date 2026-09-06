# EWA-BIZ-002 Sales Rep Home, Option A Implementation Contract

## Approved Direction

Option A, **Shift Ledger**, approved by the owner on 2026-09-06.

## Production Surface

- `/sales-rep-home` remains the authenticated attendant route.
- `OperationsDashboardSurface` remains the query, permission, offline, and
  navigation owner; a dedicated Shift Ledger presentation is used only when the
  resolved profile is a Sales Rep role.
- A development-only Sales Rep Home QA route must compose the same production
  presentation primitives without API, database, credential, or mutation work.

## Locked Visual Contract

- A marigold masthead begins at the physical screen edge and fills the Android
  status bar, with a paprika rule separating it from the body.
- The masthead keeps Business switching, sync attention, search, the rep's
  greeting, and a concise next-customer cue.
- The body opens with a readiness/sync line, then a dominant circular-ticket
  Start sale action, a three-column recent-work ledger, numbered supporting
  actions, and recent sales.
- The dock remains the existing three-position attendant dock with Start sale
  as the central one-handed action.
- Light uses the warm Market Day canvas; Dark uses the shared deep-palm canvas.
  Rules and rows replace a generic rounded-card stack.

## Truthful Data Translation

- The product has no authoritative clock-in or open-shift timestamp. The UI
  therefore says `Ready to sell` or `Selling needs setup`; it must not invent
  `Shift open · 8:42`.
- Sales Rep roles cannot read the owner inventory balance report. The approved
  `Assigned stock` fact is translated into a real `Sellable catalog` readiness
  fact; no unauthorized or fabricated stock quantity is shown.
- The numeric ledger uses the loaded recent orders and their real value, not a
  claim that the bounded result is the complete calendar-day total.

## Behavior That Must Not Change

- Sellability gating for both the large Start sale row and central dock action.
- Offline provisional order state, pending-sync count, and disabled global
  search while offline.
- Customer book visibility, daily closeout, sync status, Work, Business switch,
  order detail, personal conversations, and pull-to-refresh navigation.
- Owner-only Catalog, Reports, inventory-management, setup, and staff work stays
  absent from the Sales Rep surface.
- Loading, feature-unavailable, empty, populated, offline, pending-sync, and
  disabled-sale states retain truthful feedback.

## Responsive And Accessibility Contract

- Every press target is at least 44 × 44 points.
- Button label/icon groups use the corrected shared vertical centering behavior.
- At the shared large-text breakpoint, the hero, fact ledger, ticket action,
  numbered rows, recent sales, and dock reflow without clipped essential text.
- The measured hero height controls the status-bar transition from marigold to
  the visible canvas during scroll.
- Light/Dark, 100%/200%, scroll reachability, disabled action, offline,
  pending-sync, empty, loading, and populated states require native evidence.

## Validation Seams

- Pure Shift Ledger presentation props are the source/regression seam; existing
  dashboard queries and navigation remain integration-owned.
- Existing dashboard, app-shell, role, feature-availability, large-text,
  NativeWind, keyboard, and Android export checks stay green.
- A native-only `ewatrade-dev://sales-rep-home-shift-ledger?...` resolver exposes
  deterministic states through the safe `mobile:android:open` command.
