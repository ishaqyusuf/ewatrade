# API Contracts

## General

- All tenant-owned reads/writes resolve tenant context server-side.
- On the shared dashboard host, the active-tenant cookie is propagated through
  both server and browser tRPC clients. An explicit tenant header still has
  priority where supported.
- Store ids are validated against the active tenant.
- Exact quantities/factors are decimal strings; money is integer minor units.
- Commands use stable client ids and payload hashes for idempotency.
- Immutable snapshots preserve historical meaning; clients never reconstruct
  inventory or Order truth from current mutable Catalog data.
- Discoverable mobile directories use cursor pages with a bounded `limit`,
  stable sort plus id tie-breaker, optional server-side search, `nextCursor`,
  an unfiltered `totalCount`, and optional `forward`/`backward` direction
  metadata supplied by the tRPC TanStack infinite-query integration. The
  mobile client loads the next page near the end and only reveals list search
  when the total record count is greater than 10. Bounded dashboard previews,
  operational report sections, and subscription-capped lists are not infinite
  directories.

## Workspace Availability

- `tenant.featureAvailability` is a read-only discoverability contract, not an
  authorization grant. It reports sticky active-Store history for Catalog,
  Inventory, Orders, Service Jobs, Customers, and Reports; Staff presence is
  Tenant-wide.
- Archived Catalog items and removed, suspended, or invited operational Staff
  remain present. `hasActiveSellableItems` is a separate live prerequisite and
  only counts active fixed-price Offerings with a non-null price.
- Mobile requests send the selected business slug through `x-tenant-slug`.
  Switching a production business updates the authenticated mobile session
  profile and clears the query cache before the selected context refetches.
- `tenant.createBusiness` accepts the same bounded business identity,
  location, currency, Business Profile, operating-model, order-channel, and
  team-size facts used by mobile owner onboarding. Tenant, owner Membership,
  first Store, and completed onboarding-session creation are one transaction.
  Its response is a switch-ready Tenant summary; mobile persists that selected
  slug, clears tenant-scoped cache, and opens the new workspace.

## Signup And Business Profiles

- Browser signup, mobile email-OTP signup, mobile Google signup, and Store
  creation and authenticated new-business creation accept a validated
  Business Profile key/version plus bounded
  Products/Services/Both, order-channel, team-size, and optional Other/Mixed
  description fields.
- Mobile `sign_up` requests require the profile key/version, operating model,
  at least one order channel, team size, and Other/Mixed description when that
  category is selected. Blank optional Other/Mixed descriptions normalize to
  absent for every other profile so request and verification payloads share
  the same contract. Mobile `login` remains profile-free.
- The phone collected in mobile owner signup is Store support contact data,
  not a verified account identity. Email-OTP and Google signup both persist it
  on the first Store without assigning it to the unique `User.phone` field, so
  a legitimate shared business line cannot block email verification.
- True development runtimes use the deterministic mobile owner OTP `123456`.
  If either `APP_ENV` or `NODE_ENV` is `production`, OTP generation remains
  random, email delivery is required, and no development code is returned.
- Signup profile fields are descriptive onboarding context. They never grant
  permissions, gate features, or choose Product/Service runtime behavior.
- `tenant.stores` and `tenant.current` expose the validated
  `businessProfileKey` on each Store for client-side recommendation ranking;
  malformed or retired metadata is projected as null.
- Signup reserves only the free EwaTrade storefront hostname. Custom domains
  must enter the managed purchase or verified connection contract after
  signup; raw custom hostname writes are not accepted.

## Managed Domains

- Supported purchase names normalize to one label plus `.com.ng` or `.com`.
  Subdomains, premium results and other TLDs are outside the launch contract.
- Unsupported TLDs are rejected at the Zod request boundary after URL/case
  normalization rather than reaching a provider adapter.
- `.com.ng` deterministically routes to GO54; `.com` routes to Openprovider.
- Availability creates a 15-minute immutable quote with wholesale, currency,
  exchange-rate, retail and renewal snapshots.
- Registrant save encrypts the full legal-owner payload. Clients receive only
  id, display name, masked email, country, consent and timestamps.
- Checkout requires an unexpired quote, saved registrant, stable
  tenant-scoped idempotency key, accepted terms, configured provider,
  Paystack and Vercel prerequisites.
