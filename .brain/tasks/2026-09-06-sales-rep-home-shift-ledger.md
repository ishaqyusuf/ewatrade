# Task: EWA-BIZ-002 Sales Rep Home, Shift Ledger redesign

## Status

Complete

## Canonical Ticket

[Sales Rep Home review package](../../.scratch/mobile-architecture-hardening-and-feature-completion/designs/entry-10-sales-rep-home-rich-directions/README.md)

## Created Date

2026-09-06

## Last Updated

2026-09-06

## Implementation Progress

- Completion: 100%
- Current Checklist: 10/10 — Complete
- Blockers: None

## Implementation Checklist

- [x] Record owner approval for Option A, Shift Ledger.
- [x] Add failing public presentation and native-route checks.
- [x] Build the shared Shift Ledger hero and operational presentation.
- [x] Integrate the attendant branch without changing query or permission ownership.
- [x] Add the deterministic development-only Sales Rep Home route.
- [x] Capture native implementation checkpoints.
- [x] Verify Light/Dark and 100%/200% text.
- [x] Verify loading, disabled, empty, populated, offline, and pending-sync states.
- [x] Run focused regression, source, formatting, and Android export checks.
- [x] Complete two-axis review, documentation, evidence index, and focused commit.

## Acceptance

- Native production and QA surfaces match the approved Shift Ledger hierarchy.
- No fabricated shift time, full-day sales claim, or unauthorized stock total is
  introduced to mimic static design copy.
- Start sale remains dominant and disabled whenever the existing sellability
  contract disables order creation.
- Attendant-only permissions, navigation, offline behavior, and state semantics
  remain intact.
- Light/Dark, 100%/200%, status-bar transition, scroll/dock behavior, and button
  content centering pass native review.

## Completion Evidence

- Deterministic Android Light/Dark, 100%/200%, populated, disabled, offline,
  pending-sync, empty, loading, error, scroll-status, and restored-status frames
  are indexed in the canonical review package.
- Disabled Start sale row and central dock action expose `enabled=false` in the
  native Android accessibility tree.
- Focused presentation, QA-route, and workspace tests pass; dashboard,
  app-shell, large-text, keyboard, NativeWind theme, formatting, and Android
  export gates pass.
- Independent spec and engineering-standards second passes report no remaining
  findings after truthfulness, dark-contrast, and 200%-text corrections.
- Full mobile TypeScript remains inconclusive because the existing repository
  process exhausts its 4 GiB heap without diagnostics; the focused compile-adjacent
  source, test, formatting, runtime, and Android export gates are green.
