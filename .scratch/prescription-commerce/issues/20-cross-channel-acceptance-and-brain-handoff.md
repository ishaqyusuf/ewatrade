# 20 - Cross-Channel Acceptance And Brain Handoff

**What to build:** Prove the complete Prescription Commerce release across web, staff-assisted, and WhatsApp origins for pickup and delivery, document failure evidence and production gates, and bring Brain architecture, feature, API, database, permission, and task documentation in line with the delivered system.

**Blocked by:** 05 - Staff-Assisted Prescription Intake; 10 - Contract Legacy Service Quote Model; 17 - Embedded Signup And Repeatable Pharmacy Onboarding; 18 - Privacy, Retention, Audit, And Incident Controls; 19 - Operations Reporting And Commercial Metering

**Status:** partially verified; external acceptance gates pending

- [x] Automated acceptance tests cover web, staff-assisted, and WhatsApp intake through review, quote, payment, and pickup or delivery completion.
- [x] Multi-pharmacy tests prove sender identity, `phone_number_id` routing, tenant/store isolation, central/branch bindings, and the same customer contacting different pharmacies.
- [x] Failure-injection evidence covers storage, OCR, Meta, payment, notification, delivery, duplicate callback, stale action, and credential-revocation scenarios.
- [ ] Accessibility, responsive/mobile, performance, retry, concurrency, security, privacy, and audit checks meet the thresholds defined in the approved spec.
- [x] Production integrations remain fail closed until external legal, operational, provider, template, security, retention, and canary gates are explicitly satisfied.
- [x] A manual QA runbook records fixtures, test pharmacy setup, expected transitions, observable evidence, rollback, and incident procedures.
- [x] Brain feature, architecture, ADR, API, permission, database, migration, relationship, and task-state documents reflect the final implementation.
- [x] Any deferred external launch requirement or residual risk is recorded as owned follow-up work rather than represented as complete.

Authenticated Neon-development QA now covers setup gating, policy/role
onboarding, activation, empty queue, staff-assisted intake, explicit
success-to-attendant-review routing, and desktop/mobile sheet scrolling. The
Neon-backed database acceptance tests additionally run web, staff-assisted,
and WhatsApp safe-media origins through deterministic safety review and OCR,
attendant verification, pharmacist release, inventory-backed Quote issuance,
idempotent pickup acceptance, hosted payment callback/replay, packing, secure
pickup code, and idempotent handoff. They assert customer-safe request, Quote,
and payment views plus management audit, inventory reservation, pickup queue,
reporting, and commercial-usage projections.
The communications/database/job suites cover scoped same-customer threads,
multi-pharmacy Redis context, connection-specific credentials and sender ids,
central-number branch selection, cross-Tenant binding rejection, signature
rejection, retries, and opaque quick actions. A Neon-backed fixed-zone delivery
matrix now covers web, staff-assisted, and WhatsApp origins through delivery
Quote revision, concurrent acceptance, paid Order, packing, courier assignment,
premature-operation rejection, failed-delivery recovery/reassignment,
proof-backed duplicate-safe completion, privacy-safe projections, reporting,
usage, and terminal queue removal. A separate authorized manual-fee path reaches
paid acceptance with exact totals. Provider canaries, accessibility,
performance, broad concurrency, and security remain open acceptance work under
the separate gates above. Deterministic failure-injection
tests now cover private-storage unavailability; OCR timeout/unavailability;
Meta media and outbound-notification failures; failed payment and duplicate
callback handling; a structured delivery failure; expired/consumed quick
actions; and Tenant-scoped credential revocation.