- Registrant consent and checkout terms accept only the current
  `2026-07-24` contract version.
- Paystack hosted checkout is online-only. Callback navigation never marks an
  order paid; the signed raw-body webhook verifies reference, amount and
  currency.
- Paid registration is asynchronous. `PENDING`, `REGISTERING`, `REGISTERED`,
  `UNCERTAIN` and `FAILED` are durable states.
- An uncertain provider write is reconciled against the same registrar before
  retry, refund or failover. A definite failure requests a Paystack refund.
- Registrar states are normalized to active, pending, expired, suspended,
  cancelled, failed, not-found or unknown. Unknown never means active.
- Refund progress/failure webhooks append idempotent audit events; only a
  processed/successful refund moves the order to `REFUNDED`.
- Domain registration and Vercel connection are separate. Only an `ACTIVE`
  connection can become the primary custom Storefront Hostname.
- External connection requires the exact TXT challenge before Vercel
  attachment. Existing DNS/nameservers are never replaced by the verification
  request.
- When Vercel requires an additional ownership record, that record remains on
  the connection contract until verification succeeds.
- Domain lists are bounded to 100 because launch supports one primary custom
  storefront domain per Store; infinite pagination and bulk actions are not
  part of this contract.

## Catalog

- Item kind is immutable after creation.
- Catalog item creation runs as one idempotent interactive transaction with a
  bounded 10-second acquisition wait and 30-second execution timeout. This
  accommodates the sequential immutable graph writes on a remote database
  without weakening atomicity or allowing unbounded transactions.
- `catalog.listItemsPage` searches item name, description, category, kind,
  variant/Offering labels, and Product Inventory Unit names or symbols while
  preserving an unfiltered tenant/store list count for search visibility.
- Variant option combinations are separate from Offerings and units.
- Catalog creation accepts an optional description and image URL on every
  Sellable Variant. Product variants may also provide their own exact
  `openingStockQuantity`; each non-zero value creates opening stock against that
  specific variant's Canonical Shared balance. The existing item-level opening
  quantity remains the simple/default-variant path when no per-variant
  quantities are supplied. Product opening quantities are optional; omitting
  them creates no opening balance.
- Mobile and API releases must keep this strict variant object in lockstep. The
  schema regression fixture submits `description`, `imageUrl`, and
  `openingStockQuantity` together so an older strict server contract cannot be
  mistaken for a valid current release. Mobile omits absent optional variant
  keys instead of serializing them as explicit `undefined`, preventing
  SuperJSON from reconstructing unknown keys against a temporarily older
  strict server.
- Product Unit Offerings require the fixed pricing policy and a Current
  Inventory Unit, but their fixed amount may remain unset while setup is
  incomplete. An unset price is stored as null and cannot be ordered.
- Simple Product creation and the mobile Product setup default new Inventory
  Units to a two-decimal transaction scale. Catalog clients may omit a
  variant-unit price override. When a fallback exists it is materialized as
  that Offering's independent fixed-price snapshot; when no price exists the
  Offering remains visible but unavailable for sale.
- Product Unit Offering prices are independent. A variant's canonical-unit
  price is never copied into another unit; each additional unit must resolve
  from its own unit default or explicit variant-unit price.
- Service Offerings may be fixed or quote-required and never accept stock
  input.
- Unit Draft publication validates one factor-1 Canonical Unit, direct exact
  factors, precision, Offering replacement and any required Stock Transition.

## Inventory

- Every operation identifies an explicit Balance Source and expected revision.
- Shared/Packaged stock is never substituted automatically.
- Transformations require balanced compatible Packaged Stock endpoints.
- Corrections append reversal/replacement facts; posted operations are not
  edited in place.
- Reports serialize exact quantities and configuration context.

## Orders

- A line selects one active Store-available Offering and snapshots its price,
  quantity and semantic context at confirmation.
- New Commercial Orders receive a server-owned, Tenant-wide reference in the
  form `ORD-001`, using minimum three-digit padding and growing naturally to
  `ORD-1000`. Existing `EO-*` references remain valid and unchanged. Clients
  cannot reserve or preview the next number.
- Concurrent retries with the same `clientOrderId` return the first matching
  Order when their payload hashes agree. The losing transaction rolls its
  attempted sequence increment back instead of consuming another number.
