# Task: Mobile Metro Bundle Timeout Regression

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

The isolated Android development client still reaches a native
`java.net.SocketTimeoutException` error page while loading the Metro project,
even after `bun run mobile:android:connect --device emulator-5556` reports that
Metro, API health, and both reverse mappings are ready. This blocks fresh
screen-by-screen emulator evidence and is a regression beyond the completed
connection-readiness hardening in
`2026-09-06-mobile-development-connection-hardening.md`.

## Implementation Progress

- Completion: 100%
- Current Checklist: 8/8 — Commit the verified fix on the current branch
- Blockers: None

## Implementation Checklist

- [x] Reproduce the exact development-client bundle timeout with an agent-runnable loop.
- [x] Minimize the failing scenario and preserve the red signal.
- [x] Rank falsifiable hypotheses and run one-variable probes.
- [x] Add a failing regression check at the closest correct seam.
- [x] Implement the root-cause fix without disturbing other emulators.
- [x] Run focused tests and repeated Android connection/runtime verification.
- [x] Review the focused diff and update Brain/runbook evidence.
- [x] Commit the verified fix on the current branch.

## Validation Evidence

- Initial observed failure: `emulator-5556` displayed “There was a problem
  loading the project” with `java.net.SocketTimeoutException: timeout` after the
  existing connection command reported Metro and API ready.
- Red-capable loop: launch the route-prefixed `exp+ewatrade` development-client
  URL, poll the Android accessibility tree, and fail on the exact native timeout
  text. It reproduced the timeout at the second five-second poll.
- Minimal differential: the root Metro manifest responds `200` in about 0.28s,
  and its Android bundle responds `200` in about 0.21s from the warm cache. The
  same server queried at `/--/design-system/business-home-market-ledger` returns
  `500` in about 2.43s and attempts a web/static render that imports unsupported
  React Native internals. Root development-client attachment mounts the React
  Native login surface; adding the route to the embedded project URL is the
  load-bearing failure condition.
- Confirmed native-link differential: after the root development client was
  mounted, `ewatrade-dev://business-home-market-ledger?state=attendant&theme=light`
  routed immediately to the attendant Market Ledger surface through the app's
  existing native-intent resolver. The project stayed attached to Metro and the
  timeout did not recur. The invalid `/--/` project URL and the valid app URL
  therefore exercise different layers; only the invalid project URL reloads
  Metro at a route path.
- Root cause: an Expo Go-style `/--/route` was incorrectly embedded in the
  development-client project's `url=` query parameter. That path is not an
  Android app deep link. Metro treats it as a web/static document request,
  reaches an unsupported React Native web import, and the development client
  eventually reports a misleading native socket timeout.
- Regression seam: `mobile:android:open` validates an app-specific native URL,
  requires an explicitly selected online device with the EwaTrade project
  already resumed, shell-quotes query separators, and launches a BROWSABLE
  intent without force-stopping or reattaching Metro. It rejects development
  client, mismatched-scheme, and `/--/` route URLs before ADB can act.
- TDD evidence: the new launcher test first failed because its module did not
  exist, then exposed Android 14's `topResumedActivity` label, then reproduced
  ADB remote-shell splitting at `&theme=dark`. All three behaviors are now
  covered and pass.
- First review correction: the launcher now requires `--device` (or an explicit
  `ANDROID_SERIAL`) even when only one transport is online, and it verifies the
  global `ewatrade-react-root` marker from Android's accessibility hierarchy.
  A resumed Expo launcher, loading view, or error activity can no longer be
  mistaken for a mounted EwaTrade React Native project.
- Shared ADB device parsing, selection, argument, binary-path, and process
  helpers live in `android-adb-cli.mjs`; both connection commands use the same
  implementation.
- Focused verification: 15 tests / 42 expectations pass across the connection,
  native-route, and Market Ledger resolver suites. Biome passes for the shared
  helper, both connection scripts, the launcher test, and the root marker.
- Repeated Android verification on isolated `emulator-5556`: a fresh
  `mobile:android:connect` passed Metro, API, and both reverse mappings; an
  immediate route attempt correctly refused before the React root mounted; the
  same command then opened Light and Dark attendant URLs after the marker
  appeared. The final hierarchy contained `ewatrade-react-root`, “Good morning,
  Alexandria.”, and “Complete daily closeout”, with no timeout text.
- Two-axis review: the first spec pass found that resumed activity alone did not
  prove React Native had mounted and that explicit device selection was not yet
  enforced; the standards pass also found duplicated ADB helpers. The corrected
  second passes report zero remaining spec, scope, standards, or smell findings.
