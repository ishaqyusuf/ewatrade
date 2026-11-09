# Preview iOS billing artifact proposal

Status: **proposal only; candidate source unpinned; not ready to execute**.
Mobile release remains excluded. This document prepares the smallest conditional
native artifact step; it authorizes no build, upload, installation, OTA,
configuration change or account creation.

## Why a native artifact is a concrete prerequisite

The [exact7 inspection](../verification/2026-11-09-preview7-static-billing-prerequisites.md)
found a strong static linkage blocker: its actual packaged binaries lack the
ExpoIap/OpenIAP bridge required by the current provider, unlike signed10.
Build7 is not qualified. This is not compiled ABI acceptance from a package pin;
stripped-symbol limitations and the20/20 privacy-manifest correction remain in
that receipt. OTA cannot introduce the missing native bridge.

At19:10:59.033UTC on9November2026, one normal cached-auth EAS metadata listing
queried only registered project532f9a55-f4f6-4d4e-b60b-ea6fa8807a3b,
platformIOS, build-profile testflight-preview, limit8/offset0/one page. It returned:

| Build | Result | EAS identity | Source | Runtime |
| --- | --- | --- | --- | --- |
|7 | FINISHED | bf3503db-9e2e-4902-bef2-d46ac0ab4684 | dcbc7e4804e9f1fbcfa6b6f9a48bf54d8f9e956f |59b38390d09d433711fb525cfbe298eebda73318 |
|6 | FINISHED | a2213838-94ff-4229-89bf-208ac6fe124f |84b169dcd7364157487e36e3d60c27a7bc501a27 | b3ad3f3baf65b159779712694db8d35cd9445149 |
|5 | ERRORED | df4beeee-75b0-40ce-b800-dc31fa2f270a |84b169dcd7364157487e36e3d60c27a7bc501a27 |5b961c85099f2e1a1c22674a27d1a04c133ca6d5 |
|4 | ERRORED | df7473f4-8166-4bf5-bbe7-c3643a7691fb | c6d74b22dd5dcae0211a8ee8cb51dc92e6c73c14 |61843fd7bd175da577b255723b5633f234dbe409 |

There was no additional successful candidate in this bounded inventory. Build6
has historical delivery evidence, but current compatibility is unproved and the
current Preview OTA guard refuses its runtime. No build6 artifact was downloaded.
This is not a claim about unrelated projects/profiles or unqueried inventories.
Private one-attempt intent and sanitized receipt:
/private/tmp/ewatrade-preview-ios-inventory-2026-11-09.intent.private.json and
/private/tmp/ewatrade-preview-ios-inventory-2026-11-09.evidence.json.

## Smallest proposed deliverable

One signed store-distribution iOS artifact for the existing testflight-preview
profile, existing project/app/team and Preview services, with the current native
IAP bridge compiled and verified. Stop after producing and statically qualifying
that exact private artifact. EAS source upload/build and its auto-incremented
build number are part of this future operation; App Store Connect submission,
TestFlight group delivery, selection and installation are separate steps.