- An Order may contain the same Offering on multiple distinct lines. Product
  Orders use the first occurrence of a repeated Offering to validate any
  caller-supplied expected Balance Source revision, then reserve each later
  occurrence against the balance already updated inside the same transaction;
  combined stock availability remains enforced for every line.
- Sale clients show active incomplete Product Offerings but disable selection
  with `Price not set` and/or `Out of stock`; order submission still requires a
  real fixed price and available Product stock.
- Product reservation/fulfillment and Service work creation are separate
  transactional effects.
- Mixed Product/Service Orders are supported.
- Payments and refunds append idempotent `CommercialOrderPayment` facts. The
  Order stores the derived paid amount and exposes paid, balance and payment
  status; a command cannot overpay or refund more than was collected.
- A synchronous successful provider refund commits its refund ledger fact,
  Commercial Order balance, refund status, and hosted-payment status in one
  Tenant/Store-scoped transaction; a repeated provider result is idempotent.
- Refund creation locks the payment intent and reserves pending plus successful
  refund amounts before any provider call, preventing concurrent over-refunds.
- Refund provider dispatch persists `READY`, `OUTCOME_UNKNOWN`, `NEEDS_REVIEW`,
  and `CONFIRMED` states plus a dispatch count. A repeated command can claim
  never-dispatched work, but an indeterminate attempt is reconciled across the
  provider refund list by its unique merchant note before any further action.
  One absence after a 24-hour consistency window may be requeued under a row
  lock; a second uncertain attempt escalates to manual review and is never
  blindly redispatched.
- Order projections expose the tenant actor referenced by
  `createdByUserId` as `createdBy`. Payment projections similarly expose
  `recordedByUserId` as `recordedBy`. Missing or no-longer-active membership
  details do not erase the immutable user id.
- `orders.payments` cursor-loads received-payment facts across the active
  Tenant, supports order/customer/reference/receiver search, and returns each
  payment with its Order summary and receiver projection. Refund facts are
  excluded from this received-payments directory.
- `orders.listPage` supports stable cursor loading plus order-wide or
  customer-contact search. `orders.customerCount` returns the distinct
  normalized contact identities used by Customer Book; selecting a customer
  continues loading remaining pages before final totals are presented.
- `customers.create` saves a tenant-scoped customer with a required name and
  optional phone/email. Normalized phone and email values reject duplicate
  contact identities within the Tenant.
- `customers.listPage` cursor-loads and searches the saved directory.
  Customer Book and Create Sale merge directory rows with immutable customer
  snapshots from Commercial Orders, so order-only customers remain visible.

## Global Search And Contextual Creation

- `search.global` accepts a normalized query of 2–160 characters and a
  per-entity limit of 1–10. The response is a discriminated result union for
  `order`, `customer`, `catalog_item`, `service_job`, and `staff`.
- Search is always tenant-scoped. Catalog results may represent Product or
  Service items; customer results merge saved Customer records with immutable
  Order customer snapshots.
- Selecting a Customer search/overview action opens Create Order with that
  Customer already selected. Selecting Create Order from a Catalog Item
  overview opens Create Order and preselects the item's first currently
  sellable Offering. The operator still reviews quantities, price, payment,
  and confirmation.
- Mobile suppresses operational search inputs while offline and disables the
  Home global-search action. Product/Service creation entry points are also
  disabled; offline Order creation remains available.

## Prescription Commerce

- Queue contracts use Tenant/Store-scoped cursor pagination, bounded query and
  filters (status, source, assignee, and half-open UTC received-date range),
  allowlisted sort tuples, lightweight rows, and a separate authorized detail
  query. Prescription text, medicine lines, raw phones, media, and addresses
  are excluded from list projections.
- Intake validates consent, page count, size, MIME type, and an idempotency
  fingerprint before private-media persistence. Slow work receives only record
  identifiers and reloads sensitive data inside the job.
- OCR output is a draft. Every current line must be explicitly resolved by an
  attendant, and only a verified pharmacist can release the current revision.
