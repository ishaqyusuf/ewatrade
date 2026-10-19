# Booking confirmation, cancellation and exact-effect recovery composition

15 October 2026. Source design for the next bounded G03 implementation slice.
The prepared native commands, pure review, input adapter and draft store are
separate components; this packet does not claim an exposed booking action,
completed integration, SQL acceptance or a provider/runtime operation. Existing
approval and launch boundaries remain in force. No additional human approval
pause is proposed.

## 1. Current source and the next module

Implement next in **new** `apps/api/src/assistant/general-booking-confirmation.ts`
and its focused `.test.ts`. Reuse these actual components:

| Component | Required use |
| --- | --- |
| `general-booking-input.ts` / `generalBookingNativeInput(payload, scope, clientOperationId)` | Reconstruct the complete native command from the exact saved `GeneralBookingAction`, current server scope and original row `idempotencyKey`. It returns `StaffServiceCommerceBookingReviewInput`. It grants no authority. |
| `general-booking-draft-store.ts` / `inspectGeneralBookingDraftRowInTransaction` | Read the exact actor-owned ACTIVE GENERAL conversation and proposal, validate known row state and saved payload integrity without requiring a current key, expiry or new-booking eligibility. It is SERVER-ONLY and is not terminal effect proof. |
| Same store / `readGeneralBookingDraftInTransaction` | Obtain the PENDING row, exact native input and complete fresh canonical review for a **new** execution. Its private output must not become a model/client result. |
| Same store / `generalBookingDraftApprovalToken` | Use the local versioned approval binding described below. Ordinary GENERAL token compatibility must never be assumed. |
| `service-commerce-bookings/booking-command-review.ts` | Pure full current review for hold, confirm and all six revisions. The native work plan, exact decimal whole-Order obligations, capacity, payment and contact digest are owning source rules, not reimplemented in the composer. |
| `booking-commands.ts` | Data-only process-local preparation plus caller-owned transaction commands. All prepared commits require `(tx, handle, freshServerScope)`. |
| `booking-command-effects.ts` | Read exact historical hold/event proof without executing a command, rotating a token, checking new-issuance policy or creating notifications. |
| `general/booking-action.ts` | Strict action and `{kind:'service_booking_command', effect}` receipt shapes. Parsing is not proof or approval. These are not yet registered public GENERAL actions/history. |
| `general-quote-issue-confirmation.ts` | Reuse its row ownership, exact fingerprint, signed PENDING decision, two scoped CAS writes, transaction rollback and terminal-first composition patterns. Booking recovery must additionally reconcile exact native proof for uncertain rows; do not copy Quote's narrower refusal of every non-PENDING/nonterminal row. |

The input adapter has no new command-ID derivation: native
`clientOperationId === savedProposal.idempotencyKey`. Confirmation leaves
`clientBookingId` absent, preserving the native fallback to that same key.
Never mint a replacement key when inspecting, editing, preparing, executing,
retrying, cancelling or recovering this draft.

Caller contracts remain explicit: fresh authenticated GENERAL Session/account/
privacy/legal/account-age eligibility, actor/Tenant/current Store, permitted
client/action/domain and rollout, plus the actual intended transaction isolation.
A model/client cannot provide those facts, a transaction, a callback, a token or a
prepared handle. Current native booking authority still requires Owner/Admin or
an accepted active Store attendant within the native operational-role/Store-grant
ceiling. H04's ACTIVE membership semantics do not remove booking's existing
accepted-at/attendant rule. Clinical actions and Inquiry bookings are not created
by this work; current native booking source is ServiceRequest only.

## 2. Keep the five bindings distinct

| Binding | Meaning and verification |
| --- | --- |
| Stored `row.payloadHash` | Actual `proposalDigest(saved GeneralBookingAction)`, unchanged by signing. Strict parse of the saved payload must have the same digest and exact action/version. |
| Booking signing payload hash | `proposalDigest({domain:'GENERAL_BOOKING_DRAFT_V1', action, actionVersion, payloadHash, targetRecordId, targetRevision, roleSnapshot, conversationId, idempotencyKey})`. Use the store's actual local helper and the actual `proposal-security.ts` machinery, not a lookalike implementation. |
| `approvalTokenHash` | Digest of the actual locally bound approval token. New execution needs the current signing key and valid unexpired supplied token, using exactly the store's derived signing binding. Never call the ordinary validator with the unmodified payload hash or accept an ordinary GENERAL token as fallback. |
| `targetRecordId` / `targetRevision` | Exact canonical current review target and semantic digest. Fresh re-review must match both before a new domain effect. `asOf` and the generated hold-preview expiry observation are not commit-time promises. |
| Native command hash | The native hold/confirmation/revision hash, computed by `booking-command-inputs.ts` and checked by the effect reader. This is not the proposal payload hash, signing hash or review target digest. |

