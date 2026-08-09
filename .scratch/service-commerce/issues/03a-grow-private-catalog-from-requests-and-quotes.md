# 03A - Grow The Private Catalog From Requests And Quotes

**What to build:** Let a progressively onboarding business resolve verified
customer demand to an existing Offering or create a private draft Catalog
graph, receive attributable price suggestions, enter the current Quote price,
and explicitly promote reusable pricing without publishing records or
inventing stock.

**Blocked by:** 02 - Configure Business Capability Profile; 03 - Establish
Customer Request Interoperability Contract; 11 - Enforce Vertical And
Jurisdiction Eligibility.

**Status:** approved; blocked by Tickets 02, 03, and 11

**Approval:** Added by the owner-requested Progressive Catalog amendment and
owner-approved as part of the revised batch on 2026-08-09.

- [ ] Add a Store capability/adoption mode that distinguishes progressive
  Catalog operation from managed inventory without weakening role or vertical
  policy gates.
- [ ] Use the existing private `DRAFT` Item, Variant and Offering graph; record
  typed source-line origin and human-verified aliases instead of creating a
  parallel candidate Catalog.
- [ ] Resolve Generic Service, Commerce Inquiry and human-verified Prescription
  lines through one shared match/create/link seam while retaining their
  separate source aggregates.
- [ ] Rank existing/draft Offering matches inside the authorized Tenant/Store;
  similarity may assist but cannot automatically merge, publish, substitute or
  create medicine.
- [ ] Project price suggestions in this order: current Offering price, recent
  accepted Store Quote, completed Store sale, then authorized Tenant history.
  Include source, currency and effective time and represent no evidence as
  unknown. Prescription-derived suggestions come only from released/accepted
  Prescription Quotes, never raw prescription/OCR content.
- [ ] Let an attendant enter or choose the current Quote price as an immutable
  Quote-version fact. Updating the reusable Catalog price is a separate
  confirmed, role-gated and audited command with prior/current price, reason
  and source attribution; confirmation shows every affected Store when the
  existing Offering price scope is Tenant-wide.
- [ ] Support explicit Product availability outcomes of tracked in-stock,
  expiring manual/procure-to-order or unavailable. Only tracked in-stock may
  reserve a configured balance source; no request, Quote or sale creates stock.
- [ ] Keep every draft private and non-storefront-visible until a separate
  activation/publication command succeeds; stale source versions or
  availability attestations fail closed.
- [ ] Deliver the Midday sheet/form experience for matching, draft creation,
  suggestions, override and price-promotion confirmation with URL-owned safe
  state, exact invalidation and loading/error/retry/empty behavior.
- [ ] Prove web/staff request-to-draft-to-Quote behavior for Product inquiry,
  Service and Pharmacy-safe fixtures, including duplicate aliases, currencies,
  cross-Tenant/Store access, OCR-only rejection and price-history immutability.
- [ ] Update Brain/API/database documentation for the exact approved contracts
  and schema changes; use only the verified `.env.local` Neon development
  database for acceptance.
