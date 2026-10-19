# G03 generic Service / Inquiry pickup and delivery — implementation proposal

Date: 15 October 2026. Status: **PROPOSED; schema-dependent; not implemented or accepted**.

This packet records a read-only source audit and a concrete dependency plan. It
does not approve a schema application, database command, provider operation,
activation, GENERAL action, rollout, runtime restart, connected QA or device
acceptance. G03 still requires the complete assistant and native workflow after
the canonical dependency is implemented. Existing G01, Paystack, D04, E05, G04,
S05 and C04 boundaries are unchanged.

## 1. Current implementation and the actual missing dependency

1. `packages/service-commerce/src/schemas/fulfillment.ts` already defines exact
   Tenant/Store/Order/source context, three pickup operations, three delivery
   operation families, state vocabularies and a safe operational projection.
   `packages/service-commerce/src/fulfillment.ts` owns the transition graph,
   payment/eligibility/preparation gates and delivery-zone matching. These are
   reusable contracts and pure rules, not generic persisted fulfillment.
2. `packages/db/src/queries/service-commerce-fulfillment.ts` resolves an accepted
   Commerce Quote Order for `service`, `commerce_inquiry` or `prescription` and
   compares its source to the requested source. Its operational state is read
   exclusively from `PrescriptionPickupFulfillment`,
   `PrescriptionDeliveryAddress` and `PrescriptionDeliveryAssignment`.
   The accepted-version lookup currently does not select the full Quote
   Tenant/Store, acceptedOrderId, selected-option or currency identity required
   for a new generic writer. It is not sufficient authority on its own.
3. Both `pickupFulfillment` and `deliveryFulfillment` in
   `apps/api/src/trpc/routers/service-commerce/fulfillment.ts` unconditionally
   call `createPrescriptionServiceCommerceFulfillmentAdapter`. The adapter
   refuses every non-prescription source and retains the prescription launch
   gate. Service/Inquiry mutation support is therefore genuinely missing.
4. The prescription adapter calls functions that open their own transactions,
   followed by a separate detail transaction. It cannot be used inside a
   caller-owned GENERAL confirmation transaction to atomically persist a
   business event and proposal receipt. Its clinical roles, policy, encrypted
   pickup codes, prescription usage and communication intents remain clinical
   compatibility behavior.
5. `service-commerce-access.ts` deliberately marks enabled pickup and delivery
   as `setup_required`. `service-commerce-sources.ts` upgrades that readiness
   only for a live prescription extension. Generic readiness must be implemented
   from actual generic setup; removing the blocker alone would fabricate it.
6. Existing customer `pick_up` / `delivery` actions are version-bound Quote
   fulfillment choices. They are not collector verification, preparation,
   courier dispatch, physical delivery proof or Order completion.

ADR-0029 requires the second vertical to work without importing prescription
concepts, with expand-contract compatibility. ADR-0032 makes Store attendant
assignments additive; a generic Tenant role cannot silently create one, and
commercial Quote approval cannot satisfy professional or clinical release.

## 2. Storage decision: additive generic models are required

Existing tables do not provide a suitable durable generic logistics aggregate:

- `CommercialOrderFulfillmentCommand` is a product-line batch receipt with a
  fulfilled-line count and Order result status; it has no logistics revision,
  address eligibility, collector capability, courier state or proof identity.
- `CommercialServiceFulfillment` proves charge-only Service performance.
  `ServiceWorkEvent` requires a Job and proves work. Neither exists for every
  accepted Inquiry or Product Order.
- `ServiceDeliveryAttempt` is notification-provider transport, not physical
  delivery. `CommercialOrderActivity` is a note/attachment stream, not an
  alternative state/event store.
- Prescription delivery assignments require a prescription address, and their
  events/statuses and security helpers are prescription-owned. Reusing them
  would violate the intended second-vertical boundary.

The proposed additive schema lives in a new
`packages/db/prisma/models/service-commerce-fulfillment.prisma`, with inverse
relations in the existing Tenant, Store, CommercialOrder and CommerceQuoteVersion
model files. No existing prescription model is renamed, repurposed or removed.
These are proposed model names and fields, not claims about generated clients:

| Proposed model | Durable facts and exact identity |
| --- | --- |
| `ServiceCommercePickupFulfillment` | `id`, `tenantId`, `storeId`, unique `orderId`, immutable accepted `quoteVersionId`, source kind/id, pickup status, nonnegative Int revision, versioned preparation-attestation facts and packed actor/time, capability digest/ciphertext/expiry, attempt/lock facts if a short code is used, private collector facts, handed-off actor/time, structured exception code/reason, created/updated timestamps. |
| `ServiceCommercePickupEvent` | `id`, exact aggregate and command FKs, event type, from/to status, actor, resulting revision, effective/created time, safe reason code and private-detail reference. Unique command FK and unique aggregate/resulting-revision. No raw capability or private address/contact body in event JSON. |
| `ServiceCommerceDeliveryZone` | Tenant/Store, name, active status, locality/postal-prefix rule and priority, fixed/manual fee policy, fee/currency, promise, revision and audit attribution. Reuse the pure matcher; do not import prescription zones. Management is separately authorized Owner/Admin configuration. |
| `ServiceCommerceDeliveryAddress` | Tenant/Store, immutable exact Quote Version, nullable unique accepted Order link, zone/rule revision or explicit manual decision, encrypted address payload, scoped locality fingerprint, eligibility decision/reason/actor/time, fee/currency/promise snapshot, data key/policy version and retention metadata. A revised Quote has a new address/eligibility snapshot, not an in-place rewrite of an accepted bargain. |
| `ServiceCommerceDeliveryAssignment` | Tenant/Store, unique exact Order and address FKs, immutable accepted Quote/source identity, typed delivery status, Int revision, packed/checklist actor/time, manual courier identity/reference and masked phone, assignment/collection/delivery times, protected proof reference and proof provenance, structured failure reason, created/updated timestamps. No live carrier integration is implied. |
| `ServiceCommerceDeliveryEvent` | Same scoped event/command/revision invariants as pickup, with delivery transition/assignment event types and private proof-detail reference. |
| `ServiceCommerceFulfillmentProof` | Exact Tenant/Store/Order/accepted-Version evidence identity, creator/time/provenance and encrypted proof detail with key/retention metadata. A bare URL or an unrelated Job evidence ID is not this proof. |
| `ServiceCommerceFulfillmentCommand` | Unique `(tenantId, clientOperationId)` across BOTH modes and every operation, actor/Tenant/Store/Order/source/accepted-Version binding, schema version, normalized payload hash, mode/operation, exact resulting aggregate/revision/event identity and strictly validated safe historical receipt. No bearer secret, raw proof/address or provider response in the receipt. |

