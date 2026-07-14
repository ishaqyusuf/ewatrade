# Spec: Mobile Navigation And Home Screen System

Status: ready-for-agent
Source map: [Wayfinder: Mobile Navigation And Home Screen System](map.md)

## Problem Statement

The current EwaTrade mobile dashboard puts too many operational surfaces on one screen. Navigation, quick actions, bottom sheets, forms, CTAs, theme testing, and role-specific workflows compete for attention. Admin users and sales reps need different home experiences, but the current shell treats the dashboard as one broad surface.

The next mobile implementation should plan and ship a cleaner home/navigation system before continuing broad screen work. Admin users should get a business-control home and simplified bottom navigation. Sales reps should get a task-first home focused on selling, session work, assigned stock, sync status, and closeout. Long forms should move out of cramped bottom sheets into full-screen stack modals, and form inputs should reuse the stable login/signup input foundation.

## Solution

Introduce a role-aware mobile navigation and home-screen system using Expo Router `Stack.Protected`. Keep one shared design-system vocabulary, but split admin and sales-rep route access, home hierarchy, and secondary navigation. Use Design 01 from the mobile design-system playground as the first visual reference for the admin home and bottom tab language.

The admin bottom navigation should be:

- Home
- Sales
- +
- Stocks
- More

The `More` destination should open an icon-list navigation surface with:

- Sales Reps
- Customers
- Settings
- Theme

The central `+` should open a compact action picker for common creation/operation actions rather than forcing every action onto the home screen.

Bottom sheets should remain for short, focused actions. Any workflow with more than half-screen content, multiple sections, heavy keyboard input, or multi-step review should use a full-screen stack modal. Primary CTAs should be sticky or consistently placed near the bottom of the modal/sheet, secondary actions should be visibly subordinate, and destructive actions should require confirmation.

The floating theme FAB should become development/testing-only. Theme selection for normal users should live in the `More` list or settings path.

## User Stories

1. As an admin, I want a cleaner home screen, so that I can understand the business without scrolling through every operation.
2. As an admin, I want bottom tabs for Home, Sales, Add, Stocks, and More, so that the highest-frequency areas are always reachable.
3. As an admin, I want More to list Sales Reps, Customers, Settings, and Theme with icons, so that secondary tools are discoverable without crowding the bottom tab bar.
4. As an admin, I want the `+` action to show a focused action picker, so that create/record actions are grouped intentionally.
5. As a sales rep, I want a different home screen from admin users, so that my day starts with selling, session, stock, sync, and closeout work.
6. As a sales rep, I do not want admin tools on my home screen, so that I can move faster and avoid accidental management actions.
7. As a user filling a longer form, I want it on a full-screen modal, so that keyboard-heavy workflows are readable and complete.
8. As a user filling a short operation form, I want it in a bottom sheet, so that quick tasks remain fast.
9. As a developer, I want one shared input/form foundation, so that forms do not drift across auth, dashboard, sheets, and modals.
10. As a QA reviewer, I want role-routing, bottom-tab, modal, form, and dev-only theme behavior checked, so that navigation cleanup does not regress core Retail Ops workflows.

## Implementation Decisions

- Admin and sales-rep surfaces should be separated with Expo Router `Stack.Protected`.
- Shared primitives should remain shared; role separation is route and composition level, not a forked design system.
- Admin home should use Design 01 as the first visual reference, including its bottom-tab feel.
- Admin bottom tabs are fixed to `Home | Sales | + | Stocks | More` for the first pass.
- `More` is an icon-list navigation surface for Sales Reps, Customers, Settings, and Theme.
- The normal floating theme FAB should be removed from production-facing UI and kept only for development/UI testing.
- Sales-rep home should emphasize current session, quick sale, assigned stock, recent sales, customer lookup, offline/sync status, and end-of-shift/closeout.
- Bottom sheets should be reserved for short focused flows.
- Forms or content larger than half the screen should become full-screen stack modals.
- Full-screen modal forms should own their header, body, keyboard-safe scroll, sticky CTA area, validation, loading, and success/error states.
- Forms should reuse the login/signup input foundation and avoid creating new local input styles.
- Remove unnecessary nested card/border wrappers from form bodies; use grouping, spacing, labels, dividers, and clear CTAs instead.
- Domain behavior, API contracts, sync behavior, auth provider semantics, and subscription rules are unchanged.

## Testing Decisions

- Add or update source QA checks for role-protected route declarations, admin tab labels, More list labels, dev-only theme FAB behavior, modal route usage, and shared input reuse.
- Use focused unit/source tests where possible for route metadata and navigation item builders.
- Use Expo/emulator visual QA for admin home, sales-rep home, More list, central action picker, and at least one full-screen modal migrated from a large sheet.
- Check light and dark mode.
- Check compact phone text fit, sticky CTA visibility, and keyboard-open behavior for modal forms.
- Check that sales-rep role does not see admin-only navigation items.
- Check that admin role can still reach Sales, Stocks, Sales Reps, Customers, Settings, and Theme.

## Out Of Scope

- Changing database schema, API contracts, Retail Ops sync semantics, billing/subscription rules, or auth provider behavior.
- Rebuilding every mobile screen in this pass.
- Replacing the entire mobile design system.
- Making the floating theme FAB a normal production control.
- Shipping role-specific permissions beyond existing app role semantics.

## Implementation Tickets

Published under `.scratch/mobile-navigation-home-system-implementation/issues/`.
