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
- Inbound provider event identity is unique and replay-safe. Recording the same
  provider event reuses the existing row, while worker claim uses an atomic
  `RECEIVED -> PROCESSING` compare-and-set. Concurrent duplicate deliveries can
  therefore produce at most one processing worker; a losing worker returns
  before Store binding, policy or customer work.
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

## Service Commerce Booking And Appointment Contract

- Booking configuration is Store + Offering scoped and carries an IANA
  timezone, one selected configured resource per booking, recurring local
  availability, typed exceptions, duration, lead/hold/horizon/reminder values,
  payment policy and cancellation/refund policy. Policy revisions are derived
  by the server and snapshotted at confirmation.
- Slot reads clamp a page-generated boundary to the authoritative server clock,
  preventing ordinary request latency from invalidating a current link while
  never returning a past slot. Holds and confirmations use row locks, bounded
  Serializable transactions and payload-bound replay identities.
- Booking lifecycle and payment lifecycle are independent. Only an accepted
  Commerce Quote may be linked; Request, Order and Service Job relations remain
  explicit. Reschedule keeps a confirmed booking confirmed and revalidates
  duration, horizon, resource capacity and current policy.
- `view_slots`, `confirm` and `view_and_manage` capabilities are short-lived,
  revocable, purpose-bound and revision-bound. A manage capability may read
  slots only for its current booking so customer cancel/reschedule remains
  possible without broad Store authority.
- Confirmation, reminder, reschedule and cancellation notifications persist as
  provider-neutral identifier-only intents. Claim reauthorizes policy and
  booking state before recipient decryption; bounded failure returns eligible
  work to retry, and the recurring sweeper covers every pending notification
  type rather than only reminders.

## Service Commerce Reporting Contract

- Inputs use a half-open `[start,end)` UTC occurrence window no longer than 366
  days. Tenant and actor are never client fields; optional Store scope is
  checked against the authenticated Tenant inside the repository.
- Every report or allowlisted drill-down read rechecks an active accepted
  Owner/Admin/Manager membership and appends one immutable audit before report
  queries run. Audit metadata is limited to actor, Tenant, validated optional
  Store, fixed server purpose, report kind/section, bounded time window,
  fixed `SERVICE_COMMERCE_REPORTING` source domain, allowed/denied result and an
  allowlisted denial reason; it contains no report rows, customer/request/media/
  provider identifiers or raw errors.
- Report and drill-down reads share a repository-owned rolling budget of 30
  attempts per actor/Tenant per 60 seconds. The Membership row serializes the
  count-plus-audit boundary and manager authority is re-read after the lock; the
  first over-budget read fails closed, is audited
  as `RATE_LIMITED`, and maps to a retryable API error without querying report
  facts.
- Each authoritative source query is capped at 10,000 rows. `mayBeTruncated`
  is true when any source reaches its cap so bounded aggregates are never
  presented as exact without qualification.
- Lifecycle values use source-owned occurrence fields: request receipt, Quote
  issue/acceptance, payment record, booking confirmation/completion, pickup,
  delivery and Service work completion. Current mutable `updatedAt` values are
  not accepted as historical completion or price evidence.
- Catalog provenance records explicit resolution and price-evaluation markers.
  Rows predating those markers contribute to `resolutionUnknown` or
  `quoteOverrideUnknown`; the API does not infer history from a graduated or
  currently priced Offering.
- Applicable external costs return a known total/count or `null` plus an
  unknown count. Meta/BSP delivered-message cost is counted only for the
  canonical delivered usage fact; read/failed callbacks stay reliability
  facts. Cost kinds are never merged or estimated.
- Report and drill-down outputs are aggregate-only strict schemas. Customer
  names, contacts, request/media/OCR text, object/provider references, bearer
  capabilities, credentials and provider operation ids are forbidden.

## Service Commerce Customer Action And Notification Contract

- The exhaustive action vocabulary is `request_quote | view_quote |
  choose_quote_option | book | pay_now | pick_up | delivery | talk_to_staff |
  reschedule | cancel`. One server registry owns labels, consequences and
  confirmation requirements; channel clients never recreate the state rules.
- Issuance derives current source, exact released Quote Version/selected Offer
  Option, booking, fulfilment, readiness and policy facts. Pending/rejected
  Quotes and actions not valid for the current state are never projected.
- A capability is short-lived, single-purpose and bound to Tenant, Store,
  source kind/id/version, target kind/id/version, optional exact Option,
  channel, action and payload identity. Persistence stores only its digest;
  logs, analytics, jobs and notification rows never store the raw bearer.
