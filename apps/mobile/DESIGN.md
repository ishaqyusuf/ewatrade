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

## Motion

Screen changes and content motion follow T3 Code's mobile app (`pingdotgg/t3code`, `apps/mobile`): native transitions for screens, short Reanimated fades for content, and the system Reduce Motion setting respected everywhere.

- Screen transitions stay on the native stack. Do not add JS stack interpolators or shared-element transitions. Choose the animation through the presets in `src/lib/screen-transitions.ts` instead of per-screen `animation` values:
  - `push` (stack default): iOS-style slide on Android; iOS keeps its native push and swipe-back.
  - `modal`: `presentation: "modal"`, sliding up from the bottom on Android; iOS keeps its native modal sheet.
  - `gate`: cross-fade for entry, auth and shell routes reached by `Redirect`, `router.replace` or a `Stack.Protected` guard flip (index, login, sign-up, verify-email, onboarding, staff onboarding, no-access, dashboard, admin tabs, customer shell, sales-rep home).
- Admin bottom tabs cross-fade (180ms ease-out) and switch instantly when Reduce Motion is on.
- Content motion lives in `src/components/ui/motion.tsx` with timing in `src/lib/content-motion.ts`:
  - `RevealItem` + `useFirstReveal(ready)`: a list's first page drifts up and fades in with a capped stagger. Rows mounted later by scrolling or pagination appear without motion.
  - `MotionView`: fades in content that replaces a loading state. Pass `animate={false}` when the data was already cached as the screen opened, so it rides the native push without an extra fade.
  - No exit motion: content leaves with its native screen transition.
- Wrapping adds an `Animated.View`. Do not wrap a root that relies on negative margins (Android drops touches outside the parent's bounds) or one that needs `flex-1`, unless you pass `fill`.

## Loading states

Owner direction L3, 8 October 2026 (concept board: `.brain/artifacts/mobile-screen-transitions-2026-10-07/loading-receipt-concepts.html`). Keep each screen's real chrome visible while it loads (title, filters, labels, tile captions), and draw only the incoming data as placeholders shaped like the real content.

- Use `ListSkeleton` (variants `order`, `item`, `person`, `ledger`), `DetailSkeleton` and `HomeSkeleton` from `src/components/mobile/loading-skeletons.tsx`. For a single figure use `Skeleton` inside `SkeletonGroup` from `src/components/ui/skeleton.tsx`, as metric tiles do with their `loading` prop.
- Every group passes a `label` ("Loading orders"); screen readers hear that instead of the shapes.
- One shared sweep per group, coloured by the theme's `skeleton` and `skeletonHighlight` tokens. It stops under Reduce Motion.
- Do not use a centred "Loading…" card, a spinner banner or plain "Loading…" text for screen content. Small inline progress (an action button's own spinner, "Loading more…" under a paginated list) is fine.

## Receipts

- The receipt screen is a paper preview on a soft canvas (pages swipe sideways, with dots), plus one toolbar: a PDF / Image switch and icon buttons for Save and Share.
- On Android 10+, Save writes straight to `Download/EwaTrade` through the local `DownloadSaver` module, without a folder prompt. Older Android falls back to the system folder picker; iOS uses the share sheet.
- Files are named from the order: `ORD-012 Receipt - Business.pdf`, or `ORD-013 & ORD-012 Receipts - Business.pdf` for groups.
- The receipt document, shared with the dashboard, leads with the business, a PAID / UNPAID tag and the amount due, then the ledger, and ends with a small "Made with ẸwáTrade" footer.
- Show people the fix, not raw native errors: a missing native module asks them to update the app.
