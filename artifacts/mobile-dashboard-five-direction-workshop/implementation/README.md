# Classic Home source checkpoint — 2 October 2026

Implementation complete (5/5); paused at the owner’s request before emulator/UI testing. No installable build is requested. Resume only when the owner says proceed.

- Guided catalog/order/team/status states integrated in Classic owner Home; real existing native workflows connected.
- Solo dismissal persisted per account/business/store on this device.
- Existing bottom tabs and shell unchanged; SHA-256 baseline stored alongside this file (10 files).
- Domain/navigation checks: 20 pass, 0 fail, 66 assertions. Scoped 10-file Biome and diff checks passed.
- Full TypeScript: default 4 GB and 8 GB runs exhausted memory. 14 GB run reached one unsupported RotateCcw icon diagnostic; corrected to supported RefreshCw. Full compiler not rerun after correction due to requested pause.
- A local Expo Android export completed before the owner clarified no artifact was needed. It was not installed or deployed and predates the icon correction. It is not the accepted source checkpoint.
- No UI guard, browser, emulator/ADB, screenshot, native acceptance, merchant write or shared runtime restart in this implementation turn.

Deferred: emulator state matrix, Light/Dark, large text, TalkBack, role changes, invite lifecycle, scoped solo cold start, offline/cache, navigation and scroll.

Brain impact: feature, decision, task, design, architecture, staff integration and index updated. No API or database contract changes.

## Later continuation

Owner subsequently authorized smoother dock hide/reveal, elastic scrolling and UI testing on the existing emulator. The pause above is historical. Motion changes now intentionally affect bottom-tabs, app-shell and admin-tabs-context; at-rest geometry and navigation definitions remain intact. Current native evidence and outcomes are in `../emulator-qa/2026-10-02/QA-REPORT.md`.

## Native QA continuation checkpoint — 2 October 2026

Owner resumed testing on the existing emulator. Source implementation 5/5; QA checkpoint 4/7. Original 16 scenarios have 64 scene-entry checks across Light/Dark and 100%/200% text; one original Dark 100% image rendered Light and is excluded. Sixteen connected fixture checks pass. Two accessibility fixes have native after evidence. The Dark primary-label fix now has Dark 100% primary/secondary after evidence; additional text-size/variant checks remain open. Four added recovery/team fixtures expand planned states to 20.

Live order composer entry/Back, Orders and Create chooser are verified. Other live navigation, scroll/elasticity, TalkBack and reduced motion remain open. Android ANR/recovery is intermittent; original settings are confirmed restored. No APK install, emulator reboot or shared-server restart. Historical tab-shell hashes describe initial guided Home source; subsequent owner-authorized motion edits retain at-rest geometry. Exact outcomes and remaining work: `../emulator-qa/2026-10-02/QA-REPORT.md`.

Final native QA checkpoint, 2 October: all 20 branch identities have rendered (original 16 × Light/Dark × 100%/200%; four added states verified in Dark 100%). Connected fixture checks 16/16; latest focused source 28 tests/82 assertions. Three issues corrected: repeated order announcement and clipped avatar verified, plus Dark primary/secondary semantic label binding verified at 100%; 200%/remaining variants still open. Original emulator settings confirmed restored. Live order composer/Back, Orders and Create chooser verified; remaining navigation/accessibility open. Native motion screenshots show hide/return, but gesture delivery is delayed/misread and the requested 30-second recording contains only five frames/3.667778 seconds. Animation quality/elastic release are not accepted. Recurrent ANR records a 15,014 ms MotionEvent timeout, cause unconfirmed. App-only recovery and existing ADB forwarding avoid restarts but do not yield stable acceptance. QA remains 4/7, source 5/5; no emulator/server restart or merchant mutation. See QA-REPORT.md and motion-attempt-results.json.

Final source check: configured mobile TypeScript passes after the final native foreground binding and four added fixtures (14 GB heap, exit 0); 28 tests/82 assertions and scoped Biome/diff/Home/app-shell/action guards pass. Native QA remains 4/7 and needs attention: owner reboot authorization is pending after repeated unreliable gesture/recording behavior; no reboot occurred. Original emulator settings are verified restored. Details and exact exclusions are in the Home workshop QA-REPORT.md.
