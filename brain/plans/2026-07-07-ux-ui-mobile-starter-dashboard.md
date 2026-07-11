# Plan: Mobile Starter Dashboard

## Type
UX/UI

## Status
In Progress

## Created Date
2026-07-07

## Last Updated
2026-07-11

## Intake
- Intake File: brain/intake/2026-07-07-mobile-expo-starter.md
- Intake Item: Add the first owner/manager dashboard screen for the sales and inventory mobile app.

## Goal Or Problem
After onboarding or local sign-in, the mobile app needs a useful starter dashboard that reflects the sales and inventory management product direction rather than a generic copied app screen.

## Current Context
The broader Retail Ops plans cover real sales, inventory, reps, closeout, sync, and reporting. This starter dashboard should not implement those backend workflows yet. It should provide a polished owner/manager overview with local mock data and clear future extension points.

## Proposed Approach
Create a mobile-first dashboard using static/local mock sales and inventory data. Emphasize today metrics, orders, low stock, active reps, sync status, and quick actions. Keep actions as non-destructive placeholders or local navigation targets until backend procedures exist.

## Implementation Steps
- Build `/dashboard` as the authenticated starter home.
- Add metric cards for today's sales, pending orders, low-stock items, and active reps.
- Add a compact sales/order status section inspired by the saved mobile sales/order design direction.
- Add a low-stock or inventory alert list using starter mock data.
- Add quick actions for new sale, add stock, create order, and invite rep as placeholders.
- Add local sign-out access so the local session flow can be tested end to end.
- Use `formatMoney` from `@ewatrade/utils` for currency display.
- Keep dashboard data in a small local module or screen-local constants that can be replaced by tRPC queries later.

## Affected Files Or Areas
- `apps/mobile/src/app/dashboard.tsx`
- `apps/mobile/src/components`
- `apps/mobile/src/data`
- `packages/utils`

## Acceptance Criteria
- Dashboard renders after local login/sign-up.
- Dashboard content is specific to sales and inventory management.
- Currency and counts render consistently.
- Quick actions are visible but do not imply completed backend workflows.
- Sign out clears the local session and returns to login.
- No copied beauty shop sample data or GND operational language remains.

## Test Plan
- Run `rg -n "GND|gnd|prodesk|Guerlain|La Roche|beauty|cosmetic|makeup|e-shop" apps/mobile/src apps/mobile/assets`.
- Run `git diff --check`.
- Manual Expo smoke test: login/sign-up to dashboard, inspect dashboard on phone-sized viewport, sign out.
- Run targeted typecheck if mobile dependencies resolve.

## Brain Update Requirements
- Update progress only unless implementation adds dashboard IA decisions that should be reflected in Retail Ops docs.

## Lower-Agent Readiness
- Implementation scope is clear: Yes
- File boundaries are clear: Yes
- Acceptance criteria are observable: Yes
- Required checks are listed: Yes
- Brain update requirements are listed: Yes
- Ready for handoff: Yes

## Completion Report Requirements
Lower agent must report:
- Changed files
- Checks run
- Brain docs updated
- Unresolved issues
- Any skipped acceptance criteria

## Risks / Edge Cases
- A polished mock dashboard can be mistaken for complete backend functionality; labels and placeholder actions should stay honest.
- Dense cards must remain readable on small phones.

## Open Questions
- None.

