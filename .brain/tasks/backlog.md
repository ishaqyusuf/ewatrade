# Backlog

## Purpose
Pending work that is identified but not actively being executed.

## Items

### Prescription Commerce design-partner discovery and pilot readiness

- Priority: High
- Description: Validate the Prescription Commerce product and commercial model
  with a pharmacy design partner. Complete pharmacy baseline research,
  PCN/electronic-pharmacy role confirmation, privacy and prescription-media
  controls, pharmacy-owned WABA/number and provider onboarding validation,
  live recipient-number routing canary, OCR provider
  evaluation, operating SOPs, integration inventory, delivery-zone policy, and
  the controlled active-test plan before production launch.
- Related Feature: Prescription Commerce
- Decision Files:
  `.brain/decisions/ADR-0026-prescription-commerce-product-and-operating-boundary.md`,
  `.brain/decisions/ADR-0027-tenant-owned-multi-pharmacy-whatsapp-connections.md`
- Commercialization Package: `output/commercialization/README.md`
- Spec File: `.scratch/prescription-commerce/spec.md`
- Spec Status: Ready for Agent
- Delivery Status: Source implemented; backlog covers design-partner and
  production-readiness gates only
- Created Date: 2026-08-07

### Mobile paginated query direction contract

- Priority: High
- Description: Align the mobile infinite-query `direction` field with the
  strict `catalog.listItemsPage` and `orders.listPage` input schemas. Android
  emulator QA on 2026-07-23 confirmed that Catalog/Products, Orders, and
  Customers render `unrecognized_keys` errors because the generated infinite
  query input includes `direction: "forward"`.
- Related Feature: Mobile list pagination and search density
- Status: Backlog

No unstarted Generic Inventory or Generic Service implementation ticket
remains. The clean local database cutover is complete. Behavioral QA is tracked
in `.brain/tasks/in-progress.md` for the separate testing goal. Managed
cross-device/public evidence is a deployment integration, not a prerequisite
for the implemented private local capture flow.
