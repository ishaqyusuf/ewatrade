# G03 durable Service Request disposition proposal

15 October 2026. **Reviewable design only; not implemented or accepted.** This
packet changes only this Markdown file. It does not change Prisma, generate a
client or migration, connect a database, run a command against a request, start
services, send a message, or schedule acceptance. Root owns Brain/checklist and
source ownership reconciliation. It adds no new human approval gate: existing
source ownership, database-target authority, explicit proposal confirmation and
connected-acceptance boundaries continue to apply.

## 1. Problem and scope

`packages/db/src/queries/service-public.ts:576–611` currently reads a request by
Tenant/id and updates status/response unconditionally, incrementing revision.
`apps/api/src/trpc/routers/service-access.ts:217–225` supplies a role ceiling and
Tenant but no actor/current Store. `apps/api/src/schemas/services.ts:362–369`
accepts requestId, response and target status without expected revision or stable
command identity. This cannot distinguish an uncertain duplicate from a new
response, protect a later Quote/booking/customer decision, or recover an immutable
disposition after another write.

The new schema-free `service-request-read.ts` supplies protected discovery and
exact generic originals. Those reads do **not** implement this command or expose
invented allowed transitions. G03 remains the full request → immutable versioned
Quote → booking → pickup/delivery journey, including appointments, Progressive
Catalog/access dependencies and separate clinical/customer decisions. This packet
only prepares the first disposition command within that journey.

ServiceRequest, CommerceInquiry and PrescriptionRequest stay separate aggregates
(ADR-0029, ADR-0030; `.brain/features/service-commerce.md`, Customer Request
Interoperability). No customer capability, conversation receipt or notification
intent is repurposed as a Service Request command journal.

## 2. What the existing sources establish, and what remains a source decision

| Evidence | Established rule | Remaining decision |
| --- | --- | --- |
| ADR-0012, Decision | A Service Request is unconfirmed intent; only accepted Quote/direct Intake creates an Order/work. | Disposition cannot create work, accept a Quote, take payment or mark fulfillment. |
| Existing disposition schema/function | The supported intents are `declined` and `needs_information`; response is trimmed, nonempty and at most 2000 characters at the API boundary. | The repository command currently lacks a state transition table. Its permissiveness is a defect, not an approved transition policy. |
| `customer-requests.tsx:128–153` | Existing UI offers Request information only for SUBMITTED. | Decide whether NEEDS_INFORMATION may receive a revised response as a new event. |
| Same UI `:155–183` | Decline is offered for any state except CONVERTED/DECLINED, including QUOTED and WITHDRAWN. | These UI predicates do not prove that declining a quoted/withdrawn request is domain-safe. |
| `service-commerce-sources.ts` serviceStates; service feature interoperability | WITHDRAWN and CONVERTED are distinct source states. Quote release owns QUOTED; accepted Quote owns conversion. | No generic response may overwrite customer withdrawal, accepted commercial state or a released version without an explicit source-owned rule. |
| ADR-0032 and current `serviceAccess.updateRequest` | Store team rules govern their named preparation/actions; the existing disposition route uses the Service Manager ceiling and has no attendant check. Maker/checker applies to Quote release. | Preserve the disposition ceiling; do not transplant booking/fulfillment attendant or quotation-approver authority, or copy a broad workspace `canOperate` check. |

Recommended initial implementation policy, **pending canonical source-owner
resolution**, is SUBMITTED → NEEDS_INFORMATION/DECLINED and NEEDS_INFORMATION →
DECLINED. A changed NEEDS_INFORMATION response may be a separate deliberate event
if the canonical policy permits it. QUOTED, CONVERTED, WITHDRAWN and DECLINED must
fail closed initially. There is no reopen action in this packet. A private DRAFT
Quote, outstanding approval, active booking/hold or released Quote must receive
an explicit source conflict/consequence rule before disposition is allowed; the
proposal does not silently revoke, supersede or cancel them.

These are implementation decisions to settle in ordinary canonical source review,
not a newly invented user permission ceremony. Until settled, ship reads and keep
disposition unsupported. Preserve the full G03 requirement in the checklist.

## 3. Proposed source-owned durable event model