Separate pickup and delivery event relations avoid a nullable polymorphic event
row that could belong to both or neither aggregate. Canonical code verifies the
command/event/aggregate tuple in either branch; database uniqueness protects
competing creation and revision. Cross-Tenant/Store coherence must be expressed
with composite relations where the existing model keys permit it and rechecked
after locking in every command. Generated migration review must verify the
actual constraints; this document does not claim a database invariant exists.

The schema gate is material. Root defines both `db:migrate` and `db:push`, and
repository instructions require both after a Prisma update, using generated
migrations rather than hand-written migration files. **No Prisma source is
changed and neither command is run in this task.** The next implementation
boundary must explicitly resolve how schema work and those database commands
will be authorized; a stand-in adapter over nonexistent tables is not completion.

## 3. Exact authority and source / Quote / Order proof

The proposed canonical module is a new
`packages/db/src/queries/service-commerce-generic-fulfillment.ts`. Its private
authority reader must recheck persisted facts inside the owning transaction:

1. Active Tenant, exact active Store in that Tenant, active accepted actor
   membership, supported current native Service operator role and current
   staff Store access/revision. Preserve the existing native fulfillment
   operator ceiling (`OWNER`, `ADMIN`, `MANAGER`, `CASHIER`, `OPERATOR`) plus
   explicit active Store `ATTENDANT` assignment; do not transplant the narrower
   Quote-preparation Manager ceiling into fulfillment or broaden scoped grants.
   `serviceCommerce.*Fulfillment` is not currently admitted by
   `apps/api/src/utils/staff-procedure-policy.ts`; unsupported SCOPED non-owner
   callers remain denied until a separately reviewed explicit grant exists.
   Owner/Admin still require the actual attendant assignment for these shared
   fulfillment commands. A client role, Store origin or navigation target is
   never authority.
2. `service` must load the exact ServiceRequest in the same Tenant/Store;
   `commerce_inquiry` must load the exact Inquiry with `vertical === SERVICE`.
   Never infer SERVICE from an unknown vertical. New writes require a supported
   post-conversion source state. Historical receipt recovery must not pretend
   that a new action is permitted merely because a prior event exists.
3. Load the exact Order and accepted Commerce Quote Version, then validate
   `acceptedOrderId`, Quote id/Tenant/Store/source kind/id, accepted status,
   currency and selected payable Option/immutable Order linkage. Use the
   accepted version, not a newly current Quote head. Validate immutable sold
   totals against the original conversion facts; later credits or Order
   amendments must be interpreted through their canonical lineage and must
   never be misread as a matching original total or a free delivery repricing.
   If that lineage cannot be proven, new logistics writes fail closed.
4. Refuse prescription source kinds, PHARMACY Inquiry verticals, clinical
   accepted Quote links and any unexpected prescription fulfillment relation.
   The generic adapter never calls a clinical command with a missing source
   or uses a generic flag to skip pharmacist release. Existing clinical
   authority, launch and policy gates stay in the prescription adapter.
5. Read actual active shared profile, named capability, Store/source-specific
   `SERVICE` policy and current staff channel readiness. Derive paid,
   eligible, packed and ready from canonical saved facts; do not expose
   `eligible`, `verticalReleaseReady`, `authorize` or similar client booleans.
   `getServiceCommerceWorkspaceAccessReadOnly` and the pure policy reader can
   supply review facts without writes; execution uses canonical policy audit
   behavior in the same transaction.

New write admission and historical recovery need separate checks. A current
authenticated actor must still have exact source/Store read/action authority to
recover a receipt; a later disabled logistics capability, changed fee rule or
expired pickup code must not cause a second execution or destroy the historical
receipt. Neither recovery nor a receipt grants a new action. Shared GENERAL
Session/account/privacy/legal/client/capability/rollout guards remain caller-owned.

## 4. Canonical command and replay protocol

Expose explicit transaction-owned pickup/delivery commands and a read-only
review/detail, with a root-client native adapter wrapping them in the existing
bounded Serializable transaction helper. The `…InTransaction` forms must never
open a transaction, call a provider, enqueue a job or retain the transaction in
an opaque process-local object.

1. Strictly parse a bounded exact intent. Retain the shared six operation
   families and current field bounds; add an explicit schema version and an
   exact reviewed aggregate revision / initial-absence marker for the generic
   branch. Preserve the clinical compatibility schema. No client may choose
   the actor, Tenant, paid state, source eligibility or server revision. Do
   not silently replace a stale revision with the latest one.
2. Establish the immutable intent identity once before any retry: caller-supplied
   stable `clientOperationId`, exact operation/scope/source/accepted-Version,
   normalized editable fields and expected aggregate identity/revision. Hash
   canonical normalized data. For sensitive low-entropy pickup codes, use a
   keyed, domain-separated verifier rather than a publicly guessable bare hash.
   Secret generation, and any configured async screening, happens outside the
   transaction; a retry reuses the same prepared intent and capability.
3. Acquire `lockCommerceFinancialOrder` first: Book, customer account, then
   Order. Recheck currency/customer/Store ownership, then lock exact logistics
   state and any source/Job/Line rows in a documented deterministic order.
   Reuse held-lock proof only in the same transaction; never reacquire another
   financial context after a source lock or accept a caller-created lock flag.
4. Recheck current authority and immutable source/accepted-Order linkage, then
   look up the tenant-wide command key. If present, require the same actor,
   full intent hash, mode, scope, aggregate and actual saved event/receipt.
   Return that exact historical receipt even if the aggregate has subsequently
   advanced; do not construct a replay receipt from today's status. A
   different Order, mode, source or payload under the same key conflicts.
5. Only a new command runs current readiness, paid/eligibility/work gates,
   reviewed revision and transition checks. Write aggregate CAS/increment,
   one typed event, safe receipt and any explicitly composed Order/work
   changes in the SAME owning transaction. Int revisions must refuse overflow.
   Event/command effective times and original completion dates are stable on
   replay. Unique-key races recover only after the failed transaction has
   rolled back, then apply current receipt-read authority and exact tuple checks.
6. GENERAL stages a signed pending proposal from the read-only canonical review;
   outside-TX preparation never changes business truth. Final confirmation
   rechecks every saved binding and fresh review digest before its proposal
   CAS, then calls the transaction-owned native command and stores the safe
   result atomically. Completed/cancelled proposal recovery precedes new write
   readiness and never sends, charges, reissues capabilities or chooses a new
   command identity. Actual SQL rollback/concurrency needs connected evidence;
   an in-memory stand-in cannot certify it.

