# Ewatrade Mobile Design Notes

## Purpose

`apps/mobile` is the Expo starter for Ewatrade's small-business sales and inventory workflows. It should feel fast, calm, and operational: clear cards, strong status cues, thumb-friendly controls, and dense-but-readable information for repeated phone use.

## Current System

- App: `apps/mobile`
- Router: Expo Router under `src/app`
- Tokens: `src/lib/theme.ts` and `src/styles/global.css`
- Styling: NativeWind class names with React Native styles only when needed
- Icons: `@hugeicons/react-native` through `src/components/ui/icon.tsx`
- Common primitives: `Pressable`, `Button`, `Text`, `View`, inputs, switches, tabs, alerts

## Direction

- Use the saved Smart Sales & Order Management mobile reference as inspiration for onboarding, sales status, analytics cards, and quick actions.
- Keep owner-provided source boards in the repository-root `.design/` folder. The internal Design 01 routes load those tracked files through `@design/*`, while emulator review captures live under `.design/qa/`.
- Adapt the visual direction toward inventory custody, sales reps, orders, low-stock alerts, and closeout readiness.
- Keep API/auth placeholders honest until production mobile auth and Retail Ops tRPC procedures are implemented.

## Mobile UI Redesign Foundation

- Use the downloaded mobile UI redesign references in `.scratch/wayfinder-mobile-ui-redesign/assets/reference-pins/` as visual inspiration, translated into an operational Retail Ops app rather than copied literally.
- Prefer a light-first system with a complete dark-mode counterpart: bright app surfaces in light mode, matte black canvas and charcoal cards in dark mode.
- Use deep teal as the primary action and brand role, near-black for floating/navigation structure, green for success or online states, and amber for money, warning, pending, or attention states.
- Keep screens compact and task-focused with rounded cards, pill filters, status chips, timeline rows, haptic actions, and floating bottom sheets.
- Treat input-heavy surfaces as keyboard-safe by default. Reuse `MobileScreen`, `Modal`, `BottomSheetKeyboardAwareScrollView`, `FormField`, and `Input` rather than introducing one-off keyboard behavior.
- Preserve NativeWind discipline: choose `className` or `style` per native element and avoid unnecessary mixing.
- Shared foundation primitives for redesign work live under `src/components/mobile`: `ActionButton`, `EmptyState`, `FormField`, `OtpInput`, `QuantityStepper`, `StatusBadge`, `StatusBanner`, and `TimelineRow`.
- Design 01 commerce previews include navigable Orders, Customers, Customer overview, and Order overview screens. These routes use static typed preview data until the owner approves promotion into production mobile surfaces.
