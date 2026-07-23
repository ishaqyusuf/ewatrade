# ADR-0018: Mobile Sentry Observability

## Status

Accepted

## Context

Ewatrade has independently deployed Expo, Next.js, API, and jobs runtimes.
Combining all runtimes in one Sentry project would mix releases, alerts,
ownership, and issue grouping. The mobile application also handles customer
and commerce data, so optional replay, PII, feedback, and log collection should
not be enabled as an incidental part of crash reporting.

## Decision

The Expo application owns the separate
`cipron-concepts/ewatrade-mobile` Sentry project.

The mobile runtime uses `@sentry/react-native`, the Sentry Expo config plugin,
and Sentry's Metro base configuration. Development, preview, and production
remain Sentry environments inside the same mobile project.

The public DSN is supplied through `EXPO_PUBLIC_SENTRY_DSN`. The private
`SENTRY_AUTH_TOKEN` is restricted to local ignored configuration and secret
build environments for source-map and debug-symbol uploads. It must never be
committed or included in public Expo configuration.

Default PII collection, Session Replay, User Feedback, and SDK Logs remain
disabled. Enabling any of them requires an explicit privacy and retention
decision.

## Consequences

- Mobile releases, crash-free health, alerts, and ownership remain isolated
  from future dashboard, marketing, storefront, POS, API, and jobs projects.
- JavaScript and native stack traces can be symbolicated when the upload token
  is available during the build or EAS Update publish.
- Local and cloud build systems need secret-token configuration in addition to
  the public DSN.
- Additional observability features are opt-in and cannot silently expand the
  application's data collection.