- Public preview and execution revalidate capability status/expiry, current
  source/version, exact target, Store readiness, vertical policy and the
  creator's current operating authority. Stale, consumed, revoked,
  cross-scope or unavailable facts collapse to a safe recovery response.
- Navigation is not business truth. Consequential commands require explicit
  confirmation and a payload-bound operation id. Quote Option selection runs
  inside the authoritative Commerce transaction; booking, payment and
  fulfilment continue through their existing source-owned command boundaries.
- Provider-neutral notification intents contain a protected recipient and
  server-owned message/template metadata. WhatsApp claim resolves exactly one
  active Store Binding/Connection whose approved template configuration
  contains the canonical customer-action template. Dispatch jobs carry
  identifiers only, reauthorize again after claim before decrypting
  credentials/recipient, send through Direct Meta, reconstruct only opaque
  `/action/[token]` URLs and record bounded attempts/receipts. Direct Meta
  status callbacks resolve the immutable provider Connection + operation id;
  delivered/read/failed states update only the matching Tenant/Store generic
  intent. Each action token remains single-purpose: read-only Quote links
  cannot accept/pay/choose fulfilment, and booking management accepts only the
  exact projected reschedule or cancel operation.
- A five-minute bounded scheduler enumerates due pending, failed or expired-
  claim intents whose attempt budget remains. It enqueues only actor/Tenant/
  Store/intent identifiers; the scoped claim remains the authorization and
  provider-readiness boundary.
- The release boundary remains authoritative: customer Quote actions appear
  only after an exact Version is `ISSUED`; a pending or rejected approval can
  create staff work but cannot create a customer capability or notification.

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
- `createDraftCatalog`, `linkCatalogOffering`, `promoteCatalogPrice`,
  `graduateCatalogOffering` and `publishCatalogOffering` are separate commands
  with role, revision, source, Store and vertical-policy checks. Saving a Quote
  cannot invoke them implicitly.
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
- Graduation preserves the Item, Variant and Offering identities plus every
  source link, alias, Quote, Order and price-history relation. Product input
  completes SKU/barcode, unit and opening-count facts; Service input completes
  duration, work, authorization and booking facts and cannot create stock.
  Both use the Offering revision and a stable command identity. Publication is
  a later confirmed command with its own revision check and audit event.
- A valid manual/procure-to-order attestation may produce a snapshot-only
  Commercial Order without a reservation after transaction-local revalidation.
  Only a published, inventory-configured Offering with tracked availability
  can reserve the verified Balance Source.
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

- `serviceCommerce.channelWorkspace` returns `recommendation | null` from the
  selected Store's validated Business Profile, operating model, order-channel
  and team-size facts plus the current active Tenant Store count. The strict
  recommendation contains only allowlisted channels, routing/coverage modes,
  reasons and setup steps with `advisoryOnly: true` and
  `authorizationEffect: none`. It is a read projection and cannot confer
  readiness, role, policy approval, binding, activation or publication.
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
  survives sender rotation. Newly published links use the shared
  `chat.ewatrade.com` origin, while already printed Storefront URLs continue
  through the same compatibility route. The token/QR contains no Tenant, Store,
  connection or phone identifier. Multiple active senders suppress WhatsApp
  rather than guessing a route.
- Inbound events retain the resolved vertical. The runtime queues Pharmacy only
  for Pharmacy and generic Service only for the channel-neutral worker. Generic
  intake requires the explicit Store-scoped `intent:product` selection; absent
  selection returns `source_selection_required` and no aggregate is guessed.

### Implemented quotation release contract

- Release mode is exactly `attendant_can_release | approval_required` and uses
  a typed attendant-release compatibility default when no policy row exists.
  Only Owner/Admin may create or revise the policy; changed-payload replay and
  stale revisions fail with the same typed conflict contract. After either
  mode is persisted, release requires an active Store attendant assignment;
  a generic Tenant role does not inherit the compatibility fallback.
- Approval-required configuration fails unless an active Store attendant and a
  selected active approver resolve to different Users. A one-person Store must
  keep the attendant-release mode or add another accepted team member.
- Approval-required preparation persists a private `DRAFT` Quote Version and
  one Tenant/Store/Version-unique `pending` approval. It returns no public
  acceptance token, Order, reservation, payment or communication intent and
  leaves the source in its pre-Quote lifecycle.
- Decision lifecycle is `pending | approved | rejected | superseded` with
  append-only transition audit. A new immutable revision supersedes only its
  prior pending decision; approved/rejected history remains immutable evidence.