The receipt should contain only schema version, command/event/aggregate IDs,
operation/mode, exact source/accepted-Version/Order origin, original from/to
status and resulting revision, safe reason code, original UTC ISO effective
time and explicit reported outcome. `handed_off` or `delivered` records staff
operational evidence; it does not prove a provider sent a notification, customer
consent, payment collection, stock restoration or financial journal posting.

## 5. State, payment, preparation, proof, return and completion rules

Reuse the actual shared transition graph without new hidden transition paths:

| Pickup state | Allowed next states |
| --- | --- |
| preparing | cancelled, exception, ready |
| ready | abandoned, cancelled, exception, handed_off |
| exception | cancelled, preparing, ready |
| abandoned / cancelled / handed_off | none |

| Delivery state | Allowed next states |
| --- | --- |
| ready_for_assignment | assigned, cancelled |
| assigned | cancelled, collected, failed, rescheduled |
| collected | failed, in_transit, returned_to_store |
| in_transit | delivered, failed, returned_to_store |
| failed | cancelled, rescheduled, returned_to_store |
| rescheduled | assigned, cancelled |
| returned_to_store | cancelled, rescheduled |
| delivered / cancelled | none |

Delivery preparation creates the initial `ready_for_assignment` state; assignment
also permits exact reassignment while `assigned` without inventing collection.
An absent pickup is initialized only under the exact accepted Order lock with
unique Order ownership; the initial prepare command records the resulting ready
state and both initialization/preparation provenance. There is no client-created
aggregate or automatic recreation after a terminal cancellation.

- New prepare/assignment/handoff/transition commands retain the existing paid
  gate. Read payment evidence under the financial lock and reconcile effective
  recorded amount with the current payable Order and canonical payment rules;
  a client boolean, navigation to checkout or provider intent is not payment.
  Keep payment collection, refunds and finance activation separate.
- Delivery requires an exact encrypted address and server-owned eligibility
  decision from a configured zone or explicit authorized manual decision. A
  manual-fee review is not an eligibility approval, and a client-provided fee
  is not a saved decision. Selected Quote fee/currency/promise/address snapshot
  must agree before acceptance/preparation. Changed fee or mode requires an
  explicit canonical Quote revision/reapproval and customer acceptance before
  an Order exists; a paid accepted Order must not be silently repriced.
- Existing `checks` accepts any nonempty all-true map. That is staff attestation,
  not evidence that an arbitrary business checklist was satisfied. The generic
  implementation must either name and preserve that limited meaning or add a
  versioned server-owned required checklist definition and compare the exact
  required keys. It must never let `{ok:true}` satisfy undisclosed requirements.
- Preparation needs actual full original Product/Service obligations ready.
  Product quantities, tracked Job allocations, charge-only performance and
  management authorization stay with their existing canonical writers. Pickup
  handoff may compose the existing exact Job handoff only where that native
  action is expressly part of the reviewed intent; it cannot mark all work
  performed by setting Order status. Split Jobs, mixed lines, rework and
  cancelled allocations retain the whole-Order rules in
  `commercial-order-completion.ts`.
- Pickup handoff requires the exact unexpired capability, current ready state,
  collector facts and server-verified preparation. The capability is bound to
  one aggregate/Order/version and cannot be reused as a customer Quote or
  payment capability. Raw code distribution must use an existing authorized
  protected/customer channel; the safe adapter/detail/model output cannot
  contain it. If a short-code attempt limiter is used, its failed-attempt
  transaction must actually commit independently of the refused success path;
  copying an increment followed by a thrown transaction is not sufficient.
- Delivered requires a nonempty protected proof reference with exact proof
  ownership/provenance; a random URL or arbitrary foreign object ID must not
  count. Failed, rescheduled and returned-to-Store require a structured reason.
  Couriers are manual metadata until a separate carrier adapter is authorized.
- A logistical cancellation does not cancel/refund the Commercial Order.
  Returned-to-Store means a pre-delivery operational outcome, not Product
  return, restock, refund, work reversal or a new financial posting. The current
  graph has no delivered-to-returned transition; a delivered Product return
  uses existing explicit commercial return/correction commands. Terminal
  logistics remain historical until an explicit separately designed amendment.
- A generic delivered/handoff event is never sufficient to fake original line
  performance. Completion and earning must combine exact dated obligations
  with the required generic logistics evidence where the accepted mode requires
  it. Review every existing completion writer so product/work completion cannot
  finalize a logistics-bound Order before its delivery/handoff. Preserve legacy
  non-logistics Orders and the prescription proof branch. Automatic journals
  stay inactive; this work cannot activate them.

Two related legacy seams must not be copied blindly: prescription transitions
set Order completed/cancelled from clinical logistics directly, and
`reviseServiceCommerceQuoteForFulfillmentInTransaction` creates `current.version+1`
with its own older fee validation. Generic mode/fee revision should compose the
current canonical Quote issue/revise/release machinery, including exact maximum
version numbering, Int32 money, selected options, moderation and release approval.

## 6. Privacy and retention impact

Addresses, collector identity, courier contacts and delivery proof are new
personal-data families. Proposed protection is application encryption through a
generic server-only data-key envelope, with exact Tenant/Store/Order purpose/AAD
binding and key version. There is no justification to reuse prescription
encryption/retention or clinical access merely because its helper exists.
Capability secrets use separate purpose/key material. New crypto design and key
operations need their own reviewed source/configuration boundary.

Safe detail/model/history projections expose state, original timestamps,
structured reason code, revision and `proofPresent`; full address, collector
contact, ciphertext, capability, proof object key/URL and unrestricted exception
reason remain protected exact-original fields, subject to current read authority.
Do not copy those fields into analytics, audit bodies, GENERAL model output,
error messages, command receipts or provider-neutral identifiers-only jobs.

Add these families to the existing account/privacy inventory and controller
retention assessment before enabling persistence. Keep operational/financial
evidence separate from erasable contact/proof detail; retain nonidentifying
command integrity needed for replay. Retention class, policy/version, due date,
legal-hold metadata and bounded purge/audit behavior need explicit reviewed
policy. This proposal chooses no arbitrary retention period, does not claim
erasure coverage and does not launch a cleanup worker. Historical redaction
must preserve source/event identity without turning an erased proof into a
fresh reusable completion capability.

## 7. File-level implementation sequence and ownership candidates

