# Private Android Play Preview profile — source checkpoint

9 November 2026. Source implementation only; no build, upload, credential grant,
hosted configuration, purchase or rollout has been performed by this checkpoint.
The existing signed Production validation AAB 36 remains the historical artifact.

## Reason and accepted design

The registered Play package is `com.ewatrade.app`. Ordinary Preview uses
`com.ewatrade.preview`; Production correctly rejects Google test purchases because
those receipts belong to Sandbox. The Apple reviewer exception does not apply to
Google and is unchanged. The shared release coordinator reviewed this separate
Preview path under the owner's ongoing Android acceptance goal.

The existing EAS account runner now admits only:

```sh
bun run eas:build --preview --platform android --android-play-test --expected-commit <full-sha>
```

This is a reviewable future command, not approval to execute it. The existing clean
source and hosted-argument guards still apply, including the second source check
following authenticated environment attachment. `play-preview` extends Preview,
uses store-distributed AAB/local credentials, a dedicated channel, registered Android
package, Preview iOS identity, exact Preview service origins and a separate native
scheme. Fingerprint runtime policy remains; expo-updates and foreground update
checks are disabled for this artifact. Normal Preview and Production identities
and update behavior are unchanged. The test path cannot submit, publish an OTA,
or invoke the automatic Preview APK/download-site publisher. Ordinary submission
still requires the exact Production profile/channel/version/source.

`check-play-preview.mjs` additionally refuses absent/incorrect Sandbox owner/store
configuration, the wrong registered package or any of the three monthly mappings,
Production checkout/reviewer flags, incorrect Preview RTDN audience/push identity,
and invalid Publisher credentials. A separate local-keytool check requires the
registered AAB36 upload-certificate SHA-256; the keystore password is passed only
through the child environment, never command arguments or output. It reuses the actual product and RSA credential
parsers; no credentials are printed. Offline configuration checks do not prove
hosted API permissions, deployed settings or durable callbacks. This checkpoint
tests the signing guard with fixtures; the actual local keystore and signed
artifact have not been inspected for a new candidate.

## Verification

- Offline doctor and seven-owned-path fast plan: core/mobile/domain, no unknowns.
- Scoped fast smoke: 202 tests / 1,056 assertions, QA tooling types and Biome pass.
- Actual Expo config/profile/Sandbox negative checks: 5 tests / 68 assertions pass.
- Runner fixture suite: 98 tests / 605 assertions pass in a private temporary
  copy of the same runner, fixture and two helper files. SHA-256 equality was
  checked; no Git worktree or different implementation was used.
- Ordinary Preview inherited-opt-in clearing is passes 2 tests / 24 assertions separately after adding
  the explicit inherited flag/profile fixture. No external EAS calls occur: the
  fixture uses fake CLI/auth/attachment/git commands.
- Focused TypeScript check of app.config.ts and the runner, and assistant H02 pass.
  Existing route coverage evidence is reused: no route or merchant command changed.

The suite run directly from the checkout had twelve empty-stderr diagnostic
assertion failures; those same cases pass from the identical isolated copy.
The cause of that checkout-specific output behavior remains unproven. A baseline
copy also encountered one default five-second fixture timeout under concurrent
checks; the isolated suite used a bounded ten-second per-case timeout. These
observations are retained and are not signed-client or hosted acceptance.

Logs are private `/private/tmp/ewatrade-play-profile-*-2026-11-09.log` files.
No application flow, database, provider, emulator or payment was exercised.

## Gates before execution and acceptance

1. Owner approval of the prepared Publisher API terms/Enable and license-testing
   final Save; concrete separate review of any subsequent service-account, key,
   IAM/Play permissions and RTDN setup. Enabling an API alone grants none of those.
2. Release-owner verification of actual isolated Preview API/DB/owner configuration,
   credentials, package, exact product mappings and authenticated durable RTDN.
   Never copy a Production reviewer identity/policy into Preview.
3. Exact clean committed build candidate and local signing identity inspected;
   after an approved build, inspect the actual AAB package, upload certificate,
   version/source, IAP linkage, service URLs, channel, runtime and disabled OTA.
4. Separately approved exact upload/distribution and inactive base-plan activation
   scope when controlled testing is ready. A Play-delivered install on the approved
   physical Samsung with the licensed Google account is required for final proof.
5. Accepted legal/safety state and explicit controlled test checkout. A test track
   alone does not prevent charges; verify the license account and Google test method.

Official [Google billing test guidance](https://developer.android.com/google/play/billing/test)
permits preliminary same-package sideload/debug testing by licensed testers. Such
proof cannot replace final signed Play-delivered acceptance. The current emulator
is a Google APIs image with Play Store disabled and is not accepted for this proof.

[Regional catalog receipt](2026-11-09-play-regional-plans.md) ·
[Audience/country review](2026-11-09-play-audience-country-review.md)
