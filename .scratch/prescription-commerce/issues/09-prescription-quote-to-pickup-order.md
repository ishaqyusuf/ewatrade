# 09 - Prescription Quote To Pickup Order

**What to build:** Turn a pharmacist-released Prescription Request into a customer-facing, versioned Quote and let the customer accept a pickup outcome exactly once to create a Commercial Order, inventory reservations, and immutable commercial snapshots.

**Blocked by:** 03 - Migrate Service Requests To Commerce Quotes; 08 - Pharmacist Review And Catalogue Mapping

**Status:** implemented-source; production acceptance pending

- [ ] A released request can produce full, partial, or unavailable Quote outcomes with explicit included, substituted, unavailable, and declined lines.
- [ ] Each commercial or availability change creates a new immutable Quote version and supersedes older customer actions safely.
- [ ] The secure customer page shows the current version, expiry, store identity, pickup terms, exact item totals, and pharmacy-approved alternatives.
- [ ] Accepting a partial quote requires explicit customer acknowledgement and never silently includes unavailable or declined lines.
- [ ] Accepting the current pickup Quote is atomic and idempotently creates one Commercial Order, line snapshots, totals, and inventory reservations.
- [ ] Expired, superseded, withdrawn, declined, or already accepted versions cannot create another order.
- [ ] Reservation failure leaves no partially accepted quote or order and returns an actionable response to staff and customer.
- [ ] End-to-end tests prove Prescription Request to pharmacist release to Quote to pickup order, including retries and concurrent acceptance.
