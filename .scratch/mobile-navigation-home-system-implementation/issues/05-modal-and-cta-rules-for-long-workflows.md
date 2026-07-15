# 05 — Modal And CTA Rules For Long Workflows

**What to build:** Oversized bottom-sheet workflows are moved to full-screen stack modals with consistent headers, keyboard-safe layout, and CTA placement.

**Blocked by:** 02 — Admin Home And Bottom Tabs; 04 — Sales-Rep Home Screen.

**Status:** implementation-complete; runtime QA captured

- [x] The app has a documented rule: bottom sheets are for short focused actions; content over half-screen, multi-section, or keyboard-heavy workflows use full-screen stack modals.
- [x] Oversized Sales Reps, business switching, create sale, customer book, rep clock-in, closeout, first product setup, stock intake, product links, reports, subscription, sync status, and unit conversion workflows are migrated to full-screen modal routes.
- [x] Full-screen modal forms have consistent header, scroll body, keyboard safety, sticky primary CTA, secondary action, loading state, and validation state in source.
- [x] Destructive or irreversible actions require an explicit confirmation surface.
- [x] Existing Retail Ops behavior remains unchanged after the modal migration.
- [x] Keyboard-open QA confirms the primary CTA stays reachable for the migrated Sales Reps workflow.
- [x] Source QA verifies modal route registration and guards against reintroducing the migrated workflow as an oversized sheet.

Runtime evidence captured:
- [x] Android emulator hierarchy proof for `/staff-invite-modal` with `Sales reps`, `Add staff`, email input, and `Send invite`.
- [x] Android input-method proof shows `mIsInputViewShown=true` while `Send invite` remains visible in the Sales Reps modal hierarchy.
- [x] Android emulator hierarchy proof for `/stock-intake-modal` with `Record stock`, `Stock intake`, source status, note input, and `Add stock`.
- [x] Android emulator hierarchy proof for `/create-sale-modal` with `FULL-SCREEN WORKFLOW`, `Create sale`, `Select item`, and sale source markers.
- [x] Android emulator hierarchy proof for `/customer-book-modal` with `FULL-SCREEN WORKFLOW`, `Customers`, `Customer book`, source status, and `Find customer`.
- [x] Android emulator screenshot proof for `/sync-status-modal` at `/private/tmp/ewatrade-sync-status-route.png`, showing full-screen route chrome, Online/Offline mode, device, last sync, server history, and queue metrics.
- [x] Android emulator hierarchy proof for `/product-share-modal` with `FULL-SCREEN WORKFLOW`, `Product links`, `Find product`, and `All generated links`.
- [x] Android emulator hierarchy proof for `/unit-conversion-modal` with `FULL-SCREEN WORKFLOW`, `Convert units`, conversion source, and quantity fields.
- [x] Android emulator hierarchy proof for `/business-switch-modal` with `FULL-SCREEN WORKFLOW`, `Businesses`, `Business workspace`, `Your businesses`, and `Add business`.
