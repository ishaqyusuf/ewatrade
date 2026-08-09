# 01 - Define Service Commerce Boundary And Compatibility Contract

**What to build:** Record the current Generic Service and Pharmacy Commerce ownership map, create a shared typed interoperability contract at package boundaries, and lock existing behavior with compatibility evidence before any extraction or rename.

**Blocked by:** None - first expand-contract slice.

**Status:** ready-for-agent

**Approval:** Owner-approved on 2026-08-09. This is the active implementation frontier and may start now.

- [ ] Verify the inspected ownership/file map in `.scratch/service-commerce/midday-migration-contract.md` against the approved implementation baseline and amend it before code only if that baseline changed.
- [ ] Define a minimal shared vocabulary for source kind/reference, channel origin, capability/readiness, allowed action and fulfilment option without a universal request table.
- [ ] Preserve `ServiceRequest` and `PrescriptionRequest` as authoritative aggregates with typed adapters rather than cross-imported database models.
- [ ] Add compatibility tests that capture current Generic Service and Pharmacy Commerce outcomes before ownership moves.
- [ ] Document expand, compatibility, switch and contraction checkpoints plus rollback conditions; no contraction is part of this ticket.
- [ ] Split the existing broad acceptance fixture into reusable run-owned setup/cleanup helpers and focused lifecycle specs without weakening bounded atomic teardown.
- [ ] Verify packages remain focused and apps/API entrypoints orchestrate rather than owning domain logic.
- [ ] Update Brain/API contract documentation for the approved interoperability boundary.
