# 19 - Operations Reporting And Commercial Metering

**What to build:** Give owners/operators de-identified Prescription Commerce performance reporting and generate auditable commercial usage events without exposing prescription contents or confusing EwaTrade fees with provider-owned charges.

**Blocked by:** 12 - Pickup Preparation And Handoff; 14 - Delivery Assignment And Execution; 16 - WhatsApp Commerce Actions And Notifications

**Status:** implemented-source; production reconciliation pending

- [ ] Store- and tenant-scoped dashboards report request volume, channel mix, review time, quote outcomes, conversion, payment, pickup, and delivery performance.
- [ ] Metrics are derived from canonical lifecycle events with documented definitions, time zones, denominators, and late-event behavior.
- [ ] Reports use identifiers and aggregates rather than prescription text, medicine names, media, addresses, or unnecessary customer data.
- [ ] Usage events are emitted exactly once for defined billable actions and can be reconciled to source requests, orders, messages, and fulfilments by authorized operators.
- [ ] EwaTrade platform charges, Meta conversation/template charges, payment-provider fees, delivery costs, taxes, and pharmacy revenue are represented separately.
- [ ] Missing provider-cost data is shown as unknown rather than silently estimated or folded into platform pricing.
- [ ] Exports and report APIs enforce active tenant/store context and permission boundaries.
- [ ] Metric-definition, deduplication, reconciliation, privacy, permission, and multi-store tests are included.