A pending token must fail if target, role snapshot, conversation, command key,
action/version or actual payload changes. Key rotation, proposal expiry or a
later stale target must not erase an already verified historical domain effect.
Historical recovery therefore never regenerates or validates a new approval
with the current key as a condition of reading the original result.

Fingerprint dates explicitly as ISO strings, as the Quote composer does;
`proposalDigest(rawPrismaRow)` alone does not serialize Date instances correctly.
The recovery/decision CAS must bind the actual observed status and **all** stored
identity/binding/outcome metadata, including full payload/result equality or their
validated bound representation, errorCode, decidedAt, expiresAt, createdAt and
updatedAt. Use the actual Prisma JSON-null semantics in query predicates; inert
delegate equality is not proof of PostgreSQL JSON/null behavior. Do not directly
reuse a PENDING-only store-edit CAS for EXECUTING completion or recovery.

## 3. Proposed server-only interfaces and data lifetimes

Use a small strict scalar request:

```ts
{ conversationId, draftRef, revision, decision: 'confirm' | 'cancel', approvalToken? }
```

No payload, receipt, actor, scope, command key, time, target, crypto callback,
notification choice or execution mode comes from this request. Scope is a
separate required fresh server argument. Bound the encoded request/envelope
before parser transforms, reject unknown fields/getters/proxies and snapshot
accepted data before the first await. The existing Quote scalar admission is a
reference; exact HTTP/body admission remains the future outer entrypoint.

Proposed exports:

1. `inspectGeneralBookingConfirmationInTransaction(tx, serverScope, request, signingKey)`
   returns an exact recovered/cancelled result or `{kind:'pending', plan}`.
2. `prepareGeneralBookingConfirmation(plan)` runs **after inspection TX closes**
   and returns an opaque process-local prepared handle.
3. `confirmGeneralBookingInTransaction(tx, serverScope, request, signingKey, handle?)`
   performs proof-first recovery/cancellation or one fresh atomic execution.
4. An internal exact-proof recovery function shared by inspection and final
   composition; do not make a separate public replay command.

A plan retains cloned data only: exact scope/request identity, immutable proposal
fingerprint, original native input, full reviewed target binding and, for confirm,
the opaque native contact inspection handle. No transaction, delegate, closure
or crypto/provider callback survives inspection. The final prepared WeakMap
contains those data bindings plus the correct native opaque prepared handle.
Forged/serialized/copied handles refuse; an explicitly invalid handle must not
select a legacy fallback. Successful preparation is cached per plan so transaction
retry uses the same token/cipher allocation and original command identity.

Production preparation uses existing trusted local
`issueServiceCommerceBookingCapabilityToken` and
`protectCommunicationsRecipient`; it does not call customer public routes, mint a
customer intake capability, screen text, enqueue a job or contact a provider.
Private tokens/ciphertexts never enter a proposal JSON payload, public receipt,
model output, URL, trace, log or analytics event.

## 4. Proof-first ownership and historical recovery

Both inspection and final execution start in this order:

1. Strict request/current server scope; exact actor/Tenant/Store/GENERAL ACTIVE
   conversation and exact proposal ID/revision. Recheck row fields even when the
   query predicate includes them. Validate action version, payload/action/hash,
   original key, dates, known status and bounded JSON without current readiness.
2. Reconstruct native input from **saved payload + saved key + current scope**.
   Read exact native historical proof before cancellation, crypto allocation,
   expiry/current-key validation or fresh new-execution review.
3. For a saved COMPLETED row, parse its strict saved receipt and independently
   read the native proof. Require equality of the entire canonical compact effect
   and saved effect, not merely a receipt kind, related booking or current status.
   An absent/malformed/different receipt or missing proof is unavailable, never a
   reason to run the command again.