Place alongside ServiceRequest in
`packages/db/prisma/models/service-operations.prisma`. This is proposed Prisma
text, **not an instruction to edit/apply schema now**:

```prisma
model ServiceRequestDispositionEvent {
  id                   String               @id @default(cuid())
  tenantId             String
  storeId              String
  requestId            String
  actorUserId          String
  actorMembershipId    String
  actorRoleSnapshot    MembershipRole
  accessModeSnapshot   StaffAccessMode
  accessRevision       Int
  clientCommandId      String               @db.VarChar(160)
  payloadHash          String               @db.Char(64)
  reviewDigest         String               @db.Char(64)
  fromRevision         Int
  toRevision           Int
  fromStatus           ServiceRequestStatus
  toStatus             ServiceRequestStatus
  previousResponse     String?              @db.Text
  response             String               @db.VarChar(2000)
  occurredAt           DateTime             @default(now())
  tenant               Tenant               @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  store                Store                @relation(fields: [storeId], references: [id], onDelete: Restrict)
  request              ServiceRequest       @relation(fields: [requestId], references: [id], onDelete: Cascade)

  @@unique([tenantId, clientCommandId])
  @@unique([requestId, toRevision])
  @@index([tenantId, storeId, requestId, occurredAt, id])
}
```

Add inverse `serviceRequestDispositionEvents ServiceRequestDispositionEvent[]`
to Tenant and Store, and `dispositionEvents ServiceRequestDispositionEvent[]`
to ServiceRequest. No User/Membership foreign-key relation is proposed: immutable
actor scalar snapshots follow existing Service event conventions and must not
create a new account-deletion blocker. Display a removed actor as unavailable;
never substitute the current operator. Existing privacy export/deletion inventory
must account for this concrete new response/actor dataset before any deployment;
the implementation owner must reconcile that dependency with the privacy owner.
Request deletion cascades the owned event; Store deletion is restricted while
owned request events remain. Retention/deletion behavior is part of source review,
not an authorization to delete existing data.

The canonical command validates `toStatus` is one of the two supported disposition
states, `toRevision === fromRevision + 1`, positive revisions, exact actor/scope
and response bounds. Existing status enums include other states for historical
`fromStatus`; their presence does not admit new target actions. Event rows are
append-only through this command; no edit/delete endpoint is added. The unique
request/revision key is an integrity constraint, not a substitute for row locks.
No historical event backfill is fabricated from current `staffResponse`.
`previousResponse` is the exact nullable pre-write value, not an empty-string
substitution. It uses Text because the legacy repository function has no length
guard of its own; only its API currently imposes 2000 characters. A legacy value
that cannot fit a complete safe review must refuse the command, never be clipped
or silently omitted. The new response remains 1..2000 after normalization.

## 4. Caller-owned canonical interfaces

Proposed NEW `packages/db/src/queries/service-request-disposition.ts` and tests;
reuse the current request reader/error family and exact generic source predicates:

```ts
type Scope = { tenantId: string; storeId: string; actorUserId: string }
type Intent = {
  requestId: string // nonempty, <=191; exact saved native Service source identity
  status: 'declined' | 'needs_information'
  response: string // trim; 1..2000
}

reviewServiceRequestDispositionInTransaction(tx, scope & Intent)
// -> { target: { id: requestId, revision: reviewDigest }, review: {
//      requestId, expectedRevision, fromStatus, toStatus, response,
//      customer: {name,phone,email}, source/Quote/booking consequence facts,
//      current actor/Store/access and applicable source-policy revision facts
//    } }

executeServiceRequestDispositionInTransaction(tx, scope & Intent & {
  expectedRevision: number
  expectedReviewRevision: string
  clientCommandId: string // 8..160, stable across uncertain retries
})
// -> { eventId, requestId, fromRevision, toRevision, status, response,
//      occurredAt, replayed }

readServiceRequestDispositionOriginalInTransaction(tx, scope & {
  requestId: string; eventId: string
})
// -> safe full saved event/response plus separately labelled current request

authorizeServiceRequestDispositionRecoveryInTransaction(tx, scope & {
  requestId: string; eventId: string
})
// -> void; fresh authority + exact event/source scope, no command re-execution
```

