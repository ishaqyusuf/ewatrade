# Market Day Login And Onboarding Implementation Contract

## Source Of Truth

- Selected direction: `A - Market Day`
- Production feature contract:
  `.brain/features/mobile-auth-onboarding-market-day.md`
- Durable decision:
  `.brain/decisions/ADR-0040-market-day-mobile-entry-experience.md`

## Required Behavior

- Login keeps email OTP, Google, QA entry, theme, and sign-up behavior. The
  separate Customer History path was later retired by ADR-0041 in favor of
  common Login plus server-owned Access Profile routing.
- The palm canopy paints through the status-bar safe area with light system
  icons.
- Onboarding keeps three pages, Skip, progress, completion persistence, and
  login routing. Under ADR-0041 it remains a retained Business-orientation
  presentation, not an unauthenticated cold-launch identity gate.
- Both screens remain scrollable, keyboard-safe, theme-aware, and compatible
  with the shared adaptive large-text policy.

## Acceptance

- Light and Dark default-scale visual review.
- Login enlarged-text and status-bar evidence.
- Onboarding pages 1-3 visible and actionable.
- Continue advances exactly one page; final Continue persists completion and
  replaces the route with Login.
- Focused auth, onboarding, large-text, theme, NativeWind, formatting, and diff
  checks pass.
