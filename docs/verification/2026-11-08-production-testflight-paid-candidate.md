# Production-backed paid TestFlight candidate — 8 November 2026

The approved reviewer account and its versioned Free workspace are in Production.
The existing Preview TestFlight target cannot exercise that identity or the
deployed, owner-restricted Apple Sandbox verification path. Ordinary Production
store publication remains blocked by its audience/legal/payment acceptance gates.

The existing `--ios-testflight` route now also permits explicit Production iOS
build and upload, using `testflight-production`. The profile uses the registered
app/project, Production services, restored local signing, store/device distribution
and its own update channel. Production TestFlight OTA is refused. Existing Preview
TestFlight behavior is retained. Ordinary Production build/update/upload behavior
keeps its audience, public legal, iOS login/identity and billing gates.

The private target requires paid native scope, the IAP plugin, the exact reviewed
Production origins and local operator configuration that passes the existing
server-owned immutable reviewer-ID policy, with public checkout explicitly false and ordinary Sandbox forwarding enabled.
Reviewer IDs and billing authorization are forbidden in the client build profile.
The build also runs live API, iOS login/organization and Production Expo attachment
checks. Upload verifies the exact finished build ID, version, commit, project,
owner, profile, channel, store/device distribution and HTTPS artifact before any
submission command. Profile overrides, auto-submit and non-exact artifacts remain
refused. Build input cleanliness now includes the new preflight source.

`softwarePlanPurchases=true` restores the owner's paid-launch client scope. It
does not activate hosted billing, publish an OTA, submit public review or prove a
purchase. Store authorization/availability, signature verification, current-owner
binding and the controlled Sandbox allowlist remain server authority. Verified
Sandbox facts stay Sandbox; no fake Production receipt or grant is introduced.

Expo documents that [iOS upload goes to TestFlight rather than public App Review](https://docs.expo.dev/submit/ios/).
[Apple confirms TestFlight purchases use Sandbox](https://developer.apple.com/documentation/StoreKit/testing-at-all-stages-of-development-with-xcode-and-the-sandbox).
Before upload/distribution, inspect existing internal groups and automatic
distribution settings; restrict this candidate to the approved owner/test audience.
Public submission still requires the complete paid/legal/privacy acceptance packet.

## Source verification

- Offline doctor passes; no services, database or device were started.
- 112 focused checks / 620 assertions pass across actual runner fixtures, private
  target validation, Preview regression and ordinary paid-billing requirements.
  Fake EAS/API/auth adapters make no provider or database calls. Negative cases
  cover wrong origins/identity/reviewer scope, open public checkout, wrong profile/
  channel/source/version, missing scope/plugin, dirty source, API/login/identity/
  attachment failures, Android misuse and Production TestFlight OTA refusal.
- Scoped tooling TypeScript passes with ESNext/DOM libraries; Biome passes on owned
  changed files. The new target is not a hosted or signed acceptance result.
- Owned-path fast smoke passes 284 tests / 1,813 assertions plus QA tooling types
  and Biome. Scope includes every owned runtime/test/config/impact path and excludes
  concurrent web-payment implementation.
- Full mobile TypeScript passes with the documented 16 GB heap. Shared H01 and
  H02 pass after the web owner supplied the two new RPC classifications and their
  own impact record, then committed the Paystack-only work as `70effe0b5`. The new
  target's form-only/API decision remains separate. The source must be clean and
  pinned before a build; its signed/provider acceptance remains open.
- Existing Apple checkout/review verification/notification relay/policy unit checks
  pass 16 tests / 165 assertions against the combined working source. The first
  standalone invocation lacked the required unusable DB sentinel; the corrected
  minimal source environment made no database connection or provider call.

## Required execution

1. Use the restored same-key protected signing files and exact clean committed
   source without a worktree. See the separate signing restoration receipt.
2. Install/verify the exact reviewer-only Production server configuration and local
   operator preflight settings, with public checkout false. Bind any API rollout
   and notification routing/canary to the actual deployment. Local preflight does
   not establish hosted configuration equality or effective behavior.
3. Build through `bun run eas:build --prod --platform ios --ios-testflight
   --expected-commit <full-sha>`. Inspect actual signature, registered identity,
   native IAP linkage, service origins, permissions and fingerprint.
4. Upload only that accepted artifact through the same guarded route, selecting
   its exact build ID/version/commit. Observe Apple processing and internal audience.
5. The owner installs via TestFlight on the available iPhone and performs licensed
   purchase/restore/lifecycle tests with the approved reviewer identity. Keep real
   purchase/refund coverage separate from TEST-notification acknowledgements.

No credential was created/replaced by this source change, and no hosted flag,
build, upload, tester distribution or public publication is claimed here. Apple
remains 2/6 accepted milestones. No schema or API contract changed. Assistant
access stays form-only; an assistant cannot start a store purchase.
