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
- The route enqueues a shared background notification job through `@ewatrade/jobs`.
- The job resolves a typed notification dispatch through `@ewatrade/notifications`, plans channel deliveries, and sends email messages through the shared email templates in `@ewatrade/email`.
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
  - optional `metadata`

## APIs
- `POST /api/early-access`
- `POST /api/waitlist`
- Both APIs currently trigger email-oriented notification side effects after persistence.

## Notification Stack
- `@ewatrade/notifications/types` defines the early-access and waitlist event schemas.
- `@ewatrade/notifications/payload-utils` provides typed event builders, author resolution, recipient normalization, and channel trigger helpers.
- `@ewatrade/notifications/services` provides the notification service interface and email dispatch service.
- `@ewatrade/email/templates` provides separate admin and customer email templates for early access and waitlist submissions.

## UI
- Hero CTA links jump to the relevant lead capture forms.
- Early access form captures richer context for outreach.
- Waitlist form captures lightweight intent with name and email only.
- Successful and failed submissions also emit client-side toast notifications through `@ewatrade/notifications-react`.

## Permissions
- Public, unauthenticated submission.
- Persistence remains server-side through the marketing app and shared DB package.

## Edge Cases
- Invalid or malformed payloads return `400`.
- Database connectivity failures return an error message in the form UI.
- Repeated submissions are currently allowed and can be deduplicated later operationally.

## Future Improvements
- Add anti-spam protection and rate limiting.
- Replace the current in-memory job fallback with a real Trigger.dev-backed execution path.
- Replace the console email transport with a production email provider adapter.
- Add CRM or email automation integration.
- Add lead source attribution and campaign metadata.
- Add admin tooling for reviewing captured leads.
