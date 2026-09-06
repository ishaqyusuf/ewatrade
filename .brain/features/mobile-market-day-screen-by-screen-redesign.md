# Mobile Market Day Screen-By-Screen Redesign

## Status

In progress from 2026-09-01. The Startup Splash Refresh-rich `Market Pulse`
source correction was implemented on 2026-09-04 after an audit found that its
rich React handoff was scoped to `/` and could be bypassed by cold deep links.
Fresh EAS Preview v6 cold-launch QA verifies the native splash gate and rich
handoff in Light and Dark. Staff Onboarding Option A, `Market Nameplate`, also
passes its full native acceptance matrix. App Lock Option E, `Quiet Seal`, is
implemented and has completed native visual and accessibility validation, so
nine of 38 active screen packages are fully implemented and re-verified
(23.7%). Business Home Option A, `Market Ledger`, is implemented and passes its
native state, theme, 100%/200% text, status-bar, navigation, source, bundle and
two-axis review gates. Sales rep Home now implements owner-approved Option A,
`Shift Ledger`, and passes its truthful-data, state, theme, 100%/200%, scroll,
accessibility, source, bundle, and two-axis review gates.

## Purpose

Complete ẸwáTrade mobile one production screen at a time with a recorded native
baseline, five distinct Design HTML directions, selected design, production
implementation, and exact functional and visual QA evidence.

## Program Source Of Truth

The working program, queue, percentages, decisions, and evidence contract live
under `.scratch/mobile-architecture-hardening-and-feature-completion/`.

The existing `mobile-ui-screen-audit.md` remains valuable historical evidence,
but its earlier completion status does not automatically satisfy this new,
color-forward redesign program.

## Product Contract

- Market Day is the entry-system anchor, not permission to paste the login
  composition onto every operational screen.
- Each screen spends visual boldness in one purposeful place and keeps daily
  work scan-friendly.
- Five options differ in hierarchy and composition, not only palette.
- Each five-option batch ships with a top-right in-page selector. Codex may rank
  and recommend options, but must pause before implementation until the owner
  explicitly approves one or asks for replacement directions.
- Screen behavior, permissions, data meaning, offline policy, and server-owned
  rules remain unchanged unless a separately documented product defect is
  discovered.
- Shared semantic Light/Dark tokens and native primitives are preferred over
  screen-local theme systems.
- A screen is complete only after emulator evidence and applicable functional,
  keyboard, large-text, theme, state, and accessibility checks pass.

## Current Frontier

- Onboarding, Login, and Sign Up are complete. Sign Up uses the
  owner-approved `Market Stalls` direction across all four steps, keeps search
  in the bottom dock, changes the status-bar surface with the visible scroll
  background, centers Android action and selection labels, and passes focused
  Light/Dark, keyboard, 200% text, theme, and auth-flow checks. Its business
  details step now lets Android `adjustResize` handle its short form instead
  of applying a second full-screen keyboard-aware scroll; iOS retains a modest
  48px input clearance.
- A 2026-09-02 owner report caught the disabled Login CTA label and chevron
  sitting low in the older review board. The canonical HTML package, original
  `.gstack` mirror, and shared native `ActionButton` now center the complete
  label/icon/loading group with Android-safe text metrics. Fresh Login and Sign
  Up Light/Dark evidence passes without submitting either auth action, and the
  focused auth guard locks the corrected composition.
- A 2026-09-02 Onboarding re-audit reconfirmed its five-direction selection,
  three-step behavior, Login redirect, Light/Dark and 200% evidence, and focused
  guards. The development theme control is now hidden from `/onboarding` after
  an older QA capture exposed action overlap. Because this was the original
  combined Login + Onboarding batch, its missing separate native pre-design
  Onboarding frame is recorded as a non-repeatable historical exception.
- `ẸwáTrade` is the canonical user-facing brand spelling (`Ẹ wá`, “come”);
  domains, package ids, URL schemes, and code identifiers remain ASCII-safe.
