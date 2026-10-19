# Full GENERAL booking integration — implementation proposal

Date: 15 October 2026. Status: source preparation only; not implemented or
accepted by this packet. Root owns integration, Brain, manifest, compiler and
approval gates. This advances the full G03 booking requirement, not a substitute
availability reader or a new booking system.

## 1. Current canonical source and remaining gap

The existing canonical Service booking aggregate supports all eight requested
commands: hold, confirm, arrive, start, complete, cancel, mark no-show and
reschedule. It owns resource capacity, current configuration, immutable booking
policy snapshots, exact operation hashes/events, customer-capability rotation,
linked Service work, cancellation consequences and durable notification intents.
No booking table/migration is needed for these eight staff commands. Generic
Inquiry booking is not supported by this aggregate: `bookingSourceType` admits
only a Service Request. Do not relabel an Inquiry or Prescription as Service to
make an assistant action work. Generic pickup/delivery remains its separate
schema-dependent G03 requirement.

New caller-owned commands are available through actual DB subpaths
`@ewatrade/db/service-booking-commands` and
`@ewatrade/db/service-booking-command-effects`:

| Command | Outside owning TX | Inside final owning TX | Exact recovery |
| --- | --- | --- | --- |
| Hold | `prepareServiceCommerceBookingHold` snapshots strict input, hashes it and allocates private confirm token | `createPreparedServiceCommerceBookingHoldInTransaction` | `readServiceCommerceBookingHoldEffectInTransaction` |
| Confirm | Initial `inspectServiceCommerceBookingConfirmationInTransaction`; after TX closes `prepareServiceCommerceBookingConfirmation` allocates private manage token and protects exact consented contact | `confirmPreparedServiceCommerceBookingInTransaction` | `readServiceCommerceBookingConfirmationEffectInTransaction` |
| Six lifecycle operations | `prepareServiceCommerceBookingRevision` snapshots input/hash and allocates private manage token | `revisePreparedServiceCommerceBookingInTransaction` | `readServiceCommerceBookingRevisionEffectInTransaction` |

Prepared handles are process-local WeakMap identities, not serialized tokens,
authorization or restart recovery. Native commands return safe exact receipts;
confirmation/revision also return SERVER-ONLY `notificationDispatches`. Recipient
ciphertext, raw tokens and transport/provider delivery proof are absent from
receipts. Native wrappers keep their existing own-transaction behavior.

Current GENERAL has `readBooking`, a saved `service_booking` target and exact
dashboard/native original views. It has no booking action in `GeneralAction`, no
booking command receipt in `GeneralReceipt`, no durable booking draft/composer,
no complete booking action review, and no booking editor/confirmation rendering.
`serviceAssistantBookings.availability` is protected and query-only; it remains
planned G03 in the inventory and is not currently in `general-callers.ts` or a
GENERAL availability tool. Existing original reads do not enumerate bookings or
hold identities. Missing identity must stay unresolved; do not ask for internal
IDs/JSON or select the first queue/cache row.

## 2. Proposed strict public action and receipt contract

Proposed NEW shared module: `packages/assistant/src/general/booking-action.ts`
and test. These names are proposed, not current public actions:

| Proposed action | Complete business intention, excluding server authority/operation IDs |
| --- | --- |
| `service_booking_hold` | Exact `source:{kind:'service',id}`, `offeringId`, `resourceId`, integer quantity1..10,000, exact slot start/end instants, current expected configuration revision |
| `service_booking_confirm` | Exact Service source and `holdId`; optional exact `quoteVersionId`, `commercialOrderId`, `serviceJobId`, preserving canonical optional relationships without fabricating them |
| `service_booking_arrive` | Exact `bookingId` and expected booking revision |
| `service_booking_start` | Exact `bookingId` and expected revision |
| `service_booking_complete` | Exact `bookingId` and expected revision |
| `service_booking_cancel` | Exact `bookingId`, expected revision, structured nonblank reason1..80 |
| `service_booking_no_show` | Exact `bookingId`, expected revision, structured reason; native mapping is `mark_no_show` |
| `service_booking_reschedule` | Exact `bookingId`, expected revision, structured reason, exact new `resourceId`, start AND end instants |

Use exact opaque native IDs up to191 without accidental128/160 truncation or
client normalization. Scope IDs follow the actual current GENERAL contract.
Finite revisions use native storage bounds: configuration0..Int32MAX,
revision command0..Int32MAX-1. No extra fields, client actor/Tenant/Store,
`accessToken`, clock, exclusion, token issuer/protector, provider fields,
claimed authority, payment override or `clientOperationId` are admitted. Dates
must round-trip their exact instant, including milliseconds and offsets; server
normalizes for canonical Date inputs only after strict validation. Display UTC
and the saved/configured IANA timezone; never guess device timezone/DST.
Reject lifecycle fields inappropriate to an operation instead of retaining
ignored reschedule data. Native command schemas remain the final validator.

