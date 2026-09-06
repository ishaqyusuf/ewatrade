# Mobile Auth And Onboarding — Market Day

## Status

Implemented and runtime-reviewed through Verify Email / OTP on 2026-09-02.

## Purpose

Give ẸwáTrade's Business login and first-run onboarding a distinctive,
mobile-native entry experience instead of a generic responsive-web treatment.
The owner selected the `Market Day` direction from five design options.

## Product Contract

- The login canopy uses palm green, marigold, paprika, sky, and warm cream with
  bold editorial type and simple market-inspired geometry.
- The canopy is full bleed through the device status-bar safe area; system
  status icons remain light on the palm surface.
- The onboarding flow uses the same palette and shape language while keeping
  its three setup tasks, progress, skip action, and primary action immediately
  understandable.
- Light and Dark mode each use semantic Market Day palettes rather than
  hard-coded white/black inversion.
- Login-code, Google sign-in, QA entry, theme switching, and onboarding
  completion behavior remain intact. ADR-0041 intentionally replaced the old
  pre-auth Customer History path and cold-launch onboarding gate with common
  Login plus server-owned Access Profile routing.
- Disabled actions are deliberately quiet. Busy primary actions retain the
  active paprika/on-paprika contrast while blocking duplicate activation.
- Visible product copy uses the canonical `ẸwáTrade` wordmark (`Ẹ wá`,
  “come”); technical identifiers remain unchanged.
- Verify Email continues the entry system with the approved `Market Tally`
  composition: palm status area, recipient capsule, notched six-cell tally
  ticket, continuous 3×4 counter, marigold Paste, and paprika Delete. Existing
  OTP request/verification payloads and routing remain unchanged.

## Accessibility And Responsive Behavior

- The shared screen shell can paint the safe area independently from its
  scrollable canvas, so edge-to-edge color does not compromise content
  scrolling.
- Auth and onboarding remain vertically scrollable and keyboard-aware.
- The established adaptive large-text breakpoint remains authoritative.
  Internal QA actions stack when space is constrained, and normal layout is
  top anchored without source-test-only utility conflicts.
- Primary controls keep at least a 50-point height and preserve the shared
  action primitive's busy, disabled, accessibility-state, icon, and spinner
  behavior.
- Small canopy copy uses a dedicated warm accent for readable contrast on palm;
  paprika buttons use dark ink in Light mode.

## Runtime Evidence

Evidence is stored under
`.designs/mobile-ui-audit/android-2026-09-01/auth-onboarding-market-day/`.
Canonical screen-program evidence is stored under
`.scratch/mobile-architecture-hardening-and-feature-completion/screenshots/`.

- `before/`: untouched Login baseline plus early combined-batch reference
  material. No separate untouched native Onboarding frame was archived; the
  canonical completion audit records that non-repeatable historical exception.
- `checkpoint/`: implementation progress, status-bar correction, compact
  onboarding, Dark mode, and enlarged-text checks.
- `after/login-light-active.png`: final login with a full-bleed status bar.
- `after/onboarding-light.png`: final first onboarding step with its primary
  action visible in the standard Pixel viewport.
- `entry-01-login-onboarding-market-day/android-onboarding-light-step-1.png`
  through `android-onboarding-light-step-3.png`: the complete three-step flow.
- `entry-01-login-onboarding-market-day/android-onboarding-final-login-redirect.png`:
  native proof that `Get started` returns to Login.
- `entry-01-login-onboarding-market-day/audit-2026-09-06/`: fresh current-source
  Light steps 1-3, Dark steps 1 and 3, and Light 200% top/scrolled frames,
  captured through the exact development-only Onboarding QA URL.
- `entry-02-startup-splash-rich-directions/android-native-splash-light.png` and
  `android-native-splash-dark.png`: generated native splash acceptance.
- `entry-02-startup-splash-rich-directions/android-hydrated-splash-light.png`:
  React hydration acceptance with the full Market Gate composition.
- `entry-05-verify-email-otp/after-market-tally-light.png` and
  `after-market-tally-dark.png`: final native Market Tally themes.
- `entry-05-verify-email-otp/checkpoint-market-tally-partial.png`: native
  partial-entry progression; Delete was then verified without submitting digit
  six.
- `entry-05-verify-email-otp/after-market-tally-dark-200-percent.png` and
  `after-market-tally-dark-200-percent-lower.png`: corrected stacked counter
  labels and complete lower-keypad reachability at 200% system text.

## Verification

- `bun --cwd apps/mobile qa:auth-redesign`
- `bun --cwd apps/mobile qa:auth-onboarding`
- `bun --cwd apps/mobile qa:large-text-layout`
- `bun --cwd apps/mobile qa:nativewind-style`
- `bun --cwd apps/mobile qa:theme-colors`
- Android Expo runtime bundle and Pixel emulator inspection
- Android Gradle application assembly and installation
- Independent visual-fidelity and engineering-standards review

The broad `qa:action-primitives` guard still reports the pre-existing raw
`Pressable` in `sale-item-picker.tsx`; the changed auth files use the shared
action primitive. The final scoped mobile TypeScript check passes.

## Boundaries

This is a presentation and shared mobile-shell change. It adds no API,
permission, authentication, database, or migration behavior.

The retained `/onboarding` presentation is not the unauthenticated cold-launch
gate under ADR-0041. Development builds expose only the exact
`ewatrade-dev://onboarding-market-day` URL for deterministic native review; the
resolver returns no route in production.
