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

## UI
- Hero CTA links jump to the relevant lead capture forms.
- Early access form captures richer context for outreach.
- Waitlist form captures lightweight intent with name and email only.

## Permissions
- Public, unauthenticated submission.
- Persistence remains server-side through the marketing app and shared DB package.

## Edge Cases
- Invalid or malformed payloads return `400`.
- Database connectivity failures return an error message in the form UI.
- Repeated submissions are currently allowed and can be deduplicated later operationally.

## Future Improvements
- Add anti-spam protection and rate limiting.
- Add CRM or email automation integration.
- Add lead source attribution and campaign metadata.
- Add admin tooling for reviewing captured leads.
