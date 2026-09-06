# QA Accelerator Preview Readiness

## Purpose

Release the mobile and website QA Accelerator to an authorized local
development, development, or preview environment without exposing production
controls or live-provider effects.

## Required configuration

- `APP_ENV=development|preview`
- `QA_ACCELERATOR_ENABLED=true`
- `QA_ACCELERATOR_SECRET` with at least 32 random characters
- `EMAIL_QA_DOMAIN_ROUTES` containing every exact routed QA Domain
- `QA_ACCELERATOR_ALLOWED_ORIGINS` containing every exact website preview
  origin; custom preview hosts must be listed explicitly
- Optional `QA_ACCELERATOR_TRUSTED_CLIENT_IP_HEADER=cf-connecting-ip|x-real-ip`
  only when the preview origin is reachable exclusively through a trusted
  proxy that overwrites that header. Otherwise leave it unset; caller-supplied
  forwarding headers are not rate-limit identities.
- `QA_MESSAGING_TEST_ADAPTER_ENABLED=true` only when its registered test
  adapter is part of the acceptance run
- Mobile preview identity (`APP_VARIANT=preview`) with its distinct name,
  scheme, bundle id, and Android package

Production must set `APP_ENV=production` and keep
`QA_ACCELERATOR_ENABLED=false` or absent.

## Android local connection preflight

Start the current source from one root-managed session:

```bash
bun run dev --local -f mobile api jobs dashboard
```

Then connect only the emulator or device assigned to the current task:

```bash
bun run mobile:android:connect --device emulator-5556
```

The command installs and verifies Android reverse mappings for API `3095` and
Metro `3096`, probes Metro status and API database health, and checks the
`qaAccess.capability` contract. It refuses to choose silently when multiple
Android transports are online. Add `--require-qa` for QA-profile acceptance;
that strict mode fails if transport is healthy but the selected server profile
has QA disabled or misconfigured.

After all probes pass, the command force-stops only the selected development
client and opens the verified Metro URL through its Expo development-client
scheme. This avoids both the disconnected Expo launcher state and the duplicate
Fabric surface race observed when reattaching an already-running client. Use
`--no-launch` when only transport and capability diagnostics are required.

To open a development-only QA screen, wait until the React Native project is
visibly mounted, then send its app-specific URL through the separate native
launcher:

```bash
bun run mobile:android:open --device emulator-5556 --url 'ewatrade-dev://business-home-market-ledger?state=attendant&theme=light'
```

Do not append `/--/route` to the Metro URL embedded in
`exp+ewatrade://expo-development-client`. That syntax belongs to Expo Go and
makes Metro handle the path as a web/static document request; the Android
development client can then surface a misleading `SocketTimeoutException`.
The native launcher requires one explicit online device, verifies that the
EwaTrade project is already resumed, preserves URL query separators through
ADB's remote shell, and rejects development-client or `/--/` URLs.

Treat its states independently:

- `API cannot be reached`: no healthy listener exists on `3095`.
- `stale or wrong environment`: a listener exists, but the current QA tRPC
  procedure is absent; stop that EwaTrade API process and restart the unified
  stack from current source.
- `QA profile selection is not configured`: Android, Metro, and API are
  connected, but the required server configuration above is absent. No QA
  Access Profile list should be expected until configuration and eligible QA
  data exist.

The 2026-09-06 recurrence combined a missing `3095` reverse mapping with an API
process left running since 2026-08-25. After replacing that process, the local
profile truthfully reported `category: disabled`; its selected database health
response contained zero accounts. Evidence is archived at
`.scratch/mobile-architecture-hardening-and-feature-completion/screenshots/runtime-failures/2026-09-06-android-connection/01-connected-local-qa-disabled.png`.

For local HTTP preview acceptance, set `API_URL`, `NEXT_PUBLIC_API_URL`, and
`BETTER_AUTH_URL` to the same local HTTP API origin. Otherwise an inherited
HTTPS origin can correctly emit a `__Secure-` session cookie that WebKit must
reject on localhost. Deployed preview origins remain HTTPS and should retain
secure cookies.

## Schema gate