- Commerce Quote Versions are immutable. Each newly issued Version owns one or
  more immutable Offer Options; a legacy Version with no stored Option projects
  as one synthetic default for expand-contract compatibility. A multi-option
  Version is deliberately non-payable until one exact current Option is chosen.
  Selection uses the opaque Quote capability plus an idempotent client command,
  rechecks Store policy and every selected Offering/availability snapshot, and
  records at most one choice for that Version. A competing choice returns a
  typed idempotency conflict and creates no Order, reservation or payment.
- Acceptance requires the current, issued, unexpired version plus one opaque
  token and, when applicable, its stored selection. Only the selected/default
  Option's lines and exact monetary/fulfilment facts reach Order creation;
  retries return the same Commercial Order/payment intent.
- A legacy commercial `ALTERNATIVE` line is customer-visible but non-payable:
  it is excluded from subtotal, total, reservation, Order and payment facts,
  and an alternative-only legacy Quote fails closed. Pharmacy retains clinical
  substitute attribution in its own mapping while sending the selected
  substitute to Commerce as one `INCLUDED` payable line.
- Storefront Service and Prescription Quote reads, selection, acceptance and
  hosted-checkout preparation call the typed public tRPC procedures. Storefront
  pages do not import repository commands, Prisma or provider adapters.
- Accepted-Quote price suggestions and reusable Catalog price-promotion impact
  admit only the selected/default Option. Unselected immutable Option lines are
  excluded even though they remain visible in Quote history.
- Fulfilment choice precedes payment when fee or eligibility changes. `Pick up`,
  `Delivery`, `Ask pharmacy`, and `Review & pay` are opaque idempotent actions;
  a message/button never establishes payment.
- Hosted payment callbacks verify signature, amount, currency, provider
  reference, and current Order before appending payment facts. Raw card data is
  never accepted.
- Public status, re-upload, quote, payment, and pickup access use scoped opaque
  capabilities stored as digests. Invalid, expired, revoked, stale, or
  cross-Store capabilities return not-found or conflict without disclosing the
  target.
- A WhatsApp Quote quick-action row stores only the action-token digest and the
  internal Quote Version id under its Tenant/Store scope. The raw action token
  is returned once to construct the secure customer URL; neither it nor the
  Quote acceptance bearer is persisted as `entityId`. Quote display,
  fulfilment selection, and hosted checkout resolve and revalidate both public
  capability forms through one Commerce Quote access boundary.
- WhatsApp runtime resolves `phone_number_id` to one active Tenant Connection,
  then resolves one Store using opaque channel/action context, and only then
  reads Redis state or persists content. Active bindings are independently
  checked against both the Connection Tenant and Store Tenant; any corrupted
  or cross-Tenant active binding rejects the entire recipient route rather than
  selecting a remaining valid branch. Ambiguity and an empty result fail closed.
- Conversation state uses a Store-bounded context key after routing. Meta
  delivery/read/failure receipts bypass intake and update only the scoped
  communication attempt matched by provider message id and Connection. Receipt
  transitions are row-locked and monotonic, preserving the first delivery/read
  timestamps under duplicate or concurrent webhooks.
- Central-number routing may use a short-lived Connection/customer selection
  containing only Tenant/Store identity; request id and content remain solely
  in the Store-bounded conversation state.
- Embedded Signup callback state and number discovery are encrypted and
  short-lived. The client receives identifiers/readiness only, never access
  tokens or credential references.
- Revoking or suspending a WhatsApp Connection atomically suspends only that
  Connection's bindings inside the same Tenant and records a lifecycle audit.
  Subsequent inbound and outbound claims therefore fail closed.
- Workspace availability exposes `hasPrescriptionCommerce` only after active
  Store setup; it controls navigation visibility but is not authorization.
- The authenticated Prescription workspace-access projection is Tenant/Store
  scoped and returns only `canAccess` plus an allowlisted capability source.
  It is a routing/prefetch hint, not authority: every queue/detail read repeats
  the professional-role or personal break-glass guard server-side.
- Detail, media, pharmacist-decision, transcript, and credential reads append
  purpose-labelled `PrescriptionSensitiveAccessEvent` records. Ordinary roles
  remain Store-scoped. A break-glass fallback is personal, manager-created,
  conspicuous, at most 60 minutes, re-audited on each use, and cannot be closed
  without a post-use review reason.
- Retention applies independent cutoffs to clinical artifacts, audit evidence,
  and commercial identity. It redacts mutable content idempotently while
  retaining minimal lifecycle/accounting tombstones. Legal hold stops claims.
