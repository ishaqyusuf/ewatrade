# ADR-0003: Use Package-Driven Notifications, Email, and Jobs Boundaries

## Status
Accepted

## Context
The platform needed an initial notification and email delivery foundation that could be reused across apps without baking transport logic into route handlers. The user explicitly asked to use `~/Documents/code/plot-keys` as the implementation reference for this area, and the first live use case is marketing lead capture.

## Decision
- Introduce `packages/notifications` to own notification payload composition and delivery planning.
- Introduce `packages/notifications-react` to own client-side notification delivery primitives for React apps.
- Introduce `packages/email` to own email defaults, templates, message creation, and delivery transports.
- Introduce `packages/jobs` to own background execution helpers, retry behavior, and notification dispatch handlers.
- Keep application routes responsible for validating requests, persisting data, and enqueueing jobs only.
- Start with an email-first implementation and an in-memory fallback runner, while preserving a future Trigger.dev integration seam inside `packages/jobs`.
- Treat `~/Documents/code/plot-keys` as the default structural reference for notification, email, and jobs package boundaries unless a later ADR replaces it.

## Consequences
- Notification side effects stay out of app route handlers and can be reused by future apps and domains.
- Client apps get a shared notification UX layer instead of reimplementing toast state per app.
- Notification definitions now live as typed registries and payload-utils instead of ad hoc event objects.
- Email providers can be swapped behind shared transports without changing feature routes.
- Trigger.dev can be introduced later without forcing feature modules to change their public APIs.
- Background work in local development currently depends on the process remaining alive because the fallback runner is in-memory.