Receipt union must preserve the actual safe
`ServiceCommerceBookingCommandReceipt`: `hold_created` and `booking_event`,
including exact original source/origin/Offering/resource/quantity/UTC dates,
event operation and revision, statuses, saved timezone/policy revisions and
refund consequence. Prefer a discriminated GENERAL wrapper around this exact
safe receipt rather than recreating a reduced summary and losing immutable facts.
Keep `notificationDelivery:'unverified'`. A refund-eligible consequence is not a
refund, cancellation is not a payment reversal, and booking completion alone
is not proof of whole-Order completion or financial posting.

Hold receipts are not `service_booking` originals: a hold is not a confirmed
booking. Show its exact expiry and link the actual Service Request; a dedicated
hold-original view requires a protected server-owned proposal/effect read, not a
made-up booking target. Confirmation/event receipts may open the existing exact
booking/source/Offering tuple. That existing target currently caps/trims160;
root must reconcile it to native exact191 identity with historical round-trip
tests before using all canonical receipts. Add origin binding for new receipt
navigation while preserving old absent-origin saved targets safely; origin is
navigation metadata, never authority.

## 3. Fresh complete review needed before staging and execution

Proposed NEW canonical query module:
`packages/db/src/queries/service-commerce-bookings/booking-command-review.ts`
and test. Proposed entry point:
`reviewStaffServiceCommerceBookingCommandInTransaction(tx, serverInput)` returns
`{target:{id,revision:sha256},review}`. No callbacks, capability allocation,
recipient encryption, policy audit writes, durable event or provider activity.
Use the actual prepared-command input types and native normalizers/hashes, not a
second interpretation of command identity.

1. Resolve fresh active Tenant/Store, accepted active membership and actual
   native Owner/Admin-or-Store-ATTENDANT ceiling through
   `assertStaffBookingCommandScopeInTransaction`. Keep persisted staff access,
   positive access revision, role/mode and SCOPED non-owner exact active Store
   assignment. A role named Manager/Cashier does not itself grant attendant
   authority. Current GENERAL Session/account/privacy/action/client/domain
   authority is additional, not replaced by this helper.
2. For NEW execution review, use active booking runtime, read-only booking
   policy, exact eligible Service Request and complete source revision. Preserve
   nonclinical scope/accepted-Order proof before projecting generic assistant
   facts; reuse the existing nonclinical Service reader boundary rather than
   interpreting a source kind as a clinical licence. If current native selectors
   do not expose required review facts, explicitly release a narrow shared pure
   selector extraction; do not copy a weaker authority or mutate during review.
3. Hold: exact current configured Offering/resource, configuration/settings/
   resource revisions, timezone/duration/lead/horizon/hold duration, quantity,
   entire requested interval, recurring/OPEN union, CLOSED precedence and
   authoritative live capacity. Bind source/access/policy/config/resource/fact
   revisions and exact intent. The review clock is an observation, not durable
   capacity reservation. Native final lock/evaluation remains authoritative.
4. Confirm: exact unexpired HELD row/source/Offering/resource/config revision,
   quantity/slot and expiry; exact optional accepted Quote/Order/Job identities,
   financial-read facts and source/consent revision. Bind private contact basis
   digest server-side but project no phone/email/ciphertext. Show whether native
   notification intent may be queued separately from its delivery. Review must
   not call the opaque confirmation inspector to imply complete eligibility:
   the current inspector prepares contact basis, not a full capacity/payment/
   linked-work review.
5. Six revisions: current exact booking revision/status/links and saved policies;
   native next-state eligibility; for reschedule complete new interval/resource
   capacity excluding this exact current booking server-side. For cancel,
   current cutoff/payment+refund totals and policy consequence. For start/
   complete, exact linked financial Order and every native-active Job line,
   authorization/status/original-quantity and whole-Order obligation effects.
   Native completion locks and synchronization remain the writer; a preview
   must describe those effects and must not silently cap or omit Job lines.
6. Review drift invalidates the signed target; explicit edit/refresh stages a
   new proposal revision and requires new individual confirmation. No automatic
   switch to another resource, time, hold, Order, Job, source or current Store.
   Do not add an unconditional PAID gate: native permits unpaid cases according
   to its existing policy. Payment readiness and provider settlement remain
   distinct from saved payment snapshots and operational authorization.