- Reports use canonical event occurrence timestamps and a half-open `[from,to)`
  window. Denominators include all in-scope requests; late events appear in the
  period containing their authoritative event timestamp. Tenant reports are
  aggregates plus Store breakdowns. Missing provider costs remain `null` with
  an unknown count and are never estimated or merged into platform charges.
- Attendant edits create a new immutable transcription revision rather than
  rewriting OCR output. Corrections, additions, and deletions retain the prior
  revision for pharmacist comparison with the original media.
- Privacy identity verification records the verifying user, timestamp, and a
  bounded evidence/method reference before processing can be queued.

## Service Commerce Source And Progressive Catalog Contract

ADR-0030 and the revised ticket batch are owner-approved. Tickets 01-03 now
implement the focused source vocabulary, Store readiness boundary, normalized
source projection and narrow Commerce Inquiry lifecycle. Ticket 03A now also
implements the Progressive Catalog commands below.

- The exhaustive source reference is `service | prescription |
  commerce_inquiry`; Commerce Inquiry is limited to Product demand requiring
  identification, availability confirmation or a Quote. Exact known Products
  remain cart/Commercial Order commands.
- Commerce Inquiry uses `received | needs_clarification | ready_to_quote |
  quoted | converted | declined | withdrawn | expired`; resolving a Catalog
  line never creates an Order or advances it to `converted`.
- `serviceCommerce.sourceProjection` accepts one strict typed source ref and an
  optional authorized Store. It authorizes the actor and active Store profile
  before its exhaustive source loader and returns only Store identity,
  normalized state, neutral summary, capability readiness and allowed actions.
- Exact Product demand is a discriminated `exact_product` input with only
  `add_to_cart | create_commercial_order`. Inquiry creation accepts only
  `needs_identification | needs_availability_confirmation | needs_quote` and
  rejects exact Product input before opening a transaction.
- Existing Service and Prescription public tokens and routes remain their
  source-owned contracts. The shared source ref is an authenticated internal
  dispatch identity and is never substituted for a public bearer token.
- Inquiry state changes are revision-safe scoped commands. `QUOTED` is written
  only by Commerce Quote issuance; `CONVERTED` is written only after accepted
  Quote Order creation and acceptance recording in the same transaction.
- Inquiry Quote issuance re-authorizes Store operation/readiness inside its
  write transaction. An identical replay returns a new opaque secondary token
  backed by one rotatable digest; it does not store raw bearer data, invalidate
  the original token or repeat Quote/Inquiry effects. A `QUOTED` Inquiry is
  bound to its existing `clientQuoteId`; another Quote identity fails with an
  idempotency mismatch. New immutable versions remain scoped to that existing
  Quote identity. The server derives Product inventory configuration and
  balance revisions during Inquiry Quote issuance; public or attendant inputs
  cannot supply those trusted snapshots, and accepted conversion passes them
  to the Commercial Order reservation boundary.
- `catalogMatches` and `priceSuggestions` are authorized Tenant/Store-scoped
  projections. Suggestions include source, currency and effective time and
  never read another Tenant or represent missing evidence as zero.
- A generic Service/Inquiry line enters this boundary as a fingerprinted
  `source_snapshot`, not as verified truth. It may assist candidate ranking,
  but only the operator-confirmed Catalog name/alias is persisted as reusable
  Catalog meaning. Prescription uses the separate `human_verified` evidence
  variant; Ticket 04A will supply the same variant from revisioned generic
  Human-Verified Observations.
- `createDraftCatalog`, `linkCatalogOffering`, `promoteCatalogPrice` and
  `graduateCatalogOffering` are separate commands with role, revision, source,
  Store and vertical-policy checks. Saving a Quote cannot invoke them
  implicitly.
- Draft Catalog records remain private and unavailable to ordinary storefront
  search. Publication/activation is an explicit command independent of Quote
  use or managed-inventory graduation.
- Quote prices are immutable version facts. Catalog price promotion appends an
  attributed price change and never rewrites historical Quotes or Orders.
