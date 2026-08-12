# API Endpoints

Typed tRPC routers are the primary application contract.

## Tenant Workspace

- `tenant.businesses` lists the authenticated user's active business
  memberships for mobile workspace switching.
- `tenant.createBusiness` creates another merchant Tenant, active owner
  Membership, first Store, and completed Store onboarding record for the
  authenticated account.
- `auth.requestMobileOwnerOtp`, `auth.verifyMobileOwnerOtp`, and
  `auth.verifyMobileGoogle` carry bounded Business Profile personalization
  answers through owner signup. Login remains profile-neutral.
- `tenant.stores`, `tenant.current`, and `tenant.createStore` expose or capture
  the validated Store Business Profile used for setup recommendations.
- `tenant.featureAvailability` returns the active Store's record-derived
  feature presence plus business-wide Staff presence and the live sellable-item
  prerequisite.

## Catalog

- Read: `catalog.listItems`, `catalog.listItemsPage`, `catalog.getItem`,
  `catalog.listUnitDefinitions`, `catalog.listUnitConfigurations`.
- Setup/manage: `catalog.createSimpleItem`, `catalog.createItem`,
  `catalog.createUnitDefinition`, `catalog.createUnitConfigurationDraft`,
  `catalog.updateUnitConfigurationDraft`,
  `catalog.publishUnitConfiguration`, `catalog.setOfferingAvailability`,
  `catalog.archiveVariant`, `catalog.archiveOffering`.

## Inventory

- Read/report: `inventory.balanceReport`, `operationHistory`,
  `operationAudit`, `auditExport`, `reconciliationReport`,
  `offeringAvailability`, `transfers`.
- Operate: `postBalanceOperation`, `reserveOffering`, `commitReservation`,
  `releaseReservation`, `createStockCount`, `finalizeStockCount`,
  `transformPackagedStock`, `moveCustody`, `dispatchTransfer`,
  `transitionTransfer`, `createCloseout`, `finalizeCloseout`,
  `correctOperation`.

## Commercial Orders

- `orders.create`, `orders.get`, `orders.list`, `orders.listPage`,
  `orders.customerCount`, `orders.payments`,
  `orders.fulfillProductLine`, `orders.fulfillProducts`,
  `orders.returnProductLine`,
  `orders.recordPayment`, `orders.reminderSettings`,
  `orders.updateReminderSettings`.
- `orders.create` accepts optional delivery timing, immediate Product
  fulfillment intent, and an atomic initial payment.
- Trigger task `orders.fulfillment-reminders` checks due Product Orders hourly
  without changing fulfillment state.

## Global Search

- `search.global` returns a bounded, ranked tenant-wide aggregate of Orders,
  Customers, Catalog Items, Service Jobs, and role-permitted Staff.
- The mobile client waits for two normalized characters and debounces requests;
  quick-create actions are client navigation, not synthetic search records.

## Customers

- `customers.create`, `customers.count`, `customers.listPage`.

## Offline

- Policy: `offline.settings`, `offline.updateSettings`.
- Sync: `offline.registerDevice`, `offline.replay`, `offline.conflicts`,
  `offline.review`.
- `offline.conflicts` is the management review queue for both staged staff
  records and typed conflicts; each row declares its review kind and safe
  actions.

## Service Operations

- Intake/work: `services.createIntakeDraft`, `confirmIntake`,
  `createAndConfirmIntake`, `queue`, `queuePage`, `getJob`, `assignees`, `assignJob`,
  `authorizeLine`, `transitionLine`, `rescheduleJob`, `splitLine`,
  `createRework`, `addNote`, `recordException`, `batchUpdate`,
  `handoff`, `getSettings`, `updateSettings`.
- Evidence: `services.captureEvidence`, `updateEvidenceUpload`,
  `publishEvidence`, `revokeEvidence`.
- Customer access: `serviceAccess.createRequestForm`, `requestForms`,
  `requestForm` (public), `submitRequest` (public), `requests`,
  `updateRequest`, `issueQuote`, `quote` (public), `selectQuoteOption`
  (public), `acceptQuote` (public),
  `createTracking`, `revokeTracking`, `tracking` (public).
- Communications/reporting: `serviceCommunications.createIntent`,
  `createBatchIntents`, `providerStatus`, `recordManualShare`,
  `recordDeliveryAttempt`,
  `serviceReporting.summary`, `serviceReporting.auditExport`.

## Service Commerce

- Protected booking procedures are `bookingConfiguration`,
  `createBookingResource`, `updateBookingConfiguration`,
  `createBookingCapability`, `holdBookingSlot`, `confirmBooking` and
  `reviseBooking`. Tenant, Store and actor scope are server-derived; public
  customer contact is never accepted.
