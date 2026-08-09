# 01 - Define Service Commerce Boundary And Compatibility Contract

**What to build:** Record the current Generic Service and Pharmacy Commerce ownership map, create a shared typed interoperability contract at package boundaries, and lock existing behavior with compatibility evidence before any extraction or rename.

**Blocked by:** None - first expand-contract slice.

**Status:** complete on 2026-08-09

**Approval:** The original slice and ADR-0030's revised source vocabulary were
owner-approved on 2026-08-09. The compatibility prefactor was reconciled with
the exact amended contract before this ticket was marked complete.

- [x] Verify the inspected ownership/file map in `.scratch/service-commerce/midday-migration-contract.md` against the approved implementation baseline and amend it before code only if that baseline changed.
- [x] Define a minimal shared vocabulary for `service`, `prescription` and the
  narrow `commerce_inquiry` source kind/reference, channel origin,
  capability/readiness, allowed action and fulfilment option without a
  universal request table.
- [x] Preserve `ServiceRequest` and `PrescriptionRequest` as authoritative aggregates with typed adapters rather than cross-imported database models.
- [x] Add compatibility tests that capture current Generic Service and Pharmacy Commerce outcomes before ownership moves.
- [x] Document expand, compatibility, switch and contraction checkpoints plus rollback conditions; no contraction is part of this ticket.
- [x] Split the existing broad acceptance fixture into reusable run-owned setup/cleanup helpers and focused lifecycle specs without weakening bounded atomic teardown.
- [x] Verify packages remain focused and apps/API entrypoints orchestrate rather than owning domain logic.
- [x] Update Brain/API contract documentation for the approved interoperability boundary.

**Evidence:** `@ewatrade/service-commerce` focused tests: 4 passed; package and
DB typechecks passed. The split acceptance matrix passed 8 tests/224 assertions
against the canonical verified `.env.local` Neon development profile before
the source enum reconciliation; the post-reconciliation change is isolated to
the DB-free shared contract and its focused tests. Local Docker/PostgreSQL was
not used. No schema, provider, caller-ownership, switch, or contraction change
was made.