- Product availability is explicitly tracked in-stock, expiring manual/
  procure-to-order or unavailable. Only tracked in-stock creates a reservation;
  every available attestation owns an immutable maximum quantity and Quote
  preparation rejects a missing or larger quantity. Tracked requires an active
  inventory-configured Offering and existing balance; a private draft remains
  manual/unavailable until explicit graduation;
  graduation opening quantity is an explicit Stock Operation, never a value
  inferred from request/Quote/Order history.
- Prescription source adapters may propose/link drafts only from human-verified
  lines. Pharmacist release and vertical policy remain required for Product
  availability and Quote eligibility; OCR alone is never a Catalog command.
- Source fingerprints cover source-snapshot or human-verified line content and
  revision facts, not aggregate lifecycle timestamps. Issuing a Quote therefore
  cannot stale its own Catalog link, while a genuine line, transcript or
  mapping change does.
- Draft/link/availability/promotion command identities bind to normalized
  payload hashes. Replaying an identity with changed input fails with an
  idempotency mismatch.

### Implemented Store capability/readiness contract

- Profile status is `disabled | active | suspended`; Catalog adoption is
  `progressive | inventory_managed`. Capabilities are explicit booleans, not
  role-derived client state.
- Capability readiness is `available | setup_required | restricted |
  unavailable` with allowlisted blockers and recovery actions. Disabled Store,
  disabled/suspended profile, disabled capability, incomplete setup, policy
  restriction and provider outage remain distinct.
- Activation requires an active Store, intake, at least one web/staff/WhatsApp
  channel, at least one Quote/booking outcome and Progressive Catalog when that
  adoption mode is selected. At least one configured channel and one outcome
  must also be runtime `available`; setup, restriction or provider failure on
  the only configured option fails activation and active-profile updates.
- A suspended profile cannot be changed by the generic activation command.
  That transition requires a future policy-authorized flow. For WhatsApp, no
  Store binding is `setup_incomplete`; a non-active Binding or Connection is
  `provider_unavailable`; and a server-owned Store-profile restriction is
  `policy_restricted` and takes precedence. Authoritative Ticket 11 decisions
  now derive that policy outcome; the legacy allowlist is restriction-only
  compatibility input and cannot grant a capability.
- Catalog adoption projects private draft capture, public activation, tracked
  inventory and procure-to-order independently. A request/Quote still cannot
  publish Catalog data or invent stock.
- Commands require `storeId`, `expectedRevision`, a 3-240 character reason and
  shared Zod settings. Tenant id and actor id come only from authenticated
  context; repository reads/writes still predicate Tenant plus Store. Initial
  create and later updates translate optimistic/unique races to the same typed
  conflict rather than leaking a provider error.

### Implemented vertical/jurisdiction policy contract

- Exact policy scope is Tenant + Store + `service | pharmacy` vertical +
  two-letter Store jurisdiction + `web | staff | whatsapp` channel + one typed
  capability/Catalog-adoption subject. Clients cannot supply Tenant identity or
  derive Store jurisdiction.
- Runtime outcomes are `allowed | restricted | pending_evidence |
  expired_approval | prohibited`, with safe reason, policy revision and
  `validUntil`. Missing/changed jurisdiction, absent evidence, future/expired
  window, revocation and ambiguous facts fail closed. No runtime cache exists;
  invalidation is therefore each authoritative request/job read.
- Allowed decisions require a private evidence reference and approval
  reference. Nigeria Pharmacy WhatsApp has a separate default-prohibited rule
  and requires an explicit unexpired written approval record even when its
  Connection and Binding are technically ready.
- `setPolicyDecision` and `revokePolicyDecision` are optimistic, atomic,
  Tenant/Store-scoped release-owner commands. Every evaluation, safe list,
  evidence detail, denied read, change, revoke, jurisdiction mismatch, stale
  revision/write race and denied override appends an allowlisted audit without
  copying raw evidence.
- The public API derives `reviewedByUserId` from the authenticated release
  owner; clients cannot claim that another user performed the review.
- Public Service, Prescription and Inquiry entry points collapse a denied
  result to their existing unavailable contract. Inquiry acceptance checks the
  exact source and current policy before idempotent replay; the source must be
  `quoted` only for a fresh conversion, not after the replay already converted
  it.
- WhatsApp rejects a denied Store before inbound customer content is stored,
  rechecks at durable inbound/outbound claim, and rechecks the scoped attempt
  immediately before provider send. Denial creates no provider call.