- Startup Splash Refresh-rich Option A, `Market Pulse`, remains owner-approved.
  The native palm gate fills the status bar, uses the marigold doorway mark, and
  replaces the installed white-centered legacy gate after the next native
  rebuild. The rich handoff is now owned by the root launch lifecycle, waits
  for its first layout before hiding the native gate, and cannot be bypassed by
  an initial route or cold deep link. Its approved pulse composition is cleanly
  captured in Light and Dark; the Light footer uses deep green on cream and the
  Dark footer uses cream on deep green. Production and Preview use the approved
  1,400 ms minimum while local development alone uses a 4,000 ms review hold.
  Fresh EAS Preview v6 cold launches verify the native palm-and-doorway gate
  and rich React transition in Light and Dark without a white frame.
- Verify Email / OTP implements the owner-approved Option A, `Market Tally`.
  The native screen carries palm through the status bar, bridges into the
  canvas with a notched tally ticket, and uses a continuous 3×4 ledger keypad
  with marigold Paste and paprika Delete actions. Light/Dark runtime evidence,
  partial-entry progression, Delete recovery, auth behavior guards, theme,
  NativeWind, keyboard, large-text, formatting, and diff checks pass. No OTP
  was requested or verified during QA.
- Customer History Login is superseded by the unified-login Access Profile
  architecture in [ADR-0041](../decisions/ADR-0041-unified-mobile-login-profile-entry.md).
  Its archived five-direction board remains historical evidence only; there is
  no route to redesign or approve. Staff Onboarding now has its five-direction
  owner-review board. Its captured emulator route correctly falls back to Login
  without a valid invited-staff session, so the review board records the exact
  existing invitation data and action contract while marking the authenticated
  invite-profile baseline as data-gated. The owner approved Option A,
  `Market Nameplate`, on 2026-09-04. The completed implementation preserves the
  invitation and activation behavior, keeps the shared CTA content group
  optically centered in every state, uses native Android resize at standard
  text, and adds only 12px of focused-field clearance at 200% text. Light/Dark,
  100%/200%, both-input keyboard, disabled, loading, error, action reachability,
  source, regression, formatting, and Android export checks pass.
- App Lock retains its device-local six-digit create, confirm, manage, unlock,
  biometric, lockout, and sign-out reset contract. The real current create-PIN
  surface is captured in Light and Dark, and its five-direction review board is
  preserved with chevron navigation and theme switching. The owner selected
  Option E, `Quiet Seal`, on 2026-09-04. Its paprika status-bar cap, centered
  device seal, calm six-cell rail, linear keypad and device-only note are now
  implemented across setup, confirmation, manage, verification, unlock, error,
  lockout, biometric and recovery states. Native Light/Dark 100% and 200%
  evidence, focused tests, formatting, source-contract validation and Android
  export pass while preserving the existing device-local security contract.
- Business Home preserves the shared `/dashboard` and
  `/(admin-tabs)/admin-home` production surface, owner/attendant visibility,
  Store setup versus operational branches, global search, sync, Business
  switching, central Create, snapshot, recent orders, and persistent navigation.
  Its untouched production-component fixture is archived in Light and Dark.
  Five genuinely different 390 × 844 directions are available through one
  chevron-controlled, theme-switching review board. The owner approved Option
  A, `Market Ledger`, on 2026-09-06 for its direct owner scan and its ability to
  grow from setup into daily operations. Production now uses that ledger from
  first-Store setup through populated operations while preserving real data,
  permissions, offline projections, navigation and recent-order behavior. The
  paprika hero reaches through the status bar; the status bar follows the
  measured background after the hero clears; the dock hides on ordinary
  downward scroll; and full-scale financial values reflow without shrinking.
  Light/Dark, owner/attendant, loading, empty, populated, offline, pending-sync,
  100%/200% text, source, Android export and independent reviews pass.
- Sales Rep Home preserves the existing attendant route, permissions, queries,
  sellability gate, customer book, closeout, sync, Work, order details, personal
  conversations, and offline policy while giving attendants the approved Shift
  Ledger hierarchy. It reports only loaded recent orders and their real loaded
  value, keeps queued work in provisional/sync messaging, and never invents a
  shift time or unauthorized stock quantity. Native Light/Dark, 100%/200%,
  loading, error, disabled, empty, populated, offline, pending-sync, measured
  status-bar transition, dock, accessibility-tree, source, formatting, Android
  export, and independent review gates pass.

## Boundaries

This program does not itself authorize database, API, authentication,
permission, provider, or production-data changes.