| Required input/check | Proposed boundary and current gap |
| --- | --- |
| Source and freeze | Stay in the main checkout. Source coordinator first lets owning chats finish/commit their work, reviews the resulting scope, establishes a brief source hold and pins one full SHA. Current mobile app.config/onboarding and shared-package edits are foreign WIP. Do not stash, discard, cherry-pick, change branches or create a worktree. Current HEAD alone is not an approved candidate. |
| Clean inputs | Existing eas-account-runner requires the expected SHA to equal HEAD and all mobile/packages/release inputs to be committed. Preserve that guard and stop on drift. Bind package/lock, plugins, native provider, app config, EAS profiles and build-tool inputs to the candidate. |
| Runtime and origins | Preview APP_ENV/variant, explicit IOS_TESTFLIGHT=1, store/device distribution, channel testflight-preview, existing registered com.ewatrade.app. Verify effective hosted Preview attachment and resolved config with the existing testFlightPreviewFailures guard. API must be preview-api.ewatrade.com; Dashboard/base/web and chat must be their reviewed isolated Preview services. Shared public legal content may remain ewatrade.com. No Production backend origin or account is a substitute. |
| Native bridge | Candidate must autolink ExpoIap/OpenIAP, not merely pin expo-iap in package.json. Inspect actual build logs/pod linkage and final signed Mach-O module/method markers, StoreKit linkage, runtime fingerprint and JS/native pair. No forced historical fingerprint or old-runtime OTA override. |
| Privacy | Review the candidate's actual Info.plist, entitlements and complete SDK privacy manifests against current source and signed10. Recheck location/contacts declarations and app-owned collection/tracking purposes; counts alone are not privacy acceptance. Preserve20/20 historical counts, without requiring a future package to have an invented fixed count. |
| Signing | Reuse existing protected iOS local credentials for teamZXC78SPCV4/bundlecom.ewatrade.app; no new certificate/profile/key or rotation is implied. Review expiry and distribution suitability without printing credentials. Verify final signature, no debug entitlement, byte/hash and correct registered identity. Existing private signed10 IPA remains preserved. |
| Tooling/auth | Use the existing explicit iOS signed-build path, not root release's Android selector or a new executor. The current eas:build wrapper creates an isolated EAS session using existing account password custody; that is a different future authentication action from this inventory's cached normal CLI read. Review its authorization before execution; do not start it under read-only permission or replace it with an ad hoc bypass. |
| Environment acceptance | Complete real hosted Preview API/Dashboard/jobs configuration and database binding as a separately authorized scope. Ordinary Sandbox owner billing must be ready before real fresh onboarding. Do not change the old QA cohort/grants, copy Production settings, widen the reviewer policy or buy on the original reviewer owner. A built artifact alone does not satisfy these prerequisites. |

The established command shape, for a separately approved exact candidate only:

```text
bun run eas:build --preview --platform ios --ios-testflight --expected-commit <reviewed-full-sha>
```

Do not execute this placeholder. Pin source first and inspect the complete
reviewed command/auth/signing scope; retain existing native/source/provider
guards. No automatic submit, install or OTA follows a successful build.

## Verification, delivery and rollback boundaries

Use [docs/testing.md](../testing.md): focused candidate source/platform checks and
existing guards, then artifact-specific evidence. Relevant API/jobs changes use
the normal approved Preview/matching existing-data smoke path; no backend deploy
is needed solely to repeat a test. Root release's current mobile integration is
Android-only, so its receipts do not accept this iOS artifact. Public submission
and Production activation are outside this proposal.

Before any later same-phone installation, separately review exact TestFlight
availability/group delivery and select the target device. Preview and signed10
share com.ewatrade.app, so Preview replaces the current app. Preserve original
purchase/tester identities and private receipt hashes; establish an available,
permitted rollback to exact signed10 EAS50f69a74-5dae-4d0a-b481-9ad6164146f4,
runtime018c6c66e7e614408870451b744e5befac86a851 and saved IPA SHA
eb80bdb6c4bf52a93ab27ea4fe6cc52fec3c7a4bd1a201f33dfbaa9c00b63354.
Possessing the IPA does not prove reinstall availability or authorization. A
separately selected test device could preserve the installed10, but is not
assumed available. Never clear app/purchase history to manufacture isolation.

After qualified delivery, a separate exact lifecycle case binds the new ordinary
Preview owner created by real onboarding, tester, tenant, client/source/runtime,
API/database and actual callback target. Existing transaction recovery is not
repeated. Populated retained-data/over-Free-limit proof stays open even if a
fresh empty owner passes provider lifecycle observations.

## Validation and Brain impact

The one bounded listing exited0 and validated every record's project/platform/
profile before retaining sanitized metadata. No artifact download, selection,
install, password login, build or runtime change occurred. Proposal checks cover
receipt identities, existing profile/source/auth guards, links and diff. Reuse
the immediately preceding offline doctor,10 retrieval-guard cases and unchanged
core51tests/254assertions plus QA-tooling types only for their actual scope; none
is future-build or device acceptance. Source freeze, full candidate SHA,
effective environment, signing freshness and rollback availability remain open.

Brain impact: local .brain/features/native-store-billing.md,
.brain/features/owner-wide-billing.md and .brain/tasks/in-progress.md.
