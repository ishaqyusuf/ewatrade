# Wayfinder: Mobile Navigation And Home Screen System

## Destination

Create a ready-for-agent implementation spec and ticket set for cleaning up the EwaTrade mobile app home/navigation experience. The first implementation target is a better planned home screen and navigation system: admin and sales-rep homes diverge by role, bottom navigation is simplified, forms and CTAs are deliberately placed, large workflows move to full-screen stack modals, and shared inputs/components replace one-off wrappers.

## Notes

- Planning scope only until the ticket breakdown is approved.
- Primary app surface: `apps/mobile`, Expo Router, React Native, NativeWind, existing Retail Ops mobile flows, and the in-progress design-system playground.
- The first visual reference is Design 01 in the mobile design-system playground, including its home screen and bottom tab language.
- Admin bottom navigation direction from the requester: `Home | Sales | + | Stocks | More`.
- `More` should open an icon list for `Sales Reps`, `Customers`, `Settings`, and `Theme`.
- The floating theme FAB should remain only for UI testing in development mode.
- Admin and sales-rep home screens should be different and role gated with Expo Router `Stack.Protected`.
- Forms or bottom-sheet content larger than half the screen should move to a full stack screen modal.
- Reuse the stable login/signup input style wherever input is needed.
- Reduce excessive card/border wrappers in forms and bottom-sheet content.
- This effort should preserve existing Retail Ops domain behavior, API contracts, offline/sync semantics, and subscription rules.

## Tickets

- [ ] [Audit current mobile navigation, home, and form density](01-audit-current-mobile-navigation-home-and-form-density.md)
- [ ] [Decide protected role navigation and route boundaries](02-decide-protected-role-navigation-and-route-boundaries.md)
- [ ] [Plan admin home screen and bottom navigation](03-plan-admin-home-screen-and-bottom-navigation.md)
- [ ] [Plan sales-rep home screen and task-first navigation](04-plan-sales-rep-home-screen-and-task-first-navigation.md)
- [ ] [Decide sheet, full-screen modal, CTA, and form rules](05-decide-sheet-full-screen-modal-cta-and-form-rules.md)
- [ ] [Assemble implementation tickets and QA gates](06-assemble-implementation-tickets-and-qa-gates.md)

## Decisions so far

- No approved Wayfinder decisions yet.

## Not yet specified

- Exact implementation ticket count and blocking edges.
- Exact Expo Router route group names for admin versus sales-rep surfaces.
- Exact content hierarchy for admin and sales-rep home screens after reviewing current dashboard data.
- Which current bottom sheets must become full-screen modal routes in the first pass.
- Exact QA script names and screenshot evidence requirements.

## Out of scope

- Changing Retail Ops data models, API contracts, sync semantics, subscription rules, auth provider behavior, or billing provider behavior.
- Replacing the entire mobile design system.
- Implementing every Retail Ops screen redesign in this first navigation/home cleanup.
- Making the theme switcher a normal production floating FAB.