4. For uncertain/incomplete rows with exact original native proof, derive the
   canonical compact receipt from that proof and reconcile by exact scoped row
   CAS to COMPLETED. Mark the result as recovered original effect, not a new
   human confirmation or new execution. A requested draft cancellation encountering
   an applied effect must disclose that effect; it cannot hide it as cancelled.
5. With **no** proof, EXECUTING/FAILED/EXPIRED remains unknown/unavailable and
   cannot automatically issue or acquire a new command key. Only a clean PENDING
   row without a native effect can enter the ordinary signed new-execution path.

Proposed explicit reconciliation CAS source states are PENDING, EXECUTING, FAILED
and EXPIRED, each only with independently verified exact native effect. FAILED
or EXPIRED is not evidence that a legacy uncertain effect never happened. The
initial implementation must record the exact supported state set and test every
member; there is no catch-all non-COMPLETED update. A CANCELLED row with a native
effect is an integrity conflict, not an ordinary cancellation receipt. A clean
CANCELLED row must have no executed result and no native effect; return its saved
cancellation without requiring current key/expiry/new readiness. Never turn a
terminal draft into a new pending command.

Reject invalid state/outcome combinations before recovery or writes. Reuse the
store's exact row integrity validator: PENDING has null result/error/decision;
COMPLETED has a valid decision date, null error and a strict saved receipt;
CANCELLED has a valid decision date and null result/error. EXECUTING, FAILED and
EXPIRED preserve valid nullable legacy decision/error metadata and may have a
strict safe saved receipt. Any such receipt must independently match the entire
exact native proof before recovery; a null receipt may be derived only from that
proof. No-proof uncertain rows remain unknown, even with a schema-valid receipt. Unknown
states, malformed dates and nonmatching payload/action/target bindings refuse.
FAILED/EXPIRED legacy error metadata is included in the exact recovery CAS and
cleared only when verified native proof atomically establishes COMPLETED. A
malformed or contradictory saved outcome is not silently replaced with a guessed
success, even if another related domain record exists.

Native proof requirements are already centralized:

| Action | Exact historical proof |
| --- | --- |
| Hold | `readServiceCommerceBookingHoldEffectInTransaction`: original actor, native key/hash, exact ServiceRequest/origin, Offering/config identity, resource, quantity, configuration revision and exact slot; original created/expiry times. Later CONFIRMED/expired hold status must not rewrite this historical `hold_created` effect. |
| Confirm | `readServiceCommerceBookingConfirmationEffectInTransaction`: exact original CONFIRMED event by key/hash/actor/origin, exact booking/hold/source and native default clientBooking identity, booking command hash, immutable event slot/policy/capacity/time. |
| Arrive/start/complete/no-show/reschedule/cancel | `readServiceCommerceBookingRevisionEffectInTransaction`: exact booking event by original key/native hash/actor/origin and operation/type/status; reschedule's exact resource/slot; historical next revision derived from hash-bound expectedRevision + native CAS/event invariant. Cancellation uses original immutable refund columns, not today's payments. |

Every reader also checks current native staff read scope and exact nonclinical
ServiceRequest existence/Store identity. It does not require a still-eligible new
source, active booking runtime, fresh availability, new policy approval, live
booking revision or current token. A later declined/withdrawn source, reschedule,
completion, refund, recipient change or expired/rotated bearer capability does not
turn the original event into another effect. Existing historical guards still
limit who can recover: current actor and native accepted booking role/attendant/
Store access are required. These are current source checks, not a claim that an
expired Session, deleted account or removed GENERAL ownership may read history.

The composer must use the native reader; it must not duplicate native hashing,
query an arbitrary first event, accept a related Order as proof, infer a receipt
from current booking state, fetch bearer data or call a native command to recover.
The native event schema has no explicit per-event revision column; revision proof
relies on the exact stored command hash plus the canonical revision-CAS-before-
event rule. Inert tests demonstrate composition, not a SQL integrity theorem.

## 5. Clean PENDING cancellation versus domain booking cancellation

