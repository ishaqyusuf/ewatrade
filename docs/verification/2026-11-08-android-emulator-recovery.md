# Android emulator recovery and QA setup readiness — 8 November 2026

Owner requested emulator recovery, continued Android checks and coordination.
Android owns the two Maestro flows, More confirmation identifier and this evidence; the sole release
coordinator owns runner source-equivalence changes and deployment. Apple owns
reviewer-signup diagnosis. No worktree or branch switch was used.

## Recovery evidence

Approved emulator-5554 was absent, not merely slow. Emulator-5560 was active with
the same AVD name, initially raising a conservative concern about shared data.
Follow-up `.ini` inspection and the other owner's handback established separate
paths: default `~/.android/avd/AlGhurobaa_API34.avd` versus
`/tmp/channel-filter-avds/AlGhurobaa_API34.avd`. The names alone did not prove a
shared writable backing store; no corruption or causal collision is established.
The other owner stopped its own 5560 after completing testing and explicitly
handed the resource back. This chat did not stop or operate that device.

Started only approved 5554 with the installed emulator's documented `-read-only`
multi-instance option, `-no-snapshot -no-window -no-audio -memory 2048 -cores 2
-gpu host -feature -Vulkan`. Saved AVD data and permissions were preserved;
read-only instance changes are volatile. Initial host swap usage was about 11 GB,
but no memory/GPU root cause was proven. The chosen setup restored responsiveness:
ActivityManager and package lookup each 0.15 s; screenshot 1.22 s; all exit 0.

Private evidence: `/private/tmp/ewatrade-emulator-recovery-20261108/`, including
`emulator.log`, `services.json`, initial and repaired journey logs/artifacts.

## Evidenced test-flow repair

The first full journey exited 1 at the QA-domain field before runtime acceptance.
It entered the Set up QA branch, but saved configuration hydrated before its tap
completed. The failure capture shows ordinary login with Open 4 QA businesses,
not a setup field. This reproduces a harness readiness race, not a failing domain
configuration or authentication result.

The revised setup block accepts the semantic Set up QA / Open N control, waits
for a recognized resulting setup/login/chooser state, enters a domain only when
the actual setup field exists, and opens the chooser only when not already there.
A required bounded QA-domain-options assertion follows every path. No optional
tap, coordinate shortcut or bypass of a missing chooser is introduced. Exact
profile, runtime, catalog, total, cancellation, billing and final identity checks
remain unchanged. Setup changes affect test orchestration; the separate confirmation marker below
is the sole app-source addition. No billing or authentication policy changed.

## Verification boundary

Offline doctor and owned-path plan pass (core mapping, zero unknown paths).
The repaired setup journey passed its recognized chooser condition and exact
build/OTA assertion, expected OWNER, catalog, offering, ₦2,500 checkout total,
draft cancellation and existing closed-checkout billing status. It then failed
the earlier confirmation selector: Maestro resolves Sign out to its leaf text,
so `childOf.containsChild: Cancel` does not target the accessible sibling button.
This actual runtime result supersedes the prior offline matching assumption;
no complete journey pass was earned.

Added only `testID="more-sign-out-confirm"` to the actual confirmation
ActionButton, whose existing Button/Pressable prop forwarding carries the ID.
The handler, styles, dialog title and final login assertion remain unchanged.
The shared sign-out flow now taps that unique ID. No synthetic source test was
added for a one-prop marker; exact native verification needs the coordinated next
Preview candidate. Owned-path fast checks pass **284 tests / 1,813 assertions**, QA tooling types
and changed-file Biome. H01 coverage is unchanged/passes; H02 passes with the
reviewed no-capability-impact record. The initial format-only check failed on the
new impact JSON's array formatting; formatting was corrected before the passing
source run. These checks exclude the coordinator's owned runner edits from the
selected change paths; core tests include its now-committed runner regressions.

Prop-forwarding source evidence: ActionButton spreads remaining props into
Button (`action-button.tsx:119`); Button spreads into the shared Pressable
(`ui/button.tsx:119`), which spreads into React Native BasePressable
(`ui/pressable.tsx:66`). The confirmation identifier therefore follows the
existing native prop path. No compiled/signed acceptance is inferred.
The direct diagnostic uses the full shared flow against existing QA data and
build 35 / Android update `01a1b815-655b-7ef1-9762-6c0e526a3182`, checked onscreen
before and after the journey. It cannot substitute for the canonical candidate
receipt while tracked harness changes are uncommitted and current HEAD differs
from the deployed OTA source. The coordinator owns the next accepted candidate.

No sale/payment submission, fixture, app-data reset or permission grant/revoke.
The current closed-checkout billing-screen assertion is not paid-launch approval.
Paid launch still requires merchant products and signed subscription lifecycle
acceptance; Android 1/8 and Apple's separate 2/6 are not promoted here.

Brain impact: local `.brain/features/mobile-dev-preview-qa-accelerator.md` and
`.brain/tasks/in-progress.md`; no schema/API/entitlement behavior changed.
