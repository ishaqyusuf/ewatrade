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
- `EMAIL_DELIVERY_MODE` has canonical `console` and `live` values. QA domain
  routes are orthogonal and provider-delivered in either mode.
- Mobile OTP treats either `NODE_ENV=production` or `APP_ENV=production` as a
  production runtime. This keeps production-profile development servers from
  silently returning a development code and skipping provider delivery.
- Only a true non-production runtime uses the deterministic development OTP
  `123456`; preview and production QA-domain delivery continue to use random
  provider-delivered codes.
- Ordinary mail is console-only outside production and provider-delivered in
  production; mixed recipient lists are split per recipient.
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

## QA Tenant Lifecycle

- New tenants are server-classified from the creating owner's configured QA
  domain. Existing candidates require explicit platform-admin adoption.
- QA and ordinary identities cannot cross membership lanes.
- `/platform/qa-maintenance` previews marked tenants, counts, and provider
  blockers, then requires a ten-minute preview token and exact typed
  confirmation before Trigger starts the purge.
- Active subscriptions and purchased domains block deletion. The job revokes
  sessions, deletes tenant aggregates transactionally, removes orphaned users,
  supports partial retry, and retains only a counts-only `QaPurgeRun`.