## Progress Notes
- 2026-07-10: Replaced the placeholder `/dashboard` with a local Retail Ops starter dashboard covering business header, offline-ready sync banner, first-item setup prompt, sales/inventory/staff metrics, quick actions, low-stock alerts, and recent sales. Replaced copied beauty shop starter products, orders, and categories with Ewatrade retail stock examples and added missing local data types used by the existing starter stores.
- 2026-07-10: Added the first-product setup sheet and local persisted Retail Ops store. The dashboard prompt now opens a keyboard-aware setup form for item name, primary unit, unit price, optional variants, and starting stock, then shows a created inventory summary with pending-sync status.
- 2026-07-10: Wired the New sale quick action to a local create-sale sheet. Local completed sales now appear at the top of Recent sales with payment method, attendant, customer, total, and pending-sync status.
- 2026-07-10: Wired the Add staff quick action to a local invite sheet and added an Attendants dashboard section with pending invite state.
- 2026-07-10: Added a Customer book dashboard section and searchable customer-book sheet powered by locally captured sale customers.
- 2026-07-10: Replaced the static offline-ready banner with a local sync status banner and sheet. The dashboard now shows offline mode, pending sync counts, and the local sync event queue.
- 2026-07-10: Added restock entry points to the inventory summary and dashboard. Stock intake now opens a keyboard-aware sheet, updates local product stock, records stock movements, and shows opening stock, restocks, and sales in the dashboard movement list.
- 2026-07-10: Added the local conversion entry point to the inventory summary. The dashboard can now open a conversion sheet for products with variants, show variant stock buckets, and include conversion movements in the recent stock ledger.
- 2026-07-10: Added a Day closeout dashboard summary and keyboard-aware closeout sheet. The dashboard now shows open sales since the latest closeout, expected cash/transfer totals, latest closeout review/sync status, and a Close day action for payment declarations and closing stock confirmation.
- 2026-07-10: Added a business switch/create entry point to the dashboard header. Dashboard sections and sheets now read the active business context so local products, sales, staff, customers, links, stock movements, closeouts, and sync events are scoped per business.
- 2026-07-10: Added a Rep sessions dashboard card and clock-in flow. The New sale quick action now routes through opening inventory confirmation when the current attendant has not clocked in, and the dashboard shows currently open sessions plus opening variance counts for admin monitoring.
- 2026-07-10: Added a Subscription dashboard card and plan sheet. The dashboard now shows the active local plan, status, and usage for products, staff, and businesses, with Starter, Growth, and Pro tiers available in the plan sheet.
- 2026-07-10: Added a Reports dashboard card and local reports sheet. The dashboard now opens report snapshots for today sales/payment totals, sales by attendant, sales by product/unit, stock balance/current price, stock intake/conversion history, variance, and pending sync visibility.
- 2026-07-10: Added a production API target for the local first-product setup flow. `retailOps.createProduct` can now persist product name, primary unit, price, optional variants, and opening stock once mobile auth/session wiring moves from local store to tRPC calls.
- 2026-07-10: Added production API targets for the local stock intake and conversion flows. `retailOps.recordStockIntake` and `retailOps.recordUnitConversion` can now persist balance changes once mobile sync/tRPC wiring replaces the local-only store.
- 2026-07-10: Added production API targets for the local rep-session and closeout entry points. `retailOps.openSession` and `retailOps.closeSession` can now persist basic session lifecycle, receipt totals, and cash variance once mobile session calls move from local store to tRPC.
- 2026-07-10: Added a production API target for the local Add staff flow. `retailOps.inviteStaff` can now create or refresh invited tenant memberships for cashier/operator/manager staff once the mobile invite sheet moves from local store to tRPC.
- 2026-07-10: Added production API targets for the local Product links flow. `retailOps.productShareLinks`, `retailOps.createProductShareLink`, and `retailOps.deactivateProductShareLink` can now persist generated product link metadata once the mobile share sheet moves from local store to tRPC.
- 2026-07-10: Added public production API targets for the web Product links flow. `retailOps.sharedProduct` can resolve active shared product links for the web page, and `retailOps.createSharedProductOrderRequest` can create pending order requests from the link.
- 2026-07-10: Replaced the Sync sheet's all-local "mark pending events synced" path with first mobile production sync wiring. The sheet now builds supported replay payloads for pending closeouts, customer upserts, product setup, rep session opens, sales, share-link create/deactivate, staff invites, stock intake, and unit conversions, registers the local offline device before replay, sends a stable local offline device id to `retailOps.syncEvents`, stores returned production product/unit/session/share-link/staff membership ids, updates applied/failed/conflict event states, keeps blocked events queued with dependency-wait reasons, persists the latest sync run summary locally, and exposes failed events as retryable "Needs retry" work plus conflicts as review work in the sheet and dashboard banner.
- 2026-07-10: Added dashboard last-sync visibility. When there is no open sync work, the dashboard sync banner now summarizes the latest local sync telemetry status, time, and applied/total counts without requiring the operator to open the sync sheet.
- 2026-07-10: Added server sync-history visibility to the mobile sync sheet. Operators can now see recent production-recorded sync runs for the current offline device, including status and applied/failed/skipped counts, next to the local queue.
- 2026-07-10: Added retry-backoff visibility to the mobile sync sheet. Failed events now show the next retry time when automatic replay is waiting, while the existing retry action still lets the operator move the event back to pending immediately.
- 2026-07-10: Added manager device-management visibility to the mobile sync sheet. When the API permits it, managers can review active and revoked offline devices, revoke non-current devices, and restore revoked devices without leaving the sync surface.
- 2026-07-11: Added manager server-conflict visibility to the mobile sync sheet. When the API permits it, managers can review unacknowledged production conflicts for the current offline device and mark them reviewed from the same sync surface.
- 2026-07-10: Added report-level sync operations visibility to the mobile Reports sheet. The dashboard report flow now shows online/offline mode, the current offline device, latest local sync summary, and pending/retry/review queue counts without requiring managers to open the operational sync controls first.
- 2026-07-10: Added all-link analytics to the mobile Product links sheet. The sheet now summarizes active links, total views, total orders, and product count, then lists every generated link for the active business with share and deactivation controls.
- 2026-07-10: Added protected pending-order visibility to the mobile Product links sheet. When online, the sheet reads `retailOps.sharedLinkOrderRequests` for recent pending shared-link requests and shows customer, order number, product/unit, quantity, and total with offline and unavailable-session fallbacks.
- 2026-07-10: Added shared-link request follow-up actions. The production API now exposes `retailOps.updateSharedLinkOrderRequestStatus`, and the mobile Product links sheet lets permitted users complete or cancel pending link requests after follow-up.
- 2026-07-11: Added compact payment and fulfillment controls to shared-link request follow-up. Pending requests in the mobile Product links sheet now let permitted users choose cash, transfer, or card plus pickup/delivery outcome before completing the request.
- 2026-07-11: Added first protected shared-link delivery-request API bridge. `retailOps.createDeliveryRequest` can create an order-linked delivery request with pickup/dropoff details, and `retailOps.deliveryRequests` lists delivery requests with durable rows first plus order-metadata fallback.
- 2026-07-11: Added first delivery-request status updates. `retailOps.updateDeliveryRequestStatus` can mark a shared-link delivery request assigned, picked up, delivered, or cancelled while recording durable tracking/assignment state when available and order-metadata fallback otherwise.
- 2026-07-10: Added production link performance visibility to the mobile Product links sheet. When online, the sheet now reads `retailOps.productShareLinks`, summarizes synced active links, views, and orders, and lets permitted users share or deactivate production links while keeping local/offline link management available.
- 2026-07-10: Added online production link creation to the mobile Product links sheet. When a selected product has a production id and the device is online, Generate now calls `retailOps.createProductShareLink`, shares the returned production URL, and refreshes production link analytics; unsynced products keep the local/offline link flow.
- 2026-07-10: Added auth-backed customer register/login to the storefront shared-link checkout. Customers now choose new or returning account, submit email/password through Better Auth, and the pending order request stores only the resulting platform customer account metadata.
- 2026-07-11: Aligned the mobile dashboard metric cards with the starter-dashboard acceptance criteria. The top cards now derive today's sales, product-link pending orders, low-stock alert count, and active rep sessions from the active business's local state instead of static sample metrics. The Low stock section now lists real product/unit balances when they fall near the reorder threshold and shows a clean empty state when there are no alerts.
- 2026-07-11: Added a compact manual stock adjustment path to the existing keyboard-aware Record stock sheet. The sheet now supports Restock and Adjust modes, product-unit/variant selection, increase/decrease direction, correction/damage/loss/found-stock reasons, insufficient-stock prevention for decreases, pending-sync movement rows, and local Reports/dashboard labels for Stock adjustment movements.

## Linked Task
- Task Title: Mobile Starter Dashboard
- Task File: brain/tasks/roadmap.md