Availability retains its real bounds: one exact source/Offering/resource,
positive window≤31days,1000+1 facts per underlying fact set with explicit refusal,
500 candidate scans, up to100 returned slots per page and exact revision-bound
cursor. Use every returned slot/coverage flag, never sum live pages as a
reservation. Those are availability bounds, not permission to shrink canonical
work/effect graphs. Measure complete JSON/logical review and wire envelope bytes
before parse/copy/digest; counts alone do not bound memory. Refuse the whole
review or verify complete paging, never silently truncate a supported action.

## 4. Durable draft and terminal-first composer

Proposed NEW API modules, each with inert actual-chain tests:
`general-booking-intent.ts`, `general-booking-draft-store.ts`,
`general-booking-review-store.ts`, `general-booking-confirmation.ts` under
`apps/api/src/assistant/`. Mirror the Quote composer security properties, not
its Quote-specific payload/digest/receipt schema.

1. Server mints proposal ID/idempotency identity once, deriving stable native
   operation/booking IDs from that saved identity. Durable proposal binds action
   version, strict full intention, payload hash, actor/Tenant/Store/conversation,
   role snapshot, source/booking target digest, expiry and signed approval hash.
   Repeated edits change revision/target/approval and retain the same operation
   identity; no new native ID per click, process restart or lost response.
2. Inspect in a current authenticated owning TX. Load exact conversation/proposal
   and **terminal receipt first**, before pending/expiry/rollout/new readiness.
   COMPLETED recovery checks private payload integrity/current read authority
   and the actual native effect reader, returning the original exact historical
   receipt after later booking transitions, disabled booking or source decline.
   Do not invoke the normal original reader here: it requires new booking
   runtime/source eligibility and would erase valid historical outcomes.
3. CANCELLED proposal recovery is read-only. Cancel a still-pending proposal
   through exact CAS/current action/read authority, including an expired pending
   proposal without invoking tokens/crypto. Cancelling a proposal is NOT booking
   cancellation; the latter is its own signed domain action. Signing-key rotation
   must not destroy valid terminal native proof; no new approval required to read
   a completed outcome. EXECUTING/uncertain state reconciles the same identity,
   never mints another command or reports rollback from a lost response.
4. Only valid signed, unexpired PENDING state with current full target produces
   an opaque pending plan. For confirmation call the actual native inspection
   during this initial read TX. Retain cloned facts/opaque inspection only; no
   TX/delegate/context/callback survives into the outside phase.
5. After initial TX closes, call actual native preparation with trusted token
   issuer and recipient protector. Hold/revision also allocate outside final
   TX. Deduplicate preparation per inspected plan. Private tokens/ciphertext/
   handles never enter client/model/history/analytics. Wrong, missing, cloned or
   stale proof fails before effects with no inside-TX fallback callback.
6. In a NEW freshly authorized Serializable TX, repeat exact signed full binding,
   authority, expiry and complete target review; exact PENDING→EXECUTING CAS,
   execute actual prepared native command and explicitly read back its safe
   immutable effect. Persist COMPLETED+receipt and final readback in the SAME
   owning TX. Any error rolls back the owning transaction; do not nest a native
   own-TX wrapper. Lock ordering stays financial Order→Booking→Resource/Job as
   canonical code requires. Tests with synthetic delegates are not SQL rollback
   or concurrent-persistence proof.
7. Return server-only notification followups separately. Queue only after commit
   through existing durable booking dispatch; enqueue failure cannot undo a
   saved booking or authorize a new booking identity. Existing native notification
   intents/jobs recover delivery independently. Unknown/sent/failed provider
   delivery never changes the original booking command receipt into settlement
   or a promise that a customer was contacted. No provider action in this slice.

Quote infrastructure proves a viable pattern: actual
`general-quote-issue-draft-store.ts`, `general-quote-issue-confirmation.ts`,
`general-quote-issue-review-store.ts` and `general-quote-issue-review-pages.ts`.
Its current packet code has Quote-specific types and the named pricing-clock
omission; do not cast booking reviews through it or copy omissions. A booking
packet must preserve every business fact, counts/order/target/binding and dates,
with complete assembly verification. Adopt the measured1MiB envelope approach
and a measured whole-review byte limit only after full booking graph evidence;
no claim the Quote64MiB budget is already a booking contract. Fresh recompute
every page, check expiry after serialization and refuse mixed/stale/partial pages.

## 5. Exact shared integration ownership and client work

The following EXISTING paths require root/shared-owner release; this proposal
changes none of them:

| Layer | Exact registration paths and required work |
| --- | --- |
| Shared public action/receipt/history | `packages/assistant/src/general/contracts.ts`, `snapshot.ts`, `answer-target.ts`, `booking-read.ts`, `packages/assistant/package.json`: additive eight-action and safe receipt schemas, exact saved round-trip/history compatibility, no historical target retargeting |
| Capability/classification | `packages/assistant/src/capabilities/manifest.ts`, `types.ts`, `inventory.ts`, coverage fixtures: exact tools/procedures/action clients/roles and planned availability; do not remove planned classification merely for internal source |
| Canonical imports | `packages/db/package.json`: narrow new review export if needed; preserve actual existing command/effect subpaths and native wrappers |
| GENERAL adapter | `apps/api/src/assistant/general-actions.ts`, `general-context.ts`, `general-proposals.ts`: register all eight, current caller assertions, durable edit/read/terminal-first recovery, actual outside-TX preflight composition before entering final action TX; current transaction-local `prepareExecution` is insufficient for token/cipher preparation |
| Protected API/tools | `apps/api/src/trpc/routers/assistant.ts`, `service-assistant-bookings.ts`, `_app.ts`; `general-callers.ts`, `general-tools.ts`, `general-turn.ts`, `general-turn-execution.ts`: strict draft/review/page/decision registration, canonical namespace paths, current principal and explicit individual confirmation; never execute as a tool result |
| Saved projection | `apps/api/src/assistant/general-proposal-history.ts`: compact receipt/draft reference and unavailable history handling without full private inputs, tokens, or turning old completed actions into pending reviews |
| Dashboard | `apps/dashboard/src/components/general-assistant/general-proposal-card.tsx`, `use-general-assistant.ts`; new exact booking editor/review/paging components. Existing `sheets/assistant-booking-sheet.tsx`, `assistant-booking-content.tsx`, `assistant-booking-state.ts` retain original/back/chat continuity |
| Native | `apps/mobile/src/components/mobile/assistant/general-model.ts`, `use-general-assistant.ts`, `native-service-original-screen.tsx`, `native-booking-original-screen.tsx`; new complete eight-action editor/review. Current original must not be mistaken for mutation UI; fixed target, fresh mount-owned reads and exact Store/role/access read generations fence every Save/Open callback |
| WhatsApp/shared transport | `apps/api/src/assistant/channel-action-turn.ts`; `packages/assistant/src/channels/action-review.ts`, `action-result.ts`, `render.ts`, `capability-action-handoff.ts`: inspect terminal first and prepare outside final claimed ACTION TX, retain current linked Session/channel authority and atomic receipt/outbox ownership. App-review handoff must be honest until every full review/confirmation/recovery leaf is actually supported |

Discovery gaps must be implemented deliberately: Offerings/resources must come
from current exact authorized configuration/availability, holds from the saved
hold receipt/proposal, booking/source/Offering from exact saved originals. If a
user asks to find existing appointments, add a scoped bounded pure list/search
with exact original targets and coverage; no broad contact scan or queue fallback.
No generic Inventory/Service workspace fallback substitutes for a booking original.

Client editor must support all editable native fields: quantity/slot/resource,
all optional confirmation relationship choices, structured reasons, entire
reschedule interval. Fixed action/source/booking identity may not change through
local edits. Field changes hide prior impact, cancel pending Save synchronously,
and require fresh review. Scope/focus/disabled/refusal/blur/unmount and late
callbacks cannot revive prior facts or emit an old payload. Review shows exact
time/timezone/expiry/quantity, saved-vs-current policy/payment, linked work and
cancellation/notification consequences before individual Confirm. No offline
execution, automatic confirm-after-hold, payment combined action or blanket plan
approval. Each H04 plan step still uses its own saved action/receipt.

## 6. Next independently implementable slice and acceptance

First authorize ownership of NEW
`packages/db/src/queries/service-commerce-bookings/booking-command-review.ts`
and `.test.ts`, plus NEW shared `general/booking-action.ts` and `.test.ts`.
Implement full eight-operation strict intention/safe receipt/complete pure review
against actual canonical helpers. Leave exports/union/manifest/router/UI to root;
the modules remain unexposed until integrated. If canonical review needs a shared
native pure-selector extraction to preserve complete synchronization/payment
semantics, report the exact seam and obtain root's file release before editing.
That is a real booking prerequisite, not a claim of complete booking delivery.

