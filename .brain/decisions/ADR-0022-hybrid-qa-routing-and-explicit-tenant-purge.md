# ADR-0022: Hybrid QA routing and explicit tenant purge

## Status

Accepted

## Decision

Use `console`/`live` as the base email mode and apply configured QA-domain
routes independently per recipient. Persist QA classification on `Tenant`;
never infer deletion eligibility during purge. Platform admins must adopt
legacy candidates, obtain a signed preview, resolve every live commercial
blocker, and run cleanup through the jobs package. Keep only aggregate
`QaPurgeRun` receipts.

## Consequences

Production ordinary mail and QA-routed mail can operate together, `.test`
misconfiguration fails closed, cross-lane membership is rejected, and live
subscriptions or purchased domains are never cancelled automatically.