The first read binds current source revision, current canonical
CommerceQuote/source/version/approval facts, relevant bookings/holds and exact
response. It uses read-only policy checks without creating policy audit/notification
side effects. Actor, Tenant, Store and permission snapshots are server-owned;
clients cannot submit them as authority. Customer contact may be disclosed for
review but cannot be overridden by this command. Raw public tokens, capability
digests, provider keys and clinical media never enter the DTO/review/model.

## 5. Authority, lock and transaction semantics

1. The root wrapper uses a caller-owned Serializable transaction with maxWait
   10 seconds and timeout 30 seconds, matching existing commercial command limits.
   It must support composition with GENERAL proposal result persistence. Never
   cast a transaction client to PrismaClient or start an independent nested commit.
2. Reload active persisted Tenant/membership/current Store and scoped Store
   access. Preserve existing Owner/Admin/explicit LEGACY Manager ceiling until
   a source-owned broader action grant is actually implemented. Resolve the
   disposition authorizer from the existing route ceiling; do not add attendant,
   Quote-approver or booking gates by analogy. Any newly required source-specific
   policy needs explicit source review and its own revision fence. Do not admit Cashier/Operator just because
   `getServiceCommerceWorkspaceAccess().access.canOperate` includes them. Quote
   approver status is not disposition authority. Clinical sources are refused.
3. Acquire the actual authority and applicable policy fences before mutation. Lock the exact generic
   ServiceRequest row and re-read it in Tenant+Store scope. All competing Quote,
   booking and disposition paths must follow their verified common source/Quote/
   financial-Order lock order; extract a shared lock seam rather than prescribing
   an unverified reversed order. Request lock alone is insufficient if existing
   issuance/booking does not participate in it. Audit those dependencies before
   claiming concurrency safety.
4. Look up the durable event by Tenant/clientCommandId **before** demanding that
   the mutable request still has the pre-write revision. After fresh authority,
   same canonical intent/hash and same owning actor/request/Store return the
   original event. Changed scope, expected revision, response or target status
   refuses. Never reconstruct a receipt by rerunning the accepted transition.
5. For a new key, validate explicit state/consequence policy, expected revision
   and current review digest under locks. Update with a conditional predicate
   `{id,tenantId,storeId,revision,status}`; require count exactly one. Increment
   revision once, set response/status, append one event containing exact before/
   after facts, and persist any assistant receipt in the **same transaction**.
6. A SHA256 canonical payload hash binds normalized intent, expected source
   revision and original actor/Tenant/Store. The review digest additionally binds
   current source/consequence and authority facts. Do not hash a bearer approval
   token or generate a fresh command ID during retry. The journal stores both
   hashes; replay compares the immutable payload/event and checks current access,
   without requiring a now-obsolete live review digest after success.
7. A unique-key race must rollback the losing transaction and reload the saved
   event in a fresh bounded transaction with authority and payload comparison.
   Retry only recognized serialization/deadlock/unique-key races with a fixed small
   attempt budget; never retry arbitrary failures as a new operation. Different
   commands for the same revision cannot both pass the conditional source update.
8. Persisting a response is not a send, quotation release, booking cancellation,
   refund or fulfillment action. No enqueue/provider/app-launch branch belongs in
   this command. If future source rules require customer-visible conversation
   effects, define their atomic durable intent and separately authorized dispatch
   semantics explicitly; do not bolt a send onto this packet.

## 6. Existing native command and client migration

The existing `serviceAccess.updateRequest` route must become a strict wrapper over
the shared canonical command, deriving actor and selected current Store from fresh
server context. Its input adds expectedRevision, expectedReviewRevision and
clientCommandId. Do not leave a branch that accepts their absence and executes
the old unconditional update. Preserve a wrapper name only for compatibility of
the procedure path, not compatibility of the unsafe payload.

The existing dashboard form consumer is
`apps/dashboard/src/components/service-work/customer-requests.tsx`; no other
direct command caller was found in the inspected source. Migrate it in the same
source release: use protected current request originals/review, edit the exact
response, show state/customer/consequences, then explicitly confirm. Capture one
command ID plus payload at review and retain them after uncertain responses.
Show “Retry same action” and reconcile its exact event; never reset to a new key
or silently apply a stock response to an old list row. During mixed deployment,
old clients fail validation with a clear refresh requirement. Deploy schema and
compatible server/client artifacts in their established rollout order; no bypass
of the stricter command is retained for an outdated UI.

