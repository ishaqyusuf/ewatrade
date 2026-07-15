# Mobile Google OAuth Setup

Use the dedicated EwaTrade Google Cloud project:

https://console.cloud.google.com/auth/clients?project=ewatrade-mobile-retail-ops

The After Service Google Cloud project was only used as a reference for the existing web OAuth pattern. EwaTrade mobile uses native Google Sign-In for Android/iOS development and production builds, Expo Auth Session only for Expo web, and server-side ID-token audience checks across Android, iOS, and web/generic client IDs.

Android must not use Expo AuthSession with `androidClientId`; Google rejects that path because it sends a custom app redirect scheme with an Android OAuth client. Native builds use `@react-native-google-signin/google-signin`, `GoogleSignin.configure`, Android Play Services validation, and the configured web client ID to obtain a secure ID token for `auth.verifyMobileGoogle`.

Reference checked on 2026-07-12:

- `/Users/M1PRO/Documents/code/micro-startups/after-service/packages/auth/src/index.ts` configures Better Auth with `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for dashboard web OAuth.
- `/Users/M1PRO/Documents/code/micro-startups/after-service/brain/bugs/2026-06-08-google-signup-failed.md` documents the web callback shape: dashboard-owned `/api/auth/sign-in/social` and `/api/auth/callback/google`.
- EwaTrade mobile instead requests a Google ID token with Expo Auth Session and sends it to `auth.verifyMobileGoogle`, so the API must allow the `aud` values for the native Android, native iOS, and web/generic client IDs.

## Required OAuth Clients

Create or reuse these OAuth client IDs from **APIs & Services > Credentials**.

### Web Client

Use this client ID for server-side allowed audience checks, Expo web AuthSession, and native Google Sign-In ID-token issuance.

Set:

```env
GOOGLE_CLIENT_ID=211207022957-rus56d1m8811dhrhdgl9dskjbfo61e0d.apps.googleusercontent.com
GOOGLE_WEB_CLIENT_ID=211207022957-rus56d1m8811dhrhdgl9dskjbfo61e0d.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_CLIENT_ID=211207022957-rus56d1m8811dhrhdgl9dskjbfo61e0d.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=211207022957-rus56d1m8811dhrhdgl9dskjbfo61e0d.apps.googleusercontent.com
```

### Android Development Client

Package name:

```text
com.ewatrade.dev
```

Set:

```env
GOOGLE_ANDROID_CLIENT_ID=211207022957-g1t883us09m81ea98d63irlo1vhp396q.apps.googleusercontent.com,211207022957-915i1tugrtm8ljda6grpsi7fb42sqp20.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=211207022957-g1t883us09m81ea98d63irlo1vhp396q.apps.googleusercontent.com
```

The mobile app requires `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` on Android and a web/generic client ID for the native sign-in ID token. It intentionally does not treat the generic or web client ID alone as Android-ready, so a missing Android client falls back to the email-code path with a clear setup message.

The Android OAuth client also needs the SHA-1 certificate fingerprint for the app build that will run Google sign-in.

Local development debug keystore was created on 2026-07-11 at:

```text
~/.android/debug.keystore
```

Use this SHA-1 for the Google Cloud Android development OAuth client:

```text
A7:A1:5D:42:BD:71:31:81:D3:F0:B0:57:75:F5:3C:9C:22:A1:99:34
```

### Android Production Client

Package name:

```text
com.ewatrade.app
```

Use the production upload/app-signing SHA-1 from Google Play or EAS credentials when production build setup is ready.

EAS production upload keystore SHA-1 copied from the Expo project on 2026-07-12:

```text
B9:27:4B:A6:33:A7:F9:DD:58:0E:37:A2:56:A4:99:59:68:A7:66:C3
```

Set for production or preview builds:

```env
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=211207022957-915i1tugrtm8ljda6grpsi7fb42sqp20.apps.googleusercontent.com
```

### iOS Development Or Production Client

Bundle IDs:

```text
com.ewatrade.dev
com.ewatrade.app
```

Set:

```env
GOOGLE_IOS_CLIENT_ID=211207022957-00l0378tlj8bv403hif9cuq3mcnfhc2t.apps.googleusercontent.com,211207022957-u8gitr3tdh7gun8atsoffai037sev2ut.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=211207022957-00l0378tlj8bv403hif9cuq3mcnfhc2t.apps.googleusercontent.com
```

The mobile app requires `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` on iOS and a web/generic client ID for the native sign-in ID token. It intentionally does not treat the generic or web client ID alone as iOS-ready. `apps/mobile/app.config.ts` derives the `iosUrlScheme` for the Google Sign-In config plugin from the primary configured iOS client ID, so changing dev/prod iOS credentials requires rebuilding the native app.

Use `211207022957-u8gitr3tdh7gun8atsoffai037sev2ut.apps.googleusercontent.com` for production or preview builds with bundle id `com.ewatrade.app`.

## Expo Environment Variables

On 2026-07-12 the `@cipron-startups/ewatrade` Expo project was configured with plain-text project environment variables:

- `development`: `EXPO_PUBLIC_APP_VARIANT=development`, web/generic Google client IDs, Android dev client ID, and iOS dev client ID.
- `production`: `EXPO_PUBLIC_APP_VARIANT=production`, web/generic Google client IDs, Android production client ID, and iOS production client ID.
- `preview`: `EXPO_PUBLIC_APP_VARIANT=preview`, web/generic Google client IDs, Android production client ID, and iOS production client ID.

## QA Gate

Google auth is not complete until:

- `.env` contains the matching Google client IDs.
- `bun run --cwd apps/mobile qa:google-oauth-ready` passes.
- Native Android/iOS builds include the `@react-native-google-signin/google-signin` config plugin.
- Android AuthSession does not pass `androidClientId`; Android Google auth must use native Google Sign-In.
- The API environment has at least one allowed Google audience.
- The mobile app launches Google sign-in from login.
- The mobile app launches Google sign-up after business name entry.
- `auth.verifyMobileGoogle` accepts a real Google ID token and creates or resumes a mobile session.
- Wrong-audience and unverified-email responses fail safely into the email-code path.

## Local Setup Status

- Android development SHA-1 is available.
- The dedicated EwaTrade Google Cloud project `ewatrade-mobile-retail-ops` was created on 2026-07-12.
- The mobile source now uses native Google Sign-In on Android/iOS and sends the returned ID token to `auth.verifyMobileGoogle`. Expo AuthSession remains available only for the Expo web path.
- Expo Go cannot fully test native Google Sign-In; use a development build or production build for native provider QA, and use email-code auth as the fallback inside Expo Go.
- Google OAuth env keys are configured in `.env`, `.env.production`, `apps/mobile/.env.local`, and `apps/mobile/.env.production` as of 2026-07-12.
- Expo project environment variables are configured for development, preview, and production as of 2026-07-12.
- `bun run --cwd apps/mobile qa:google-oauth-ready` passes against the root local env, root production env, mobile local env, and mobile production env.
- A fresh Google ID token was generated from the web client for `ishaqyusuf024@gmail.com` on 2026-07-12, proving the consent/test-user path can issue an ID token for the configured EwaTrade app. The token is short-lived and should not be stored in docs.
- For live sign-up QA, also set `GOOGLE_LIVE_NAME` and `GOOGLE_LIVE_BUSINESS_NAME` to disposable values. They are ignored for login mode, but the live readiness gate requires them when `GOOGLE_LIVE_MODE=sign_up` so the new-owner path can create the first business context intentionally.
- The readiness script intentionally does not print configured values. It checks that configured values look like Google OAuth client IDs ending in `.apps.googleusercontent.com`, and that the API audience keys include the same client IDs used by the Expo mobile keys:
  - `GOOGLE_ANDROID_CLIENT_ID` must include `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`.
  - `GOOGLE_IOS_CLIENT_ID` must include `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.
  - `GOOGLE_WEB_CLIENT_ID` or `GOOGLE_CLIENT_ID` must include the Expo web/generic client ID.
- Live provider/API QA still requires a fresh `GOOGLE_LIVE_ID_TOKEN`, an approved API URL, expected email, auth mode, and explicit `GOOGLE_LIVE_CONFIRM_AUTH=1`.
