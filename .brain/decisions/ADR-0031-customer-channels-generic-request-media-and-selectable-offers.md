# ADR-0031: Customer Channels, Generic Request Media And Selectable Offers

## Status

Accepted as a product and architecture amendment on 2026-08-10. The owner
approved `Settings > Channels`, multiple business-owned connections, stable
Store entry links/QR codes, generic customer-request media and non-additive
selectable commercial alternatives. This amendment produced a 16-ticket batch;
ADR-0032 subsequently adds Store team routing and Quote release approval,
making the current batch 17 tickets. Production storage, scanner, provider and
database rollout remain separately authorized.

## Context

The current Pharmacy setup combines three different concerns: regulated
Prescription operations, WhatsApp Connection/Store binding configuration and
public customer-channel sharing. That makes a reusable business capability
look Pharmacy-owned even though onboarding already knows the business and its
category.

A non-regulated bag seller exposes the same boundary problem. A customer may
send a bag image and ask whether it is available. The business must safely
receive and view that image, verify `bag / red / small`, match or create a
private Catalog draft, and offer alternatives such as red-small at NGN 20,000
or black-large at NGN 30,000. None of those transport/storage facts require a
`PrescriptionRequest`, while Prescription OCR, clinical access and pharmacist
release remain genuinely regulated.

The existing Commerce Quote model also treats `alternative` lines as payable
when calculating totals. Displaying both bags as ordinary lines would therefore
risk presenting or charging NGN 50,000 instead of requiring one explicit
choice.

## Decision

- The dashboard navigation owns a business-neutral `Settings > Channels`
  surface titled `Customer channels`. `Connect WhatsApp` is the connection CTA;
  `Chat` is not the settings boundary because web request links, documents,
  booking and future channels are not all chat.
- A Tenant may own multiple Connections. Each Connection has explicit Store
  bindings, lifecycle/readiness, billing and replacement facts. One central
  number may serve several Stores only when an opaque Store entry link or
  explicit customer branch choice makes routing unambiguous.
- The channel setup journey is `setup -> configure -> test -> publish`.
  Publishing creates a stable Store customer entry point, share link and QR
  code. The QR targets an EwaTrade entry page that projects only currently
  allowed web/WhatsApp choices; it does not encode a raw provider number or
  Tenant/Store identifier, so connection rotation does not require reprinting.
- Business category and initial onboarding facts may recommend capabilities
  and setup defaults. They do not establish legal, professional, channel or
  operational authorization.
- Generic channel media is modeled as a private Media Asset, a typed Source
  Attachment and, when a human confirms its meaning, a revisioned Verified
  Observation. These contracts are Tenant/Store scoped and attach through the
  existing `service | prescription | commerce_inquiry` source registry; they
  do not introduce a universal Request table.
- `attachments` is a disabled-by-default Store capability. Business category
  may recommend it, while channel/source/provider/policy readiness remains
  server-owned and fail closed.
- Generic media owns upload/provider retrieval, content validation, private
  storage, safety state, retry/reupload, short-lived delivery grants, baseline
  retention/deletion and access audit. Raw bytes, object keys, provider ids,
  signed URLs and customer content do not enter public projections, logs, URL
  state or identifier-only job payloads.
- A Verified Observation is human-attributed commercial evidence, not Catalog
  or inventory truth. Automated classification may propose an observation,
  but cannot verify, publish, price, substitute, reserve stock or create an
  Order. Progressive Catalog consumes only authorized verified facts.
- Pharmacy may reuse generic transport/storage/grant mechanics, but retains its
  authoritative `PrescriptionMedia` clinical record during expand-contract and
  continues to own OCR, original-media comparison, human line verification,
  pharmacist release, sensitive access, break-glass and regulated retention.
  Generic safety never implies professional approval.
- A versioned Commerce Quote may contain immutable mutually exclusive Offer
  Options. Each option owns its lines, availability/fulfilment facts and exact
  total. Unselected options are never additive payable lines. Selection is an
  explicit current-version/expiry-guarded, idempotent command; only the selected
  option can be accepted, ordered, reserved or paid.
- Existing simple Quotes expand as one default payable option. Existing
  Prescription media APIs/models and routes remain compatible until generic
  and Pharmacy acceptance, reconciliation and separately approved contraction.

## Consequences

- Retailers, repairers, appointment businesses and pharmacies can share one
  channel/attachment foundation without importing clinical models.
- Pharmacy settings shrink to regulated roles, consent, policies and clinical
  controls. Connection and entry-link configuration moves to Customer Channels.
- Printed QR codes survive number rotation and can present the correct Store,
  permitted channel and recovery state at visit time.
- A bag photo can grow a private Catalog through human verification without
  automatically publishing customer content or fabricating inventory.
- Quote totals remain exact when the business offers alternatives; choosing a
  product is commercial truth, not a UI-only checkbox.
- The migration needs additive generic media/attachment/observation records,
  provider/jobs/viewer seams and compatibility links rather than a destructive
  rename of `PrescriptionMedia`.
- Object storage, safety scanning, live Meta media retrieval and production
  retention operations remain explicit provider/release gates.

## Rejected Alternatives

- Keep WhatsApp/media under Prescription settings: makes every future business
  depend on Pharmacy names and duplicates channel infrastructure.
- Make all media clinical or move Pharmacy review into generic media: either
  over-regulates ordinary images or weakens mandatory professional controls.
- Store attachments directly in arbitrary source JSON: loses lifecycle,
  idempotency, access, retry, retention and audit integrity.
- Let vision/OCR create Catalog or price facts automatically: customer media is
  unverified evidence and may be ambiguous, unsafe or unrelated.
- Point printed QR codes directly to a mutable WhatsApp number: replacement or
  branch-routing changes invalidate the physical entry point.
- Represent alternatives as ordinary payable Quote lines: adds mutually
  exclusive choices into one incorrect total.

## References

- `.brain/decisions/ADR-0029-service-commerce-platform-core-and-vertical-capability-extensions.md`
- `.brain/decisions/ADR-0030-progressive-catalog-and-thin-pharmacy-extension.md`
- `.brain/features/service-commerce.md`
- `.scratch/service-commerce/spec.md`
- `.scratch/service-commerce/midday-migration-contract.md`
- `.scratch/service-commerce/issues/04a-establish-generic-customer-request-media-and-verified-observations.md`
- `.brain/decisions/ADR-0032-store-team-routing-and-quote-release-approval.md`
