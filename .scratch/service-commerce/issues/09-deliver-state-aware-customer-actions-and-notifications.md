# 09 - Deliver State-Aware Customer Actions And Notifications

**What to build:** Project and deliver only the customer actions valid for the current source version, Store capabilities, vertical policy and channel, including Request quote, Book, Pay now, Pick up, Delivery and Talk to staff.

**Blocked by:** 04 - Generalize WhatsApp Connection And Location Binding; 05 -
Deliver Channel-Neutral Request Intake; 06 - Reuse Quote Payment And Order
Conversion; 06B - Enforce Store Quotation Approval And Release; 07 - Add
Booking And Appointment Lifecycle; 08 - Extract Shared Pickup And Delivery
Fulfilment; 11 - Enforce Vertical And Jurisdiction Eligibility.

**Status:** complete in source and verified on the Neon development database;
live provider canaries and production rollout remain separate release gates

**Approval:** Original scope and revised dependency order owner-approved on
2026-08-09; selectable Offer Option actions approved on 2026-08-10.

- [x] Define one exhaustive server-side action registry keyed by typed state/capability/policy rather than UI string switches.
- [x] Generate opaque, expiring, single-purpose, idempotent capabilities bound to the current internal version and Store.
- [x] Keep sensitive data, Tenant/Store ids and raw bearer capabilities out of button payloads, logs and analytics.
- [x] Revalidate source, current version, expiry, fulfilment, role and vertical eligibility on every action command.
- [x] Make payment, booking and fulfilment confirmation explicit commands; button clicks and link navigation are not business truth.
- [x] Render channel-appropriate web/WhatsApp actions with safe stale/expired recovery and a direct human escalation path.
- [x] Render authoritative Offer Option actions such as `Choose red small` and
  `Choose black large` with each exact price. UI/templates consume Ticket 06's
  server projection and never calculate exclusivity, selected state or totals.
- [x] Never project/send a pending or rejected Quote. Approval request/decision
  notifications are staff-facing; customer `View quote`, `Choose` and `Pay`
  actions appear only after Ticket 06B's exact-version release succeeds.
- [x] Persist provider-neutral intents and idempotent attempt/receipt facts with template and service-window enforcement.
- [x] Test the registry and shared execution seam across positive, stale,
  consumed, cross-Tenant, disabled, provider-failure and replay paths, plus
  exact Quote Option, booking and support target integrations.

## Evidence

- The DB-free registry is exhaustive for `request_quote`, `view_quote`,
  `choose_quote_option`, `book`, `pay_now`, `pick_up`, `delivery`,
  `talk_to_staff`, `reschedule` and `cancel`.
- Capability rows store only digests and bind Tenant, Store, source/version,
  exact target/version, action, expiry and idempotency facts. Public preview and
  execution reauthorize current server facts before returning or changing
  state.
- The provider-neutral notification outbox stores protected recipients and
  identifier-only job payloads. Dispatch resolves exactly one active Store
  binding, requires the server-owned approved customer-action template,
  rechecks policy/readiness after claim, reconstructs only opaque
  `/action/[token]` links and sends through the existing Direct Meta adapter.
- A bounded five-minute scheduler recovers due pending, failed or expired-
  claim outbox rows after enqueue/process failure and fans out only
  identifier-only payloads; claim still owns authorization and retry limits.
- Focused shared, DB, Commerce Quote, booking, Customer Channels, WhatsApp
  receipt, API, communications and job suites passed 116 tests with 300
  assertions. The suite proves channel gating, view-only Quote authority,
  exact booking-operation continuation and scoped receipt reconciliation.
- `20260811100049_service_commerce_customer_actions` was generated and applied
  through the canonical verified `.env.local` Neon workflow; `bun db:push`
  reported the development database already in sync.
- `20260811110847_service_commerce_customer_notification_receipts` adds the
  immutable provider-Connection reference used to route delayed Direct Meta
  delivered/read/failed receipts into the generic notification ledger; it was
  generated/applied through the same verified Neon workflow.
- The run-owned Neon action lifecycle passed 1 test with 6 assertions and
  removed its fixture atomically.
- A temporary run-owned Neon fixture powered Portless QA of a current `View
  quote` capability at 1280x720 and 390x844. The 44px control executed once,
  rendered the completed/Continue state and reached the secure Service Quote
  route with HTTP 200. The stale/unavailable Retry state also passed; neither
  mobile state overflowed and the console remained clean. The fixture was
  removed immediately afterward.
- Live provider template canaries, production migration application and
  business activation remain explicitly open.
