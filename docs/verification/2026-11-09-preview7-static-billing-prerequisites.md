# Exact Preview7 static inspection and billing prerequisites

Status: **artifact recovered and inspected; build7 is not qualified for the
current native billing flow**. This is static evidence, not device or lifecycle
acceptance. Apple remains3/6; I05 and the broader acceptance gates remain open.
Mobile release remains excluded.

## Retrieval and custody

The original retrieval exited1 without retaining its failing phase. Preserve
that result as inconclusive. It did not prove that the artifact was absent or
incompatible, and does not supersede the successful18:53UTC EAS metadata read in
the [separate readiness case](2026-11-09-preview-billing-readiness-observation.md).

The existing signed10 downloader's allowlist included wf-artifacts.eascdn.net;
the first helper omitted that host. This was a concrete discrepancy justifying
a separately reviewed second attempt, not proof of the original failure cause.
The second helper added that established CDN host, exclusive private intent
before network, refusal on any existing intent/result and sanitized phase/code
receipts for ordinary errors and its50-second deadline. Root reviewed source
SHA2568382cd5bb4bbcd611e4ccffdc73a5cd1a475ef59cbd2ad7dd27c842b4cd5907a
and authorized that exact continuation once, using normal cached EAS CLI auth.
No password login or alternative target/auth source was used.

The second attempt completed19:06:38.465UTC on9November2026, exit0, after two
redirects. Its25972387-byte IPA SHA256 is
45270b4ee3c2d2ded2f170199b92cd0b207ade637447ab3db35f84f95addf40c,
exactly matching the saved signed7 receipt. Signed artifact URLs and credentials
were not emitted or persisted. IPA/receipts remain private mode0600 under a
mode0700 temporary directory. The archive contained247 entries/88976164 expanded
bytes, no absolute/traversing paths and no symlinks; extraction was private.

## Actual compiled artifact comparison

| Static check | Exact Preview7 | Existing signed10 |
| --- | --- | --- |
| EAS ID | bf3503db-9e2e-4902-bef2-d46ac0ab4684 | 50f69a74-5dae-4d0a-b481-9ad6164146f4 |
| Native source | dcbc7e4804e9f1fbcfa6b6f9a48bf54d8f9e956f | 2d4424b1525c4aa05e6ced39ce888e31d7f8140e |
| App identity | com.ewatrade.app,1.0.0(7),team ZXC78SPCV4 | com.ewatrade.app,1.0.0(10),same team |
| codesign deep/strict verification | exit0; get-task-allow false | exit0; get-task-allow false |
| Actual EXUpdates.bundle/fingerprint file | 59b38390d09d433711fb525cfbe298eebda73318 | 018c6c66e7e614408870451b744e5befac86a851 |
| ExpoIap/OpenIAP strings in all packaged Mach-O binaries | absent from main binary and all three framework binaries | present in main binary |
| Positive controls in main binary | ExpoModulesProvider,ExpoCamera,ExpoLocation present | same controls present |
| Native purchase method markers | generic finishTransaction only; fetchProducts/requestPurchase/getAvailablePurchases/getStorefront absent | all five present |
| Main binary linked StoreKit framework | absent | present |
| ExpoIap string in packaged JS bundle | absent | present |
| Privacy manifest count |20 |20 |

The generic finishTransaction string alone does not identify the current Expo
IAP bridge. Both packages contain only React, ReactNativeDependencies and hermes
frameworks; each executable was inspected, so this check did not overlook a
separate ExpoIap framework. nm returned0 but exposed no matching IAP symbols in
either main binary; symbol output alone is not evidence of absence. The finding
instead combines complete packaged-binary strings, positive controls, linked
frameworks and packaged JS evidence.

The current mobile native provider checks
requireOptionalNativeModule("ExpoIap") in
[the provider](../../apps/mobile/src/components/mobile/store-subscription-provider.native.tsx).
The installed expo-iap bridge resolves ExpoIap/ExpoIapOnside and its Swift module
imports OpenIAP. Package pins at the old Git source do not prove native linkage.
The actual7 artifact supplies no evidence of that required bridge and cannot be
accepted as the current billing client. An OTA cannot add a missing native
module. A native-compatible Preview client is therefore a concrete prerequisite;
this does not automatically require or authorize a new build before checking
whether another suitable existing signed artifact is available.