1. **Schema and contract review boundary:** new generic Prisma model file plus
   inverse relations; shared additive generic context/review/receipt schemas in
   `packages/service-commerce/src/schemas/fulfillment.ts`; tests in the existing
   package. Preserve all prescription schemas/field bounds. Resolve data-key,
   retention, checklist and accepted-Order amendment decisions before writes.
   Generated client/schema application remains separately gated.
2. **Canonical authority/review/commands:** new
   `packages/db/src/queries/service-commerce-generic-fulfillment.ts` and focused
   tests, optionally separated into read/command modules if the boundary grows.
   Add read-only exact review and `…InTransaction` pickup/delivery operations;
   native root-client adapter wraps those functions without a second detail
   transaction. Extend `service-commerce-fulfillment.ts` to project the exact
   source's generic state or clinical compatibility state, rejecting mixed rows.
3. **Canonical address/setup:** new scoped zone/eligibility/address module and
   schemas/Owner/Admin routes, using actual matcher and exact immutable Quote
   snapshot. Update `service-commerce-access.ts` / `service-commerce-sources.ts`
   readiness only when real generic setup is complete. Keep missing setup
   unavailable and preserve the pharmacy-only readiness upgrade.
4. **Completion integration:** additive generic proof branch in
   `commercial-order-completion.ts`, plus narrowly reviewed changes to actual
   product, charge-only, Job handoff and booking completion writers to preserve
   the additional logistics obligation. Keep Book/account/Order lock ordering,
   original-quantity arithmetic and dated earning evidence. No finance activation.
5. **Protected native API integration:** source-discriminated dispatch in
   `apps/api/src/trpc/routers/service-commerce/fulfillment.ts`: prescription
   goes to its unchanged adapter, Service and SERVICE Inquiry go to the new
   canonical adapter. Actor/Tenant come solely from fresh protected context;
   exact selected Store access remains checked. Extend bounded detail/review
   schemas and error mapping without leaking private failure facts. No generic
   permission/SCOPED allowlist expansion as incidental implementation.
6. **Assistant and every client:** root-owned GENERAL action/review/receipt,
   signed durable proposal and caller-owned confirmation, capability inventory,
   model-safe tools, saved-history projection, exact originals and complete
   native/dashboard editors; exact freshness/actor/Store/source/revision and
   blur/unmount fences, original back stack, full editable supported fields,
   refreshed impact and explicit confirmation. WhatsApp must reuse current
   authorized identity and durable same-command inspection; no provider send
   or clinical grant is implied. Form-only/planned entries earn no acceptance.
7. **Acceptance and documentation:** root-owned Brain/API/schema/relationships/
   migration/privacy/retention/ADR impact; source-only regressions first, then
   separately authorized schema and bounded connected concurrency/rollback,
   then actual protected public/native/dashboard/device flows. Record exact
   source freeze and no missing rows/pages/proof at each acceptance boundary.

## 8. Inert fixtures and required acceptance evidence

Existing source fixtures to preserve and extend:

- `packages/service-commerce/src/fulfillment.test.ts` — exact transition, gate
  and zone semantics; no database evidence.
- `packages/db/src/queries/service-commerce-fulfillment.test.ts` — exact detail,
  attendant/source predicates and paid gates; add complete accepted-Version
  and generic-vs-clinical projection checks.
- `packages/db/src/queries/service-commerce-prescription-fulfillment-adapter.test.ts`
  and `prescription-fulfillment-commerce-locks.test.ts` — prescription behavior,
  launch/role/policy boundaries and existing Order-before-source lock order.
- `packages/db/src/queries/commercial-order-completion.test.ts`,
  `commercial-order-fulfillment.test.ts`, `commercial-service-fulfillment.test.ts`
  and existing Service work/booking tests — mixed/split quantities, chronology,
  nonclinical-vs-clinical evidence and no new posting activation.
- `apps/api/src/schemas/service-commerce-fulfillment.test.ts` and
  `apps/api/src/trpc/routers/service-commerce/fulfillment.test.ts` — strict
  schemas and actual protected route dispatch, derived actor/Tenant/Store and
  denied source partitions. Existing route module mocks prove only that boundary.

New actual-canonical, predicate-aware in-memory delegates should cover every
pickup and delivery operation and the following before connected QA:

1. Exact actor/Tenant/Store/source/accepted-Version/selected-option/Order tuple;
   PHARMACY Inquiry, prescription, foreign relation, unknown source state,
   inactive/revoked membership/Store/assignment/profile/policy and unsupported
   SCOPED grant refuse before any business write.
2. Stable same-key receipt after lost response and after later state advance;
   different payload/mode/Order/source/actor key collisions refuse. Opaque or
   signed GENERAL proof forgery/JSON clones refuse before command execution.
3. New-command revision CAS, absence creation race and revision overflow;
   real financial lock sequence followed by exact reread; simulated predicate
   failures cannot silently skip reads. No nested transaction or provider call.
4. Actual allowed/disallowed graph edges, reassignment/reschedule, complete
   preparation facts, paid/partial/refunded and unpaid distinctions, eligibility
   and accepted fee/currency/address drift, missing/foreign proof, code expiry,
   retry lock and collector mismatch. Failed-attempt persistence must be tested
   as a committed refusal path, not merely a recorded fake write.
5. Split/mixed original quantities, rework and cancelled allocations cannot
   complete an Order; handoff/delivery/return cannot manufacture performance,
   payment, stock restoration or journal evidence. Exact completion dates and
   original receipts survive retries and later lifecycle changes.
6. Protected-original private facts never enter model/history/list/receipt;
   scope/freshness changes retire old UI callbacks, and retention/redaction
   does not break exact replay identity or expose an erased capability.

Meaningful fixture failures may show the intended source predicates and local
write sequence; they do not establish PostgreSQL row locks, Serializable retries,
rollback, uniqueness, real encryption key custody, hosted policy, carrier proof,
public wrapper, notification provider, concurrency or device acceptance. No such
runner is scheduled or executed by this packet.

## 9. Audit provenance and verification

No tests, compiler, connected runner, database query or product source mutation
were performed for this audit. Source was inspected locally and the proposal's
existing reference paths were checked. New proposed paths are explicitly marked
as new above and are not implementation artifacts.

Principal inspected SHA-256 values at audit time:

