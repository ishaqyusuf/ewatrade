# Android36 SDK and transport evidence — 8 November 2026

Later source checkpoint: [9 November native prebuild hardening](2026-11-09-android-native-prebuild-hardening.md)
adds explicit release cleartext refusal and fixes the isolated Play Preview
scheme rejection. It does not change the frozen build36 facts below or establish
all-data encryption, signed acceptance or a final Data safety answer.

This advances the existing Data safety preparation while Google investigates
subscription-price error540F8949. It is a bounded manifest/source review, not a
network capture, final Data safety declaration or paid-release acceptance.

## Exact inputs and reusable evidence

Registered Production validation AAB36 (1.0.0), package `com.ewatrade.app`, EAS
`56f45d80-ec23-4368-add5-49329741f3a5`, source
`dafec2e01fda01b243a8207f5092b011ff46bb03`. Its previously inspected SHA256 is
`0c2527f3cfbb54ce377d5417c25cbf513192e1daac10c366f4256dc5aff4dde3`.
The owner-approved [upload and saved draft](2026-11-08-play-merchant-artifact-readiness.md)
are complete; no rollout was authorized by that upload.

9November official-reference check: Google's
[Play services disclosure page](https://developers.google.com/android/guides/play-data-disclosure)
explicitly covers only base, basement, OSS licenses and tasks. Its no-collection
statement cannot be reused for `play-services-auth`. The linked Sign-In guide
now redirects to Credential Manager documentation, not an auth-specific data
sheet. Exact auth SDK collection/transport therefore remains open; no new
sign-in or SDK migration was performed merely to inspect documentation.

Reused bundletool manifest: `/private/tmp/ewatrade-android36-manifest.xml`, SHA256
`c6c0a82490f6b528794c87e6574e42b508d236ecff2b116f8db495e30511ff74`.
A safe local extraction at `/private/tmp/ewatrade-android36-transport-evidence.json`
records the selected fields and eleven source paths compared byte-for-byte with
that frozen source. All eleven remain unchanged in the current checkout. The
concurrent TestFlight/profile and purchase-scope changes are excluded; no claim
about a future signed paid candidate follows from this equality check.

## Findings and limits

| Surface | Exact finding | Remaining proof |
| --- | --- | --- |
| Native location | The already accepted manifest inventory has no coarse/fine/background location permission. | Manual addresses, IP-derived location, embedded web behavior and relevant server handling still need accurate classification. Permission removal is not a blanket no-location statement. |
| Platform transport policy | `minSdkVersion=24`, `targetSdkVersion=36`; application has neither a `usesCleartextTraffic` override nor `networkSecurityConfig`. | Android9+ documents a default cleartext refusal for targets28+, with best-effort enforcement. The app also supports older OS levels24–27; the absent override does not establish an explicit cleartext block there. Neither inference proves every native socket/provider exchange. |
| Expo Updates | Actual manifest has updates enabled, HTTPS `https://u.expo.dev/532f9a55-f4f6-4d4e-b60b-ea6fa8807a3b`, Production channel and launch check `NEVER`. | `use-launch-auto-update.ts` explicitly calls `checkForUpdateAsync` / `fetchUpdateAsync`; NEVER is not proof that no update traffic occurs. Actual requests, metadata and redirects remain to reconcile. |
| Sentry | Actual native metadata sets `io.sentry.auto-init=false`. Frozen Production EAS profile sets `EXPO_PUBLIC_SENTRY_ENABLED=false`; `initMobileObservability` returns unless it is exactly true. | Native init/performance/NDK providers are still packaged. No runtime packet observation or all-native-silence claim is made; SDK presence alone is not collection. |
| Mobile analytics | Unchanged runtime/policy requires Production Android, explicit enabled/project flags, authentication and fresh server permission. Runtime admits only `https://ewatrade.com/api/analytics/mobile`; native adapter posts a bounded batch with installation ID and signed analytics context. | Actual embedded enablement, hosted allow/forward decisions, received payloads and downstream retention are not established by source guards. Do not call this anonymous or universally disabled. |
| EwaTrade API | tRPC and mobile authentication use the common configured base URL. The resolver requires configuration outside local Expo hosting but accepts the configured URL without enforcing HTTPS itself. | Reuse the exact build's Production origin preflight; verify its effective embedded values and redirects rather than treating a source default as a universal TLS guarantee. No configuration was changed. |
| Google sign-in | Unchanged Android path lazily loads native Google sign-in, requests email/profile with offline access false and sends the ID token to the existing API verification mutation. | Exact active client setup, Google SDK transport/data behavior and user-directed/provider classification remain to accept. No sign-in/provider invocation was run for this review. |
| Preview native installer | `installedBuild` / `resolveInstalledBuild` require Android Preview channel before native build-check/install flow. AAB36 uses Production channel. | This establishes the source/channel fence for that path; Expo OTA and external links remain separate. No app installation occurred. |

Android policy references checked8November:
[Network Security Configuration](https://developer.android.com/privacy-and-security/security-config#CleartextTrafficPermitted)
and [application cleartext policy and enforcement limits](https://developer.android.com/guide/topics/manifest/application-element#usesCleartextTraffic).
The default-policy conclusion above is an inference from the actual manifest and
these platform rules, not an observed traffic result.

## Source paths reused

- `apps/mobile/app.config.ts` and frozen `apps/mobile/eas.json`.
- `apps/mobile/src/observability/sentry.ts`.
- `apps/mobile/src/runtime/analytics-runtime.tsx` and
  `packages/events/src/{mobile-policy,native}.ts`.
- `apps/mobile/src/trpc/client.tsx`, `src/lib/{base-url,mobile-service-url}.ts`.
- `apps/mobile/src/hooks/use-mobile-google-auth.ts`.
- `apps/mobile/src/lib/app-update-client.ts` and
  `src/hooks/use-launch-auto-update.ts`.

## Next executable privacy work

1. Reconcile the exact target's non-secret enabled SDK/provider/model choices,
   gateway/media destinations and analytics forward settings through the existing
   release/operator owner. An absent local setting or supported adapter does not
   establish hosted behavior. Preserve credential custody and avoid test sends.
2. Accept recipient roles, original/backup/log retention and positive paid-owner
   deletion disposition using the existing privacy process; reuse the accepted
   empty-data case only for its actual scope.
3. Bind those facts to the actual signed paid candidate and freeze one complete
   legal/disclosure snapshot for the already-required exact-content approval.
4. Complete truthful Google Data safety answers and review materials after these
   facts are accepted. Do not choose Yes for all-data transit solely from this
   manifest review.

Google's [Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
requires app/SDK collection to be reconciled. Internal-only testing is exempt
from the published Data safety section; this does not waive the intended public
release's declaration or any app privacy/paid-test safeguards. The uploaded draft
is not evidence that final paid functionality or public disclosures are accepted.

No code, app/store configuration, legal metadata, provider activation, database
records, test fixture, support message, build or deployment changed in this audit.
No new device/traffic test was run. Valid source/Preview/artifact evidence is
reused; documentation doctor, owned-path mapping, links and whitespace are the
appropriate checks. Android remains1/8; Apple retains its independent checklist.
