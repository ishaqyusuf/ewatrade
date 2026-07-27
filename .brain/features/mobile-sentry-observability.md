# Mobile Sentry Observability

## Summary

The Expo mobile application uses the official Sentry React Native SDK and the
`cipron-concepts/ewatrade-mobile` Sentry project for JavaScript error reporting,
native crash reporting, release artifacts, source maps, and debug symbols.

## Runtime Configuration

- `EXPO_PUBLIC_SENTRY_DSN` selects the mobile Sentry project.
- `EXPO_PUBLIC_SENTRY_ENVIRONMENT` separates development, preview, and
  production events without creating separate Sentry projects per environment.
- The SDK initializes before the Expo Router root layout mounts and wraps the
  root layout so React errors are captured.
- Sentry is disabled when the public DSN is absent.
- Automatic and manual EAS Update reloads flush pending Sentry events before
  restarting the JavaScript runtime.

## Build Configuration

- `@sentry/react-native/expo` configures native build integration for the
  `cipron-concepts/ewatrade-mobile` project.
- Metro starts from `getSentryExpoConfig` and then applies the existing
  NativeWind and monorepo resolver configuration.
- `SENTRY_AUTH_TOKEN` is a private build-time credential used only to upload
  source maps and native debug symbols. It must remain ignored locally and be
  stored as a secret in EAS for cloud builds.
- The DSN is intentionally public configuration; the upload token is not.

## Privacy Defaults

- `sendDefaultPii` is disabled.
- Session Replay is disabled.
- User Feedback is disabled.
- SDK Logs are disabled.
- These features require a separate privacy, retention, redaction, and product
  decision before they may be enabled.

## Verification

Run:

```bash
bun --cwd apps/mobile qa:sentry-config
bun --cwd apps/mobile tsc -p tsconfig.json --noEmit
```

The first native preview or production build after the EAS upload token is
configured must send one deliberate test exception. Confirm that the event is
received by `cipron-concepts/ewatrade-mobile` and that JavaScript and native
frames are symbolicated before closing the production handoff.

## Current Verification

On 2026-07-23, the Sentry configuration guard, mobile TypeScript, Expo
environment attachment, app-launch configuration, Expo prebuild config
resolution, Android Expo export, and diff hygiene checks passed. The Android
export correctly bundled the Sentry-aware Metro pipeline; its warning about
missing generated native configuration is expected before CNG/EAS prebuild
creates the ignored native projects. A live native event and symbolication
check remain pending. On 2026-07-26, Android Preview build
`246bf5c6-46f1-4fbd-b964-31461a0a4c44` passed the Metro bundle after the
Design 01 reference boards were included in the EAS upload, then failed in the
Sentry Gradle upload task because Preview had no `SENTRY_AUTH_TOKEN`. With
explicit owner authorization, the existing local token was then stored as the
project-scoped, Preview EAS secret `SENTRY_AUTH_TOKEN`. Replacement build
`0d20383d-ad6d-4425-888b-2d073718cf6c` completed successfully as Android
versionCode 4, including the Sentry source-map artifact upload for release
`com.ewatrade.app@1.0.0+4`. On 2026-07-26, with explicit owner authorization,
the complete mobile production configuration was synchronized to both
`production` and `preview` on the currently selected
`@startups-2/ewatrade-2` project. Metadata verification confirmed the public
Sentry settings are project-scoped public variables and `SENTRY_AUTH_TOKEN` is
a project-scoped secret in both environments. Preview build
`39b3766f-6dba-4ef3-8e0f-a46723b4894a` then proved that the token copied from
the production env file lacks permission for `cipron-concepts/ewatrade-mobile`:
its source-map upload received Sentry HTTP 403. The previously authorized,
known-working local token was restored to Preview only. Replacement Preview
build `74b14a10-2097-40c6-9f98-2708c36b81c6` completed successfully as
Android versionCode 7 and uploaded its Sentry artifact. Production still needs
a token with permission for the mobile Sentry project before a production
build can upload source maps. A deliberate native Preview event and
symbolication check remain pending.
