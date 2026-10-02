# Classic Home emulator QA — 2 October 2026

Partial acceptance; native QA remains open. Implementation is 5/5 complete and the seven-item QA checkpoint is 4/7 complete. Final acceptance needs attention because native gesture/capture timing remains unreliable after safe app-only recovery. Testing used the existing emulator-5554 / Pixel_10a, Android 17, 1080 × 2424, and the existing development client `com.ewatrade.dev.barcodeqa`. No emulator reboot, shared-server restart, APK installation or physical-device operation occurred.

## Verified coverage

- The original 16 scenarios have 64 successful scene text-entry checks: Light/Dark at font scales 1.0 and 2.0. These are rendering checks, not complete end-to-end acceptance.
- Requested theme matches in 63/64 original captures. The original Dark 100% everyday frame rendered Light and is excluded from Dark acceptance. All 32 fresh 200% captures match their themes. Earlier transient font-change captures are excluded.
- Connected fixture transitions: 16/16 pass, including catalog → unfinished → ready → first order, optional solo dismissal, app cold-start persistence, separate account/business/store scopes, invitation acknowledgement, active team, retry recovery and returning/queued/unavailable lower content. See `interaction-results.json`.
- Four Light 200% lower-content checks pass: new-business tasks, catalog-ready tasks, pending invitation and returning-empty message. Ten remaining planned lower-content checks remain open.
- Live authenticated Jawdah Home: the first-order action opens Create sale / Step 1 of 3; Android Back returns Home. Orders tab and Quick create chooser open. Products/More rechecks captured splash or the still-open chooser and are not passed.
- Two accessibility defects have native after evidence: repeated order status labels and a clipped decorative account initial at 200%. Details below.
- Latest focused source run: 28 tests pass, 82 assertions. Nine-file Biome, scoped diff check, action-primitives and app-shell guards pass. Final configured full mobile TypeScript passes after the final semantic-color and four-fixture additions with a 14 GB heap; /private/tmp/ewatrade-home-qa-latest-typecheck.log is empty and the process exits 0.

Original states: new-business, unfinished-catalog, catalog-ready, first-order, solo, invitation-pending, team-active, everyday, returning-empty, queued, offline-cached, offline-empty, loading, unavailable, orders-unavailable and stock-work. Four additional source fixtures — established-unready, team-unknown, team-existing and team-restricted — expand planned coverage to 20 states. Dark 100% top/middle/lower captures now verify all four added states: established history survives catalog recovery; unknown/existing team use the directory; restricted team exposes no invitation/directory action. Other theme/text-size combinations remain pending.

The clearly labeled development-only scene route reuses ClassicDashboardScreen, ClassicHomeJourney, the production journey/metrics models and actual AsyncStorage preference hook. Simulated callbacks do not create merchant orders/catalog records, send invitations or claim provider delivery. Live route entry is separate from fixture progression and does not validate real mutation lifecycles.

## Findings and limits

ISSUE-001 (medium, accessibility, fixed and verified): a recent-order row announced status twice in the native button label, e.g. `Sample customer A, Consultation, Completed, Completed, R450.00`. Reproduced in Light/Dark scene XML and `interaction-03-first-order.xml`. Source now provides one explicit customer/detail/status/amount label at the row button. Native after evidence: `large-text-lower-light-invitation-pending.xml` contains `Sample customer A, Consultation, Completed, R450.00` and `Sample customer B, Setup service, Open, R250.00`, each status once. Shared layout/data behavior unchanged. No automatic commit in this shared dirty workspace.

Fixture-only correction: Home tab now uses the same House icon as the admin navigation definition. This never changed the real admin tab's existing icon.

ISSUE-002 (medium, accessibility, fixed and verified): at font scale 2.0, the decorative account initial clipped in its fixed avatar circle. Fresh-scene reproduction: `font-200-new-business-before.png/xml`. The account button now applies the existing compact-control font cap (1.35) to this initial; full user name and the button’s complete account/settings accessible name remain available, with body/metric text continuing at full scale and the existing shared compact-button policy retained. Native after evidence: `font-200-cold-first-order.png/xml` and the fresh Light/Dark 200% matrix show the complete initial. A transient initial font-change capture also had stale measurements; it is retained as startup evidence and not used as a passing layout result.

Font-change diagnostic: a cold process reconnect at font scale 2.0 clears the stale measurements seen after changing the setting in the running development app. `font-200-cold-first-order.png/xml` verifies complete header, status, heading, description and primary action. Acceptance reruns use `matrix-200-fresh-*`; the interrupted earlier `matrix-200-*` captures are historical diagnostics, not passing acceptance evidence. The avatar fix is visible in the fresh cold capture.

Connected fixture interactions: 16/16 pass, including catalog progression, first-order progression, solo dismissal, cold persistence, independent account/business/store scopes, invitation acknowledgement, active team, retry recovery and distinct returning/queued/unavailable lower content. See `interaction-results.json` and its referenced evidence.

Shared guard results: Home/dashboard and app-shell pass. Admin-tabs reports only the root `/.designs/` ignore requirement; the broader large-text guard reports legacy marker requirements in auth/onboarding/catalog/More source; NativeWind reports a mixed style/className in `barcode-camera-screen.tsx:213`. These failures are outside the Home/motion edits made here; they remain visible in `guard-results.json` and logs. Do not interpret scoped native Home acceptance as a clean repository-wide guard result.

