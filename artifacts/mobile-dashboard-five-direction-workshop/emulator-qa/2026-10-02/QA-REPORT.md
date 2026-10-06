# Classic Home emulator QA — 2 October 2026

Implementation **5/5**; native QA checkpoint **6/7**. The resumed pass recovered the original QA OWNER session through the existing login, completed visual motion/elastic release, cold reduced motion, footer-action and live tenant route checks, and returned to actual Ishaq/Jawdah Home at Light 100%. Real TalkBack traversal/activation remains unaccepted. The final mobile compiler reports 15 errors only in concurrent Finance supplier-purchase source; this is not a repository-wide compiler pass.

## Latest requested avatar change

Classic Home derives a stable strong background from the normalized first non-whitespace uppercase initial. A shared seven-color identity palette stays consistent across themes and business states; unknown names use `?`, and initials can share a color. White contrast is at least 5.36:1 (`avatar-contrast-results.json`). The 48-point circle, full account/settings accessible label, profile destination and compact decorative-initial 1.35 cap are retained; body/name scaling is unchanged. A style-only native text leaf binds the white foreground.

Native accepted evidence: `resumed-avatar-dark-200-verified-theme.png`, `resumed-avatar-light-200-native-leaf.png`, `resumed-live-dark-200-return.png` and final live `resumed-final-live-home.png/XML`. The real “I” is blue; fixture “A” is green. The profile action opens More (`resumed-avatar-profile-route`).

## Verified coverage

- Prior scene coverage: all 20 Home states in Light/Dark at 100%/200%, 14 lower-content checks at 200%, and 16 connected/scoped fixture transitions. See original matrix results, `large-text-lower-results.json` and `interaction-results.json`. These callbacks send no merchant mutations or invitations. The latest approved parallel copy refinement removed duplicate headings/step prose; historical captures describe the presentation at their capture time. State logic and callbacks are unchanged, with 28 focused tests/82 assertions passing after that refinement.
- Added established-unready, team-unknown, team-existing and team-restricted states retain history during catalog recovery and preserve directory/permission distinctions. Scene names do not guarantee an exact scroll edge; exclude restored-offset captures from edge assertions.
- Live tenant routes after session renewal: Products has three existing catalog items; Orders has the healthy zero-order state; More/sync has zero queued work; Catalog has three items; Staff has two directory entries (one active, one pending). Evidence: `resumed-live-products-settled`, `resumed-live-orders-settled`, `resumed-live-more`, `resumed-live-catalog-modal`, `resumed-live-team-reachable`. Staff was scrolled above the dock before tapping; the earlier covered-row tap is excluded.
- Avatar/profile, Sync, Search, catalog, team and pull-refresh routes work. Sync and Search close back to Home. Prior first-order CTA opened Create sale / Step 1 of 3 and Back returned Home; the Create chooser exposed its six options. No order or invitation was submitted. Opening a route before authenticated queries settle is not counted as healthy destination acceptance.
- Global workspace enumeration remains unavailable under the signed QA session's bounded authorization (`resumed-live-business-settled`). This is an auth-scope limitation, distinct from healthy tenant reads. No global auth/permission broadening or business switch was performed; healthy ordinary-login workspace switching remains outside this accepted evidence.
- Translucent status bar: a 70%-opacity theme-background scrim shows underlying scrolled content while preserving readable OS icons. Previous true long-scene Light/Dark 200% captures verify translucency. Resumed Sync/Catalog returns at Light/Dark 200% verify correct icon styles (`resumed-status-dark-200-modal/return`, `resumed-status-light-200-return`, review sheet). Compact real Home fits the viewport; `resumed-status-*-200-scrolled` filenames do not establish actual scrolling. iOS remains untested.

States covered: new-business, unfinished-catalog, catalog-ready, first-order, solo, invitation-pending, team-active, everyday, returning-empty, queued, offline-cached, offline-empty, loading, unavailable, orders-unavailable, stock-work, established-unready, team-unknown, team-existing, team-restricted.

## Motion and accessibility findings

1. Repeated order status announcement is fixed. Native XML announces customer/detail/status/amount once (`Sample customer A, Consultation, Completed, R450.00`).
2. Decorative initial clipping at 200% is fixed with the existing 1.35 compact cap, preserving the full account label. The latest initial-based palette/white native leaf also passes true Light/Dark 200% checks.
3. Semantic ActionButton foreground binds to a nested native text leaf. Dark primary/secondary samples activate independently; the disabled sample is `enabled=false` and leaves the prior sample result unchanged (`resumed-footer-dark-primary/secondary/disabled`). Light/Dark 200% samples render with retained labels and muted disabled styling (`resumed-footer-light-200`, `resumed-footer-dark-200`). Disabled nonactivation is verified; no normal-text AA claim is made for the exempt disabled foreground.
4. The admin dock's former zero-height host pruned all five visible controls from Android's accessibility tree. The absolute full-height box-none host restores Home/Orders/Create/Products/More without moving nested dock geometry (`live-200-dock-before/after.xml`). Resumed hidden/visible captures verify tree removal/reentry, not real TalkBack activation.
5. Native dock hide/reveal and Android bottom stretch/release are visually accepted. `home-motion-resumed.mp4` contains the complete 45.24-second sequence, 365 frames; `resumed-motion-rest/down/up/bottom/edge-held/edge-released` stills show the dock returning, remaining visible at the bottom, and content stretching then settling. Earlier incomplete recordings are diagnostic only. Variable-frame-rate idle recording and the host/API37 graphics warning prevent a measured 60 FPS/no-jitter performance claim.
6. Cold reduced motion is verified after temporarily setting animator duration to zero and recreating the app. Dock hidden/visible trees pass; held/released content crops change only at the far-right scrollbar, with no content stretch (`resumed-reduced-edge-held/released`, `resumed-reduced-dock-hidden/visible`). Original settings were subsequently restored.

