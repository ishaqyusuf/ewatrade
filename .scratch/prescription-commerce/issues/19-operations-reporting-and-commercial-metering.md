# 19 - Operations Reporting And Commercial Metering

**What to build:** Give owners/operators de-identified Prescription Commerce performance reporting and generate auditable commercial usage events without exposing prescription contents or confusing EwaTrade fees with provider-owned charges.

**Blocked by:** 12 - Pickup Preparation And Handoff; 14 - Delivery Assignment And Execution; 16 - WhatsApp Commerce Actions And Notifications

**Status:** implemented-source; production reconciliation pending

**Verification note (2026-08-09):** the report API/UI now supports one Store or
the active Tenant, exposes Store breakdowns and Quote outcomes, and separately
projects platform, Meta, payment-provider, delivery, tax, and pharmacy-revenue
amounts. Missing applicable costs remain `null` with an unknown count. Usage
reconciliation now verifies every known source type under Tenant/Store scope.
Focused metric/cost/multi-store tests and DB/API/dashboard typechecks pass;
production reconciliation remains open.
Report scope is shareable URL state with explicit error recovery. Quote issue,
accept/decline, payment, pickup handoff, and delivery completion are assigned to
the half-open window containing their authoritative lifecycle timestamp.

- [x] Store- and tenant-scoped dashboards report request volume, channel mix, review time, quote outcomes, conversion, payment, pickup, and delivery performance.
- [x] Metrics are derived from canonical lifecycle events with documented definitions, time zones, denominators, and late-event behavior.
- [x] Reports use identifiers and aggregates rather than prescription text, medicine names, media, addresses, or unnecessary customer data.
- [x] Usage events are emitted exactly once for defined billable actions and can be reconciled to source requests, orders, messages, and fulfilments by authorized operators.
- [x] EwaTrade platform charges, Meta conversation/template charges, payment-provider fees, delivery costs, taxes, and pharmacy revenue are represented separately.
- [x] Missing provider-cost data is shown as unknown rather than silently estimated or folded into platform pricing.
- [x] Exports and report APIs enforce active tenant/store context and permission boundaries.
- [x] Metric-definition, deduplication, reconciliation, privacy, permission, and multi-store tests are included.