ISSUE-003 (medium, Dark contrast, fixed; Dark 100% primary/secondary verified, remaining variants/200% pending): `matrix-100-dark-everyday-recheck.png` reproduces a Light foreground on the Dark mint New order button. The class-only attempt still reproduced white text after reconnect. The nested native text leaf now binds the already-resolved semantic foreground color; its parent retains existing typography, classes and compact scaling. This preserves shared geometry and explicit Market Day overrides. Dark 100% primary and secondary after evidence is verified in final-100-dark-established-unready-top/middle.png. Other variants and 200% recheck remain pending. Latest Biome and action-primitives guard pass.

## Current recovery and device settings

ADB reconnect earlier removed emulator reverse mappings. Project-standard forwarding for Metro 3096 and API 3095 was restored on emulator-5554 only; both mappings remain verified. Host Metro status and API health passed at that recovery. App-only cold recreation briefly recovered the live Home screen at normal text size.

The final visual pass then encountered an Android unresponsive-app dialog. `anr.log` records a 15,014 ms MotionEvent timeout on MainActivity at 11:44:57; `current-settled.png` and `restricted-dark-settled.png` show the dialog. Selecting Wait briefly returned the everyday fixture but a subsequent scene launch failed and the dialog recurred. Cause is unconfirmed: these observations do not establish whether Home source, development runtime or guest/host scheduling caused the hang. Bounded ReactNativeJS/AndroidRuntime warning reads contain no exception; that is not proof of a healthy app.

App-only force-stop/relaunch and reconnect to the observed existing EwaTrade 3096 launcher entry were attempted without reboot or data clearing. Startup briefly remained blank, then a direct development-scene link recovered rendering. Four added Dark 100% scene checks subsequently settled and were captured successfully. Recovery remains intermittent; native QA continues cautiously. The attempted `final-100-*` capture pass is interrupted and excluded: several frames contain splash, stale state or the ANR dialog. Updated visual driver now requires the fixture identity to settle before capture; it does not mark screenshots as visually accepted automatically.

`final-settings-readback.json` confirms all original settings: font scale 1.0; animator duration scale unset; window and transition scales 1.0; enabled accessibility services unset; accessibility_enabled 0. TalkBack and reduced-motion settings were never changed. The app/profile-theme restoration after the final interruption remains unverified.

Automatic approval review rejected the proposed same-emulator reboot because the recorded scope prohibited restarts. No reboot occurred. A temporary safe recovery made reboot unnecessary earlier; recurrence leaves native acceptance open. Explicit owner authorization is required before that previously rejected recovery action; it is unnecessary while app-only recovery continues to hold.

## Native scroll attempt

`motion-visual-rest/down/up.png` shows the dock visible, hidden after downward movement, and returning during upward movement. The upward frame is partway through reveal, not accepted settled geometry. Later screenshots show delayed/misread gestures: the purported bottom frame contains a refresh banner, and held/released frames move through lower content with incidental fixture actions. These do not establish bottom-edge stretch/release or no-jitter acceptance.

`home-motion-final.mp4` was requested with a 30-second screenrecord limit but ffprobe reports only 3.667778 seconds and five video frames. The recording is retained as diagnostic evidence, not smoothness/FPS acceptance. `motion-attempt-results.json` records partial and unverified outcomes. All drivers are finished/stopped. Original settings were verified restored before this attempt and no settings were subsequently changed. Native QA needs stable emulator/runtime operation; the root cause of ANR and timing problems remains unconfirmed.

## Remaining acceptance checklist

- Final Dark primary/secondary/disabled label recheck after ISSUE-003; correct Dark 100% everyday capture.
- Four added states and remaining lower content in Light/Dark and 100%/200% text.
- Live Products/More, header/catalog/team navigation and read-only refresh; no merchant submissions.
- Finish reliable native motion/edge recording, reversals and focus restoration. Screenshots show dock hide/return, but current capture timing and gesture delivery are unreliable; unit tests do not establish animation quality.
- Actual TalkBack focus/activation and hidden-dock accessibility; reduced-motion behavior after an app cold start, then original-settings restoration/read-back.
- Complete remaining native evidence review and Brain checkpoint; the final source compiler after the last edits now passes.

Shared guards outside this change remain failing: admin-tabs root `/.designs/` ignore requirement, legacy large-text marker requirements in auth/onboarding/catalog/More, and mixed style/className in barcode-camera-screen.tsx:213. See `guard-results.json`; scoped checks do not mean repository-wide guards are green. Shared dirty work is preserved; no automatic commits, stashes, unrelated fixes or GitHub issue creation.

## Brain impact check

Updated `.brain/BRAIN.md`, `.brain/features/mobile-home-guided-journey.md`, `.brain/features/mobile-scroll-motion.md`, `.brain/features/mobile-accessibility-large-text.md`, `.brain/tasks/in-progress.md`, `.brain/design/2026-10-02-mobile-dashboard-five-direction-workshop.md`, `.brain/architecture/mobile-design-modules.md` and `.brain/decisions/2026-10-02-native-scroll-motion.md`. These document source ownership, motion behavior, development-only fixtures, findings and incomplete native acceptance. No API, database or permission contract changed; no migration work is required.

Final handoff: native drivers are stopped/finished; source compiler passes after latest edits. QA needs attention pending owner authorization for rebooting the same emulator with app data retained. Automatic review rejected the earlier reboot under the recorded no-restart scope; it was not executed. Original system settings remain verified restored. No merchant writes, install, emulator reboot or shared-server restart. Source 5/5; QA 4/7.

Owner explicitly approved rebooting the same emulator in the next reply ("yes"). The emulator-5554 reboot command succeeded on 2 October; app data retained, no wipe/install or shared-server restart. Earlier approval-pending notes are historical. Native acceptance resumes after boot and the existing API/Metro forwarding is restored. Source 5/5, QA 4/7 at resumption.