Proposed strict GENERAL action is
`{action:'service_request_disposition',requestId,status,response}`. The server
preparation owns expected revision/review binding; proposal idempotencyKey is the
domain command key. Draft editing triggers new canonical review and a new signed
approval revision. The model cannot call the executor or manufacture authorization.
Review states that a response is being recorded, whether/where it is customer
visible under actual source behavior, and that nothing is sent automatically.

Receipt proposal is a dedicated strict union member
`{kind:'service_request_disposition',recordId:eventId,requestId,title,detail}`;
original target is `{kind:'service_request_disposition',requestId,eventId}` with
origin `{tenantId,storeId}` where the navigation protocol uses origin. It opens
the exact immutable event and full response; current request data is separate.
The mutable request original remains `{kind:'service_request',requestId,origin}`.
No related Order, current request status or latest event substitutes for the
recorded event. Saved completed GENERAL recovery calls fresh event authorization
and returns `executedResult`; it does not re-run review/execute.

The eventual native response editor requires fixed request identity, full bounded
response editing, fresh protected context, access/target remount, synchronous
latest-field references and parent action-lock handling. Save edits only the
proposal; explicit final confirmation remains separate. Exact event/original
screens preserve Back to the saved report/chat and hide stale private content and
row callbacks on current-authority loss. Claude UI ownership and existing Workshop
requirements remain in effect; this proposal does not authorize UI edits by this
child.

## 7. Independent test and acceptance packet

| Layer | Required evidence |
| --- | --- |
| Pure contracts/state policy | Strict extra-field rejection; two supported target statuses; response 1/2000 boundaries; explicit transition matrix and private/released Quote/approval/booking consequences; no invented reopen/customer decision. |
| Actual canonical tx stand-ins | Active/current authority and explicit legacy ceiling; suspended/foreign/scoped/clinical refusal; source/Quote/Order/booking identity checks; revision/digest mismatch; conditional update and one event; full response; no provider/notification writes; query/lock order observations. |
| Durable replay/recovery | Exact duplicate returns original event after later request changes; changed key intent/actor/Store/revision refuses; current revoked access refuses replay; receipt recovery reads event without mutation/review rerun; malformed event/source linkage fails closed. |
| Wrapper and GENERAL integration | Strict new native input required; exact actor/current Store and tx composition/options; error mapping; parent signed review edit/stale/cancel/explicit confirmation; proposal+event+request all rollback together; saved result is safe and exact. |
| Native/dashboard source components | Actual editor queued field → Save payload; current/refused/paused/remounted context; original event vs current request distinction; exact event route, full response, uncertain-attempt identity, Back stack. Fixtures do not claim device/browser acceptance. |
| Connected concurrency/rollback, only under existing authorized target packet | Same key simultaneously yields one event/revision effect; different keys at one revision conflict; racing Quote release/booking/customer withdrawal respects shared locks/policy; forced failure after each write leaves no request/event/proposal partial state; declared synthetic fixtures and cleanup; zero provider enqueue/send. |

Do not count inert transaction stand-ins as PostgreSQL locking, rollback,
concurrency, deployed schema or device proof. Connected runners remain unscheduled
until their existing authorization/target prerequisites are satisfied; there is no
automatic retry or alternate-target substitution in this document.

## 8. Source ownership and database actions

Proposed narrow source packet ownership:

- Canonical owner: new disposition query/test; controlled replacement of
  `service-public.ts` wrapper; shared source/Quote/booking lock and state-policy
  extraction only after those dependencies are explicitly coordinated.
- Schema owner: additive model/inverses, generated client and privacy inventory
  integration; no hand-authored migration SQL.
- Root integration: DB exports, strict API schemas/router, explicit scoped
  procedure policy admission, GENERAL adapter/contracts/tools/receipt recovery,
  planned manifest and source tests/impact/checklist/Brain.
- UI owner: migrated dashboard consumer plus native response/original surfaces.
  Preserve existing source snapshots and avoid overlapping frozen G05 paths.

