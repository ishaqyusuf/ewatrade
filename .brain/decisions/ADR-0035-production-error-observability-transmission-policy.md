# ADR-0035: Production Error Observability Transmission Policy

## Status

Accepted on 2026-08-29 with explicit owner authorization for external
production diagnostics.

## Context

EwaTrade processes sensitive commerce, customer, payment, location,
conversation, media, prescription, provider, and offline-operation data across
independently deployed API, jobs, web, and mobile runtimes. Runtime-local
redaction is insufficient because SDK integrations may add request, user,
breadcrumb, context, or payload data after application code constructs an
event. Expected business conflicts also need product handling without alert
noise.

## Decision

Use `@ewatrade/errors` for structural error classification and safe public
envelopes. Use `@ewatrade/observability` as the only external diagnostic policy.
Transmission is enabled only for exact production with code authorization, a
DSN, and a release. Each independently deployed runtime owns a separate Sentry
project.

Before transmission, rebuild the event from a strict allowlist. Do not forward
request/user/context/breadcrumb/log/module/transaction objects or original
exception messages. Allow only sanitized stack/symbolication data, stable
classification, bounded operation/request identifiers, runtime, release, and
an opaque reference. Disable default PII, breadcrumbs, tracing, replay,
feedback, and SDK logs.

Keep expected auth, validation, access, quote, module/role, idempotency,
offline, rate-limit, and stock conflicts non-reportable by default. Wrap
systemic database/provider failures as reportable without provider responses.

## Consequences

- External diagnostics cannot be enabled accidentally in local, development,
  or preview environments, even if a DSN is present.
- Source-map upload is independently fail-closed on upload credentials and the
  runtime project mapping.
- Operational events contain less debugging context by design; engineers use
  the opaque request/error references to correlate with privacy-safe local
  logs.
- Deployment owners must provision and smoke-test each runtime project. Source
  completion alone does not prove production routing or symbolication.
- ADR-0018's mobile SDK/project/build decisions remain, but its environment
  behavior is narrowed to this production-only transmission policy.