- Pharmacy channel activation and public projection require both the exact
  channel subject and intake permission. A prohibited WhatsApp route exposes
  neither availability nor its display number. Media upload/re-upload, hosted
  checkout, fulfilment acceptance/configuration/progression and notification
  intent creation reauthorize at their server write boundary. A notification
  denial skips the intent without rolling back a valid payment or fulfilment
  transition.
- Progressive draft capture, Catalog publication, procure-to-order, price
  promotion and managed-inventory graduation are independently typed subjects.

### Implemented Customer Channels contract

- A Tenant may own multiple WhatsApp Connections and bind each to explicit
  Stores. The generic API delegates to compatibility persistence; no new caller
  depends on Prescription settings or credentials.
- Setup is `setup -> configure -> test -> publish`. A pending/replacement sender
  never displaces the working active route before the identifier-only readiness
  task succeeds. Ambiguous or cross-Tenant active binding graphs fail as a
  whole route.
- Team routing assigns only an accepted active Tenant Membership to one Store.
  It grants an operational attendant capability, not a Tenant role or Pharmacy
  licence. Publication requires at least one active attendant.
- A stable `/r/[token]` entry resolves current channel/policy facts and therefore
  survives sender rotation. The token/QR contains no Tenant, Store, connection
  or phone identifier. Multiple active senders suppress WhatsApp rather than
  guessing a route.
- Inbound events retain the resolved vertical. The runtime queues Pharmacy only
  for Pharmacy and generic Service only for the channel-neutral worker. Generic
  intake requires the explicit Store-scoped `intent:product` selection; absent
  selection returns `source_selection_required` and no aggregate is guessed.

### Implemented channel-neutral intake contract

- `serviceCommerce.submitPublicIntake`, `submitStaffIntake` and internal
  `submitWhatsAppIntake` accept the same strict envelope but each endpoint is
  schema-locked to its own channel/context. Public web carries only the opaque
  current entry token; protected staff Store selection is resolved from the
  authenticated Tenant; internal WhatsApp carries the claimed inbound event
  and provider identity.
- The public entry projection returns allowlisted request kinds, not source or
  Store identifiers. `product_inquiry` opens the generic request page;
  `prescription` resolves the current source-owned Pharmacy capability through
  a server redirect. Generic WhatsApp is advertised only when the generic
  Service route itself is policy-ready.
- The repository re-resolves Store, active attendant, readiness and policy
  before delegating to one explicit `commerce_inquiry | service |
  prescription | exact_product` intent. Source aggregates retain lifecycle and
  command ownership. Exact Product returns `use_cart`.
- Success returns only channel, replay flag and typed source reference. Expected
  stale/disabled/ambiguous/unsupported failures return an allowlisted recovery;
  unknown database/provider failures are rethrown for retry/observability.
- Entry revision and inbound-event `PROCESSING` state are asserted again inside
  the exact source write transaction. A transient generic WhatsApp failure
  releases the event to `RECEIVED` before throwing so the durable retry can
  claim it again; terminal unsupported/selection failures remain explicit.
- `clientCommandId` and optional `providerEventId` are persisted with consent
  and origin attribution. Provider replay is Tenant-idempotent; staff user
  attribution is never inferred for public or provider-created records.

### Implemented generic media contract

- Media intake is exactly `image | document` and `web | staff | whatsapp`, with
  allowlisted MIME/signature, 10 MiB per object and 12 active attachments per
  source. Client/provider identity is idempotent inside Tenant scope.
- Persistence separates private Media Asset, typed Source Attachment and
  revisioned Human-Verified Observation. Source adapters revalidate the exact
  Tenant, Store, source, source line and source version before intake, metadata,
  view or observation.
- The server rechecks channel, attachment capability, provider readiness and
  vertical policy. WhatsApp retrieval additionally binds the private provider
  media id to an active scoped Connection/Binding. Jobs carry identifiers only.
- Lifecycle is explicit: pending upload/retrieval, stored, safety pending, safe,
  quarantined, rejected, retryable, retention hold and deleted. Retry never
  turns a missing private object into public truth; retention deletion is
  idempotent.
- Staff metadata contains safe lifecycle/recovery only. Viewing requires an
  active attendant, current source, safe active attachment and a one-time
  60-second grant; expiry or embed failure restores authorization.