The repository defines both root `db:migrate` and `db:push`. If/when an actual
authorized schema implementation occurs, AGENTS requires **both** root commands
after the Prisma edit. The current scripts delegate to
`../local-infra-kit/bin/db.ts` with `--profile ewatrade`; package-local Prisma
commands are not an equivalent target-authority workflow.

For a separately verified and authorized local target, the command shapes are:

```sh
bun db:migrate --local -- --name service_request_disposition_events
bun db:push --local
bun db:generate
```

These are examples of the exact root entrypoints, **not runnable authorization**.
The current root local wrapper starts configured local services for migrate/push
(`shouldStartLocalServices`), so `--local` is not inherently inert or a way around
the existing runtime boundary. A chosen Development/Preview mode instead needs
the already-authorized exact profile/database target and its verified migration
ledger; do not assume the historical isolated assistant database or shared profile
is approved for this new change. Production is outside this packet. Do not use
`--prod`, reset/data-loss/force flags, edit another profile, create a fresh target
as a workaround, manually write migration files or start/restart services here.

Before an eventual authorized run, reconcile all concurrent schema changes and
capture the selected target fingerprint without exposing credentials, reviewed
schema/migration hashes, baseline/diff and service startup consequences. A drift
or fingerprint refusal remains a refusal. Inspect Prisma-generated migration,
required migrate/push terminal results and client generation separately; none
implies rollout or acceptance. Source-only design/pure tests may continue now;
this child has run none of those database/profile actions.

G01 human QA pause, Paystack pause, D04 conditional fingerprint boundary, E05
activation/restart rejection, G04 deferred connected sections and S05 unscheduled
retry remain unchanged. Full G03 remains open. Brain documentation impact belongs
to root's consolidated proposal/schema/API/feature/task reconciliation.

## 9. Concrete schema/command review addendum — 15 October 2026

The fragment in section 3 is the minimal candidate event migration, not a
compiled schema. Existing `ServiceRequest` already owns revision/status/response;
its `currentQuoteId` points to **legacy ServiceQuote**, not CommerceQuote. New
review must locate CommerceQuote by `(tenantId, sourceType=SERVICE_REQUEST,
sourceId=requestId)` and verify its Store, all relevant versions and approvals.
It must not use the legacy relation as proof that there is no modern Quote.

Candidate model edits are limited to the additive event and three inverses:

```prisma
// Append inside the existing Tenant and Store models, respectively:
serviceRequestDispositionEvents ServiceRequestDispositionEvent[]

// Append inside the existing ServiceRequest model:
dispositionEvents ServiceRequestDispositionEvent[]
```

The repeated inverse line means one line in **each** model, not two identical
fields in one model. Existing global Request `id` is the FK target in section 3.
The proposed FK alone does not enforce event Tenant/Store equals Request
Tenant/Store: canonical scope predicates and post-lock rereads are mandatory.
If a composite FK is required as a stronger database invariant, the schema owner
must additionally propose `@@unique([tenantId, storeId, id])` on ServiceRequest
and change its event relation to reference that exact tuple. Do not claim that
constraint already exists or insert it into a hand-written migration.

The proposed command uses the shared native Service Commerce source-reference
191-character identity boundary. Current assistant Request original/page targets
use 128 characters, while the old disposition API only requires a nonempty ID.
That is a real client/read contract migration seam: explicitly reconcile those
targets and readers before promising command→saved-original parity. Do not trim,
truncate or reject a valid native191 identity through an incidental narrower
GENERAL schema. This proposal does not itself edit any of those contracts.

The immutable payload hash binds schema version, original actor/Tenant/Store,
request ID, expected pre-write revision, normalized target status and response.
The event binds both previous response and resulting response, state/revision
pair and review digest. `previousResponse` is protected original/audit content;
model-safe receipts expose event identity, state/revisions and outcome, not a
second copy of customer contact or unrestricted response history. The exact
protected event reader may return both responses under current authority.
Event redaction/retention must be an explicit privacy processor: changing a
historical body cannot silently invalidate command replay or make an erased
record appear to have had no response. Retain approved nonidentifying command
integrity separately from protected body disposition; no period is selected here.

### Acceptance and disposition must share a real concurrency protocol