## TalkBack remaining acceptance

TalkBack v17 was enabled and bound with touch exploration; green native focus appeared on the avatar and earlier Orders heading. Queued first-run notification prompts were cleared; temporary notification permission was restored exactly afterward. Keyboard and hardware-event shortcut attempts plus injected one-finger swipes did not reliably advance focus. An ordinary injected Products tap opened the route directly, which does not establish TalkBack activation. Accessibility XML, a bound service and a green focus outline are insufficient to accept traversal or double-tap activation.

A reliable native TalkBack input path/manual traversal is required to complete this check, including each visible dock control, activation and hidden-dock focus exclusion. No app defect has been established from the emulator injection limitation. Method reference: [Google TalkBack keyboard shortcuts](https://support.google.com/accessibility/android/answer/6110948?hl=en).

## Device/session restoration

Only existing emulator-5554 / Pixel_10a, Android17/API37, 1080×2424, development client `com.ewatrade.dev.barcodeqa` was exercised. The owner approved same-emulator recovery with retained data. After prior WebView package-update/app-exit and renderer stalls, the same AVD was reopened with command-line host GPU, retaining saved configuration/data. Screenshots now complete quickly; the macOS/API37 GLES warning remains. No install, wipe, physical-device operation or shared API/Metro restart. Emulator reverse mappings remain API3095/Metro3096.

The former **Age check unavailable** blocker is superseded. Session renewal used the existing domain-only QA login, loaded authorized businesses and selected the original Jawdah OWNER profile. No age declaration, auth source change, credential export, unsigned local token or guard bypass was used. Healthy tenant reads then resumed.

`resumed-settings-readback.json` confirms font1.0; animator duration unset; window/transition1.0; accessibility services unset/accessibility_enabled0; TalkBack notification permission false with original USER_SENSITIVE_WHEN_GRANTED flag. `resumed-final-live-home.png/XML` verifies actual Ishaq/Jawdah Home, persisted Light theme and normal text. Existing emulator and services remain available.

## Source verification and exclusions

28 focused tests / 82 assertions pass. Scoped six-file Biome passed, followed by a final two-avatar-file check after the native-leaf correction. Shell/dashboard/action guards pass. The configured full mobile compiler completed with 15 diagnostics solely in `finance/supplier-purchase-recognition.tsx`; none in Home/dock/status-bar. See `resumed-typecheck.log` and `final-source-results.json`.

Broader gates still fail outside this scope: root /.designs/ archive ignore (admin-tabs), unrelated auth/onboarding/catalog/More large-text markers and barcode-camera-screen.tsx:213 mixed style/className. Shared concurrent work is preserved; no commits, stash or unrelated source fixes. This report does not claim repository-wide green checks.

Exclude stale/transient/mislabeled captures: original Dark100 everyday (corrected by `focus-theme-dark-settled`); font-change startup frames; initial `resumed-avatar-fixture-dark-200` before native-leaf correction; `resumed-avatar-dark-200-native-leaf` that rendered Light after HMR; `resumed-avatar-live-light-200-settled` that is a replayed fixture; early final Home launcher capture (now replaced by verified actual Home). Only true-theme settled captures count. Source-copy simplification belongs to the parallel approved workstream and is retained.

## Checkpoint

- [x] Shared dock/edge implementation and unchanged geometry.
- [x] Focused source regressions, 28 tests/82 assertions.
- [x] Compiler rerun completed; concurrent Finance errors recorded, repository gate failing.
- [x] Prior 20-state/theme/text and 14 lower-content checks.
- [x] Connected/scoped fixture transitions, 16/16.
- [x] Live tenant destinations/refresh, motion/elastic release, footer variants, cold reduced motion, workflow returns and final settings/Home restoration.
- [ ] Real TalkBack traversal/activation and hidden-dock focus acceptance.

## Brain impact

Updated `.brain/BRAIN.md`, `.brain/architecture/mobile-design-modules.md`, `.brain/features/mobile-home-guided-journey.md`, `.brain/features/mobile-scroll-motion.md`, `.brain/features/mobile-accessibility-large-text.md`, `.brain/tasks/in-progress.md`, `.brain/design/2026-10-02-mobile-dashboard-five-direction-workshop.md`, `.brain/decisions/2026-10-02-native-scroll-motion.md`, `.brain/decisions/2026-10-02-classic-home-translucent-status-bar.md` and new `.brain/decisions/2026-10-02-classic-home-initial-avatar-colors.md`. These reconcile acceptance/recovery limits and record the requested avatar behavior. No API, database, permission contract or migration change.
