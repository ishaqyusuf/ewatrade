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

The earlier `6a4948c8` candidate used build 35, Preview OTA group
`2d7fb5f3-cf65-424d-9a6b-61bd0831f005`, Android update
`01a1b7f9-1b58-73b0-a16b-281b4aac3746`. The release coordinator retains authority
for exact candidate/config matching and the complete `qa:smoke` retry. Existing
sale item label `Add Broiler pricing QA 6 Oct · Day-old` and config hash
`35390ed991445f8cd7787d18231965c6edd449139fbb64660c0b2e31e2543578` are preserved.
Earlier exact-candidate catalog/New sale progress does not establish a passing
full journey. Android paid acceptance remains 1/8; Apple remains separate at 2/6.

Brain impact: local-only `.brain/features/mobile-dev-preview-qa-accelerator.md`
and `.brain/tasks/in-progress.md`; no schema/API/permission behavior changed.


## Coordinated Preview retry — latest handback

The sole coordinator's final handback is clean documentation commit `45969d111`.
It records the normal Preview-only release of source
`3ac9a21759fb428f0e83f5ec8e6d6ae851d96bb1`, after 283 source tests / 1,796 assertions
passed. No new application change was introduced by this reconciliation.

| Candidate fact | Value |
| --- | --- |
| Preview OTA group | `5b0fdf2d-129e-46f2-9b35-90f53ff74f8a` |
| Android update | `01a1b815-655b-7ef1-9762-6c0e526a3182` |
| Existing build/runtime | Build 35 / `0a1cc8debc0d42e5b32ff0455e3b5368ff6fed7e` |
| Config hash | `704ff8bfe528034502901ca4a51b5d82e35a97f6c8dfd10559fbbdee4c403db0` |
| Failed runtime-unverified receipt | `35aa5085-6fc5-4e49-be65-406df9ca8069` |

Coordinator cold-restarted only the approved emulator-5554's same
AlGhurobaa_API34 AVD, preserving user data. Package and ActivityManager services
initially recovered; emulator-5560 remained untouched. The normal release plan
selected only a compatible Preview OTA; Production web/API/jobs `6a4948c8` and
synchronized DB `bf9bc356` remain unchanged.

The full smoke stalled in view-hierarchy transport. Its flushed log shows launch
completed and the initial Sign in/More condition begun; it never reached the
repaired confirmation selector. The coordinator stopped its own test process,
and the executor exited 1 with the failed receipt above. Final package lookup
responded, but ActivityManager and screenshot capture each exceeded 10 seconds.
This does not prove either a passing or failing confirmation selector.

No owned release/test executor remains. Further testing requires concretely
responsive approved Android services, then `qa:smoke` with this exact candidate
and config. Do not redeploy merely to retry, erase data, relax assertions or
substitute an unapproved device. No additional device action was performed in
this documentation reconciliation. Android stays 1/8; Apple's 2/6 and genuine
Preview TEST receiver-only acceptance are unchanged.

The canonical [release receipt](../plans/2026-11-07-full-production-release.md#android-selector-candidate-emulator-acceptance-blocked--7-november-2026)
retains coordinator actions, evidence and limits. This update reconciles existing
evidence; the earlier focused checks and later coordinator source checks are
reused, not claimed as newly executed tests.

Documentation reconciliation checks: offline doctor, owned-path plan (core, zero
unknown paths), local file/anchor links and whitespace pass. No additional device
check or source-suite rerun was performed for this evidence-only update.