The additive `QaTesterGrant`, `QaClientAuthorization`,
`QaAccessProfileSelection`, `QaAccessAttemptBucket`, and `QaAccessAuditEvent`
models plus QA-derived `Session` fields must exist on the selected development
database. Run the repository-required migration and push commands only after
the owner explicitly confirms the resolved database identity. Never substitute
production, another shared database, or a manually authored migration.

## Issue and revoke tester access

Issue from the configured non-production profile:

```bash
bun --filter @ewatrade/db qa:issue-tester-credential --domain ishack.qa.test --tester tester@example.com --expires-in-hours 168
```

Copy the returned credential once through an approved secret channel and keep
the returned grant id. Revoke it when the test window closes:

```bash
bun --filter @ewatrade/db qa:revoke-tester-credential --grant-id <grant-id>
```

Revocation must invalidate all client authorizations and derived sessions.

## Tester flow

Give invited testers the standalone
[QA Accelerator Tester Handoff](./qa-accelerator-tester-handoff.md) before
issuing a credential. It contains no reusable secret and is safe to share with
the invited test group.

1. Open the local/development or preview mobile channel, or an allowlisted
   local/development or preview website origin.
2. Confirm the first business-shell view is a non-dismissible QA access sheet.
3. Enter the exact QA Domain and tester credential.
4. Confirm only active QA businesses and Stores for that exact domain appear.
5. Select one profile and confirm an ordinary scoped session opens.
6. On login, registration, and every declared safe form, use Quick Fill and
   verify it changes only the local draft. Dirty drafts require confirmation,
   Undo restores the entire replaced draft, and submission remains manual.
7. Confirm generated emails use the exact QA Domain and arrive through the
   existing routed-email policy.
8. Clear/change the QA Domain and confirm the derived session is revoked and
   the front-door sheet returns.

Private media, passwords, OTPs, app-lock PINs, provider credentials,
destructive confirmations, regulated decisions, and live commercial checkout
remain excluded.

## Artifact boundary verification

After compiling all three clients for one mode, run the verifier against the
artifact directories. `QA_MARKETING_ARTIFACT_DIR` and
`QA_DASHBOARD_ARTIFACT_DIR` point to the corresponding Next.js output roots;
`QA_MOBILE_ARTIFACT_DIR` points to the Expo export root.

```bash
QA_ARTIFACT_MODE=preview \
QA_MOBILE_ARTIFACT_DIR=<preview-expo-export> \
QA_MARKETING_ARTIFACT_DIR=<preview-marketing-next-output> \
QA_DASHBOARD_ARTIFACT_DIR=<preview-dashboard-next-output> \
bun run qa:accelerator:artifact
```

```bash
QA_ARTIFACT_MODE=production \
QA_MOBILE_ARTIFACT_DIR=<production-expo-export> \
QA_MARKETING_ARTIFACT_DIR=<production-marketing-next-output> \
QA_DASHBOARD_ARTIFACT_DIR=<production-dashboard-next-output> \
bun run qa:accelerator:artifact
```

Preview must contain the expected controls, fixture markers, and exactly six
marketing QA handlers. Production must contain none of those markers or routes.
Do not reuse a `.next` directory after compiling the other mode; keep separate
artifact roots as shown above.

## Acceptance matrix

- Android and iOS: optional and dismissible first-launch suggestion, ordinary
  login/registration/onboarding without QA, login `Set QA`/update entry,
  persisted authorization, offline retry, upgrade-required, revoke/expiry,
  chooser search/loading/selection, sign-up, representative Customer/Staff/
  Catalog/Inventory/Order/Service forms, dirty confirmation, Undo, keyboard,
  light/dark, and logout/front-door return.
- Website: Chromium and WebKit at each preview origin, first-view block,
  cookie persistence, cross-tab revoke, chooser, signup/lead/dashboard forms,
  exact-domain emails, dirty confirmation, Undo, and ordinary session cookies.
- Providers: spies prove zero unauthorized live SMS, WhatsApp, payment,
  subscription, domain/hosting, private-media/analysis, refund, or destructive
  calls. Test adapters return unmistakably non-live receipts.