- Public `publicBookingSlots`, `publicHoldBookingSlot`,
  `publicConfirmBooking`, `publicBooking` and `publicReviseBooking` accept only
  short-lived opaque purpose-bound capabilities. Missing, stale, rotated,
  expired, cross-scope or revision-mismatched capabilities collapse to the
  same unavailable public response.
- Protected `serviceCommerce.issueCustomerActions` resolves the authenticated
  Tenant, authorized Store and operator, projects the current exhaustive
  action set, persists digest-only capabilities and optionally enqueues one
  provider-neutral notification after commit.
- Public `serviceCommerce.customerAction` accepts only an opaque capability
  token and returns a current safe preview or an unavailable recovery. Public
  `executeCustomerAction` additionally requires a stable operation id and the
  explicit confirmation flag; it never accepts Tenant, Store, source or target
  identifiers.
- Protected `serviceCommerce.report` returns aggregate lifecycle, Catalog,
  reliability, media and separated-cost projections for a server-derived
  Tenant and optional authorized Store over a half-open date window.
- Protected `serviceCommerce.reportDrilldown` accepts only the allowlisted
  `lifecycle | catalog | reliability | media | costs` category. It derives the
  actor for the repository access boundary and returns aggregate, redacted
  buckets rather than raw rows or provider operation identifiers. The internal
  Connection id remains an allowlisted aggregate cost-attribution dimension.
- Both reporting procedures reauthorize the active Owner/Admin/Manager and any
  requested Store inside the repository, then append one immutable allowed or
  denied report-read audit before querying report facts. A foreign Store id is
  never persisted in the denial evidence. Reads are limited to 30 per
  actor/Tenant in a rolling 60-second window; an excess read returns a safe
  retryable `TOO_MANY_REQUESTS` error and appends `RATE_LIMITED` denial evidence.
- Dashboard `/service-commerce/reports` owns typed URL `store`, `from`, `to`
  and `detail` state plus explicit loading, empty, error, retry and truncation
  presentation. It does not widen the server's Store or manager authorization.
- Storefront `/action/[token]` renders the current action/recovery. Booking,
  support and Quote pages accept only the same revalidated opaque capability;
  `/commerce-inquiry-quote/[token]` owns Product Inquiry Quote selection and
  acceptance without exposing internal scope.

- Protected `serviceCommerce.workspaceAccess` resolves an optional authorized
  Store selection and returns only the server-owned access, configuration,
  readiness, activation blockers, revision, Store summary and Tenant billing
  ownership projection. WhatsApp readiness reads its scoped binding/Connection
  lifecycle, while restrictions come from the profile's server-owned
  capability input; no credential, customer content or private policy reason
  is returned.
- Protected `serviceCommerce.updateProfile` requires Store scope, expected
  revision, shared settings and a bounded reason. It updates/creates the
  profile and audit event atomically.
- Protected `serviceCommerce.setActivation` requires the same scope, revision
  and reason plus the requested active state. Activation re-evaluates blockers
  and scoped provider/policy readiness inside the transaction before a
  revision-guarded state and audit write. It requires an available channel and
  Quote/booking outcome and fails closed for suspended profiles.
- Protected `serviceCommerce.policyDecisions` returns safe current decision
  metadata for an authorized Store without evidence/licence/approval values.
  `policyDecision` is the separately audited Owner/Admin evidence-detail read.
- Protected `serviceCommerce.setPolicyDecision` and
  `revokePolicyDecision` require authorized Store scope, release-manager
  authority, explicit vertical/jurisdiction/channel/subject, authenticated reviewer attribution,
  effective/expiry window, private evidence plus approval where allowed, a
  reason and expected revision. Conflicts and cross-scope inputs fail closed.
- Protected `serviceCommerce.sourceProjection` resolves an exhaustive
  `service | prescription | commerce_inquiry` ref only after Tenant, Store,
  actor and active-profile authorization. It returns the customer-safe shared
  projection and never returns vertical-private data.
- Protected `serviceCommerce.createInquiry` and `transitionInquiry` own the
  narrow Product-uncertainty lifecycle. Exact Product inputs are rejected for
  cart/Commercial Order handling; generic transitions cannot set quoted or
  converted.
- Protected `serviceCommerce.issueInquiryQuote` issues an immutable Commerce
  Quote with one or more exact Offer Options for a ready Inquiry and Product
  Offerings only. Authorization/readiness is checked inside the Quote
  transaction; identical retries return a usable secondary opaque token
  without repeating lifecycle effects.
- Public `serviceCommerce.inquiryQuote`, `selectInquiryQuoteOption` and
  `acceptInquiryQuote` use the opaque Commerce Quote token. Selection is
  current-version guarded and idempotent; acceptance remains unavailable until
  one of multiple Options wins. Acceptance creates one Commercial Order from
  only that selected/default Option before marking the Inquiry converted. An
  exact accepted replay reauthorizes current policy and returns the original
  Order after conversion.