- Only an attributed current observation may feed Progressive Catalog matching
  and private draft creation. Raw bytes, customer wording, provider payload or
  automated safety output cannot publish, price, reserve or order.
- Ordinary Commerce has a baseline 365-day retention class. Pharmacy may attach
  a clinical extension and retain Prescription-owned OCR/review/access policy.

## Services

- Service Request is unconfirmed intent and creates no Order/work.
- Quote Versions are immutable; only the current unexpired version may be
  accepted. Acceptance is idempotent.
- Direct Intake confirmation and Quote acceptance create the Commercial
  Order/tracked work graph atomically.
- Job Line revision guards stale work transitions, authorization, split,
  assignment and promise changes.
- Evidence is private by default. Client contracts can report local, queued,
  uploading or failed state but cannot mark an asset safe/available. Trusted
  infrastructure must supply safe asset and safety metadata before manager
  publication can succeed.
- A mobile capture stored as `LOCAL` references a file retained in that app
  installation's documents directory. It is not a cloud URL, is never returned
  publicly, and cannot be published.
- Public tracking is an allowlisted projection and never returns internal notes,
  actors, private evidence, raw storage references or private contacts.
- Public tracking includes the tenant timezone so customer promise dates are
  formatted consistently and accurately.
- Intake may select standard/express service, an optional assignee, promised
  pickup, notification channel and initial payment. Express charges are
  snapshotted into the Order total.
- Line completion is not a staff progress transition. `services.handoff` is the
  only normal collection path and atomically requires ready work plus a zero
  balance, optionally applying the final payment.
- Batch work and batch messaging accept 1–100 Jobs. Batch messaging requires a
  stable client batch id so transport retries are idempotent. Scheduled intents
  remain independent of work state; rescheduling replaces pending due
  reminders, while full-Job readiness or handoff cancels obsolete reminders.
- `services.queuePage` cursor-loads active tracked work in priority/age order
  and searches receipt/customer/service fields without changing the total
  active-queue count used for search visibility.

## Offline

- `offline.settings` returns the active Tenant's
  `offlineOperationsEnabled` and `offlineApprovalRequired` policies.
  `offline.updateSettings` changes both for an Owner or Admin.
- Device registration and replay reject new work while offline operations are
  disabled. Existing staged/conflict records remain reviewable, and replay may
  return their current server status so originating devices can converge.
- The only supported command payload is versioned `commercial_order`. It may
  include customer snapshot facts and an optional initial payment; replay
  creates or reuses a directory Customer and records the payment atomically
  with the Order.
- Replay returns applied, review-required, blocked or discarded outcomes. A
  review-required result with no conflict code is awaiting management
  approval; a non-null code carries typed conflict and authoritative state.
- Owner/Admin/Manager may approve or reject staged records. Approval applies
  the original authenticated staff actor and Order atomically; failure moves
  the command into typed conflict review.
- Unsupported old command types and event shapes are rejected or discarded;
  there is no compatibility reader.
- Catalog, inventory, closeout, Staff, Service, standalone Customer and later
  payment mutations remain online-only.

## Commercial Order Delivery

- `orders.create.deliveryDueAt` is optional at the API boundary and defaults to
  now in the repository. `fulfillNow` is optional command intent.
- `orders.create.initialPayment` uses the same amount, method, reference, note,
  and idempotent client-payment identity as later payment collection.
- Future delivery and immediate fulfillment are mutually exclusive.
- `orders.fulfillProducts` accepts one idempotent command identity and commits
  every remaining active Product reservation in one transaction. Already
  fulfilled or otherwise non-active lines are not committed again. A durable
  tenant-scoped command receipt binds the identity to the Order payload and
  returns the original fulfilled-line count and resulting status on replay.
- Order projections expose nullable `deliveryDueAt`; null identifies a legacy
  Order created before scheduling rollout.
- Reminder settings return enabled, day-before, and same-day booleans for the
  active Store. Missing persistence returns all three defaults as true.
# QA purge contract

- Purge start requires a current signed preview and exact `PURGE ALL QA DATA`
  confirmation. Empty or provider-blocked previews are rejected.
- Status responses and retained receipts expose aggregate counts only.