Next separate owner can implement the NEW durable draft/composer modules once
the actual review DTO freezes, with real command/effect functions and existing
`packages/db/src/queries/test-helpers/booking-commands.ts`. Required inert checks:
all eight operations/optional links, quantity10,000/native191/revision boundaries;
strict input and exact hash; source/contact/consent/policy/access/role drift;
full capacity/DST interval and scoped page drift; outside-TX depth sentinel for
token/cipher callbacks; forged/cloned/missing opaque handles; hold expiry between
inspect/preparation/final; duplicate/reordered events; final CAS/content/authority
races; exact same receipt after later lifecycle/runtime/source changes; key
rotation/expired cancellation; wrong-source/foreign Store/Order/Job; complete
large Job effects without truncation; honest lost-response and simulated failure
states; notification followup failure preserves saved truth and no provider call.

Reuse existing command, availability, canonical evaluator, read/target/native
fixtures as prerequisite evidence; run affected suites only after source changes.
New actual API/client/channel fixtures must exercise registered functions and
renderers, strict unknown-byte admission and complete-page verification. Real
SQL concurrency/atomic rollback, authenticated saved history/Open/back, actual
device/focus/double-tap/unknown recovery and provider/hosted acceptance remain
separate exits under the existing exact approval gates. No compiler/test/DB/
provider run was performed for this proposal. Full G03/H04 and phases4–12 remain
open;13/45 acceptance is unchanged.

G01 human pause, Paystack pause, D04 exact remaining12/fingerprint/UNSCHEDULED,
E05 activation/restart refusal, G04 six deferred/UNSCHEDULED, S05 seven UNRUN/
budget refusal/no retry scheduling and C04 exact target constraints persist.
Root owns Brain/API/permission/privacy/task/impact reconciliation. No Brain files
are edited in this preparation-only child slice.

## 7. Source fingerprint checkpoint

Hashes below describe source inspected for this proposal, not a freeze of files
owned by other agents. Existing referenced paths were checked; paths expressly
marked proposed/new are not claimed implemented.

| Inspected source | SHA-256 |
| --- | --- |
| `packages/db/src/queries/service-commerce-bookings/booking-commands.ts` | `e08e4632df34a75a026bdb3c2fe8878df0c6a71b1dbfe02566f9456f2c8fa279` |
| `packages/db/src/queries/service-commerce-bookings/booking-command-effects.ts` | `4e5d4b772b40490d983c79270792c424cfae254283e8d87f9388a8ed4bdca468` |
| `packages/db/src/queries/service-commerce-bookings/booking-command-authority.ts` | `eec5bf0f7d9b799b80d5e36b3f3c9211074f677e172fd02030d702077e402350` |
| `packages/db/src/queries/service-commerce-bookings/booking-command-schemas.ts` | `fb5e594f1f2c6179e5b501add29ca9c32dd2f876ce88804c61c44823d13eeaa9` |
| `packages/db/src/queries/service-commerce-bookings/booking-command-inputs.ts` | `d43708ef17265754de8558452a98e52092e97a083ffb73912eb35a04a7c9fa5e` |
| `packages/db/src/queries/service-commerce-bookings/booking-command-contacts.ts` | `b47425a8e5169213b093899e2c4b3a48544a3679b36400854a1e2b212d71af67` |
| `packages/db/src/queries/service-commerce-bookings/lifecycle.ts` | `0bddf1b422f7850a0d055b7ead318dd02bf12b59b99f56bc327afe38839971e1` |
| `packages/db/src/queries/service-commerce-bookings/staff-availability.ts` | `0c0aa84eabf5a59c5a64d48554017c45b548ce54a8f2c494784b4d8fa1d26446` |
| `apps/api/src/trpc/routers/service-commerce/bookings.ts` | `93ee065b3a64484a1c564979610b544d6356ddad3d98dc06d37bf2e71c7d3206` |
| `apps/api/src/assistant/general-quote-issue-draft-store.ts` | `84f5298435bf5b6c9773def6c5551110d758562d0703b2e0f229e992e9b71320` |
| `apps/api/src/assistant/general-quote-issue-confirmation.ts` | `2401b4fe93b096783bbd584a9900b2b36b908b0c086a49dee88d860fd0cf5e7e` |
| `apps/api/src/assistant/general-quote-issue-review-store.ts` | `6113f7ddd8fa9d63c9d699bea9d1b6c3e57a58dc9719b0bb6fd10b3ccc7d2058` |
| `packages/assistant/src/general/booking-read.ts` | `6b832c9d5aca54fcae9c1e7b1d03bc967c2ef91e29eb130a55b4cdbad3e8c118` |
| `packages/assistant/src/general/contracts.ts` | `9eacb3fd950ce4a831a716a6dde20530332daca8ba6b475d2fe8f350f04bf581` |
| `packages/assistant/src/capabilities/manifest.ts` | `86d21cbd56073de11d278d2c1ab6d798f4885ea514acc17b158ace6c2650a77c` |