- Protected `serviceCommerce.catalogMatches` and `catalogPriceSuggestions`
  resolve one authorized typed source line, fail closed on policy/scope drift,
  and return ranked private/active Offerings plus attributable Store-first
  price evidence. Missing price history is an explicit unknown result.
- Protected `serviceCommerce.createCatalogDraft` and
  `linkCatalogOffering` are idempotent reviewed-source commands. Generic raw
  request wording is only a fingerprinted source snapshot; the operator must
  provide the confirmed Catalog name/alias. Draft creation reuses the private
  Item/Variant/Offering graph and never publishes a record, creates Store
  availability or creates a stock balance source.
- Protected `serviceCommerce.attestCatalogAvailability` records tracked,
  expiring manual procure-to-order or unavailable evidence. Tracked evidence
  requires an already-configured Store balance; the read never creates one.
  Every available result commits a maximum quantity that Quote preparation
  cannot exceed. A private draft cannot claim tracked stock before its separate
  managed-inventory graduation.
- Protected `serviceCommerce.catalogPricePromotionImpact` and
  `promoteCatalogPrice` separate an immutable Quote price from a confirmed,
  manager-gated reusable Offering price change and return every affected Store
  before mutation.
- Protected `serviceCommerce.catalogGraduationReadiness` projects the exact
  Product- or Service-specific facts still missing from one Store Offering.
  `graduateCatalogOffering` completes those facts in place with an expected
  revision, idempotency identity, actor and reason; Product opening quantity is
  posted through an explicit stock operation while Service graduation has no
  inventory effect.
- Protected `serviceCommerce.publishCatalogOffering` is a separate confirmed,
  revisioned command. Graduation never implicitly publishes an Item, Variant,
  Offering or Store availability record.
- Protected Customer Channels procedures expose the scoped workspace, manual
  or Embedded WhatsApp setup, explicit Store bindings, connection retest and
  lifecycle, Store attendant assignment/revocation, and stable entry-point
  publish/revoke. Owner/Admin owns provider setup; accepted active Memberships
  are the only assignable Store attendants.
- The protected `serviceCommerce.channelWorkspace` response includes a nullable
  advisory onboarding recommendation. It is server-derived from validated
  Store metadata and active Tenant Store count, and exposes no mutation or
  authority.
- Protected `serviceCommerce.quoteReleaseSettings` and
  `updateQuoteReleaseSettings` expose/update the Store's revisioned
  `attendant_can_release | approval_required` policy. The update is
  Owner/Admin-only and accepts only selected active Membership ids, expected
  revision, stable operation id and bounded reason.
- Protected `serviceCommerce.pendingQuoteApprovals` and
  `quoteApprovalDetail` return safe Store-scoped pending work plus the exact
  immutable Quote Version, Option totals, expiry and server-derived decision
  actions. Manager access does not grant approval authority.
- Protected `serviceCommerce.approveQuoteVersion` and `rejectQuoteVersion`
  require the approval, Quote, Version and policy identities plus a stable
  decision id and reason. Approval is a bounded atomic release command;
  rejection remains a staff decision and never reuses customer decline.
- Public `serviceCommerce.publicCustomerEntryPoint` resolves only a digest of
  the opaque `https://chat.ewatrade.com/r/[token]` capability and returns
  current allowed request/chat
  actions. It returns no Tenant/Store/provider id or mutable sender number when
  routing is missing or ambiguous.
- Protected media procedures expose policy-authorized safe attachment metadata,
  60-second one-time viewer grants and revisioned human observation. Internal
  procedures own commit, safety and retry transitions. Raw provider ids,
  storage keys and bytes never enter tRPC projections.
- `POST /api/service-commerce/media/upload` is the authenticated staff multipart
  boundary. It resolves Tenant/Store/attendant/source/policy, verifies bytes
  server-side, stores privately, commits the scoped asset and enqueues an
  identifier-only safety task. `GET /api/service-commerce/media/[token]`
  consumes a one-time short-lived viewer capability.

## Staff And Billing

The retained `retailOps` router contains only staff membership/onboarding and
subscription administration. Catalog, inventory, orders, offline and Service
operations do not use that compatibility namespace.

## Managed Domains

- Read: `domains.list`, `domains.registrantProfile`, `domains.order`.
- Purchase: `domains.checkAvailability`, `domains.saveRegistrantProfile`,
  `domains.createCheckout`.
- Bring your own: `domains.connectExternal`, `domains.verifyConnection`.
- `POST /api/domains/webhooks/paystack` verifies the raw-body Paystack
  signature and owns successful payment/refund facts. Non-terminal and failed
  refund events are recorded idempotently for operations visibility.
- Trigger jobs `domains.registration`, `domains.connection.verify` and the
  scheduled `domains.reconcile` task own registrar and Vercel side effects.
