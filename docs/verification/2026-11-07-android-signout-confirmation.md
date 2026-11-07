# Android Sign out confirmation selector

Resumed after explicit release freeze handback at clean `main` commit
`79fad7564`. Only `.maestro/sign-out.yaml`, this receipt and owned coordination
notes change. No app, authentication, billing, native dependency or deployment
change is included.

## Reproduced failure

The sole coordinator's exact-candidate run on application source `6a4948c8`
failed with the Sign out sheet still open. Its preserved artifact is
`.scratch/qa-release/artifacts/c28628fe-1fe2-4fc4-87a0-7e3d5398707e`, under
`2026-11-07_225422/QA catalog and sale draft`.

The command log proves that `text: Sign out` with `below: Sign out\?` selected
the underlying menu text at `[138,1376][669,1415]`. The captured hierarchy also
contains the actual confirmation button at `[369,1470][682,1557]`, alongside
Cancel. Screen position alone therefore did not distinguish the two actions.
The unchanged login-screen assertion correctly failed after the wrong tap.

A replayed assertion against the recorded tap fails because its direct parent
does not contain Cancel. The proposed selector matches exactly one node in the
same captured hierarchy: the confirmation button. A fresh device hierarchy
before the repair check still showed the open modal and both Sign out labels.

## Repair

The confirmation tap now selects Sign out whose direct parent contains a Cancel
child. The modal-title and final login-screen assertions remain. This uses the
existing action row exposed by the installed app, with no coordinate/index tap,
optional skip, timeout increase or added app test identifier. It also does not
depend on whether the action row is horizontal or vertically stacked.

Maestro documents `childOf` and `containsChild` as direct parent/child selectors:
[relational selectors](https://docs.maestro.dev/reference/selectors/relational-selectors.md).
The menu scroll and all catalog, amount, cancellation, billing and runtime
assertions in the main smoke flow are unchanged.

## Verification and release boundary

- Offline doctor passes; no service or database setup was started.
- Owned-path fast-check plan maps to core with zero unknown paths.
- Captured-hierarchy check: old recorded target rejected; exactly one new
  target, the modal confirmation button, accepted.
- Owned-path fast source check passes **50 tests / 237 assertions**, plus QA
  tooling types. YAML is parsed by the diagnostic generated from the shared flow.
- First device attempt stalled before executing any flow command. The owned
  Maestro process stack shows `DadbInstrumentationSession.startedSuccessfully`
  waiting on Android instrumentation. A bounded ActivityManager inspection also
  timed out; device logs reported application-attach delays of about 22 seconds.
  This is not a selector result. The owned runner was terminated (exit 143),
  with no EwaTrade app-data or permission changes. Attempts to stop only the
  two Maestro driver packages also exceeded their 15-second bounds.
- One retry was capped at 180 seconds and timed out (exit 124) without reaching
  any flow command. Its own process group was terminated; no other emulator or
  app process was terminated by the retry wrapper. Native confirmation therefore
  remains **unverified**. Do not equate the source/captured-tree checks with a
  successful device tap. Private evidence is retained under
  `/private/tmp/ewatrade-signout-confirmation-20261107/`, including the startup
  thread stack, extracted diagnostic, selector evidence and retry exit marker.

The focused device diagnostic is generated from the actual shared confirmation
command and starts at the already-open failure state. It performs ordinary
sign-out only; no fixture, sale/payment submission, app-data reset or permission
change. It is not a full release receipt.

The coordinator's candidate uses build 35, Preview OTA group
`2d7fb5f3-cf65-424d-9a6b-61bd0831f005`, Android update
`01a1b7f9-1b58-73b0-a16b-281b4aac3746`. The release coordinator retains authority
for exact candidate/config matching and the complete `qa:smoke` retry. Existing
sale item label `Add Broiler pricing QA 6 Oct · Day-old` and config hash
`35390ed991445f8cd7787d18231965c6edd449139fbb64660c0b2e31e2543578` are preserved.
Earlier exact-candidate catalog/New sale progress does not establish a passing
full journey. Android paid acceptance remains 1/8; Apple remains separate at 2/6.

Brain impact: local-only `.brain/features/mobile-dev-preview-qa-accelerator.md`
and `.brain/tasks/in-progress.md`; no schema/API/permission behavior changed.