Current `acceptServiceQuote` in `service-public.ts:794–918` opens a transaction
without the native Quote helper's explicit Serializable options. It reads the
Request at about line 844 without status/revision locking, creates Order/work,
records Quote acceptance, then updates Request by **id only** to CONVERTED at
about line 902. A concurrent decline can therefore be overwritten, or an Order
can be created for a Request that has just become ineligible. Adding a lock only
to the new disposition writer cannot fix a nonparticipating acceptance writer.

Before release, coordinate these actual paths as one owned source dependency:

| Existing path | Required evidence before claiming the new command safe |
| --- | --- |
| `service-public.ts:acceptServiceQuote` | New acceptance rechecks allowed source status/revision and exact Quote target under the agreed source protocol, then source CAS and Order/work/acceptance commit together. Exact successful replay still returns its original Order/Job before imposing new-action lifecycle gates. |
| `commerce-quotes.ts` Service source `load`/`recordIssued`, issue/revise and approval | Private preparation, release and source QUOTED revision participate in the same conflict protocol; a failed source CAS rolls the entire release back. No implicit cancel/supersede side effect is added to disposition. |
| `service-commerce-bookings/shared.ts:assertBookingSource`, lifecycle hold/confirm/revise | Source eligibility and reservation creation cannot race past a disposition conflict check. A pure availability page is live/unreserved and does not establish that protection. |
| Customer withdrawal, if/when exposed | Find every real source status writer and include it; do not invent a withdrawal API or treat the enum as proof a canonical writer exists. |

The exact combined lock order is **not decided** by this document. The existing
financial helper locks Book/customer account before Order; acceptance may create
an Order not yet available to lock. The implementation owner must document the
actual lock graph for source, Quote/Version, booking resource and financial
context, coordinate every participant, then prove no reversed acquisition.
Do not prescribe “Request first everywhere” or “Order first everywhere” without
that audit. A status+revision CAS is still necessary under the agreed locks.

Add connected races to section 7: decline versus new customer acceptance;
request-information versus acceptance; decline versus private Quote preparation,
release/approval and hold/booking confirmation; same command versus same command;
different commands at one revision. Force failures after source CAS, event append,
Order/work creation, Quote acceptance and GENERAL receipt. Observe actual commit/
rollback, original identities and one-time revisions on an explicitly authorized
target; the existing stand-ins prove none of those database properties.

### Privacy, retention and export ownership

The new actor/response dataset must extend the existing
[commercial inventory](../../../db/src/queries/account-privacy-commercial-inventory.ts),
[completion contradiction checks](../../../db/src/queries/account-privacy-completion.ts),
[commercial retention processor](../../../db/src/queries/account-privacy-commercial-retention.ts)
and [record-retention assessment](../../../db/src/queries/account-privacy-record-retention.ts).
Those processors currently treat unsupported Service/contact facts as review
blockers; do not classify a new nonzero event family as “not applicable.” Include
actor and related subject/contact candidates, preserving the rule that a contact
match is a review candidate, not proof of ownership or erasure authority.
Any subject data export needs an exact bounded event projection; the existing
[assistant private export](../../../db/src/queries/assistant-private-export.ts)
owns assistant data and cannot stand in for export of a new domain journal.
See [privacy schema/retention boundary](../../../../.brain/database/account-privacy.md).

### Decisions and actual authorization still required

1. **Product/source policy:** may NEEDS_INFORMATION receive an amended response,
   and may quoted Requests ever be declined? If so, define the explicit Quote/
   approval/booking consequences; until then those unresolved edges refuse. This
   is a product decision, not permission to overwrite them.
2. **Existing privacy/controller process:** decide retention/redaction/export
   handling for previous and new responses and actor attribution. No arbitrary
   retention duration or automatic erasure is selected.
3. **Existing database-action gate:** name and authorize the exact local or
   nonproduction target, profile/fingerprint, concurrent-schema baseline and
   service-start consequences before any Prisma edit requiring migrate/push.
   Root commands and generated migrations remain mandatory; currently no such
   target authorization is supplied by this packet.

Routine model naming, source ownership, predicate tests and consistent lock-graph
implementation can be resolved by the implementation reviewers. They do not
require repeated human approval. Schema/command/client work is not completed by
these fragments; full G03 and all previous acceptance gates remain open.
