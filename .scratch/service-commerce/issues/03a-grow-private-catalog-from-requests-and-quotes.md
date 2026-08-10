# 03A - Grow The Private Catalog From Requests And Quotes

**What to build:** Let a progressively onboarding business review customer
demand, resolve it to an existing Offering or create a private draft Catalog
graph, receive attributable price suggestions, enter the current Quote price,
and explicitly promote reusable pricing without publishing records or
inventing stock.

**Blocked by:** 02 - Configure Business Capability Profile; 03 - Establish
Customer Request Interoperability Contract; 11 - Enforce Vertical And
Jurisdiction Eligibility.

**Status:** complete on 2026-08-10

**Approval:** Added by the owner-requested Progressive Catalog amendment and
owner-approved as part of the revised batch on 2026-08-09. Its future generic
verified-observation input was approved on 2026-08-10 without changing the
current Ticket 03A frontier.

- [x] Add a Store capability/adoption mode that distinguishes progressive
  Catalog operation from managed inventory without weakening role or vertical
  policy gates.
- [x] Use the existing private `DRAFT` Item, Variant and Offering graph; record
  typed source-line origin and human-verified aliases instead of creating a
  parallel candidate Catalog.
- [x] Keep the match/create/link boundary able to consume Ticket 04A's typed
  Human-Verified Observation without accepting raw media, provider payload,
  customer text or automated inference as verified Catalog truth.
- [x] Resolve Generic Service, Commerce Inquiry and human-verified Prescription
  lines through one shared match/create/link seam while retaining their
  separate source aggregates.
- [x] Rank existing/draft Offering matches inside the authorized Tenant/Store;
  similarity may assist but cannot automatically merge, publish, substitute or
  create medicine.
- [x] Project price suggestions in this order: current Offering price, recent
  accepted Store Quote, completed Store sale, then authorized Tenant history.
  Include source, currency and effective time and represent no evidence as
  unknown. Prescription-derived suggestions come only from released/accepted
  Prescription Quotes, never raw prescription/OCR content.
- [x] Let an attendant enter or choose the current Quote price as an immutable
  Quote-version fact. Updating the reusable Catalog price is a separate
  confirmed, role-gated and audited command with prior/current price, reason
  and source attribution; confirmation shows every affected Store when the
  existing Offering price scope is Tenant-wide.
- [x] Support explicit Product availability outcomes of tracked in-stock,
  expiring manual/procure-to-order or unavailable. Only tracked in-stock may
  reserve an existing configured balance source. Tracked applies to an active,
  inventory-configured Offering; private drafts use manual/unavailable until
  Ticket 06A graduation. No request, Quote or sale creates stock.
- [x] Keep every draft private and non-storefront-visible until a separate
  activation/publication command succeeds; stale source versions or
  availability attestations fail closed.
- [x] Deliver the Midday sheet/form experience for matching, draft creation,
  suggestions, override and price-promotion confirmation with URL-owned safe
  state, exact invalidation and loading/error/retry/empty behavior.
- [x] Prove web/staff request-to-draft-to-Quote behavior for Product Inquiry and
  Service, plus Pharmacy-safe human-verified source resolution and OCR-only
  rejection. Cover duplicate aliases, currencies, cross-Tenant/Store access and
  price-history immutability. Ticket 10 owns the regulated Pharmacy
  request-to-progressive-draft-to-Quote adaptation after this shared seam.
- [x] Update Brain/API/database documentation for the exact approved contracts
  and schema changes; use only the verified `.env.local` Neon development
  database for acceptance.

## Completion Evidence

- Shared package, database, API and dashboard typechecks pass; focused Catalog,
  Quote and Midday controller suites pass 37 tests with 95 assertions.
- The verified `.env.local` Neon development run passes four scenarios with 15
  assertions: staff and web private Product drafts with quantity-bounded manual
  availability, an active configured Offering with tracked availability, and a
  private Service draft Quote. No Docker or production database was used.
- Authenticated desktop/mobile browser QA covered the global sheet, stale-link
  fail-closed recovery and mode/id-only close behavior. Final Spec and Standards
  reviews report no hard finding.
