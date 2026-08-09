# 09 - Prescription Quote To Pickup Order

**What to build:** Turn a pharmacist-released Prescription Request into a customer-facing, versioned Quote and let the customer accept a pickup outcome exactly once to create a Commercial Order, inventory reservations, and immutable commercial snapshots.

**Blocked by:** 03 - Migrate Service Requests To Commerce Quotes; 08 - Pharmacist Review And Catalogue Mapping

**Status:** implemented-source; production acceptance pending

**Verification note (2026-08-09):** Commerce Quote invariants cover typed full,
partial, and unavailable versions, line outcomes, digested capabilities, expiry,
supersession, acknowledgement, and idempotency. The atomic acceptance transaction
creates inventory-revision-bound Order snapshots and pickup fulfilment or rolls
back as one unit. A verified `.env.local` Neon run now races two identical
acceptance commands for each web, staff, and WhatsApp origin; all six callers
resolve to exactly one Order, and the 3-test/81-assertion lifecycle matrix passes.

- [x] A released request can produce full, partial, or unavailable Quote outcomes with explicit included, substituted, unavailable, and declined lines.
- [x] Each commercial or availability change creates a new immutable Quote version and supersedes older customer actions safely.
- [x] The secure customer page shows the current version, expiry, store identity, pickup terms, exact item totals, and pharmacy-approved alternatives.
- [x] Accepting a partial quote requires explicit customer acknowledgement and never silently includes unavailable or declined lines.
- [x] Accepting the current pickup Quote is atomic and idempotently creates one Commercial Order, line snapshots, totals, and inventory reservations.
- [x] Expired, superseded, withdrawn, declined, or already accepted versions cannot create another order.
- [x] Reservation failure leaves no partially accepted quote or order and returns an actionable response to staff and customer.
- [x] End-to-end tests prove Prescription Request to pharmacist release to Quote to pickup order, including retries and concurrent acceptance.
