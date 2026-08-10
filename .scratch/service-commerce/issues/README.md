# Service Commerce Amended Ticket Batch

**Status:** revised 16-ticket batch owner-approved on 2026-08-10

**Implementation authorization:** approved for source work in declared
dependency order; production database/provider operations remain separate

This batch implements ADR-0029 as amended by ADR-0030 and
`.scratch/service-commerce/spec.md`. The owner approved the original batch and
then requested Progressive Catalog plus a thinner Pharmacy extension on
2026-08-09. On 2026-08-10 the owner approved generic Customer Channels,
stable link/QR entry points, business-neutral request media and selectable
commercial alternatives. The exact revised 16-ticket batch is approved;
production schema/provider operations remain separately authorized.

## Execution Rule

Execute one ticket at a time through its blocking edges. Tickets 01, 02, 03 and
11 are complete; Ticket 03A is in progress and Ticket 04 is the parallel
dependency frontier. Ticket 04A begins only after both foundations are
complete. Any scope or dependency change should update the spec, ADR/Brain and
affected tickets before implementation.

## Dependency-Ordered Waves

1. Boundary and readiness: 01, then 02.
2. Interoperability: 03.
3. Vertical/jurisdiction policy: 11.
4. Progressive Catalog and connection foundation: 03A and 04.
5. Generic request media and Commerce extraction: 04A and 06 after their
   respective blockers complete.
6. Channel intake, inventory graduation and shared fulfilment: 05, 06A and 08.
7. Booking and appointment lifecycle: 07.
8. Customer actions: 09.
9. Thin-Pharmacy and appointment proof: 10 and 12.
10. Reporting, cross-vertical acceptance and migration decision: 13.

Parallel work is allowed only when all listed blockers are complete and the
shared contracts are stable. Production schema/provider operations remain
separately approved even after source tickets are approved.

## Tickets

1. `01-define-service-commerce-boundary-and-compatibility-contract.md`
2. `02-configure-business-capability-profile.md`
3. `03-establish-customer-request-interoperability-contract.md`
4. `11-enforce-vertical-and-jurisdiction-eligibility.md`
5. `03a-grow-private-catalog-from-requests-and-quotes.md`
6. `04-generalize-whatsapp-connection-and-location-binding.md`
7. `04a-establish-generic-customer-request-media-and-verified-observations.md`
8. `05-deliver-channel-neutral-request-intake.md`
9. `06-reuse-quote-payment-and-order-conversion.md`
10. `06a-graduate-progressive-catalog-to-managed-inventory.md`
11. `07-add-booking-and-appointment-lifecycle.md`
12. `08-extract-shared-pickup-and-delivery-fulfillment.md`
13. `09-deliver-state-aware-customer-actions-and-notifications.md`
14. `10-adapt-pharmacy-commerce-to-service-commerce.md`
15. `12-validate-second-vertical-appointment-business.md`
16. `13-complete-cross-vertical-migration-and-acceptance.md` — shared reporting,
    cost/operations observability and final acceptance