- Approval requires a current active selected `QUOTE_APPROVER` Membership that
  differs from the requester. It revalidates policy revision, Membership and
  Store assignment, source/vertical/professional readiness, current Version,
  expiry, selected/default Option totals and availability inside the release
  transaction. Rejection performs the same identity/authority checks but does
  not create an issued/public source fact.
- Issue/approve/reject use bounded Serializable transactions and retry one
  serialization conflict before returning a typed conflict. Expired,
  non-current, source-terminal, policy-stale, approverless or availability-
  stale pending records are atomically superseded and audited; queue
  reconciliation provides an idempotent backstop for records never reopened.
- The release transaction is the only writer of Version `ISSUED`, source
  `QUOTED`, issued audit/usage and the public capability. Exact concurrent
  replay returns the released result with a fresh rotatable response token and
  does not repeat lifecycle or notification effects.
- Prescription release materializes digest-only quick actions and at most one
  protected `quote-ready:<version>` communication intent in the same
  transaction. A denied WhatsApp policy is audited and omits those optional
  channel effects without rolling back valid web/staff release. Enqueue occurs
  only after commit.
- Pending-list and detail projections carry safe commercial facts plus
  server-derived `canPrepare | canRequestApproval | canApprove | canReject |
  canRelease`. Public and WhatsApp projections expose only released `ISSUED`
  versions; clients never infer authority from role labels.

### Implemented shared fulfilment contract

- Pickup and delivery commands carry exact Tenant, Store, accepted Order and
  typed source identity. The API derives Tenant and actor identity from the
  authenticated context; the repository verifies the accepted Quote source
  before a vertical adapter can execute.
- The shared projection contains paid/Order/Quote facts plus a discriminated
  pickup or delivery operational state: current status, revision, preparation
  time, proof-present boolean, allowlisted recovery code, latest effective time
  and state-derived next operations. It exposes no address, proof value,
  courier identity, customer data or private reason. Next operations describe
  lifecycle shape only; every mutation reauthorizes current attendant,
  vertical role, policy and operational gates.
- Fixed-zone and reasoned manual-fee selection create a new immutable current
  Quote version before payment. The shared repository accepts only a safe
  non-negative minor-unit fee and one resolved payable Option.
- Preparation requires paid and eligible; assignment requires prepared and
  ready; completion/recovery remains an explicit transition. Pharmacy adds its
  professional release and policy checks without weakening the shared gates.
- Preparation, pickup exception/handoff, delivery assignment and delivery
  transitions lock the authoritative Order/fulfilment row before replay/state
  reads. Every client operation id is bound to canonical payload identity;
  identical concurrent calls recover the committed result and changed-payload
  reuse is a conflict.
- Pharmacy delivery `returned_to_pharmacy` is translated only at its adapter
  boundary to shared `returned_to_store`. Encrypted addresses and proof values
  remain vertical-private; notification intents remain policy-gated and
  allowlisted.

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
- Shared Pharmacy source/action projection consumes a server-owned current
  release fact and minimum internal contact-delivery facts, not clinical
  detail. Contact opt-in/email/phone may feed protected notification
  orchestration but never appear in the customer-safe projection. The current pharmacist review must be
  `RELEASED`, match the request's current media and transcript revisions, and
  accompany an allowlisted quote/post-quote source state. Missing or stale
  release facts produce no shared action. Clinical media, OCR, transcripts and
  review notes never cross this adapter boundary.
- Pharmacy compliance update and activation re-read the Tenant/Store-scoped
  Service Commerce profile inside the repository transaction. An active shared
  profile owns pickup/delivery outcome readiness and legacy Prescription fields
  are written only as compatibility mirrors; disabled/suspended shared profiles
  fail closed. If no shared profile exists, legacy fields remain the reversible
  expand-contract fallback.
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

## Store Conversations

- Bootstrap accepts only an opaque published Store Entry token. A valid
  existing server cookie resumes the Guest Identity; otherwise the server
  creates a 256-bit bearer and persists only its digest with a 180-day expiry.
- Customer text is trimmed, 1–2,000 characters, and payload-bound to
  `conversationId + publicToken + text` under a conversation-scoped client
  operation id. Optional `requestIntent` distinguishes default continuation
  from an explicit new/choice path. Replay returns the original message/source;
  changed payload is a conflict.
