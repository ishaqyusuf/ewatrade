# Physical iPhone control through Device Hub — 9 November 2026

Status: foreground operation and normal UI reactivation verified. Background
coordinate control remains faulty. This is a working operating procedure, not a
repair to the closed-source Computer Use engine or complete Apple acceptance.

## Reproduction and diagnosis

Device Hub displayed the paired physical iPhone over the previously verified
Wi-Fi connection. Coordinate input failed before delivery with
`-10005: noWindowsAvailable`, including on Device Hub's Mac sidebar. A fresh
Calculator window reproduced the same failure, while semantic AX button 9 changed
its display from 0 to 7 and AX Clear returned it to 0. This isolates the symptom from
EwaTrade's UI, iPhone touch handling and the wireless transport.

The narrow red-capable control probe was the documented CUA action
`await refreshedDeviceHub.click([210,310])` on the observed Mac sidebar. Its
failure was caught explicitly; it was not treated as successful input. The
Calculator differential used the observed 7 button at [70,420], against the same
app's successful semantic action. These are recorded local coordinates, not
portable selectors to replay after a window/layout change.

Ranked hypotheses were stale/background window targeting, a stuck native helper,
and a permissions/version mismatch. A normal Activity Monitor **Quit** of the
exact Computer Use helper, followed by successful automatic helper reconnection,
did not repair the Calculator coordinate probe. Rebinding Calculator did not
repair it either. System Settings still showed the existing **Codex Computer
Use** Accessibility and Screen & System Audio Recording switches on. No grants
were changed. Narrow helper/application log inspection did not establish an
internal implementation cause; do not label this a confirmed vendor defect.

Observed versions: ChatGPT 26.1103.41825/build 25679, Computer Use helper
26.1102.1001824/build 1001824, Device Hub 27.2/build 255.31.3. Official
[Computer Use documentation](https://learn.chatgpt.com/docs/computer-use)
describes the two macOS grants and background operation generally; it does not
document or resolve this specific error. That distinction remains explicit.

## Working foreground procedure

The owner brought Device Hub forward on the current Mac desktop and left the
phone unlocked on Home. The same sidebar coordinate call returned successfully.
An agent coordinate tap opened Clock on the actual phone; an agent drag from the
visible home indicator returned it to Home. Neither action required UI Automation.
Private proof: `/private/tmp/ewatrade-devicehub-foreground-tap-2026-11-09.png`.

When focus changed, coordinate input failed again before delivery. Normal Finder
UI provides an agent-operated recovery:

1. Use Finder's Go to Folder for the already-installed
   `/Applications/Xcode.app/Contents/Applications/DeviceHub.app`.
2. Verify that exact application is selected in Finder. Choose **File → Open**
   through its observed accessibility menu. This visibly reactivated Device Hub.
3. Read the current Device Hub screen and locate the intended target again before
   sending input. After a focus loss, reactivate and inspect; do not blind-retry a
   business mutation whose completion is uncertain.

The explicit Finder menu action worked after another focus loss and allowed the
single coverage restoration below. A background keyboard shortcut alone did not
consistently activate it; prefer the observed menu action. This procedure uses
normal documented CUA GUI controls, without shell input injection, AppleScript,
private UI APIs, new phone pairing, changed permissions or a new automation server.
Keep the target app in front during coordinate operations. Background operation
is still unaccepted; this does not promise fully unattended device access.

## Input limits and billing restoration

Tap, Home gesture, app opening and EwaTrade navigation were actually observed.
Device Hub's AX Home/app-grid control returned without a visible Home transition;
the actual home-indicator drag succeeded. Plain text entry into phone search
followed the phone's current Arabic keyboard layout rather than inserting the
requested Latin app name. A paste attempt did not establish literal text entry.
The visible EwaTrade app suggestion was used instead. Reliable arbitrary Unicode
typing, protected credentials, Apple confirmations and background control remain
separate limits; no password/code entry is claimed.

After control recovery, native **More** explicitly showed **EwaTrade Review /
Owner**. Plan & billing showed Free, not enrolled and 0 of 1 owner slots, with Cover
this business available. After normal Finder reactivation, one agent Cover tap
showed pending feedback; there was no second tap. At **17:28:48.083Z /18:28:48.083
Africa/Lagos**, the resulting native screen showed Active Starter, NGN5,000/month,
covered, 1 of 1 owner slots, catalog 0 of 100, staff 0 of 2 and orders 0/no limit. No Apple
checkout, new purchase, Restore, sign-out or business switch occurred.

Private restoration screenshot:
`/private/tmp/ewatrade-coverage-restored-device-2026-11-09.png`, mode0600.
This establishes the displayed normal re-enrollment result, not a fresh transaction
ID or database history-row census. One subsequent full reload in the existing
canonical reviewer Dashboard session also returned a single actual server wrapper
resolved/starter/owner_subscription and normal API-backed Active Starter with the
same business/Store. Its honest observation bound is after 17:28:48.083Z and before
the post-read clock 17:30:23Z. The executor reused accepted b0 runtime evidence;
there was no new deployment, jobs invocation or provider metadata read. The existing
[coverage receipt](2026-11-09-coverage-release-free-reenroll.md) owns the separate
API-backed, actual Settings server and hosted read-only jobs observations.
The original two-minute baseline timing remains inconclusive after correction;
device repair does not convert that estimate into measured evidence. Free reads
ended 17:09:55Z; the owner then prioritized device repair, and the business remained
Free until the later restoration. No read window was silently extended.

## Verification and Brain impact

The actual coordinate/semantic differential, helper-restart negative result,
foreground positive tap/drag and reactivation/native restoration are the focused
device evidence. Three-owned-document smoke passed 51 tests/254 assertions and
QA tooling types, with zero unknown paths; 55 local links and diff checks pass.
unchanged source/platform evidence is reused. No EwaTrade implementation, native
build, runtime flag, provider configuration or deployment changed. The local Brain
Apple handoff records the operating procedure and remaining limits.
