# 02 — Floating App Shell And Role-Aware Navigation

**What to build:** a redesigned global mobile shell with rounded floating bottom navigation, central create-sale/add action, owner/attendant navigation differences, header/context pattern, offline banner placement, notification/profile access, and safe-area behavior in light and dark mode.

**Blocked by:** 01 — Mobile Design Foundation And Reusable Primitives

**Status:** implementation-complete

- [x] The global shell uses the redesigned floating bottom navigation pattern with a clear central create-sale/add action.
- [x] Owner and attendant navigation expose different actions without fragmenting the shared shell components.
- [x] Header and business/account context are visible without crowding the primary workflow.
- [x] Offline banner placement is consistent, visible, and non-blocking.
- [x] Light and dark shell states are visually complete and use shared tokens.
- [x] Safe-area and compact-phone behavior are verified for the shell.

## Implementation Notes

- Added `MobileAppShell` as the shared mobile app frame for dashboard-class screens.
- The shell owns header title, business switch context, safe-area keyboard-aware content, a floating bottom navigation bar, and a central create-sale action.
- Owner-only nav items are filtered inside the shell so attendants keep the same shell without seeing owner inventory controls.
- Dashboard now passes the existing sync banner into the shell, preserving the non-blocking offline/sync placement and existing production/offline QA coverage.
- Added `qa:app-shell` and wired it into the mobile source QA runner.
