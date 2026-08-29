# Error And Observability System

## Summary

EwaTrade uses one typed error contract and one privacy-first observability
policy across API, jobs, dashboard, marketing, storefront, POS, and mobile.
The desktop wrapper inherits the dashboard runtime and does not initialize a
second telemetry SDK.

## Shared Contracts

- `@ewatrade/errors` classifies expected business failures and reportable
  systemic failures without message matching. It owns stable error codes,
  public messages, retryability, reportability, status, and opaque references.
- `@ewatrade/observability` converts reportable failures into safe diagnostic
  errors and reconstructs outbound events from an allowlist. It never mutates
  or forwards the original event object.
- Expected offline/idempotency/stock/quote/auth/validation/access conflicts are
  returned to product UX and normally suppressed from external reporting.
- Database timeouts/write conflicts and payment, registrar, messaging, or
  storage outages use reportable typed wrappers without provider bodies.

## Transmission Policy

External diagnostics require all of the following:

1. the repository's explicit code authorization;
2. `production` deployment identity;
3. `NODE_ENV=production`;
4. a non-empty runtime DSN; and
5. a non-empty release.

Source-map upload additionally requires an auth token, organization, and
runtime project. Development and preview never transmit diagnostic events.

Allowed event data is limited to runtime, stable code, bounded operation and
request identifiers, release/symbolication metadata, sanitized stack frames,
and the opaque error reference. Customer, merchant, staff, tenant, order,
inventory, payment, address, phone, conversation, media, prescription,
provider, request, header, cookie, token, device, and payload content is
excluded by reconstruction.

## Runtime Wiring

- Hono assigns/reuses one server-minted request id, returns it in
  `X-Request-Id`, and applies safe error envelopes at REST and tRPC boundaries.
  Caller-supplied correlation values are ignored and cannot become diagnostic
  tags.
- Registrar, payment, messaging, and storage workflows wrap provider failures
  at their operational call sites. Inventory/idempotency/customer-access
  failures preserve structural domain causes for precise non-noisy codes.
- Next.js runtimes initialize server, edge, and client SDK boundaries, provide
  global recovery UI, and capture terminal TanStack Query failures without
  changing existing retry behavior.
- Trigger captures only terminal task failure after the task runner finishes;
  task payloads are not attached.
- Mobile retains its Expo plugin, Metro configuration, native artifacts,
  wrapped root, OTA flush behavior, and `cipron-concepts/ewatrade-mobile`
  identity while using the shared policy.

## Rollout State

Source implementation and local build verification completed on 2026-08-29.
Every independently deployed runtime still needs its DSN, release, project,
and upload credentials provisioned in the deployment system, followed by one
synthetic production event and symbolication check. The existing mobile
Production upload token must first gain permission for the mobile project.
