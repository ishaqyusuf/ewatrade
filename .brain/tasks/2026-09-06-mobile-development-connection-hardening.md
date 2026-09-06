# Task: Mobile Development Connection Hardening

## Status

Done

## Priority

High

## Created Date

2026-09-06

## Last Updated

2026-09-06

## Global Ticket

- Ticket Position: 1/1

## Source Context

Android development repeatedly presented `Development server unavailable` in
the QA authorization sheet. The reproduced failure had two independent runtime
causes: the selected emulator had Metro port `3096` reversed but not API port
`3095`, and the process listening on `3095` was an EwaTrade API instance started
on 2026-08-25 whose tRPC tree did not contain `qaAccess.capability`. The mobile
client also classified every capability-query error as a network outage, hiding
the stale/mismatched API condition.

## Implementation Progress

- Completion: 100%
- Current Checklist: 8/8 — Review, document, and commit the focused fix
- Blockers: None

## Scope

- Provide one deterministic Android development connection command.
- Require an explicit device when multiple Android transports are online.
- Install and verify reverse mappings for API `3095` and Metro `3096`.
- Probe Metro, API health, and the QA capability contract with actionable,
  distinct diagnostics.
- Restart only the selected development client and attach it directly to the
  verified Metro URL after the probes pass.
- Verify the fix on the isolated EwaTrade emulator without touching devices
  owned by other work.
- Document the runbook and durable failure classification.

## Implementation Checklist

- [x] Reproduce and separate transport, reverse-port, and API-contract failures.
- [x] Add failing fixtures for device selection, reverse mappings, and endpoint
  classification.
- [x] Implement the Android development connection command.
- [x] Wire a discoverable package command with safe, actionable output.
- [x] Preserve distinct network, stale-API, and QA-configuration diagnostics.
- [x] Run focused source and fixture checks.
- [x] Verify a fresh API/Metro session on the isolated emulator and archive
  screenshot evidence.
- [x] Review the diff, update Brain documentation, and commit the focused fix.

## Acceptance

- The command never silently chooses between multiple online devices.
- The selected device reports both `tcp:3095` and `tcp:3096` reverse mappings.
- A missing/stale `qaAccess.capability` route is not reported as a generic
  development-server outage.
- The app reaches the local development API on the isolated Android emulator.
- Re-running the command does not leave the selected app in the Expo launcher
  or race an existing Fabric surface during Metro attachment.

## Validation Evidence

- `bun test apps/mobile/scripts/prepare-android-dev.test.ts`: 8 tests / 13
  expectations passed.
- `bun --cwd apps/mobile qa:android-ready-fixtures`: passed.
- `bun run mobile:android:connect --device emulator-5556`: API health, Metro,
  and both reverse mappings passed.
- `bun run mobile:android:connect --device emulator-5556 --require-qa`: failed
  as designed with the separate QA-configuration diagnostic.
- Native screenshot:
  `.scratch/mobile-architecture-hardening-and-feature-completion/screenshots/runtime-failures/2026-09-06-android-connection/01-connected-local-qa-disabled.png`.
- Staged-diff review found and corrected one classification gap so server
  `upgrade_required` and `environment_not_allowed` states remain distinct from
  missing QA configuration. No unresolved focused findings remain.
- Focused implementation commit: `62c18178`.
- The follow-up attachment hardening force-stops only the selected package,
  opens the encoded local Metro development-client URL, and was verified on
  `emulator-5556` while leaving `emulator-5554` untouched.