`decision:'cancel'` cancels only the assistant draft after proof-first checks.
For a PENDING row with no effect/result/decision, apply exact scoped PENDING CAS
and save CANCELLED/decidedAt; verify readback. It does not release an existing
hold, cancel an appointment, reverse stock/work/payment, refund money or create
notification intent. It needs current historical read/cancel scope, not an
unexpired approval token, active runtime or still-eligible new source. Use source
identity only for hold/confirm and exact original booking/source identity for the
six lifecycle drafts; do not read full contacts or private capability state.

`service_booking_cancel` is a separate business action. It retains its required
reason, expected booking revision, fresh reviewed native cancellation window,
net recorded PAYMENT minus REFUND consequence, actual native capability/reminder
changes and possible durable notification. `refund_eligible` is a recorded
consequence, never a provider refund or settlement. No new deposit/payment rule
is introduced for start/complete: native fulfillment/work eligibility remains the
existing authority.

## 6. New execution: inspect, prepare, fresh transaction, exact readback

For a clean PENDING `decision:'confirm'` with no native effect:

1. Require null result/error/decision and current locally bound approval. Read
   actual full draft review; require exact row fingerprint, role snapshot and
   target binding. Validate approval again after the read/clock crossing.
2. For hold/revise, inspection records only cloned native input and target/row
   binding. For confirm, call
   `inspectServiceCommerceBookingConfirmationInTransaction` in the same consistent
   authorized read TX; this captures exact current consent/contact basis as opaque
   data. It is not a saved result or public DTO.
3. Close the read TX; allocate the correct native prepared handle outside it.
   Hold uses `prepareServiceCommerceBookingHold`; confirm uses
   `prepareServiceCommerceBookingConfirmation`; all six revisions use
   `prepareServiceCommerceBookingRevision`. A fresh server clock is used at final
   native execution; neither client time nor inspection time replaces it.
4. In a new caller-owned authorized Serializable TX, repeat ownership and
   proof-first recovery before consuming the handle. Match fresh server
   actor/Tenant/Store/chat/draft/revision, exact row fingerprint and prepared plan.
   Require current local approval and actual complete fresh re-review to equal
   the saved reviewed target. Contact/consent change alters review binding; native
   confirm additionally rechecks the exact inspected contact basis before using
   prepared ciphertext. No provider/crypto callback can fall back inside TX.
5. Atomic PENDING -> EXECUTING CAS includes scope/chat/action/version/revision,
   actual payload hash, original key, role snapshot, exact target, approval hash,
   exact expiresAt with current `gt` time, and `updatedAt`. Require count=1.
   Read the executing row; preserve its actual automatic new `updatedAt` for
   the completion CAS. Do not compare the old timestamp as if no update occurred.
6. Call only the correct native prepared transaction helper with the REQUIRED
   fresh server scope. This retains native financial -> Order -> booking/resource
   -> Job lock ordering, current native policy/work/availability, exact replay,
   audits, capability rotation and durable intent semantics. Review never obtains
   these SQL locks or executes mutations as a preview.
7. Strictly parse the returned compact effect and independently verify it with
   the exact historical native effect reader in the same TX. Complete the row by
   exact EXECUTING CAS using the executing fingerprint/updatedAt; save the compact
   receipt and decidedAt. Require count=1 and exact owned readback/native proof/
   receipt digest equality. Any error must roll back proposal claim, native
   effect, financial/work changes, capability changes and outbox intents together.

Returning a transaction-local effect is not permission to commit a partial
transaction. A serialization/deadlock retry uses the same opaque allocation and
saved original key; any new call first checks whether a prior attempt actually
committed. Caller-owned helpers never open a nested root transaction.

## 7. Notification side effects and post-commit truth

`lifecycle.ts` owns durable ServiceBookingNotificationIntent creation and dedup
keys. Hold has no customer notification. Confirm may create confirmation/reminder
intents only with current contact consent, policy and active authorizer. Cancel/
reschedule may cancel pending reminders and create their own native change
intents; arrive/start/complete/no-show retain native behavior. Do not infer a
notification just from operation name, create one in the composer, choose another
recipient or insert arbitrary channel text.

Keep returned `notificationDispatches:{actorUserId,intentId}[]` as a **private
post-commit sidecar**, separate from persisted/public receipt. Only after the
whole owning transaction commits may the outer owner enqueue those exact IDs
with Tenant/Store using existing
`enqueueServiceCommerceBookingNotificationDispatch`. Never enqueue/send during
inspection, preparation, canonical review, an uncommitted transaction or terminal
receipt lookup. An enqueue failure after commit must not label the booking effect
failed or trigger new booking execution.