| Source | SHA-256 |
| --- | --- |
| `packages/db/src/queries/service-commerce-fulfillment.ts` | `9f1e21fb36cc7bef5493e71605109b4eb98c120de18ae9ada83407955b17936b` |
| `packages/db/src/queries/service-commerce-prescription-fulfillment-adapter.ts` | `d086011ea4866582484763e47230dba29f2641d1e695cf3cab197f01cddc537a` |
| `packages/db/src/queries/prescription-fulfillment.ts` | `1cf2ce8dd0d3dced44e5b56a970012d38c3abe6a8170590bef0040ebe98f055b` |
| `apps/api/src/trpc/routers/service-commerce/fulfillment.ts` | `cb696b1b9d4aad6c039057610b50e894abbb005a51ff29b916266e7dc228ac7b` |
| `packages/service-commerce/src/schemas/fulfillment.ts` | `4d8c65709ede08a80d15501539599535dabe0e545c7c3a0f5294507058cd8ddc` |
| `packages/db/prisma/models/commercial-orders.prisma` | `f91ae4ba30e1a9a263bf506aea090bc0b84adf69ca26119c92424371607cf3aa` |
| `packages/db/prisma/models/prescription-operations.prisma` | `ea7d491a1c0bafda5c874b9ec23428da7c9b566b386444b8294b663fd0ee3113` |
| `packages/db/src/queries/service-commerce-access.ts` | `0f3a74d951397112379bb7c6f5066969e91071210db3e84316f46950f85e95ed` |
| `packages/db/src/queries/service-commerce-sources.ts` | `b8d78511f7c074febdb9de7f25ead7158ede9d61684ecbbbd82cc0584151e82f` |
| `packages/db/src/queries/commercial-order-completion.ts` | `1d9ea035d4cc04f5b2f8a66966d9803e1447b7fc1db8426645db1ec2487e4912` |

Brain impact belongs to the parent coordinator. No Brain documentation updates
are made by this bounded proposal: it records intended work and dependencies,
without changing product behavior or claiming implementation/acceptance status.

## 10. Field-level schema and command review packet — 15 October 2026

These candidate Prisma fragments are **Markdown only**, not generated, validated
or applied Prisma. They use the existing `CommerceQuoteSourceType`,
`MembershipRole`, `StaffAccessMode`, Tenant, Store, CommercialOrder and
CommerceQuoteVersion types. Generic commands permit SERVICE_REQUEST or
SERVICE-vertical COMMERCE_INQUIRY only; an enum containing PRESCRIPTION_REQUEST
does not authorize that source. Do not copy prescription status/encryption types.

### Proposed enums and durable command journal

```prisma
enum ServiceCommerceFulfillmentMode {
  PICKUP
  DELIVERY
}

enum ServiceCommercePickupState {
  PREPARING
  READY
  EXCEPTION
  HANDED_OFF
  ABANDONED
  CANCELLED
}

enum ServiceCommerceDeliveryState {
  READY_FOR_ASSIGNMENT
  ASSIGNED
  COLLECTED
  IN_TRANSIT
  FAILED
  RESCHEDULED
  RETURNED_TO_STORE
  DELIVERED
  CANCELLED
}

enum ServiceCommerceLogisticsOperation {
  PREPARE
  HANDOFF
  RECORD_EXCEPTION
  ASSIGN
  TRANSITION
}

enum ServiceCommerceDeliveryMatchType {
  LOCALITY
  POSTAL_PREFIX
}

enum ServiceCommerceDeliveryFeePolicy {
  FIXED
  MANUAL
}

enum ServiceCommerceAddressEligibility {
  ELIGIBLE_ZONE
  ELIGIBLE_MANUAL
  INELIGIBLE
}

model ServiceCommerceFulfillmentCommand {
  id                    String                         @id @default(cuid())
  tenantId              String
  storeId               String
  orderId               String
  quoteVersionId        String
  sourceType            CommerceQuoteSourceType
  sourceId              String
  mode                  ServiceCommerceFulfillmentMode
  operation             ServiceCommerceLogisticsOperation
  schemaVersion         Int                            @default(1)
  clientOperationId     String                         @db.VarChar(191)
  payloadHash           String                         @db.Char(64)
  reviewDigest          String                         @db.Char(64)
  actorUserId           String
  actorMembershipId     String
  actorRoleSnapshot     MembershipRole
  accessModeSnapshot    StaffAccessMode
  accessRevision        Int
  resultRevision        Int
  safeReceipt           Json
  effectiveAt           DateTime
  createdAt             DateTime                       @default(now())
  tenant                Tenant                         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  store                 Store                          @relation(fields: [storeId], references: [id], onDelete: Restrict)
  order                 CommercialOrder                @relation(fields: [orderId], references: [id], onDelete: Cascade)
  quoteVersion          CommerceQuoteVersion           @relation(fields: [quoteVersionId], references: [id], onDelete: Restrict)
  pickupEvent           ServiceCommercePickupEvent?
  deliveryEvent         ServiceCommerceDeliveryEvent?

  @@unique([tenantId, clientOperationId])
  @@index([tenantId, storeId, orderId, effectiveAt, id])
  @@index([actorUserId, createdAt])
}
```

There is **one** command table and tenant-wide key across pickup AND delivery,
including every operation. A retry cannot obtain another mode's independent
receipt namespace. The canonical payload binds mode/operation/source/accepted
Version/Order, expected aggregate ID/revision or initial-absence marker and
normalized editable data. A keyed verifier binds a low-entropy pickup secret;
never persist the secret or a cheaply guessable bare-secret hash in safeReceipt.
The receipt has a strict versioned allowlist of original command/event/aggregate
identity, mode/operation, state pair, revision, outcome and UTC time, with no
contact, freeform proof, ciphertext, token or model-authored authorization fields.

Exactly one of `pickupEvent`/`deliveryEvent` must exist for a successful command,
and its kind must agree with command mode/operation and the actual aggregate.
Prisma optional relations do **not** enforce that cross-table XOR. Canonical code
must check it on commit and replay; generated migration review must not claim a
cross-table constraint from this fragment. Never recover success from a command
with zero events, two events, foreign scope or a mismatching saved receipt.

### Proposed pickup aggregate and immutable events

