# In Progress

- Amend and then execute the Service Commerce platform migration batch in
  dependency order. ADR-0029 plus ADR-0030 and
  `.scratch/service-commerce/spec.md` define a horizontal capability layer over
  existing Catalog, Customer, Commerce, Service Operations, Fulfilment,
  Communications and Reporting boundaries. Progressive Catalog lets verified
  demand grow private draft Catalog/price history and later graduate to managed
  inventory without automatic publication or invented stock. ADR-0031 adds
  generic Customer Channels, stable Store links/QR codes, private request
  media/verified observations, exact selectable Offer Options, Store attendant
  routing and optional exact-version Quote approval. Pharmacy is a
  thin regulated extension; an appointment business is the second validation
  vertical. The revised 17-ticket batch in
  `.scratch/service-commerce/issues/` was owner-approved through 2026-08-10.
  Ticket 01 is complete: the focused package exposes the exact three-source contract,
  the broad acceptance file is split by lifecycle behind one run-owned atomic
  fixture, and compatibility evidence remains green. Ticket 02 is complete:
  Store capability/readiness profiles are disabled by default, Tenant/Store
  authorization and revisioned audit commands are server-owned, the Midday
  setup workspace passed desktop/tablet/mobile save-and-activate QA, and the
  additive schema plus initial-create/activation concurrency and audit
  integration passed on `.env.local` Neon. Scoped WhatsApp binding/Connection
  state and the profile-owned policy allowlist now produce distinct setup,
  provider and restriction recovery states; generic activation fails closed
  for suspended profiles and for a sole channel/outcome that is not
  runtime-ready. The development schema is synchronized non-destructively;
  Prisma's
  existing broad ledger drift prevented migration-artifact generation, so no
  reset was accepted and production remains untouched. Ticket 03 is complete:
  one exhaustive source projection preserves Service and Prescription
  ownership/privacy, while the narrow Commerce Inquiry lifecycle routes exact
  Product demand away from artificial work and allows only accepted Quote
  conversion to create an Order. Its additive schema is synchronized to the
  verified `.env.local` Neon database; 57 focused tests pass with 172
  assertions, and the run-owned Neon acceptance passes with 22 assertions and
  atomic fixture cleanup. Ticket 11 is complete: one revisioned server policy
  boundary now owns vertical/jurisdiction/channel/subject decisions, private
  evidence and audit; activation, public/source/media/intake, payment and
  fulfilment commands plus WhatsApp intent/claim/provider send reauthorize
  current facts. Nigeria Pharmacy WhatsApp is
  default-prohibited without an explicit unexpired written approval, while the
  five Progressive Catalog decisions remain independent. Its dedicated Neon
  gate passed 9 assertions and all 10 established compatibility scenarios pass;
  the final combined run's manual-fee `P2028` passed an isolated 17-assertion
  rerun.
  Ticket 03A is complete: fingerprinted source snapshots and human-verified
  Prescription evidence feed one private Catalog seam; raw customer wording is
  never automatically reusable truth. Store-first price suggestions,
  quantity-bounded manual/tracked availability, immutable Quote pricing,
  manager-gated reusable-price promotion and the Midday global sheet are
  source-complete. The verified `.env.local` Neon development run passes four
  Product/Service scenarios with 15 assertions, and authenticated desktop/
  mobile sheet QA passed. Tickets 04 and 04A now have source-complete Customer
  Channels and generic private-media foundations on the verified development
  Neon database. Ticket 04's remaining onboarding recommendation is now a
  strict advisory-only Store projection: focused checks pass 28 tests / 130
  assertions, authenticated 1280x720 and 390x844 Channels QA passed without
  console errors or page overflow, and the run-owned Tenant/users were removed.
  Its final deterministic routing suite passes 48 tests / 108 assertions and a
  verified-Neon matrix passes 1/16, including replay-safe provider-event storage
  and one atomic worker claim under a concurrent duplicate. Store-team proofs
  keep attendant, pharmacist and commercial-approver capabilities independent.
  Live Meta/provider release acceptance remains open. Ticket 05 is complete.
  Its strict shared envelope,
  Tenant/Store/attendant dispatcher, channel-locked API,
  `/request/[token]` Product Inquiry page and explicit product-selected generic
  WhatsApp image/document worker are source-complete. A run-owned verified-Neon
  test passes all three origins for Commerce Inquiry and Generic Service plus
  replay and exact-Product recovery with 8 assertions. Dedicated source suites
  complete the progressive-Catalog, image/PDF, Pharmacy, cross-scope,
  revocation and central-branch matrix. Desktop/mobile Portless browser QA
  passed the public entry and Product Inquiry submission/success flow with no
  console errors against a temporary run-owned Neon fixture; cleanup was
  verified. Ticket 06 is complete: mutually exclusive Offer Option contracts,
  additive persistence, runtime issuance, idempotent selection, selected-only
  acceptance, legacy default projection and the preparation/release transaction
  pass focused checks. A follow-up revalidation makes legacy commercial
  alternatives display-only/non-payable, preserves a pharmacist-selected
  substitute as one included Order line and moves the Storefront public Quote
  commands behind the typed tRPC boundary. The exact post-release `.env.local`
  Neon matrix passes 6 tests and 126 assertions across multi-option Inquiry,
  generic Service, Pharmacy web/staff/WhatsApp pickup and substitute pricing;
  desktop/mobile browser QA also passes selection, selected-only payable total
  and one-Order acceptance states without console errors or mobile overflow.
  The synthetic fixture was removed. Ticket 06A is complete: one verified-Neon
  lifecycle proves a manual progressive Order without reservation, same-ID
  Product graduation with explicit opening stock, separate publication and a
  later tracked Order with reservation. Authenticated desktop and 390x844
  mobile QA passed graduation, publication, Catalog refresh, stale-id recovery
  and URL/form cleanup. Ticket 06B is complete: Store release policy,
  selected active Membership approvers, private exact-Version preparation,
  separate commercial approval/rejection and atomic source/public/Prescription
  notification release are source-complete. Persisted policy requires an
  explicit Store attendant, decisions retry one Serializable conflict, and
  stale pending decisions are atomically superseded/audited across direct and
  queue reconciliation paths. The verified `.env.local` Neon
  matrix passed 2 tests and 17 assertions, authenticated desktop/390px mobile
  Customer Channels configuration passed, and its synthetic Tenant/User was
  removed atomically. The additive migration is applied only to development;
  Ticket 08 is complete: strict source-bound pickup/delivery commands, safe
  operational projections, reusable Quote revision/zone/gate rules, a concrete
  Pharmacy adapter and row-locked payload-bound replay are source-complete.
  The canonical `.env.local` Neon matrix passed 8 tests and 242 assertions
  across pickup, fixed delivery and manual delivery with concurrent prepare/
  assignment and atomic fixture cleanup. Ticket 07 is complete with typed
  Store resources/availability, capacity-safe holds, confirmation and
  revisioned customer management, independent payment reconciliation and
  identifier-only notification jobs. Its canonical Neon lifecycle passed 1
  test/29 assertions; authenticated desktop and 390x844 dashboard/storefront
  QA covered configuration, slot selection, hold, confirmation, cancel and
  reschedule with atomic fixture cleanup. Ticket 09 is complete: one exhaustive
  state-aware action registry issues digest-only, expiring capabilities bound
  to current source/target versions; public preview/execution reauthorize
  current policy/readiness and explicit confirmation before effects. The
  provider-neutral notification outbox keeps recipients protected and jobs
  identifier-only; WhatsApp delivery resolves one active Store sender and the
  canonical approved template before Direct Meta send, while a bounded
  scheduler recovers due outbox work, and delayed Direct Meta callbacks append
  scoped generic delivered/read/failed receipts through the immutable provider
  Connection reference. Focused checks passed 116 tests/300
  assertions, the canonical
  `.env.local` Neon action lifecycle passed 1 test/6 assertions with atomic
  cleanup. A temporary run-owned Neon fixture then passed 1280x720 plus
  390x844 current-action, completed-state, secure Quote continuation and stale
  recovery QA without console errors or overflow, followed by cleanup. Tickets
  10 and 12 are now the next
  dependency-ready approved source frontiers.
  Live Meta/storage/scanner release gates remain open. The focused
  Customer Channels/media matrix passes 71 tests and 177 assertions; the
  run-owned `.env.local` Neon bag-media seam passes 7 assertions. The full test gate has
  five separately reproducible
  failures in unrelated in-progress mobile navigation and Retail Ops test
  fakes; Service Commerce focused and Neon gates are green. No production
  schema/provider operation is authorized.
  Started Date: 2026-08-09.

