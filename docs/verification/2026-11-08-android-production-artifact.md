# Signed Android Production artifact inspection — 8 November 2026

Status: private signed validation artifact accepted for identity, bundle structure,
signature integrity, permission inventory and packaged native IAP code. This is
not a Play upload, installation, store acceptance or purchase/lifecycle test.

## Exact artifact

- EAS build: `56f45d80-ec23-4368-add5-49329741f3a5`, FINISHED at
  `2026-11-08T11:36:58.482Z`.
- Source: `dafec2e01fda01b243a8207f5092b011ff46bb03`.
- Project: `532f9a55-f4f6-4d4e-b60b-ea6fa8807a3b`, owner `cipron-startups`.
- Android production profile, production update channel, STORE distribution.
- Actual manifest package `com.ewatrade.app`, versionCode `36`, versionName `1.0.0`.
- Downloaded bytes: `94591815`.
- SHA-256: `0c2527f3cfbb54ce377d5417c25cbf513192e1daac10c366f4256dc5aff4dde3`.
- Private file: `/private/tmp/ewatrade-android-validation-36.aab` (mode 0600).

The existing `eas:build --prod --platform android --validation-only` path checked
exact committed source and Production API/environment attachment before upload.
The source archive was immutable before later documentation commits. Existing
`view --prod --id` metadata was checked for exact identity/source/profile/channel;
`download --prod --id --output` then exclusively saved that finished artifact.
No worktree, Play submission, OTA publication or paid activation occurred.

## Actual bundle checks

Cached bundletool 1.18.1 successfully dumped the manifest and validated the AAB.
The first local validation attempt exposed an inspector classpath conflict: an
Android Guava JAR was selected under a JRE cache directory. Selecting the existing
JRE Guava 33.3.1 JAR corrected the inspector; the unchanged artifact then passed.
No source or artifact change was made to obtain this result.

`jarsigner -verify` exited 0 and reported `jar verified.`. Its self-signed chain,
missing timestamp and unprotected POSIX-attribute warnings are retained in the
private log. This establishes signature integrity, not trust in a public CA,
comparison with Play's registered upload certificate or store acceptance.

The actual merged manifest contains `com.android.vending.BILLING` and none of
`ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION` or `ACCESS_BACKGROUND_LOCATION`.
It also excludes WRITE_CONTACTS, SYSTEM_ALERT_WINDOW and the two explicitly
blocked foreground-service permissions. Full declared permission inventory:

| Permission |
| --- |
| `android.permission.ACCESS_NETWORK_STATE` |
| `android.permission.CAMERA` |
| `android.permission.INTERNET` |
| `android.permission.MODIFY_AUDIO_SETTINGS` |
| `android.permission.READ_CONTACTS` |
| `android.permission.READ_EXTERNAL_STORAGE` |
| `android.permission.RECORD_AUDIO` |
| `android.permission.USE_BIOMETRIC` |
| `android.permission.USE_FINGERPRINT` |
| `android.permission.VIBRATE` |
| `android.permission.WRITE_EXTERNAL_STORAGE` |
| `com.android.vending.BILLING` |
| `com.ewatrade.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` |
| `com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE` |

DEX contents include descriptors for `expo.modules.iap.ExpoIapModule`,
`dev.hyo.openiap.OpenIapModule` and
`com.android.billingclient.api.BillingClient`. These demonstrate packaged native
IAP/BillingClient code, not successful runtime initialization or paid transactions.
Permissions alone do not establish actual data collection or authorize Data safety
answers. The Android owner retains that provider/declaration review.

## Acceptance boundaries and coordination

Canonical Android Preview smoke already passed on approved emulator-5554:
receipt `2bd3d2fd-2dc9-40c0-9731-4ff36eb88b69`, source `7ba0fd68c`, exact build/update
verified before and after the full existing-data journey. It canceled the sale
draft and signed out without submitting a sale/payment or creating fixtures.
That Preview runtime is distinct from this uninstalled Production AAB.

The previous Play Production AAB35 had no BILLING permission and retained location
permissions. This new private AAB36 fixes those artifact prerequisites but has not
replaced the Play upload. Android store/legal/paid-lifecycle gates stay open;
Android 1/8 and Apple 2/6 accepted milestones remain separate. The overall release
still has five of six Production components complete; native is not published.

Exact artifact and safe evidence were handed to the existing Android chat under
the owner's coordination authorization. Apple retains direct-owner signup code
verification. The emulator was already returned to Android; no duplicate device
or release executor remains.

Private evidence: `/private/tmp/ewatrade-android-validation-56f45d80.metadata.json`,
`/private/tmp/ewatrade-android36-inspection.json`,
`/private/tmp/ewatrade-android36-manifest.xml`,
`/private/tmp/ewatrade-android36-bundle-validation.txt`,
`/private/tmp/ewatrade-android36-signature.txt`.
Only this receipt is committed, not the binary, credentials or private logs.

Brain impact: local marketing feature and full-polish task pointers now record
completed Preview acceptance, live signup repair and signed artifact inspection.
No new product source, API contract, schema or assistant authority changed; prior
source checks are reused. Documentation whitespace/scope validation passes.
