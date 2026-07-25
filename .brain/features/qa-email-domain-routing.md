# QA Email Domain Routing

## Purpose

Route synthetic QA email addresses to the individual tester responsible for
that test domain without changing application email flows or risking delivery
to another tester.

## Configuration

- `EMAIL_QA_DOMAIN_ROUTES` is a JSON object whose keys are reserved `.test`
  domains and whose values are real, deliverable tester inboxes.
- Example:
  `{"ishaq.qa.test":"ishaq@example.com","mubarak.qa.test":"mubarak@example.com"}`.
- Any local part may be used with a configured domain. For example,
  `owner+shop-1@ishaq.qa.test` routes only to `ishaq@example.com`.
- Route domains are normalized case-insensitively and may include one trailing
  dot in configuration.
- Destinations cannot use `.test`, `.invalid`, `localhost`, or a
  `.localhost` subdomain.

## Runtime Behavior

- Routing is owned by `@ewatrade/email`, so mobile OTP, web signup, staff
  invitation, notification, and scheduled job email paths share one policy.
- Routed messages preserve the synthetic address as the original recipient in
  their HTML and text bodies.
- When QA routes are configured, an unmatched `.test` recipient fails closed.
- Ordinary deliverable addresses are unchanged.
- Exact `@test.com` routing through `TEST_EMAILS`, with `TEST_EMAIL` as its
  fallback, remains available for compatibility with existing environments.

## Deployment

- The API deployment script includes `EMAIL_QA_DOMAIN_ROUTES`.
- Turbo exposes it to application builds.
- Trigger.dev syncs it to the jobs runtime.
- The Vercel marketing/web project must define the same
  `EMAIL_QA_DOMAIN_ROUTES` value in each QA-enabled deployment environment;
  this repository has no marketing env synchronization script, so that host
  setting is an explicit deployment prerequisite.
- Mobile clients do not receive the map; mobile OTP delivery is performed by
  the API through the shared server-side email package.