- Complete the Prescription Commerce production rollout after the 01-20 source
  implementation and final review fixes. Explicit sheet modes, queue facets,
  header readiness, confirmed clinical actions, executable audit/commercial
  retention, sensitive-access/break-glass controls, and Tenant reporting are
  source-complete. The Neon development schema, empty-dataset Service Quote
  backfill, authenticated setup, staff-intake, and desktop/mobile sheet QA are
  complete. A disposable Neon integration fixture also proves web,
  staff-assisted, and WhatsApp safe-media origins through deterministic
  safety/OCR, professional review, observable projections, and paid pickup
  handoff with idempotent acceptance, callback, and handoff. Focused tests also
  prove independent pharmacy senders, central/branch routing, and
  same-customer Tenant/Store isolation plus deterministic storage, OCR, Meta,
  payment, notification, delivery, stale-action, and credential-revocation
  failure handling. Focused intake and safety tests additionally prove exact
  Store-role attribution, idempotent intake, inactive-Store rejection,
  callback replay, expiring re-upload, revision invalidation, and private-media
  page navigation/rotation are source-complete in the attendant workspace;
  short-lived viewer grants now expose reauthorization after expiry/embed
  failure and share the API media contract.
  The Neon matrix also proves concurrent identical pickup acceptance for all
  three origins after adding loser-transaction recovery to the idempotency seam.
  A focused Neon web-origin rerun proves row-locked concurrent pickup handoff;
  fixed/manual delivery-zone boundary rules and explicit Tenant scoping are
  source-tested. A second Neon matrix now completes fixed-zone delivery for all
  three origins through Quote revision, concurrent acceptance, exact payment,
  preparation, courier assignment, structured failure/recovery/reassignment,
  proof-backed duplicate-safe completion, privacy projections, reporting,
  usage, and terminal queue removal. Every origin rejects unpaid/unpacked
  operations and an actor without a Store role; a separate Neon route proves
  authorized manual-fee review through exact paid acceptance.
  The legacy Service Quote backfill regression proves complete mapped-graph
  preservation and rejects same-count corruption, while a profile-attested
  current Service Request-to-Commerce-Quote-to-Commercial-Order Neon lifecycle
  covers the post-migration runtime. A complete retired-runtime before/after
  behavioral regression, production reconciliation, and legacy contraction
  remain separately gated.
  Embedded Signup tamper/expiry/session scope and the dynamic connection
  readiness job now have focused fake-provider tests; live Meta and template
  canaries remain open.
  Remaining gates: production
  Service Quote backfill/reconciliation and legacy contraction, live private
  media/OCR providers, pharmacy-owned Meta WABA/number and template approvals,
  Paystack canary, legal/privacy/retention sign-off, delivery SOP approval,
  live courier/provider acceptance, load/concurrency/security testing,
  and one monitored test-pharmacy canary. No live provider or production schema
  change is claimed. Started Date: 2026-08-09.

