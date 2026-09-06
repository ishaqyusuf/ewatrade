# EWA-ENTRY-002/003 - Market Day Login And Onboarding

## Decision

Option A, `Market Day`, was selected from five color-forward mobile directions.
It uses a plantain-cream canvas, palm canopy, paprika, marigold, and sky accents
with asymmetric editorial hierarchy and native-sized controls.

The original design was generated as one combined login/onboarding package, so
the backfill keeps both screens together. Future work uses one package per
screen.

## Artifacts

- `comparison.html`: five-direction comparison board.
- `login-options.png` and `onboarding-options.png`: direction sheets.
- `selected-login-mobile.png` and `selected-onboarding-mobile.png`: selected
  Design HTML renders.
- `approved.json`: selected direction and rejected-option rationale.
- `finalized.html` and `finalized.json`: finalized HTML reference.
- `implementation-contract.md`: production and acceptance contract.
- `onboarding-completion-audit-2026-09-02.md`: current evidence audit and the
  explicit historical pre-design-baseline exception.

Native evidence is mirrored under
`../../screenshots/entry-01-login-onboarding-market-day/`.

## Current Status

- Login: complete and native-QA verified in Light and Dark mode with corrected
  `ẸwáTrade` brand spelling and palm status-bar continuity.
- Onboarding: complete and native-QA verified across steps 1-3 and the final
  persisted redirect to Login. A 2026-09-02 re-audit also removed the
  development-only floating theme control from this route after it was found
  overlapping lower actions in older QA captures. The combined first batch did
  not archive a separate native Onboarding frame before design work; that
  historical evidence exception is documented and is not allowed for future
  screens. A 2026-09-06 current-state audit reconciles this retained
  presentation route with ADR-0041: Onboarding is no longer the unauthenticated
  cold-launch gate, and an exact development-only app URL now provides fresh
  Light/Dark and 200% screenshot access without changing production routing.

## 2026-09-02 Button Alignment Correction

An owner screenshot exposed the Login CTA label and trailing chevron sitting
low inside the disabled button. The HTML reference had centered the button box
but still allowed the text and SVG to keep separate baseline metrics. The
canonical scratch board and original `.gstack` review-board mirror now wrap the
label and chevron in one optically centered content group. The shared native
`ActionButton` applies the same group-level treatment to its loading indicator,
leading icon, label, and trailing icon while retaining Android-safe text
metrics.

The before report, Light/Dark HTML after renders, and Android Light/Dark Login
after renders are archived in the matching screenshots directory. Focused
auth, theme, NativeWind, keyboard, large-text, formatting, and diff guards pass.
No login code was requested during QA.

## 2026-09-06 Current Onboarding Evidence

Fresh unobstructed Android frames live under
`../../screenshots/entry-01-login-onboarding-market-day/audit-2026-09-06/`.
They cover all three Light steps, Dark steps 1 and 3, and a Light 200% top and
scrolled pair. The exact development-only URL is
`ewatrade-dev://onboarding-market-day`; production mode and non-exact URLs are
rejected by the resolver.