- The write transaction revalidates the current published Entry, active
  web/intake policy, active Store profile and attendant coverage, then locks the
  conversation. Exactly one eligible active source may receive the message;
  otherwise the message remains staged and has no Request link.
- Request selection is payload-bound to conversation, message, source kind/id
  and expected revision. Product choice may create a Commerce Inquiry in place;
  Service and Prescription continuation use their existing authoritative forms
  and link only a server-returned source. Stale, terminal, ineligible or foreign
  sources fail closed.
- `CommerceInquiry.revision` and `ServiceRequest.revision` are optimistic source
  versions incremented by lifecycle/Quote transitions. Prescription continues
  to use `currentMediaRevision`; Store Conversation does not invent a second
  clinical revision.
- Guest and staff timelines return only safe message id, sequence, occurrence,
  bounded text, safe sender label, observed channel and optional typed source
  reference. Safe Request cards derive type/status/lifecycle/occurrence from the
  current authoritative sources. Credentials, private contacts, clinical media,
  OCR, provider ids, internal audit and raw errors are excluded.
- Queue items contain conversation id, state, safe assignment label,
  assignment-to-current-user, current Request kind/label/status/lifecycle
  summaries, unread customer count, last customer occurrence and bounded SLA
  state/due time. Message bodies, Guest identifiers and private staff identity
  are deliberately absent.
- Queue filters are URL-owned and allow only Store, assignment, SLA, Request
  kinds, safe conversation reference and deterministic sort/cursor fields.
  Cursor pagination is cleared by filter changes but preserved by an explicit
  next-page action.
- Claim/release/handoff/reassignment commands bind the client operation to the
  exact conversation, expected assignment revision, bounded reason and target
  membership where applicable. Replay returns the original assignment result;
  changed payload conflicts.
- Reply binds the exact assignment revision, last message sequence and active
  typed Request revision. It rechecks source/policy/primary ownership before
  append, updates response occurrence facts and resolves an open escalation
  only after the reply succeeds. Current escalation state is resolved from the
  newest event for each bounded kind, never from a truncated global history.
- Timeline pagination uses `beforeSequence` and a bounded 1–100 limit. Mutable
  timestamps are not cursors; the protected sheet exposes an explicit older-
  message continuation.
- Same-origin Storefront mutations compare the public `Host` plus forwarded
  protocol when behind a trusted TLS-terminating proxy; internal request URLs
  cannot make the canonical shared chat host fail its origin check.
- Store replies must name the exact active typed Request whenever more than one
  is active. Conversation-level replies cannot carry Product, Service or
  Prescription outcome facts without that source reference.
- Mobile Customer requests carry the purpose-bound credential and installation
  proof only in dedicated headers over POST transport. Bootstrap may create a
  `MOBILE_DEVICE` credential; list, timeline, send and Request selection return
  its refreshed sliding expiry. The bounded list exposes only Store
  label/initials, latest safe message, state and current published Store token.
- Conversation Transfer creation is payload-bound to the source web
  credential, conversation, Store and caller-generated token digest. Claim is
  first-installation-only. Redeem requires a separately staged target
  credential candidate, persists only its digest, adds a scoped Guest access,
  and supports same-installation/same-target replay after a lost response.
- Native parsing accepts only the configured Customer Chat host or EwaTrade
  scheme, one `/r/<opaque-token>` path and an optional exact transfer fragment.
  Transfer capabilities are removed from crash URLs/breadcrumbs and never
  stored in AsyncStorage.

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

## Error And Diagnostic Contract

- Hono assigns one server-minted opaque request id per raw Request, reuses it
  across tRPC and fallback handlers, returns it as `X-Request-Id`, and exposes
  that header through CORS. Inbound correlation values are never reused because
  they may themselves contain customer, order, payment, or bearer identifiers.
- REST failures return `{ error: { code, message, referenceId, retryable },
  requestId }`. The public message comes from `@ewatrade/errors`; stack traces,
  raw exception messages, validation issues, provider bodies, and request
  payloads are excluded.
- tRPC `data.appError` exposes the same code, message, reference, retryability,
  and request id. The framework error code remains available for client routing
  but the server stack is removed from serialized responses.
- Expected authentication, validation, not-found/access, quote, role/module,
  rate-limit, idempotency, offline, and stock conflicts are not sent to Sentry.
- Reportable failures are converted to a safe diagnostic error and transmitted
  only through the exact-production policy in `@ewatrade/observability`.
- Webhook signature failures log only provider plus request id and return a safe
  response. Signatures, bodies, headers, customer data, and provider responses
  are neither logged nor attached to diagnostic events.