- Complete the release migration artifact and separately authorized production
  rollout for Commercial Order delivery scheduling and reminders. The source
  implementation, focused tests, package/mobile typechecks, and current Neon
  development schema synchronization are complete. Local Docker/PostgreSQL is
  not a fallback. Started Date: 2026-07-25.

- Implement managed domain purchasing and storefront connection using GO54 for
  `.com.ng`, Openprovider for global domains, Paystack checkout, and Vercel
  hosting/attachment. The implementation follows
  `.brain/plans/2026-07-24-managed-domain-midday-migration-contract.md` across
  database, provider adapters, API/jobs, dashboard, mobile, verified
  bring-your-own-domain, signup cleanup, QA, and Brain documentation.
  Source implementation is complete across Prisma schema, provider package,
  API/jobs, dashboard, mobile and signup cleanup. Remaining blockers are
  shared-database deployment, authenticated dashboard/Android runtime QA,
  credentials, commercial/legal acceptance and two owner-approved live
  canaries. Checks
  completed: Prisma format/generate, generated/applied local migration
  `20260724174525_managed_domains`, local push/deploy verification; 41 focused
  domain/provider/query/job/API
  tests and 251 repository-wide passing tests (four unrelated existing Retail
  Ops fixture failures); DB/domains/jobs/API/dashboard/marketing/mobile
  TypeScript; targeted Biome; mobile domain,
  NativeWind and keyboard guards; desktop/mobile signup browser QA. Started
  Date: 2026-07-24.