- Production: the API procedure tree omits `qaAccess`, marketing route discovery
  omits every `route.qa.ts` handler, web QA providers/fixtures are replaced,
  the mobile resolver uses production no-ops, and artifacts contain no QA
  authorization, QA Domain, `qa+`, fixture-generator, profile-chooser, or Quick
  Fill markers.
- Cleanup: revoke the grant, purge only the exact disposable QA fixtures, and
  retain content-free audit evidence. For the interactive browser/mobile
  fixture, send a newline and wait for the `status: "disposed"` record before
  terminating its process; an interrupting terminal may not leave enough time
  for asynchronous database disposal. Always perform an exact post-run residue
  count for the fixture's grant, authorizations, sessions, audits, tenants, and
  users.

## Current evidence and open gates

As of 2026-08-29, the focused QA/provider suites pass, including exact-domain
fixtures, scoped sessions, trusted network identity, provider policy, hosted
checkout, queued-provider guards, mobile build aliases, notification paths,
mobile provider hierarchy, and Quick Fill icon aliases. Targeted Biome and diff
hygiene checks pass.

The source coverage guard scans mobile field-bearing files plus every physical
marketing/dashboard `<form>`. Any new source file or added web form fails until
its logical form id is present in QA Form Coverage or the source is explicitly
classified as a reusable primitive, design fixture, Customer-shell boundary,
or other non-product form.

The reachable-recipe guard additionally maps every recipe to a source-owned
Quick Fill control. Current coverage includes the nested mobile Catalog option
editor and dashboard Store Conversation reply/assignment drafts. Those controls
must keep submit/save/send as a separate manual action and retain full Undo.
Keep marker-bearing display copy inside the aliased QA control itself; custom
`label="Quick Fill …"` props can survive as inert strings in a production
bundle even when the imported control resolves to a no-op. The production scan
also treats `QA accelerator` copy as a forbidden marker.

For packaged-stock transformation acceptance, create two current Packaged
Stock balances for the same Store, Product, variant, and configuration. Quick
Fill must use the exact factors and transaction scales returned by
`inventory.balanceReport`, refuse an understocked or inexact pair before
changing the draft, and leave `transformPackagedStock` as the only manual
submission path.

Fresh Android exports prove the split: the preview artifact at
`/private/tmp/ewatrade-preview-qa-isolated-20260827` contains the expected QA
Domain, tester-credential, `qa+`, fixture-generator, and Quick Fill markers;
the production artifact at
`/private/tmp/ewatrade-production-qa-isolated-20260827` contains none of them.
Post-audit exports repeat that boundary after adding nested Catalog options,
manual payment, and exact Unit Conversion recipes. The preview artifact is
`/private/tmp/ewatrade-preview-qa-post-audit.XXxweG`; the matching production
artifact is `/private/tmp/ewatrade-production-qa-conversion-fixed.930Ydy`.
Production and preview Webpack compilation passes for marketing and dashboard.
Production marketing client chunks and route manifest contain none of the QA
markers or QA routes; preview compilation contains the controls and all six QA
routes. Production dashboard client chunks contain no QA markers; preview
chunks contain the expected Quick Fill/fixture markers. Production API router
inspection found 328 ordinary procedures and no `qaAccess` procedure; preview
inspection found seven `qaAccess` procedures.

The isolated Android EAS preview build
`ae63dd50-158f-4889-8639-a8a8151a74f5` completed on 2026-08-29 for
`com.ewatrade.preview`, versionCode 4, and produced the internal-distribution
APK at
`https://expo.dev/artifacts/eas/bxSQIzMNM4fxe5trbMK1CAqOP6vWR4DpHhpG_OsY4Jc.apk`.
The first cloud attempt exposed an EAS config-loader incompatibility with a
local TypeScript config-plugin import; the plugin now exposes a CommonJS entry
and its idempotency test passes. A subsequent native compile reached only the
Sentry source-map upload task, which lacked a preview auth token. The preview
profile now sets `SENTRY_DISABLE_AUTO_UPLOAD=true`, leaving runtime reporting
enabled and production upload behavior unchanged. Treat the successful EAS
artifact as cloud build/signing evidence only; install it and complete the
preview interaction/recovery matrix before closing Ticket 15.