```prisma
model ServiceCommercePickupFulfillment {
  id                         String                     @id @default(cuid())
  tenantId                   String
  storeId                    String
  orderId                    String                     @unique
  quoteVersionId             String
  sourceType                 CommerceQuoteSourceType
  sourceId                   String
  status                     ServiceCommercePickupState @default(PREPARING)
  revision                   Int                        @default(0)
  packedAt                   DateTime?
  packedByUserId             String?
  checklistVersion           String?
  preparationDigest          String?                    @db.Char(64)
  handoffCapabilityDigest    String?                    @unique
  handoffCapabilityCiphertext Bytes?
  handoffCapabilityExpiresAt DateTime?
  failedHandoffAttempts      Int                        @default(0)
  handoffLockedUntil         DateTime?
  handedOffAt                DateTime?
  handedOffByUserId          String?
  collectorCiphertext        Bytes?
  exceptionCode              String?                    @db.VarChar(80)
  exceptionDetailCiphertext  Bytes?
  dataKeyVersion             String                     @db.VarChar(80)
  aadVersion                 Int                        @default(1)
  retentionPolicyVersion     String?
  privateDetailsDueAt        DateTime?
  privateDetailsRedactedAt   DateTime?
  createdAt                  DateTime                   @default(now())
  updatedAt                  DateTime                   @updatedAt
  tenant                     Tenant                     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  store                      Store                      @relation(fields: [storeId], references: [id], onDelete: Restrict)
  order                      CommercialOrder            @relation(fields: [orderId], references: [id], onDelete: Cascade)
  quoteVersion               CommerceQuoteVersion       @relation(fields: [quoteVersionId], references: [id], onDelete: Restrict)
  events                     ServiceCommercePickupEvent[]

  @@index([tenantId, storeId, status, createdAt])
}

model ServiceCommercePickupEvent {
  id                        String                     @id @default(cuid())
  tenantId                  String
  storeId                   String
  pickupId                  String
  commandId                 String                     @unique
  actorUserId               String
  fromStatus                ServiceCommercePickupState?
  toStatus                  ServiceCommercePickupState
  fromRevision              Int?
  toRevision                Int
  reasonCode                String?                    @db.VarChar(80)
  checklistVersion          String?
  preparationChecksDigest   String?                    @db.Char(64)
  privateDetailCiphertext   Bytes?
  dataKeyVersion            String?
  aadVersion                Int                        @default(1)
  retentionPolicyVersion    String?
  privateDetailsDueAt       DateTime?
  privateDetailsRedactedAt   DateTime?
  effectiveAt               DateTime
  createdAt                 DateTime                   @default(now())
  tenant                    Tenant                     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  store                     Store                      @relation(fields: [storeId], references: [id], onDelete: Restrict)
  pickup                    ServiceCommercePickupFulfillment @relation(fields: [pickupId], references: [id], onDelete: Cascade)
  command                   ServiceCommerceFulfillmentCommand @relation(fields: [commandId], references: [id], onDelete: Restrict)

  @@unique([pickupId, toRevision])
  @@index([tenantId, storeId, pickupId, effectiveAt, id])
  @@index([actorUserId, createdAt])
}
```

The handoff capability is purpose-, aggregate-, Order- and accepted-Version-bound;
its encrypted distribution is a separate explicitly authorized protected channel,
not part of the safe command receipt. Ciphertext columns are nullable so an
approved processor can erase private material without manufacturing an empty
collector/proof or deleting successful command identity. Failed attempts require
the explicit commit-on-refusal protocol described in section 5; no increment
inside a transaction that is then thrown away is presented as rate limiting.
There is no terminal-to-initial transition or automatic capability reissue.

### Proposed address/setup and delivery aggregate/events

```prisma
model ServiceCommerceDeliveryZone {
  id               String                         @id @default(cuid())
  tenantId         String
  storeId          String
  name             String                         @db.VarChar(191)
  active           Boolean                        @default(true)
  matchType        ServiceCommerceDeliveryMatchType
  matchValues      String[]
  priority         Int
  feePolicy        ServiceCommerceDeliveryFeePolicy
  fixedFeeMinor    Int?
  currencyCode     String
  promise          String                         @db.VarChar(500)
  revision         Int                            @default(0)
  updatedByUserId  String
  createdAt        DateTime                       @default(now())
  updatedAt        DateTime                       @updatedAt
  tenant           Tenant                         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  store            Store                          @relation(fields: [storeId], references: [id], onDelete: Restrict)
  addresses        ServiceCommerceDeliveryAddress[]

  @@index([tenantId, storeId, active, priority])
}

model ServiceCommerceDeliveryAddress {
  id                       String                         @id @default(cuid())
  tenantId                 String
  storeId                  String
  quoteVersionId           String                         @unique
  orderId                  String?                        @unique
  zoneId                   String?
  zoneRevision             Int?
  // Strict immutable business rule snapshot, no contact/address body:
  zoneRuleSnapshot         Json?
  eligibility              ServiceCommerceAddressEligibility
  decisionReasonCode       String                         @db.VarChar(80)
  decidedByUserId          String
  decidedAt                DateTime
  feeMinor                 Int
  currencyCode             String
  promise                  String                         @db.VarChar(500)
  addressCiphertext        Bytes?
  localityFingerprint      String                         @db.Char(64)
  dataKeyVersion           String                         @db.VarChar(80)
  aadVersion               Int                            @default(1)
  retentionPolicyVersion   String?
  privateDetailsDueAt      DateTime?
  privateDetailsRedactedAt DateTime?
  createdAt                DateTime                       @default(now())
  tenant                   Tenant                         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  store                    Store                          @relation(fields: [storeId], references: [id], onDelete: Restrict)
  quoteVersion             CommerceQuoteVersion           @relation(fields: [quoteVersionId], references: [id], onDelete: Restrict)
  order                    CommercialOrder?               @relation(fields: [orderId], references: [id], onDelete: Restrict)
  zone                     ServiceCommerceDeliveryZone?   @relation(fields: [zoneId], references: [id], onDelete: Restrict)
  assignment               ServiceCommerceDeliveryAssignment?
}

model ServiceCommerceDeliveryAssignment {
  id                       String                         @id @default(cuid())
  tenantId                 String
  storeId                  String
  orderId                  String                         @unique
  quoteVersionId           String
  sourceType               CommerceQuoteSourceType
  sourceId                 String
  addressId                String                         @unique
  status                   ServiceCommerceDeliveryState   @default(READY_FOR_ASSIGNMENT)
  revision                 Int                            @default(0)
  packedAt                 DateTime?
  packedByUserId           String?
  checklistVersion         String?
  preparationDigest        String?                        @db.Char(64)
  courierCiphertext        Bytes?
  assignedAt               DateTime?
  collectedAt              DateTime?
  deliveredAt              DateTime?
  deliveredProofId         String?                        @unique
  failureReasonCode        String?                        @db.VarChar(80)
  privateDetailCiphertext  Bytes?
  dataKeyVersion           String                         @db.VarChar(80)
  aadVersion               Int                            @default(1)
  retentionPolicyVersion  String?
  privateDetailsDueAt      DateTime?
  privateDetailsRedactedAt DateTime?
  createdAt                DateTime                       @default(now())
  updatedAt                DateTime                       @updatedAt
  tenant                   Tenant                         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  store                    Store                          @relation(fields: [storeId], references: [id], onDelete: Restrict)
  order                    CommercialOrder                @relation(fields: [orderId], references: [id], onDelete: Cascade)
  quoteVersion             CommerceQuoteVersion           @relation(fields: [quoteVersionId], references: [id], onDelete: Restrict)
  address                  ServiceCommerceDeliveryAddress @relation(fields: [addressId], references: [id], onDelete: Restrict)
  deliveredProof           ServiceCommerceFulfillmentProof? @relation("DeliveredProof", fields: [deliveredProofId], references: [id], onDelete: Restrict)
  events                   ServiceCommerceDeliveryEvent[]

  @@index([tenantId, storeId, status, createdAt])
}

model ServiceCommerceFulfillmentProof {
  id                       String                         @id @default(cuid())
  tenantId                 String
  storeId                  String
  orderId                  String
  quoteVersionId           String
  createdByUserId          String
  provenanceKind           String                         @db.VarChar(80)
  evidenceDigest           String                         @db.Char(64)
  evidenceCiphertext       Bytes?
  dataKeyVersion           String                         @db.VarChar(80)
  aadVersion               Int                            @default(1)
  retentionPolicyVersion  String?
  privateDetailsDueAt      DateTime?
  privateDetailsRedactedAt DateTime?
  createdAt                DateTime                       @default(now())
  tenant                   Tenant                         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  store                    Store                          @relation(fields: [storeId], references: [id], onDelete: Restrict)
  order                    CommercialOrder                @relation(fields: [orderId], references: [id], onDelete: Cascade)
  quoteVersion             CommerceQuoteVersion           @relation(fields: [quoteVersionId], references: [id], onDelete: Restrict)
  deliveredAssignment      ServiceCommerceDeliveryAssignment? @relation("DeliveredProof")
  events                   ServiceCommerceDeliveryEvent[]
}

model ServiceCommerceDeliveryEvent {
  id                       String                         @id @default(cuid())
  tenantId                 String
  storeId                  String
  assignmentId             String
  commandId                String                         @unique
  actorUserId              String
  fromStatus               ServiceCommerceDeliveryState?
  toStatus                 ServiceCommerceDeliveryState
  fromRevision             Int?
  toRevision               Int
  reasonCode               String?                        @db.VarChar(80)
  proofId                  String?
  checklistVersion         String?
  preparationChecksDigest  String?                        @db.Char(64)
  privateDetailCiphertext  Bytes?
  dataKeyVersion           String?
  aadVersion               Int                            @default(1)
  retentionPolicyVersion  String?
  privateDetailsDueAt      DateTime?
  privateDetailsRedactedAt DateTime?
  effectiveAt              DateTime
  createdAt                DateTime                       @default(now())
  tenant                   Tenant                         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  store                    Store                          @relation(fields: [storeId], references: [id], onDelete: Restrict)
  assignment               ServiceCommerceDeliveryAssignment @relation(fields: [assignmentId], references: [id], onDelete: Cascade)
  command                  ServiceCommerceFulfillmentCommand @relation(fields: [commandId], references: [id], onDelete: Restrict)
  proof                    ServiceCommerceFulfillmentProof? @relation(fields: [proofId], references: [id], onDelete: Restrict)

  @@unique([assignmentId, toRevision])
  @@index([tenantId, storeId, assignmentId, effectiveAt, id])
  @@index([actorUserId, createdAt])
}
```