Preview7 has three location usage-description keys absent from10:
NSLocationAlwaysAndWhenInUseUsageDescription,NSLocationAlwaysUsageDescription and
NSLocationWhenInUseUsageDescription. Signed10 adds NSContactsUsageDescription.
These are static permission declarations, not permission-prompt observations or
a complete privacy/legal assessment. Both actual counts are20; an earlier verbal
claim of24 for signed10 was incorrect. Preview API/Dashboard host strings are
present in7's bundle. Bundled host strings do not prove the active hosted
configuration or absence of other embedded routes.

## Minimum remaining prerequisites

1. Complete the actual hosted API/Dashboard configuration and database-binding
   read after the existing Vercel CLI session is verified. The browser now shows
   Authorization Successful; Android owns confirming the cached CLI session.
   Browser authorization alone is not proof that the CLI received credentials.
   Preserve the original three-part readiness case; this is follow-through.
2. Review and authorize the minimum ordinary Preview owner/Sandbox billing
   configuration, then verify the promoted runtime before fresh onboarding.
   Actual Preview jobs owner/store billing flags were false. Local profile
   omissions do not establish hosted API/Dashboard settings. Reuse approved
   private custody through the normal target-specific path; no Production
   configuration copy, new key, reviewer-policy expansion or public checkout
   activation is implied.
3. Create a dedicated ordinary Preview owner/business only through real normal
   onboarding after that runtime is ready. The named old QA owner's cohort was
   false with launch-default risk; an empty purchase history does not qualify
   it for return-to-Free testing. Do not relabel that account/grants or assume
   that adding another business under it creates an eligible target. Bind the
   resulting owner/cohort/tenant and hosted database in the reviewed case.
4. Qualify an exact signed, native-compatible Preview client. Build7 is not that
   candidate. If no suitable existing artifact exists, prepare a concrete build
   proposal for separate approval. These profiles use the same registered
   bundle as signed10: installation on the same phone replaces the existing app
   and needs a reviewed preservation/rollback plan. No installation, selection,
   upload, build, OTA or new mobile release is authorized by this finding.
5. Only after those prerequisites, review one bounded lifecycle case binding
   tester/owner/business/client/source/runtime/API/database and real target-bound
   Sandbox callback delivery. Preserve the original reviewer chain; do not buy
   again on it. The new tester's empty subscription screen proves neither
   ordinary purchase delivery nor renewal, failure, cancellation or refund.
   Empty-account lifecycle evidence also cannot accept populated retained-data
   and over-Free-limit behavior; that I05 work stays separate and open.

No account/cohort, billing flag, store setting, provider credential, transaction,
app installation or running service was changed by this inspection. Historical
build6 delivery remains a lead with current compatibility/availability unproved;
no alternate artifact was downloaded or selected.

## Evidence and validation

Private files under /private/tmp:

- ewatrade-preview7-static-first-attempt-incomplete-2026-11-09.evidence.json
- ewatrade-preview7-static-reviewed-attempt-2026-11-09.intent.private.json
- ewatrade-preview7-static-retrieval-2026-11-09.evidence.json
- ewatrade-preview7-static-guard-offline-2026-11-09.evidence.json
- ewatrade-preview7-signed10-static-comparison-2026-11-09.private.json
- ewatrade-preview7-native-linkage-followup-2026-11-09.evidence.json

Ten offline guard cases and Bun syntax passed with no network or real intent;
offline QA doctor passed without runtime probes. Exact byte/hash, archive-path,
signature, fingerprint and packaged-binary checks passed as described above.
No app code was executed. Documentation links/source references/diff are checked;
prior core51tests/254assertions and QA-tooling types are reused only where their
source is unchanged. These checks add no physical payment/lifecycle acceptance.

Brain impact: local .brain/features/native-store-billing.md,
.brain/features/owner-wide-billing.md and .brain/tasks/in-progress.md.