The optional mobile QA entry correction was subsequently published to the
Android `preview` channel as EAS Update version `2026.08.29`, runtime `1.0.0`,
update group `2d42f319-258e-4701-92af-57198f7c34f0`, Android update
`01a04e74-b8d9-7b0d-ac92-2bfece1b3b8c`. `eas channel:view preview` confirmed
this is the channel's latest update group. The publish used the current dirty
working tree, so this evidence identifies the exact update IDs and must not be
treated as a clean-commit reproducibility claim.

The durable `bun run qa:accelerator:artifact` verifier now checks preview
presence and production absence across mobile bundles, marketing/dashboard
client chunks, and the marketing route manifest. Its four fixture tests pass.
The tester handoff documents credential delivery, front-door entry, profile
selection, Quick Fill and exclusions, revoked/offline recovery, Clear QA Data,
and evidence redaction.

The owner-authorized development migration and push completed against the exact
fingerprint-verified Neon target. A disposable integration lifecycle passed 37
assertions for authorization, exact-domain discovery, redaction, exclusion,
concurrent one-time profile selection, ordinary mobile/web sessions,
revocation, and protected access, then recorded zero run-owned residue.

Local Chromium development acceptance passed the blocking QA Domain gate,
two-business chooser, ordinary dashboard session, Catalog Quick Fill, Staff
email Quick Fill with the exact routed domain, and a 390-pixel layout. Installed
Android development acceptance initially passed the authorization sheet,
two-profile chooser, ordinary Business session, Product Quick Fill, secure
restart persistence, foreground revocation, and nested Staff-sheet domain-bound
Quick Fill. The subsequent non-blocking correction was also installed and
verified: `Continue without QA` dismisses the first-entry suggestion, reveals
enabled ordinary onboarding controls, and remains dismissed when the current
app session returns to the foreground. Source regression coverage verifies the
login `Set QA` CTA reopens authorization; forcing the installed device out of
its existing authenticated/onboarding state was intentionally avoided. No form
was submitted and no email or provider effect was invoked. Three mobile design
samples were rendered; the guided-card design was selected and implemented. A
scoped GStack mobile UI review closed cleanly at quality score 10 after fixing
the sheet layout, missing Quick Fill icons, and provider placement for nested
bottom-sheet modals.

Real WebKit local-preview acceptance also passed first-view blocking, safe
invalid-credential handling, HttpOnly/SameSite cookie persistence across
refresh/direct/Back navigation, keyboard chooser search, two tabs, cross-tab
revocation and reauthorization, ordinary dashboard entry, and Staff Quick Fill
at 1280 and 390 pixels. The generated email used the exact routed QA Domain and
the request observer confirmed no Staff mutation. Repeat with
`bun --cwd apps/mobile qa:accelerator:webkit` and the documented
`QA_ACCEPTANCE_*` inputs; evidence defaults to a disposable directory supplied
by the operator.

The same WebKit runner intercepts the first capability request to prove that a
network failure leaves the dialog blocking, then returns an explicit
misconfigured capability to prove that it also remains blocking. The runner
uses Retry connection and Retry configuration to return to the ordinary
credential form before continuing the full flow. Evidence includes
`00-network-fail-closed.png`.

An installed iOS 26.5 development build also completed CocoaPods resolution,
native compilation, signed keychain entitlement, Metro bundling, API
connectivity, launch, and first-view inspection of the earlier authorization
sheet. The durable app-config plugin adds modular headers for
GoogleUtilities and RecaptchaInterop idempotently. Runtime screens read public
config from `expo-constants`; a focused regression rejects an import of the
Node-backed `app.config.ts` from the runtime bundle. The locked macOS host
prevented completion of the iOS optional-dismissal correction, chooser,
persistence, Quick Fill, and revocation interactions, so those checks remain
open.

The full Next.js build typecheck phase exceeds the available heap even at 8 GB,
and the DB package typecheck exhausts its 4 GB heap after Prisma client
generation, so neither is claimed as passed; shared utility typecheck,
compilation, focused tests, and artifact scans were completed. The remaining
iOS interaction matrix, a deployed preview origin/channel, the complete
invalid/locked/expired/offline/version-skew matrix, routed-email receipt, and
any controlled live canary remain unexecuted and must not be inferred from the
development evidence.
