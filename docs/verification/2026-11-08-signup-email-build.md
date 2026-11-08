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
Resend is contacted. The fixed hosted deployment subsequently passed the live
delivery check below.
Account creation and Apple review readiness remain separate acceptance steps.

## Provider and observability findings

The initial explicitly approved Google login selected Resend's SaaS workspace.
Its email, domain and API-log views were empty. This does not establish that
historical mail was deleted or that EwaTrade has never sent mail. The configured API key refuses
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
- The sole release coordinator completed rollout through the existing release
  path, followed by one exact-deployment live signup retry below. Checkout and
  paid gates stay closed; Apple remains 2/6 accepted milestones.

Brain impact: local error-observability feature, BRAIN and in-progress task pointer
updated. They remain ignored local memory, not force-added Git content. No API
contract or schema documentation change is needed for this build-mode repair.

## Production delivery accepted — 8 November 2026

Fix commit `dafec2e01fda01b243a8207f5092b011ff46bb03` passed matching Preview
web smoke, receipt `f5d7ab34-b680-4563-9366-1699c5b8bdf4`. The normal release
executor then completed Production rollout and API health successfully. Exact
Production API: `dpl_7A7vegqRxaiUVanBUsw9RPNcLmHg`, canonical
`https://api.ewatrade.com`, at that source commit.

One authorized retry from the retained Production Dashboard signup form returned
HTTP 200 for `auth.requestMobileOwnerOtp` at **12:14:50 WAT**. The browser advanced
to Enter the 6-digit code, and Resend marked the corresponding reviewer email
**Delivered**, email ID `01a1bade-5d52-721b-9670-af328da09b1c`. This closes the
signup email-sending defect; no OTP/body was read, no code was entered and no
account was created by the agent. The owner must perform final account verification
directly before reviewer workspace preparation continues.

Workspace correction: the retained Resend session later showed **ewatrade**, with
`ewatrade.com` Verified and the sending-only Onboarding key. Its log contained the
exact configured-key read probe, linking this workspace to the app configuration.
The Last 30 days email view was empty before the successful retry; it now contains
the Delivered message. The earlier empty SaaS view was a different selected
workspace. Resend's published [retention policy](https://resend.com/security/gdpr)
keeps email/log data for 30 days on Free, Pro and Scale; this can explain older
missing records, without proving when EwaTrade previously sent mail.

Private screenshot and sanitized metadata evidence remain under `/private/tmp`;
no recipient address, code, credentials or email content is committed here.
Source evidence above is reused unchanged; this append records hosted acceptance,
not a new test run. Sentry provisioning and remaining Apple paid milestones are
unchanged. The native archive pin was lifted before this documentation commit.