These eight models need inverse fields on Tenant/Store for their eight relations;
CommercialOrder needs command/proof arrays and optional pickup/address/delivery
relations; CommerceQuoteVersion needs command/proof/delivery/pickup arrays and an
optional address. Relations whose opposite is not shown here belong inside those
**existing** models, not a second Tenant/Order definition. Order already exposes
`@@unique([tenantId,id])`, Store exposes both scoped composite keys, but Version
has only global `id`. The fragments use actual global-ID FK targets and do not
pretend Tenant/Store/accepted-Version coherence is enforced by composite keys.
If composite constraints are selected during schema review, list every required
new key/opposite explicitly and review the Prisma-generated migration first.

Each accepted Order's mode and accepted Version remain immutable. New writes
refuse both generic mode aggregates being present, a generic plus clinical
aggregate, a mode inconsistent with the accepted selected Option, a foreign
address/proof, or an address not linked to the exact accepted Order/Version.
Unique `orderId` prevents duplicate initialization **within a mode**; it does
not prevent cross-table dual-mode rows. That limitation is explicit: canonical
Order locking plus accepted-mode equality must prevent their creation, and
recovery validates the same invariant. Post-acceptance mode switching is an
unresolved amendment product policy, not an UPDATE allowed by these fragments.

Zone `MANUAL` never means approved eligibility by itself. The exact address
decision is saved independently, with original zone revision/rule/fee/promise
snapshot or explicit manual decision. Low-entropy locality fingerprints and
capability/intent verifiers require purpose-separated keyed construction; no raw
address/contact belongs in them or in command receipts. `provenanceKind` is a
server allowlist backed by a real evidence reader, not arbitrary merchant text.
The proof table does not upload, validate, send or establish customer consent by
its existence. Supported upload/attestation provenance remains a product/source
decision before implementing Delivered.

### Concrete command API and state ownership

Proposed NEW `service-commerce-generic-fulfillment.ts` exports:

```ts
type GenericLogisticsScope = {
  actorUserId: string; tenantId: string; storeId: string
}
type GenericLogisticsTarget = {
  orderId: string; quoteVersionId: string
  source: { kind: 'service' | 'commerce_inquiry'; id: string }
  expected: { aggregateId: string; revision: number } | { absent: true }
}
// Editable fields come from the exact existing pickup/delivery operation
// schemas with clientOperationId omitted: the identity argument owns that key.
// Their shared API bounds remain191 IDs/500reason/500capability/proof;
// no artificial smaller common contract or pretend Inquiry-as-Service source.
reviewGenericFulfillmentInTransaction(tx, scope, target, mode, operation)
// -> complete review + semantic digest; no audit/write/secret generation
executeGenericPickupInTransaction(tx, scope, target, operation, {
  clientOperationId, schemaVersion: 1, expectedReviewDigest
})
executeGenericDeliveryInTransaction(tx, scope, target, operation, {
  clientOperationId, schemaVersion: 1, expectedReviewDigest
})
readGenericFulfillmentOriginalInTransaction(tx, scope, { commandId, eventId })
authorizeGenericFulfillmentRecoveryInTransaction(tx, scope, { commandId, eventId })
```

