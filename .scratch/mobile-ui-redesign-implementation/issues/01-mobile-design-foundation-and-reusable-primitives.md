# 01 — Mobile Design Foundation And Reusable Primitives

**What to build:** a redesign foundation for the mobile app so all later screens share the same visual language, interaction behavior, and accessibility baseline. This includes theme tokens, light/dark color roles, typography/spacing/radius rules, shared buttons, icon buttons, pressables, chips, status badges, inputs, OTP input, quantity stepper, empty states, banners, timeline rows, and keyboard-safe/floating-sheet primitives.

**Blocked by:** None — can start immediately.

**Status:** implementation-complete

- [x] The mobile app has a documented light/dark token system aligned with the redesign spec and reference study.
- [x] Shared action, input, status, quantity, banner, empty-state, timeline, and sheet primitives are available for later screen tickets.
- [x] Pressable and button primitives provide consistent haptic/press feedback and disabled/loading behavior.
- [x] Input-heavy primitives support keyboard-safe usage inside screens and floating bottom sheets.
- [x] NativeWind usage rules are preserved, with no unnecessary `className` plus `style` mixing in redesigned primitives.
- [x] Visual and accessibility checks cover contrast, tap targets, text fit, and light/dark state basics.

## Implementation Notes

- Added a documented mobile design foundation module for semantic color roles, core mobile primitives, icon defaults, and layout/tap target rules.
- Rebalanced the light and dark mobile theme away from the old orange action accent toward the redesign's calm operational teal/green system while preserving amber for attention states.
- Added reusable `StatusBadge`, `StatusBanner`, `EmptyState`, and `TimelineRow` primitives on top of the existing haptic action/pressable and floating-sheet foundations.
- Added `qa:design-foundation` and included it in the mobile MVP source QA runner so later redesign tickets cannot drift away from the shared foundation.