Existing `scheduleDueServiceCommerceBookingReminderIntents` deliberately sweeps
all due PENDING confirmation/change/cancellation/reminder intents, despite its
historical name. The existing identifier-only worker claims under current native
authority/state/policy, then decrypts and sends; completion records SENT, which is
not delivered/read. Reuse that owning recovery path for persisted pending intents
without replaying a booking command to obtain dispatch IDs. No scheduler/provider
is invoked or activated by this source packet, and installed runtime scheduling
is not established by source inspection.

Public outcome remains the immutable booking effect plus
`notificationDelivery:'unverified'` where present. Saved/committed, outbox pending,
enqueued, provider sent and customer received are different facts. Native refund
consequences and stored booking payment status do not imply provider settlement.

## 8. Required isolated tests for the next actual code slice

Use actual native input/hash/review/preparation/command/effect functions and the
actual draft store/security helper over explicit predicate-aware local proposal
and booking delegates. Reuse current canonical inert booking fixtures; no module
mocks of authority/review/effects and no fake SQL rollback claims.

- All eight actions create exactly one compact attributed receipt; saved JSON
  reload equals actual native effect; all six lifecycle expected revisions and
  fixed identities survive. No raw tokens, contacts, ciphertext, command key,
  private review or dispatch IDs leak into client/model/persisted receipt.
- Forged/copied/serialized handle and different current actor/Tenant/Store/chat/
  draft/revision fail; changed target/role/key/action/version/payload/conversation
  invalidates local approval. Ordinary GENERAL token fallback fails.
- New pending execution fails with missing/rotated signing key, expired token,
  expired hold, changed source/config/capacity/payment/work/contact/consent/policy,
  revoked current grants, lost claim CAS or completion CAS, and readback mismatch.
  Crypto is demonstrably outside any active TX; no TX/delegate retained.
- Confirm preparation happens once per successful plan, tokens use native suffixes
  `:confirm` / `:manage`, confirmation default clientBookingId remains the original
  key, transaction retry uses the same handle, native command IDs do not drift.
- COMPLETED receipt + genuine native proof returns after key rotation/proposal
  expiry/runtime disable/source decline/later appointment/payment changes. Wrong
  actor/key/action/hash/origin/source/hold/event/refund/slot/receipt refuses; a
  related record or schema-valid client receipt never substitutes.
- Exact proof reconciles only the explicit approved recovery state set by full
  row CAS, without current-key/new-eligibility/token/crypto/native-command/provider
  work; missing proof remains unknown. Cancellation cannot overwrite an applied
  or uncertain effect. Clean draft cancellation is distinct from business cancel.
- Notification identifiers are available only as a private committed sidecar.
  Simulated post-commit enqueue failure preserves completed booking truth and
  exact outbox identity; terminal lookup never creates/sends/reschedules anything.
- Actual financial/booking/Job lock order and whole original Order completion
  remain native source assertions. Synthetic delegate tests are not PostgreSQL
  serialization, rollback, isolation, migration, provider or device acceptance.

## 9. Remaining integration and gates

This next composer is necessary but not the full G03 booking outcome. Remaining
work includes the actual protected GENERAL guarded entrypoint, public-safe review
and original/receipt projections, signed review delivery, complete shared action/
capability/history/tool registration, all declared clients and exact confirmation/
recovery journeys, role/privacy/client compatibility and connected acceptance.
The source store/input/composer must stay unexposed until their actual guarded
consumer exists; an unregistered historical payload remains unavailable through
ordinary generic history rather than gaining a permissive fallback.

No Prisma/schema/migration, DB/profile action, provider, queue, scheduler,
activation/restart, device/browser or model action is performed by this packet.
Root owns Brain/API/permission/task/coverage impact and final source reconciliation.
Full G03 remains full scope; phases4–12 stay active and 13/45 acceptance is not
advanced. G01 human pause, Paystack pause, D04 twelve UNSCHEDULED cases, E05
activation/restart refusal and G04/S05/C04 boundaries remain unchanged.
