# Marketing Lead Capture

## Goal
Capture public marketing interest from merchants and partners through the marketing landing page so ewatrade can manage early access outreach and waitlist demand.

## Users
- Merchant owners
- Operations leads
- Interested partners evaluating the platform

## Flow
- Visitor lands on `apps/marketing`.
- Visitor chooses either `Request early access` or `Join the waitlist`.
- The marketing app submits the form to a Next.js route handler.
- The route validates the payload and persists a `LeadCapture` record through `@ewatrade/db`.
- Early access submissions also create a one-time `OnboardingSession` access token, defaulting to a seven-day expiry unless `EARLY_ACCESS_LINK_TTL_DAYS` is configured.
- The route enqueues a shared background notification job through `@ewatrade/jobs`.
- The job resolves a typed notification dispatch through `@ewatrade/notifications`, plans channel deliveries, and sends email messages through the shared email templates in `@ewatrade/email`.
- After marketing lead email dispatch, the job records delivery receipts back onto `LeadCapture.metadata.lastNotificationDispatch` and keeps a bounded `metadata.notificationDispatches` history so local and production smoke tests can prove whether admin/customer messages were sent, failed, or skipped.
- The early access confirmation email includes the secure `/signup?access_token=...` link. The signup page verifies the token, prefills the owner/business details it can infer, and the signup API consumes the token exactly once during workspace creation.
- The UI shows a success or error message without leaving the page.

## Data Model
- `LeadCapture`
  - `type` (`EARLY_ACCESS` or `WAITLIST`)
  - `email`
  - `fullName`
  - optional `companyName`
  - optional `roleTitle`
  - optional `phone`
  - optional `message`
  - optional `metadata`, including lead source data plus bounded notification receipt fields:
    - `lastNotificationDispatch`
    - `notificationDispatches`
- `OnboardingSession`
  - unique early-access token
  - expiry timestamp
  - completed flag
  - form data containing the source lead id, recipient email, generated signup URL, and lead context

## APIs
- `POST /api/early-access`
- `POST /api/waitlist`
- `GET /api/early-access/session?token=...`
- Both APIs currently trigger email-oriented notification side effects after persistence.

## Notification Stack
- `@ewatrade/notifications/types` defines the early-access and waitlist event schemas.
- `@ewatrade/notifications/payload-utils` provides typed event builders, author resolution, recipient normalization, and channel trigger helpers.
- `@ewatrade/notifications/services` provides the notification service interface and email dispatch service.
- `@ewatrade/email/templates` provides separate admin and customer email templates for early access and waitlist submissions.
- `@ewatrade/email` uses Resend as the default transport when `RESEND_API_KEY` is configured, and falls back to console delivery only when no provider key exists.
- `EMAIL_CAPTURE_FILE` enables a local JSONL capture transport for E2E tests. It must remain a server/runtime-only path and must not be imported into client notification bundles.
- `TEST_EMAILS` is the primary comma-separated smoke-test and local/dev safety recipient list for signup and notification email delivery, with `TEST_EMAIL` kept as a single-recipient fallback for older environments. Production recipients at the exact `@test.com` domain are routed to these test inboxes instead of the original disposable address.

## E2E Verification
- `bun run qa:marketing-onboarding-e2e` runs the local website onboarding proof after `CONFIRM_MARKETING_ONBOARDING_E2E=1` is set.
- The check creates three early-access leads, two waitlist leads, verifies notification receipt metadata, verifies a one-time early-access session, signs up one tenant, creates a Dry Cleaning / Laundry store, seeds four services with `SM`/`LG` variants, creates service orders and a public request link, captures a staff invite email, completes staff onboarding, and validates the dashboard `/services` page.
- In sandboxed Codex runs, the command may require elevated local-network permission so the verifier can connect to the already-running local marketing and dashboard dev servers.

## UI
- Hero CTA links jump to the relevant lead capture forms.
- Early access form captures richer context for outreach.
- Waitlist form captures lightweight intent with name and email only.
- Successful and failed submissions also emit client-side toast notifications through `@ewatrade/notifications-react`.

## Permissions
- Public, unauthenticated submission.
- Persistence remains server-side through the marketing app and shared DB package.
- Early access links are public but bearer-style secrets; the signup API rejects invalid, expired, already-used, or mismatched-email access tokens.

## Edge Cases
- Invalid or malformed payloads return `400`.
- Database connectivity failures return an error message in the form UI.
- Repeated submissions are currently allowed and can be deduplicated later operationally.
- Expired or already-used early access links return `410` from the session and signup APIs.

## Future Improvements
- Add anti-spam protection and rate limiting.
- Continue tightening the Trigger.dev-backed execution path until all notification producers enqueue remote jobs in configured environments.
- Add CRM or email automation integration.
- Add lead source attribution and campaign metadata.
- Add admin tooling for reviewing captured leads.