- Complete the mobile Sentry production handoff. The React Native SDK, Expo
  config plugin, Metro source-map integration, DSN/environment configuration,
  privacy-safe defaults, and OTA-reload flushing are implemented. The public
  Sentry variables are configured in EAS. With explicit owner authorization,
  the private `SENTRY_AUTH_TOKEN` is configured as a project-scoped,
  Production-and-Preview EAS secret on the currently selected
  `@startups-2/ewatrade-2` project. The complete 16-value mobile production
  configuration is also project-scoped in both environments, with metadata
  verification passing on 2026-07-26. Preview build
  `246bf5c6-46f1-4fbd-b964-31461a0a4c44` reached and passed Metro on
  2026-07-26, then failed in the Sentry Gradle upload task because that secret
  was absent. Replacement build `0d20383d-ad6d-4425-888b-2d073718cf6c`
  completed successfully as Android versionCode 4 and uploaded the Sentry
  source-map artifact for release `com.ewatrade.app@1.0.0+4`. Remaining:
  Preview build `39b3766f-6dba-4ef3-8e0f-a46723b4894a` exposed that the
  production-file Sentry token lacks project permission (HTTP 403). The
  known-working local token was restored to Preview only, and replacement
  build `74b14a10-2097-40c6-9f98-2708c36b81c6` completed successfully as
  Android versionCode 7 with its Sentry artifact uploaded. Replace the
  Production EAS token with one authorized for the mobile Sentry project,
  install the Preview APK, and send one deliberate test exception to verify
  symbolicated JavaScript and native events in
  `cipron-concepts/ewatrade-mobile`. Checks Run: Sentry config guard, mobile
  TypeScript, Expo env attachment, app-launch config, Expo prebuild config
  resolution, Android Expo export, EAS upload inspection, successful native
  Preview build, and diff hygiene. Started Date: 2026-07-23.

- Reconcile the production Prisma migration baseline before releasing the
  current Catalog option-detail API. Production reports
  `20260711120000_retail_ops_stock_ledger_foundation` as an unfinished,
  zero-step row because its legacy `Product` relation is absent (`P3018`,
  PostgreSQL `42P01`). The authorized read-only 2026-08-11 preflight found only
  three finished migrations, 42 later unapplied artifacts and several missing
  `0001_init` prerequisite relations despite that ledger row being marked
  applied. It also found seven `CommercialOrder` rows, none with
  `status = COMPLETED`, and no legacy Service Quote graph, so the observed
  snapshot has no historical backfill candidate.
  A guarded drift-inventory command is source-verified offline for the next
  bounded observation. It requires a new inventory-specific authorization,
  approved target fingerprint and separately provisioned globally
  least-privilege production credential; it has not been run against
  production and cannot authorize a reconciliation write.
  Once reconciled through an owner-approved production migration operation,
  release the matching API and verify a phone-authenticated Product save with
  option description and opening stock. The production schema itself was
  synchronized successfully with guarded `db:push` on 2026-07-21. Started Date:
  2026-07-20.
