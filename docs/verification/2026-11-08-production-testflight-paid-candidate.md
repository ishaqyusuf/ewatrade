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

## Private TestFlight audience inspected

App Store Connect currently has one internal group, EwaTrade Preview Internal,
with one tester matching the Account Holder and one historical build, 1.0.0 (6).
There are no external groups. The group Settings page explicitly reports
`Manual for Xcode Builds`. No group, tester, distribution or upload setting was
changed. This is the current audience observation, not proof that a future upload
has been assigned or installed. Inspect the new exact build after processing.
Private metadata receipt: `/private/tmp/ewatrade-apple-testflight-audience-2026-11-08.json`.

The seven-key API configuration helper completed a read-only dry run at clean
`fe3740963`, with three existing sensitive rows, four new rows, no linked shared
collisions and public checkout closed in the proposed configuration. No mutation
ledger exists and no value was applied. Subsequent dashboard payment safety edits
made the checkout dirty, so the old source pin was explicitly released. The
configuration/deployment/build must use a newly agreed clean committed pin.
The owner authorized direct coordination with the dashboard payment chat.
Apple acceptance stays 2/6; source and audience inspection close no signed or
runtime payment milestone.

## Dormant paid-owner privacy configuration

The owner-approved privacy implementation introduces three deployment names:
`ACCOUNT_PRIVACY_SUBSCRIPTION_RETENTION_ENABLED`,
`ACCOUNT_PRIVACY_SUBSCRIPTION_POLICY_JSON` and
`ACCOUNT_PRIVACY_APPROVED_SUBSCRIPTION_POLICY_SHA256`. The canonical release audit
now classifies those exact names as a currently disabled feature. No placeholder
policy, processing flag, provider value or hosted setting was installed. This
classification permits deployment of dormant source and does not establish
operational privacy acceptance or authorize live account processing. Move the
names out of the dormant list when enabling the feature. Existing privacy and
billing gates remain effective. Validation is a bounded config diff/format review;
the final clean-candidate release audit must still run.

## Real Expo configuration correction and saved reviewer configuration

The first actual private build at clean `49df03a06` stopped before Expo auth,
archive upload or cloud build: `app.config.ts` still rejected the TestFlight flag
outside Preview. Fixture-only target/runner checks had not exercised that import.
The dynamic config now permits Production only with the explicit
`testflight-production` profile, retaining Preview's registered-bundle override and
ordinary Production identity. Real-config regression cases exercise Production
preflight, Preview and ordinary Production resolution, and unintended target
refusal. No public store/OTA gate was removed.

At that same source checkpoint, the seven reviewed API Production settings and
seven-key local operator mirror were installed. Three existing Sensitive row IDs,
types and targets were preserved; four new Production-only Sensitive rows were
created. Final metadata readback and unrelated-setting/profile-byte comparisons
passed. One immutable reviewer is configured; public checkout is explicitly false.
No WEB billing setting changed. The operator ledger is private at
`/private/tmp/ewatrade-reviewer-config-application.private.json`; no ID/secret value
is copied here. A redeployment and effective-runtime checks remain necessary.

Two initial requests were rejected without changing metadata because the API
forbids a key field on Sensitive edits, even unchanged. The corrected value-only
request then exposed the create endpoint's single-object response shape. The
partial application was stopped and reconciled by exact metadata; the captured
new row ID received an explicit value replacement before continuing. No duplicate
row, delete/recreate, blind retry or runtime rollback was used. The completed
ledger contains all seven operations; earlier stopped ledgers remain private.

Apple's native Billing Grace Period is currently unconfigured, consistent with
using the five-day application courtesy against verified retry facts. No grace
setting changed. The draft review notes now give the exact native **Use password**
then **Sign in with password** route; persisted text and disabled Save were checked
after reload without reading credentials. Proof:
`/private/tmp/ewatrade-apple-review-password-instructions-2026-11-08.jpg`.
This preparation closes no signed or hosted acceptance milestone (Apple 2/6).

Follow-up verification: offline doctor; real-config/runner/Preview/billing suite
114 tests/628 assertions; scoped runtime-path smoke202/1,056; full mobile types;
scoped test types; owned Biome/diff checks pass. The new tests evaluate the real
Expo module with fresh module cache and restore their environment. Early
noncanonical test invocations lost subprocess diagnostics and failed; the
canonical `bun --env-file=/dev/null test ./<exact-file>` invocation passes all114.
H01 must use documented APP_ENV=local to include QA routes; its temporary
wrong-profile regeneration was discarded in full before the correct check.
No coverage inventory or permission was changed by this native-config correction.
The202-test smoke explicitly selects only app.config.ts and its regression file;
it is not full release, UI, signed or money acceptance. H02 passes with the
updated existing form-only impact record. Final backend release source smoke
and matching hosted Preview evidence remain required.
