# ẸwáTrade Mobile Architecture Hardening And Screen Completion

## Status

Approved and started on 2026-09-01.

- Historical screen packages: 39
- Active screen packages: 38 (the obsolete Customer History Login is superseded)
- Fully complete and re-verified: 10 of 38 (26.3%)
- Design-selected: 10 of 38 (26.3%)
- Implemented to the approved visual contract: 10 of 38 (26.3%)
- In implementation: 0 of 38 (0%)
- In native QA: 0 of 38 (0%)
- Correction required: 0 of 38 (0%)
- Awaiting owner design approval: 1 of 38 (2.6%)
- Baseline captured, directions pending: 0 of 38 (0%)
- Queued: 27 of 38 (71.1%)

`EWA-ENTRY-001` Startup Splash, `EWA-ENTRY-002` Onboarding, `EWA-ENTRY-003`
Login, `EWA-ENTRY-004` Sign Up, and `EWA-ENTRY-005` Verify Email / OTP are
complete. Verify Email now carries approved Option A, `Market Tally`, with a
full-bleed palm status area, tally-ticket code entry, one-handed ledger keypad,
composed Light/Dark themes, and verified partial-entry/Delete behavior. No
verification code was sent during QA.

`EWA-ENTRY-006` Customer History Login is superseded by the implemented
unified-login Access Profile architecture in
`../wayfinder-unified-mobile-login-profile-entry/`. Its review directions remain
archived historical evidence; the separate route, password form, and session
were removed rather than approved for production.

The owner-approved Startup Splash Refresh-rich Option A, `Market Pulse`, uses
a global root gate that waits for the rich React frame to lay out before hiding
the operating-system splash. Source, routing, theme, Light/Dark visual, Android
bundle, and fresh EAS Preview v6 cold-launch checks pass. The isolated Android
recordings prove the generated palm-and-doorway first frame and the final
native-to-rich transition without a white frame.

`EWA-ENTRY-007` Staff Onboarding implements owner-approved Option A, `Market
Nameplate`. Its authenticated invited-profile branch preserves the invitation
and activation contract while adding the palm-through-status hero, reflowing
nameplate, shared fields, and centered marigold action. Isolated Android
Light/Dark, 100%/200%, both-input keyboard, disabled, loading, error, and
lower-action reachability evidence pass without a real activation request.

`EWA-ENTRY-008` App Lock implements owner-approved Option E, `Quiet Seal`.
Its paprika status-bar cap, centered device seal, six-cell rail and linear
keypad preserve create, confirm, manage, unlock, biometric, lockout and reset
behavior. Light/Dark 100% and 200% native evidence, focused checks and Android
export pass.

`EWA-BIZ-001` Business Home implements owner-approved Option A, `Market
Ledger`. The shared owner/attendant surface preserves production data,
permissions, offline projections and navigation while adding the paprika hero,
responsive ledger, background-following status bar and independently scrolling
dock. Native Light/Dark, 100%/200%, setup, operational, loading, offline,
pending-sync and attendant evidence pass.

`EWA-BIZ-003` Orders list implements owner-approved Option A, `Dispatch
Ledger`. Its marigold masthead, truthful loaded summary, numbered order rows,
dynamic status-bar surface and responsive ledger preserve the existing query,
filter, pagination, offline/provisional, first-order and navigation contract.
Native Light/Dark, 100%/200%, populated, first-order, offline/pending and scroll
evidence plus focused source and Android export checks pass.

## Objective

Finish ẸwáTrade mobile one real screen at a time. Every screen must have a
current emulator baseline, five genuinely different Design HTML directions, a
recorded selection, production implementation, and native evidence proving the
screen works in its required states.

## Non-Negotiable Design Loop

1. Resolve the exact production route, component ownership, user job, actions,
   and state matrix.
2. Capture the current Android screen before changing source.
3. Generate five distinct 390x844 mobile HTML directions as one review batch.
   Options must differ in hierarchy, composition, and visual story, not only
   color. The comparison page must expose a top-right selector that switches
   among all options without leaving the page.
4. Rank the directions and recommend the strongest fit for ẸwáTrade, but do not
   select or implement it yet.
5. Pause for owner review. The owner may approve an option, reject the batch,
   or request replacement directions. Only explicit owner approval creates
   `approved.json` and unlocks production implementation.
6. Write the approved screen implementation contract before editing production
   source.
7. Implement with shared semantic Light/Dark tokens and existing native
   primitives. Keep routes thin and behavior unchanged unless the contract
   explicitly requires a product correction.
8. Capture progress screenshots while implementing.
9. Verify the final screen on Android in Light and Dark mode, 100% and 200%
   system text, compact viewport, keyboard/sheet states, and loading, error,
   empty, disabled, stale, or offline states where applicable.
10. Run functional, formatting, source, and focused regression checks.
11. Record evidence, update the ledger and Brain, then advance to the next row.

## Artifact Contract

- `designs/<screen-id>-<slug>/`: current baseline, five-option batch,
  top-right selector comparison board, recommendation, owner approval,
  finalized reference, and implementation contract.
- `screenshots/<screen-id>-<slug>/`: native before, checkpoint, after, theme,
  large-text, keyboard, and state evidence.
- `ui-audit-ledger.md`: authoritative queue and completion percentages.
- `.brain/features/mobile-market-day-screen-by-screen-redesign.md`: durable
  product contract and progress summary.

GStack may render working artifacts under `~/.gstack`, but this scratch is the
canonical project archive. `.designs/mobile-ui-audit` remains the broader native
evidence gallery and links back to the corresponding screen package.

## Completion Rule

A screen counts toward the headline percentage only when all applicable gates
are complete: baseline, five directions, selection, implementation, native QA,
functional checks, visual review, and documentation. Partial screens retain
their exact stage and do not inflate completion.

No future recommendation is treated as approval. The workflow pauses at the
review batch until the owner explicitly chooses an option.

## Frontier

1. Owner reviews the current native Order detail baseline and five Light/Dark
   directions in `designs/entry-12-order-detail-rich-directions/comparison.html`.
2. Owner explicitly selects one direction or requests a replacement batch.
3. Only after approval, freeze the Order detail implementation contract and
   begin production work.
