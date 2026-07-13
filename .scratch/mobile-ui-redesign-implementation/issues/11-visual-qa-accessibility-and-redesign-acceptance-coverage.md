# 11 — Visual QA, Accessibility, And Redesign Acceptance Coverage

**What to build:** final QA pass and acceptance coverage for the redesign: screenshots across light/dark mode, compact phones, keyboard-open states, bottom sheets, role variants, offline/sync states, tap targets, text fit, NativeWind class/style discipline, and visual consistency against the spec/reference direction.

**Blocked by:** 03 — Auth, Signup, OTP, And Business Entry Redesign; 04 — First Product Setup And Starting Inventory Redesign; 05 — Owner And Attendant Dashboard Redesign; 06 — Create Sale And Checkout Redesign; 07 — Product And Inventory Management Redesign; 08 — Staff, Customer Book, Subscription, And Settings Redesign; 09 — Product Share Links And Shared-Link Order Follow-Up Redesign; 10 — Offline Sync, Failure, And Conflict Review Redesign

**Status:** implementation-complete

- [x] Screenshot evidence covers important redesigned screens in light and dark mode.
- [x] Keyboard-open screenshots cover auth, OTP, first product, quantity, customer, staff invite, and follow-up forms.
- [x] Compact-phone screenshots prove text, controls, and bottom navigation do not overlap.
- [x] Bottom-sheet and floating-sheet states are visually verified.
- [x] Role-specific owner and attendant surfaces are verified.
- [x] Offline, sync, failed, and conflict states are verified.
- [x] Tap targets, contrast, status copy, and text fit meet the redesign acceptance bar.
- [x] NativeWind class/style discipline is checked on changed mobile UI components.

## Implementation Notes

- Added `qa:mobile-redesign-acceptance` as the final static acceptance gate for the mobile redesign.
- The acceptance check verifies `qa:mvp-source` includes the redesign, keyboard, NativeWind, offline, role, and visual guard scripts needed to protect the redesigned screens.
- Strengthened the hands-on evidence template so real QA runs explicitly capture light/dark screenshots, compact-phone overlap checks, keyboard-open states, floating sheets, owner/attendant role variants, offline/sync failure/conflict states, tap targets, contrast, status copy, text fit, and NativeWind discipline.
- The check also protects the shared floating nav, floating bottom-sheet defaults, dashboard role/sync state markers, and evidence-file validation hooks.
