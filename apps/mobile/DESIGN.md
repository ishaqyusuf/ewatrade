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

## Green Till (2026 redesign)

The visual system chosen from the mobile quality workshop. Source of truth:
`artifacts/mobile-quality-workshop/DESIGN-SYSTEM.md` (local) and the Brain batch
board (`.brain/tasks/green-till-batch-board.md`).

- **Tokens** (`src/styles/global.css`, `src/lib/green-till-theme.ts`): hero gradient,
  `gold` (same value as the dock's centre accent), `ink`, and five tint pairs
  (`tint-mint`, `tint-amber`, `tint-sky`, `tint-lilac`, `tint-rose`, each with
  `-foreground`). Mint means paid/done, amber owed/offline, rose risk/low stock, sky
  logistics/info, lilac people.
- **Components** (`src/components/mobile/green-till/`):
  - `HeroCard` (hero-card.tsx): the one answer per screen.
  - In kit.tsx: `SectionHeader`, `QuickActionRow`, `AttentionRail`, `ListCard` +
    `RecordRow`, `StatusPill`, `SetupSteps`, `GhostPreview`, `NudgeCard`,
    `ToggleRow`.
  - Auth: `auth-screen.tsx`, `auth-stage.tsx`, `auth-list.tsx`.
- **Restyled shared pieces**: `StatusBanner` (tinted, optional `linkLabel`),
  `ActionButton` `tone="gold" | "cream" | "soft"`, `Switch` (visible off track).
- **Rules**: never mix `className` and inline `style` on one element; money and counts
  use tabular numbers; honest numbers (skeletons, "—" with a reason, "as of" times,
  "Waiting to sync"). Guard: `scripts/check-green-till-kit.mjs`.

### Green Till standard scale (use these, nothing in between)

- **Spacing:** screen gutter 18; 16 between blocks (shell gap); section header 22
  above / 10 below; 14 between stacked cards; card padding 14 (hero 18); row
  vertical padding 12 (min height 62 with avatar); chip gap 8.
- **Radius:** hero 26, list cards 20, tiles and nudges 18, inputs 14, chips full.
- **Type (size/weight):** hero amount 36/800; hero or screen title 22–23/800;
  header business name 17/800; section header 16/800; row title 14/700; body
  13–13.5/400; meta and labels 12; tile label 11.5/700; pill 10.5/700. Money and
  counts use tabular numbers.
- **Controls:** primary buttons 50 tall (64 at large text); quick tiles 54; icon
  buttons 38 with hit slop to 44+; minimum touch target 44.

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
