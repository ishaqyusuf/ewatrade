# Signup email build diagnosis — 8 November 2026

## Evidence and change

The owner observed a generic error immediately after Send code to email on the
Production Dashboard signup page. Vercel recorded HTTP 500 for
`auth.requestMobileOwnerOtp`, request `req_762f7e90-79fa-4b9a-9071-c79739bc65e2`,
on API deployment `dpl_8hHnYj6S3rTwYCYgv659bbShqA9G`. Its build log identifies
Git source `6a4948c8` and the ordinary Vercel Git build helper, rather than the
isolated release bundle. The safe error log does not expose the underlying cause.

That helper omitted `--production` from Bun's bundle arguments. A disposable
fixture now runs the actual helper against the real signup OTP email template,
with development build environment and Production execution. Only Prisma client
generation is stubbed; the actual bundle arguments and React renderer run.
Before the fix the regression fails with `jsx_dev_runtime8.jsxDEV is not a
function`. Adding `--production`, already present in the isolated API builder,
makes the same email render with the expected HTML and plain-text code. The
helper retains disabled environment inlining and both native externals.

This establishes a build defect capable of causing the observed failure before
Resend is contacted. The hosted error remains a hypothesis until the exact fixed
deployment successfully sends the signup code; source evidence alone does not
establish delivery, account creation or Apple review readiness.

## Provider and observability findings

The explicitly approved Google login opens Resend's SaaS workspace. Its email,
domain and API-log views are empty. This does not establish that historical mail
was deleted or that EwaTrade has never sent mail. The configured API key refuses
read access with `restricted_api_key`; that is not evidence that sending fails.
Complete linked Production environment-name inventory confirms the email sender
and key are present, without decrypting or comparing their values.

The API's own and linked shared Production variables contain neither
`SENTRY_DSN` nor `SENTRY_RELEASE`. Existing instrumentation therefore fails its
transmission gate closed. The accessible organization project discovery returned
the mobile project only. No Sentry project/configuration was changed, and the
owner's source-map upload hold remains. The Dashboard signup bridge also handles
the server failure as a JSON response rather than an uncaught browser error.

## Validation and remaining acceptance

- Offline doctor passes without service, database or device probes.
- Focused build/template, native-external and provider-config checks pass:
  9 tests / 22 assertions. Regression was observed red before the fix and green
  afterward. No email, provider, business fixture or database write is made.
- Scoped `test:quick --files scripts/build-api-vercel.mjs
  scripts/build-api-vercel-email.test.ts` passes core smoke, QA tooling types and
  changed-file Biome after formatting the new test. This is scoped source proof.
- Assistant coverage snapshot and impact gates pass; no merchant capability,
  procedure, permission, schema or assistant authority changed.
- Sole release coordinator must deploy the committed API build fix through the
  existing release path, then bind one live signup retry to the exact deployment.
  No deployment is performed by this source change. Checkout and paid gates stay
  closed; Apple remains 2/6 accepted milestones.

Brain impact: local error-observability feature, BRAIN and in-progress task pointer
updated. They remain ignored local memory, not force-added Git content. No API
contract or schema documentation change is needed for this build-mode repair.
