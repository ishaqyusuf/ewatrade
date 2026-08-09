# Service Commerce Approved Ticket Batch

**Status:** owner-approved on 2026-08-09

**Implementation authorization:** approved in dependency order; Ticket 01 is
the current frontier

This batch implements ADR-0029 and `.scratch/service-commerce/spec.md`. The
owner approved the batch on 2026-08-09. Source implementation may proceed one
frontier ticket at a time; production schema/provider operations remain
separately authorized.

## Execution Rule

Execute one ticket at a time through its blocking edges. Ticket 01 is the only
current starting slice. Any
scope or dependency change should update the spec, ADR/Brain and affected
tickets before implementation.

## Dependency-Ordered Waves

1. Boundary and readiness: 01, then 02.
2. Interoperability and connection foundation: 03 and 04.
3. Policy and Commerce foundation: 06 and 11.
4. Channel and operational capabilities: 05, 07 and 08.
5. Customer actions: 09.
6. Vertical proof: 10 and 12.
7. Reporting, cross-vertical acceptance and migration decision: 13.

Parallel work is allowed only when all listed blockers are complete and the
shared contracts are stable. Production schema/provider operations remain
separately approved even after source tickets are approved.

## Tickets

1. `01-define-service-commerce-boundary-and-compatibility-contract.md`
2. `02-configure-business-capability-profile.md`
3. `03-establish-customer-request-interoperability-contract.md`
4. `04-generalize-whatsapp-connection-and-location-binding.md`
5. `05-deliver-channel-neutral-request-intake.md`
6. `06-reuse-quote-payment-and-order-conversion.md`
7. `07-add-booking-and-appointment-lifecycle.md`
8. `08-extract-shared-pickup-and-delivery-fulfillment.md`
9. `09-deliver-state-aware-customer-actions-and-notifications.md`
10. `10-adapt-pharmacy-commerce-to-service-commerce.md`
11. `11-enforce-vertical-and-jurisdiction-eligibility.md`
12. `12-validate-second-vertical-appointment-business.md`
13. `13-complete-cross-vertical-migration-and-acceptance.md` — shared reporting,
    cost/operations observability and final acceptance
