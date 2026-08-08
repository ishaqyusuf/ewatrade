# 20 - Cross-Channel Acceptance And Brain Handoff

**What to build:** Prove the complete Prescription Commerce release across web, staff-assisted, and WhatsApp origins for pickup and delivery, document failure evidence and production gates, and bring Brain architecture, feature, API, database, permission, and task documentation in line with the delivered system.

**Blocked by:** 05 - Staff-Assisted Prescription Intake; 10 - Contract Legacy Service Quote Model; 17 - Embedded Signup And Repeatable Pharmacy Onboarding; 18 - Privacy, Retention, Audit, And Incident Controls; 19 - Operations Reporting And Commercial Metering

**Status:** partially verified; external acceptance gates pending

- [ ] Automated acceptance tests cover web, staff-assisted, and WhatsApp intake through review, quote, payment, and pickup or delivery completion.
- [ ] Multi-pharmacy tests prove sender identity, `phone_number_id` routing, tenant/store isolation, central/branch bindings, and the same customer contacting different pharmacies.
- [ ] Failure-injection evidence covers storage, OCR, Meta, payment, notification, delivery, duplicate callback, stale action, and credential-revocation scenarios.
- [ ] Accessibility, responsive/mobile, performance, retry, concurrency, security, privacy, and audit checks meet the thresholds defined in the approved spec.
- [ ] Production integrations remain fail closed until external legal, operational, provider, template, security, retention, and canary gates are explicitly satisfied.
- [ ] A manual QA runbook records fixtures, test pharmacy setup, expected transitions, observable evidence, rollback, and incident procedures.
- [ ] Brain feature, architecture, ADR, API, permission, database, migration, relationship, and task-state documents reflect the final implementation.
- [ ] Any deferred external launch requirement or residual risk is recorded as owned follow-up work rather than represented as complete.