# Cross-product QA email and cleanup

- Product implementation is integrated. Schema rollout, secure route
  propagation, canary delivery, and first operator-reviewed purge remain
  deployment work.
- Ticket 10 Pharmacy adaptation is source-complete. Shared Service Commerce
  source/action projection now consumes only a current, revision-matched
  pharmacist release fact and never clinical media/OCR/review content. Regulated
  setup is under `Settings > Compliance`; `/settings/prescriptions` redirects
  there, while generic Connections/link/QR configuration remains under
  `Settings > Channels`. Pharmacy readiness now derives fulfilment outcomes
  from the active scoped Service Commerce profile, retaining legacy fields only
  as an absent-profile fallback. Focused tests passed 34/71, the broader
  affected suites passed 116/252, the verified Neon compatibility matrix
  passed 9/248, DB/dashboard TypeScript and Biome passed, and
  authenticated desktop plus 390px browser acceptance passed without overflow
  or console errors. No schema/provider/production operation occurred. Ticket
  12 appointment proof is source-complete. Its channel-neutral verified-
  Neon appointment seam passed 1 test/56 assertions, the separate same-phone
  Appointment/Pharmacy isolation seam passed 1 test/10 assertions, and both
  run-owned fixture graphs were removed. Authenticated desktop and 390px QA
  passed native-modal focus, keyboard, scroll, responsive, explicit-slot and
  recovery checks without overflow or console errors. Ticket 13 is in progress.
  Shared Tenant/Store reporting, separated provider-cost usage/reconciliation,
  bounded redacted drill-down, typed report UI, bag-seller Neon lifecycle,
  generic-media matrix and cross-origin Quote-release matrix are implemented.
  Reporting focused tests pass 31/125; its verified-Neon seam passes 1/19,
  including four concurrent reads within the 15-second p95/30-second maximum
  development targets plus exactly one allowed read and one audited denial when
  two callers contend at 29 prior actor/Tenant reads; the
  bag-seller seam passes 2/16; generic-media tests pass 30/95. The additive
  migrations are applied on verified development Neon. Immutable allowed and
  denied report-read audit is now enforced before repository report queries.
  The final verified-Neon routing matrix passes 1/16, its focused
  routing/signature/rotation/provider-retry suite passes 48/108, the unchanged
  Pharmacy compatibility matrix passes 9/248, and the unchanged Generic Service
  matrix passes 3/75; every run-owned fixture was removed. Authenticated report
  acceptance passes at 1280x720 and 390x844 for loaded/empty data,
  known-zero/unknown costs, aggregate drill-down, report/detail error and
  recovered retry, safe role denial, typed URL Back/Forward, keyboard access,
  clean healthy-state consoles and responsive containment; its exact run-owned
  Tenant, Store, users, sessions, audits and usage rows were removed and
  verified at zero. The development performance targets are measured and the
  rate boundary is enforced; remaining
  gates are production threshold ratification, live providers, production
  migration-drift reconciliation, and owner-authorized switch/contraction. A
  read-only development census and the authorized read-only production census
  found no completed Order or legacy sale row to backfill; the production
  census made no writes. The source-only release
  preflight now routes API migrations through the interactive production
  fingerprint guard, validates the seven reporting migrations offline and
  emits only redacted live-canary readiness with
  `executionAuthorized: false`; it contacts no database/provider and closes no
  live or production gate. The compatibility inventory now distinguishes
  canonical, legacy-history and deliberate dual-owned boundaries and records
  missing runtime rollback controls instead of treating deployment rollback as
  an in-app switch. The bounded production drift-inventory command is also
  source-verified offline and remains unexecuted pending a new authorization
  plus a separately provisioned least-privilege credential. Started Date:
  2026-08-11.