The existing CommercialOrder has **no general revision column**. Do not invent
`expectedOrderRevision`; review binds its actual exact identity, accepted Version,
selected Option, current payment/amounts, line/work obligations and accepted
mode/address/proof facts, then execution rechecks them under financial Order
locks. Generic aggregate revisions use real new Int columns; initial absence
maps to an explicit first event, not an invented preexisting revision. The exact
initial/reprepare graph in section 5 governs which commands can create or advance
an aggregate; same-state ASSIGN is a recorded reassignment, not a second collect.
Immutable command lookup occurs after fresh historical-read authority but before
new-action readiness. Store keys cannot be changed by a caller or inferred from
the source's latest linked Order. No current status equality substitutes for the
saved event/receipt tuple.

### Mandatory native completion and earned-source seams

The following are actual current writers/readers, not newly discovered workflows:

| Source seam | Current behavior | Required generic integration |
| --- | --- | --- |
| `commercial-orders.ts:updateOrderStatusAfterProductFulfillment` (~340) | Full original Product/Service line completion can set COMPLETED. | Keep recording exact Product performance; combine it with required logistics before Order completion. |
| `commercial-service-fulfillment.ts:fulfillCommercialOrderChargeOnlyServiceLineInTransaction` (~170–322) | Charge-only performance can set COMPLETED at performedAt. | Keep original authorization/performance timestamp; do not equate performance with physical delivery. |
| `service-work.ts:recordServiceHandoffInTransaction` (~2569) | Ready Job lines become completed; full Order line proof can set COMPLETED. | Decide whether logistics handoff composes this exact reviewed Job operation or is a distinct obligation. Do not invoke it implicitly for every logistics event. |
| `service-commerce-bookings/lifecycle.ts` work-sync completion (~325) | Completed booking work can set COMPLETED when original lines are complete. | Preserve work evidence and add the same accepted-logistics obligation. |
| `commercial-order-completion.ts:readCommercialOrderEarnedCompletion` (~224) | Non-prescription branch checks lines only; prescription branch additionally requires its own handoff/delivery proof. | Add a separate exact generic-source proof branch, keeping ordinary non-logistics and prescription branches intact. Require prepared ≤ handedOff/delivered ≤ completedAt, actual full lines by completedAt and exact accepted-mode/proof ownership. |
| `finance/commerce-posting-source.ts` (~50) and `finance/inventory-cost-posting-source.ts` (~76) | EARNED and eligible cost source both call earned-completion reader. | Reuse its corrected truth; no ad-hoc status-only alternate source, retroactive invented completion date, cost inference or finance activation. |

Use separate helpers for **lines/performance complete** and **whole Order ready
to complete including logistics**. Replacing the line-only helper everywhere
would create a circular prepare/handoff gate: preparation needs performed goods,
while the new logistics gate is satisfied only after preparation. Every actual
completion writer must call the whole-Order helper under its existing owning
locks after recording performance. Generic final handoff/delivery invokes the
same helper after its own event, preserving the original first valid completedAt.
Private proof erasure must follow reviewed retention semantics; a missing/erased
body must not be silently interpreted as “no logistics required.” A safe retained
verification receipt is a separate reviewed evidence contract, not invented by
this packet. No automatic financial posting is activated.

Cutover is also explicit: existing accepted SERVICE/Inquiry PICKUP or DELIVERY
Orders may already be completed without a generic logistics row because the
current generic branch is missing. Do not fabricate historical handoff/delivery
events from completedAt, exempt them by treating a missing row as UNSPECIFIED, or
rewrite posted earnings. The source owner must define which legacy obligations
require review and how any future-only obligation marker would be snapshotted.
Until that policy is resolved, their missing proof is unknown/unavailable for new
logistics/earning claims, not permission for a backfill or financial reversal.

### Privacy, lifecycle and database application checklist

Extend the real
[commercial inventory](../../../db/src/queries/account-privacy-commercial-inventory.ts),
[completion blockers](../../../db/src/queries/account-privacy-completion.ts),
[commercial retention](../../../db/src/queries/account-privacy-commercial-retention.ts),
[record-retention source assessment](../../../db/src/queries/account-privacy-record-scope.ts)
and [retention ledger](../../../db/src/queries/account-privacy-record-retention.ts)
for actor attribution, collector/courier/address contacts, proof, command/event
metadata, key references and redacted bodies. New nonzero families must block
unsupported privacy completion, not disappear from inventories. Domain export
must page exact scoped records and original safe outcomes; the
[assistant-only export](../../../db/src/queries/assistant-private-export.ts)
cannot substitute for them. User deletion must not gain new User/Membership FKs
here; scalar snapshots still require explicit privacy/controller treatment.
Store Restrict/Order Cascade/Version Restrict in the candidate are visible review
choices, not permission to delete records or evidence. See
[current privacy retention contract](../../../../.brain/database/account-privacy.md).

Before Prisma source work, obtain the existing gate's exact target/profile and
fingerprint authorization, include all concurrent schema changes, assess service
startup consequences, generate and inspect the migration, then run **both** root
`bun db:migrate` and `bun db:push` for that authorized target and generate clients.
No manual SQL migration, reset, target substitution or `--local` assumption is
authorized. See the disposition packet's section 8 for the current root wrapper
behavior; no target is authorized by either proposal.

True unresolved product/controller decisions, to present together after source
review rather than silently choose:

1. Preparation checklist: preserve explicitly labelled staff attestation, or use
   a named versioned server-required checklist? Which exact requirements apply?
2. Pickup verification/proof: long opaque capability or short code with committed
   attempt limiting; authorized distribution/recovery; allowed delivery evidence
   provenance (staff attestation, owned upload, or another reviewed mechanism).
3. Can an accepted paid Order change pickup/delivery mode or address, and with
   what explicit price/customer acceptance/credit lineage? Current proposal
   refuses such amendments; it does not decide a new transition.
4. Does generic pickup handoff explicitly compose named ready Jobs, or is
   performance already recorded and the collector event only logistics? Preserve
   ADR-0014's explicit settled-balance Job handoff either way.
5. Which approved privacy/controller retention, redaction/export and key-custody
   policy covers address/collector/courier/proof and replay integrity?
6. Which exact database target/profile/startup consequences are authorized for
   generated migration plus required push? This is the existing execution gate,
   not permission inferred from approval of Markdown design.
7. How should preexisting accepted generic pickup/delivery Orders with no generic
   logistics evidence enter the new obligation model? A future-only cutover needs
   an explicit immutable marker/policy; no completed event or receipt is invented
   for historical Orders.

All other naming/implementation/test ownership can proceed through ordinary
source review. The fragments do not resolve those product choices, constitute
schema or full-client implementation, or satisfy full G03 acceptance.
