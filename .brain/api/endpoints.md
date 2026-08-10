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
  `updateRequest`, `issueQuote`, `quote` (public), `acceptQuote` (public),
  `createTracking`, `revokeTracking`, `tracking` (public).
- Communications/reporting: `serviceCommunications.createIntent`,
  `createBatchIntents`, `providerStatus`, `recordManualShare`,
  `recordDeliveryAttempt`,
  `serviceReporting.summary`, `serviceReporting.auditExport`.

## Service Commerce

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
- Protected `serviceCommerce.sourceProjection` resolves an exhaustive
  `service | prescription | commerce_inquiry` ref only after Tenant, Store,
  actor and active-profile authorization. It returns the customer-safe shared
  projection and never returns vertical-private data.
- Protected `serviceCommerce.createInquiry` and `transitionInquiry` own the
  narrow Product-uncertainty lifecycle. Exact Product inputs are rejected for
  cart/Commercial Order handling; generic transitions cannot set quoted or
  converted.
- Protected `serviceCommerce.issueInquiryQuote` issues an immutable Commerce
  Quote for a ready Inquiry and Product Offerings only. Authorization/readiness
  is checked inside the Quote transaction; identical retries return a usable
  secondary opaque token without repeating lifecycle effects.
- Public `serviceCommerce.inquiryQuote` and `acceptInquiryQuote` use the opaque
  Commerce Quote token. Acceptance is idempotent and creates one Commercial
  Order before marking the Inquiry converted.

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
  status, re-upload, Quote review/acceptance, fulfilment choice, hosted payment,
  and pickup-code projections. The browser never supplies Tenant/Store ids as
  authority.
- `GET|POST /api/webhooks/whatsapp` verifies Meta subscription/signatures and
  delegates normalized inbound events to the connection-resolving runtime.
- `GET /api/communications/whatsapp/embedded-signup/callback` validates signed
  state, exchanges the Meta code, persists encrypted short-lived discovery,
  and redirects to explicit dashboard number selection.
- `POST /api/webhooks/prescription-payments/:provider` verifies the raw provider
  callback before creating idempotent payment facts.
- Trigger tasks own media safety, OCR/transcription, WhatsApp inbound
  continuation, communication dispatch, connection readiness, privacy
  execution, and retention.
# Platform QA maintenance

- `qaMaintenance.candidates`, `adopt`, `preview`, `start`, and `run` are
  platform-admin-only tRPC operations.