- GO54 and Openprovider do not receive client-originated requests. Current
  provider lifecycle recovery uses scheduled authoritative reads rather than a
  provider webhook.

## Public Host Ownership

## Store Conversations

- `POST /api/store-conversations/bootstrap` is a same-origin shared-host route
  that opens/resumes one permitted Store conversation and sets a Secure,
  HttpOnly, SameSite guest cookie. The raw bearer never enters JSON output.
- `POST /api/store-conversations/messages` accepts one bounded customer text
  command with a client operation id and current opaque Store Entry token. It
  atomically appends one web message and one typed Commerce Inquiry source.
- `GET /api/store-conversations/timeline` returns a bounded safe guest timeline
  using deterministic sequence pagination.
- Protected `serviceCommerce.storeConversationQueue`,
  `claimStoreConversation`, `storeConversationTimeline`, and
  `replyToStoreConversation` expose the Store-attendant half of the first text
  loop. Tenant, Store and actor scope are derived from the authenticated
  context.

These endpoints are installed on the verified development database and their
QR-to-guest-to-message-to-claim-to-reply lifecycle passes run-owned Neon and
desktop/compact HTTPS browser acceptance. Provider and production release
remain separately authorized work.

Public Service Request, Quote and Tracking routes are rendered by the
storefront. Registration/login and all authenticated dashboard routes remain on
the shared application host. A business subdomain never routes to an
authenticated dashboard.

## Prescription Commerce

- Protected tRPC router `prescriptions` owns Store setup, activation,
  professional assignments, queue/detail reads, media decisions, transcription
  verification, pharmacist release, quote issue, payment/refund operations,
  pickup/delivery operations, privacy requests, incidents, reporting, manual
  WhatsApp setup, Embedded Signup selection, connection readiness/lifecycle,
  and Store binding management.
- The protected queue context exposes lightweight readiness and allowlisted
  assignee facets. Queue filters include shareable assignee and UTC date
  boundaries. The reporting query accepts one authorized Store or the whole
  active Tenant and returns de-identified Store breakdowns and separated cost
  categories.
- `prescriptions.workspaceAccess` returns only the current user's Store-scoped
  operational capability source (`professional_role`, `break_glass`, or none).
  It lets the server route prefetch setup or the first queue without deriving
  authority from client-visible role lists; queue/detail procedures still
  enforce and audit access independently.
- `prescriptions.reviseTranscription` is an attendant-only, revision-guarded
  line correction/addition/deletion command. Pickup and delivery queue reads
  require the same operational-role or audited break-glass access as the
  Prescription Request queue.
- `prescriptions.verifyPrivacyRequest` requires bounded identity-verification
  evidence and persists the verifier before enqueueing privacy execution.
- Sensitive detail/media/setup reads append access events. A personal
  Owner/Admin break-glass grant lasts at most 60 minutes, is conspicuous in the
  queue, logs each emergency access, and requires a reviewed resolution reason.
- Public tRPC router `prescriptionAccess` owns capability-scoped web intake,
  status, re-upload, Quote review/Offer Option selection/acceptance, fulfilment
  choice, hosted payment, and pickup-code projections. The browser never
  supplies Tenant/Store ids as authority. Upload/re-upload, checkout and
  fulfilment commands reauthorize
  current Pharmacy policy before governed persistence or provider work; a
  blocked WhatsApp channel exposes neither availability nor its number.
- `GET|POST /api/webhooks/whatsapp` verifies Meta subscription/signatures and
  delegates normalized inbound events to the connection-resolving runtime.
- `serviceCommerce.submitPublicIntake`, `submitStaffIntake`, and internal
  `submitWhatsAppIntake` expose the channel-neutral intake contract. The public
  Store entry also serves `/request/[token]`; `/r/[token]/whatsapp?intent=product`
  opens the explicit generic Product Inquiry flow.
- `serviceCommerce.fulfillmentDetail`, `pickupFulfillment`, and
  `deliveryFulfillment` expose the exact Tenant/Store/Order/source shared
  fulfilment boundary. Commands currently dispatch only through the explicit
  Prescription compatibility adapter; unsupported source kinds fail closed.
- `GET /api/communications/whatsapp/embedded-signup/callback` validates signed
  state, exchanges the Meta code, persists encrypted short-lived discovery,
  and redirects to explicit dashboard number selection.
- `POST /api/webhooks/prescription-payments/:provider` verifies the raw provider
  callback before creating idempotent payment facts.
- Trigger tasks own generic Service Commerce and Pharmacy WhatsApp inbound,
  generic media retrieval/safety, OCR/transcription,
  continuation, communication dispatch, connection readiness, privacy
  execution, and retention.
# Platform QA maintenance

- `qaMaintenance.candidates`, `adopt`, `preview`, `start`, and `run` are
  platform-admin-only tRPC operations.
