# Booking review transport: security and engineering protocol

15 October 2026. Independent source/design review of
`2026-10-15-booking-public-review-transport.md`. This file is a proposal, not an
endpoint, cryptographic implementation, rollout change or acceptance result.
All existing approval gates and **13/45** remain unchanged. There is no new human
waiting period or approver. The eventual application still requires explicit
Confirm after complete review and acknowledgement.

## Decision and precise security claim

Use a **sequential, authenticated-encrypted stateless checkpoint with exact-step
idempotent retry** as the schema-free implementation default. Every begin, page
and completion request must use actual fresh GENERAL authentication and a fresh
read of the same persisted pending draft and full canonical review. Checkpoints
bind this private authority and semantic packet; they never replace it.

This prevents invented indices, advancing without a preceding server-issued
checkpoint, cross-scope use and mixing different packets. It does **not** make a
checkpoint single-use, prevent a holder from forking/replaying a valid step, prove
that an HTTP body reached its receiver, prove client decoding/rendering, or prove
human reading. Encryption cannot establish those facts. Exact-step replay returns
the same semantic page/progress and creates no domain effect. Replayed completion
may return the same existing localV1 approval token while all fresh checks still
pass. The later native/proposal CAS and original command identity enforce the
existing effect semantics; pages do not execute anything.

Strict once-only progress is not an existing product requirement. It would need
an owned, atomic durable review-session journal and its retention/cleanup policy;
a process-local map is not that journal. No schema change or new approval delay
is necessary for the default above. Never describe it as consumed-page proof.

## What the existing source actually provides

- `general-quote-issue-review-pages.ts` budgets before projection/serialization,
  preserves complete facts, uses surrogate-safe fragments, measures the installed
  SuperJSON/tRPC single-result envelope plus 4,096 bytes reserve, and checks a
  separately trusted manifest on assembly. Its plain SHA-256 packet/page IDs are
  not signatures. Its DTO **contains actor/Tenant/Store, payload hash and private
  target**, so it must not be exposed as the booking public DTO.
- That constructor materializes the complete stable JSON string and every page
  before returning. It establishes neither streaming nor bounded peak memory.
  `general-quote-issue-review-store.ts` recomputes the actual current parent on
  every request and rechecks expiry after construction; reuse that freshness
  discipline. Do not import its identity bounds or private DTO by assertion.
- `general-booking-draft-contract.ts` issues the existing
  `GENERAL_BOOKING_DRAFT_V1` local approval token through `proposalApprovalToken`.
  It binds action/version, exact payload hash, private target, role, conversation,
  original command key, row scope/revision/expiry. It does not bind transport
  progress. Existing create/edit return compact references; full read is private.
- `booking-command-review.ts` binds the full native command and review. Its only
  observation exclusions are top-level `asOf` and the named generated hold
  preview `details.effects.observedExpiresAt`. Saved hold expiry, policy dates,
  actual milestones and all other semantic dates remain bound.
- `general-booking-decision.ts` already closes inspection TX, prepares local
  token/cipher data outside TX, then runs a second fresh owning transaction.
  Exact historical effect recovery and cancellation precede new preparation.
  Page transport must not be inserted into that historical recovery path.

## Exact public and private documents

The projection owner should return one SERVER-ONLY result from one actual full
read: an allowlisted safe semantic DTO, separately labelled fresh observations,
and the minimal private canonical target/signature/row basis needed by this
owner. Do not read the full parent twice or return this wrapper to the client.

The canonical fragmented **public semantic document** contains projection/format
versions, exact action/draft/revision and all approved business/effect facts,
complete line/change/obligation facts and coverage counts. It contains no private
actor/grant/team identity, contact/name/digest, reservation belonging to someone
else, command key/hash, payload hash, canonical target digest, ciphertext,
capability or arbitrary private row. Construct every field explicitly; validate
exact native identities, Decimal strings, safe integer amounts and UTC dates.
Unsupported complete facts mean complete review unavailable, never clipping.

Put `asOf` and generated hold-preview observed expiry in a separate `observations`
object, outside fragmented semantic bytes/content identity. These may change on
every response and must be labelled observations. Otherwise fresh recomputation
changes every packet even when the native semantic target is unchanged. Do not
freeze and relabel an old observation as current, recursively drop dates, remove
saved hold expiry, or substitute observations into signed business facts.

Public integrity SHA-256 values may describe only this already allowlisted safe
document/fragments. They are not copies, truncations or aliases of private target,
payload, contact or authority hashes. Public `reviewRef` is fresh random 32-byte
base64url data, not an encoded native ID or private digest. Response logs and
analytics must redact checkpoint/approval strings and never receive the private
wrapper. Responses use `Cache-Control: no-store`; checkpoint/approval values stay
out of URLs, ordinary model output and persisted chat/history receipts.

Use one explicit private binding document, canonically serialized **after** safe
data admission/budget, containing:

1. Protocol/projection/fragmentation versions and current signing-key generation.
2. Actual actor/Tenant/Store, exact conversation/draft/revision, and current
   canonical role/access/policy/source facts through the complete private target.
3. Full saved-row fingerprint, localV1 signature basis and stored approval-token
   hash; original command identity and payload identity remain private and bound.
4. Safe semantic document digest/byte count, all section counts, ordered page
   descriptor digest/page count and random `reviewRef`.
5. Draft expiry and transport expiry. Default transport expiry is the existing
   draft expiry (currently 15 minutes after create/edit), not a new shorter human
   deadline. Begin/retry never extends it. Edit uses the existing renewal rules.

A domain-separated keyed digest of this private document can be the fixed-size
`binding` inside the encrypted checkpoint; no scope strings need be copied into
the token. On every step, recompute that binding from the actual fresh read and
compare fixed-length bytes safely. Missing/defaulted/private facts cannot be
accepted merely because an allowlisted public projection looks unchanged.

## Cryptographic construction and key rotation

Reuse the **Node crypto primitives and envelope discipline**, not an existing
business custody function or key namespace. `staff-invitation-custody.ts` is the
stronger local example: AES-256-GCM, random 12-byte IV, 16-byte authentication tag,
explicit AAD, exact envelope component count, canonical base64url and size checks.
`play-refund-review-token.ts` demonstrates purpose separation but its split and
decoder permissiveness should not be copied. Neither module provides a generic
booking checkpoint API. Communications recipient encryption has another purpose.

A source-implementable default needs no additional configured secret: derive a
32-byte checkpoint AEAD key with HMAC-SHA-256 using the existing **server-only**
approval signing secret as key and the fixed UTF-8 label
`ewatrade:assistant:booking-review-checkpoint:key:v1` as message. Use a different
fixed label for the private-binding HMAC. This is deliberate cryptographic domain
separation; do not use the literal signing secret bytes as an AES key, truncate
them, use a public hash as key, reuse a nonce, or use the checkpoint as an ordinary
approval token. This assumes the existing signing secret is an actual secret
with suitable entropy; a 32-character length check alone does not prove entropy.
A dedicated configured random key is an alternative if the configuration owner
prefers separation; this proposal does not create or rotate real configuration.

Recommended envelope: `bkr1.<iv>.<tag>.<ciphertext>` with AAD exactly
`ewatrade:assistant:booking-review-checkpoint:v1`. Encrypt strict plain JSON state:
`{v,reviewRef,binding,nextIndex,pageCount,expiresAt}`. Check protocol, exact keys,
types, integer bounds, expiry and actual scope/private binding after AEAD opens.
The checkpoint is never itself authority. Use a new random IV for every seal;
capture the current secret locally for an operation and refuse if its generation
changes before emission. Rotating the approval secret invalidates unfinished
transport and old localV1 pending signatures according to existing rules. Do not
silently resign a saved pending draft under the new key. Historical exact-effect
recovery continues without transport and without a new approval key proof.

Cap token ASCII length at 2,048 before decoding, cap decoded plaintext at 1,024
bytes, reject extra envelope segments/noncanonical base64url, require exact IV
and tag lengths and authenticate before JSON/schema parsing. State contains only
bounded digests/random reference/counters, not variable-length private facts;
assert sealed size in tests. Padding is optional if stronger ciphertext-length
uniformity is required; there is no claim that encryption hides total page/count
metadata already deliberately public. Use the same safe unavailable response for
bad tag, wrong key, expired, foreign scope and stale binding. Never echo crypto
exceptions, private binding, native target or supplied token.

## Sequential protocol

New transport schemas are strict scalar records. They do not extend existing
confirmation input with a manifest/page array. Native IDs retain exact 1..191
support and conversation IDs the actual exact 1..128 contract; no trim/retarget.

| Operation | Strict request | Returned safe data |
| --- | --- | --- |
| Begin | `{conversationId,draftRef,revision}` | Manifest with safe summary/counts, safe document digest/bytes, ordered safe page descriptors, random reviewRef, labelled observations, checkpoint for nextIndex 0. No approval. |
| Page | `{conversationId,draftRef,revision,reviewRef,index,checkpoint}` | Exact semantic fragment at that index, safe fragment checksum/byte count and packet reference, observations, checkpoint for index+1. No approval. |
| Complete | `{conversationId,draftRef,revision,reviewRef,finalCheckpoint,acknowledged:true}` | Exact draft/revision and existing localV1 approval token, only after all checks below. No private wrapper/target or native effect. |

For every operation, admit raw bytes and strict scalar data before expensive
work. Authenticate the request; enter the actual `inFreshGeneralTransaction`,
`requireGeneralScope`, exact linked-conversation restriction and current private
pending-draft read. Use actual native read authority, current parent and current
signature, not a synthetic Session or unsigned client manifest. Key/checkpoint
authentication can cheaply reject invalid requests before full parent reads but
must not return data or waive fresh checks. Use existing CSRF/origin/session
transport controls; possession of an encrypted checkpoint adds no exemption.

For Page, require authenticated `reviewRef`, exact private binding, exact public
packet reconstruction and `index === checkpoint.nextIndex < pageCount`. The
client supplies neither page offset nor replacement descriptors. Compute the
exact bounded response before returning checkpoint N+1. A checkpoint at N cannot
request N+1 directly; a checkpoint from another begin/draft/role/Store/revision or
projection cannot splice in. Repeating checkpoint N may return page N again and
a freshly sealed equivalent N+1 checkpoint. This is intentional retry, not proof
that N was consumed. A fork of N is harmless equivalent transport while fresh
binding is unchanged. There is no checkpoint that represents a server-claimed
one-time event.

For Complete, require nextIndex equal to exact pageCount and the complete fresh
binding plus acknowledgement. Recompute full safe semantic identity and complete
counts; verify saved row signature, exact current target/role and final expiry
after costly work. Release `generalBookingDraftApprovalToken` of that exact
existing row/key, and require its digest still equals stored approvalTokenHash.
Never allocate a new command key/revision, expose a private native proof, modify
proposal fields to record progress, or replace localV1 with a page token. Repeat
completion is read-only and returns the same approval value while valid.

The app must independently verify every descriptor, index, checksum, UTF-8 byte
count, full content digest, parse/schema, identity and all section totals before
showing Confirm. An unauthenticated/client-invented manifest is not trusted.
Keep acknowledgement separate from fetch progress. Mount/scope/edit/read-generation
changes retire callbacks and hide old facts synchronously; incomplete/error/abort
states cannot leave a retained Confirm handler active. Completion does not attest
human reading, even for a client that explicitly sends `acknowledged:true`.

## Bytes, memory, backpressure and lifecycle obligations

The following are required implementation proofs, not established by this prose:

- **Incoming:** choose 8,192 actual raw bytes for these scalar transport requests,
  including the complete strict single-operation JSON envelope. This leaves
  measured headroom for worst-case escaped native IDs and the bounded token.
  Match parsed budget to that cap and verify exact maximum legal inputs fit; do
  not shrink ID bounds to make a 4 KiB legacy helper fit. Bound before JSON.parse,
  count incoming chunks (Content-Length is only an early hint), fatal-decode UTF-8,
  reject compressed content, extra/batch/meta envelopes and alternate framing.
  Reuse the actual bounded body-reader mechanics with booking-safe error copy,
  not its Quote endpoint assumptions. Request abort/source error cancels reading
  without waiting on an unresponsive producer. No URL/query-string checkpoint.
- **Outgoing:** each actual serialized response body, including checkpoint,
  observations, installed SuperJSON/tRPC envelope, one-result batch brackets if
  the adapter uses them, and 4,096-byte reserve must fit 1 MiB **before emission**.
  The eventual route must refuse multi-operation batches: individually bounded
  results can otherwise exceed the aggregate body limit. Reject batch=true,
  comma-separated paths, array inputs and adapter-specific alternate batch forms;
  do not rely on a helper's hypothetical one-result serialization as route proof.
  No private response fields may be appended after the measured envelope. Errors
  are small fixed safe DTOs; no raw native error/stack/partial body is streamed.
- **Fragments:** deterministic JSON/UTF-8 serialization is bounded after safe-data
  admission; named clock exclusions are exact. Retain all facts, including a row
  spanning fragments. Cut only between Unicode scalar pairs, measure actual JSON
  escaping, and size/reduce each fragment until its exact whole envelope fits.
  Count the whole manifest too; if descriptors/counts cannot fit, refuse the
  entire packet without approval. Never clip rows or page descriptors.
- **Memory:** canonical 64 MiB logical admission happens after the DB graph is
  materialized. It is not a DB-query, RAM, CPU, timeout or HTTP bound. Existing
  Quote code additionally builds full strings/page arrays; copying it would keep
  that limitation. Prefer deterministic incremental digest/fragment traversal:
  first pass computes all bounded descriptors/digest; second emits only the
  requested page, retaining one fragment and bounded manifest metadata. Do not
  make a second canonical DB review within the transaction to do that second
  pure traversal. Explicitly account for safe DTO/native graph plus traversal,
  fragments and envelope buffers. This still is not a hard process memory bound.
- **Backpressure:** return one measured buffered page per request. Do not stream
  later checkpoints before the page body or push all pages through one response.
  On the client allow one owned page request at a time, validate before advancing,
  do not prefetch an unbounded page array, and virtualize complete retained work.
  Retained full client document/JSON assembly also needs measured resource limits
  or an incremental/file-backed assembler. If supported complete work cannot be
  held or rendered safely, explicitly refuse approval; never show partial facts
  as complete. No source fixture is a mobile peak-memory measurement.
- **Abort/timeout:** cancel incoming/outgoing work promptly where supported and
  check cancellation/expiry around expensive pure traversal. Prisma reads are
  not assumed cancellable. A timed-out/aborted read cannot issue a later token or
  update UI through a stale callback. Existing owning transaction budgets remain;
  no automatic unbounded retry or hidden expiry extension is introduced.

All fresh DB reads belong to one owning transaction per transport operation.
Construct and measure the complete response before transaction success; recheck
clock/row expiry after construction and before exposing any checkpoint/approval.
Do not send response headers/body from inside a transaction callback. A failed
transaction returns no response/token. Retrying a page after a lost response is
idempotent. Lost completion response can repeat Complete under fresh unchanged
facts. A changed target/key/row/permission restarts review, never adopts old
progress. Fresh transactions are point-in-time evidence, not a promise facts
cannot change immediately after commit. Final explicit Confirm still performs
the existing two fresh booking decision transactions and fails on drift.

No domain write, outbox enqueue, booking token/cipher preparation or notification
occurs in begin/page/complete. There is no page-progress write to roll back. The
eventual Confirm still owns native effects plus exact proposal receipt in one
Serializable transaction; real SQL rollback/concurrency remains separate required
acceptance. Uncertain/terminal commands reconcile original native proof before
new transport, signing, expiry, readiness or token preparation. Do not require
new pages merely to view/recover an already recorded result or cancel a leftover
proposal. Proposal cancellation remains distinct from booking cancellation.

## Implementation ownership and concrete verification

Source can proceed without a new human decision under the defaults above:

1. Projection owner (STATUS) freezes explicit strict safe DTO and minimal private
   wrapper from the same actual canonical read; independent privacy/full-fact
   review follows. It must not import this transport helper or expose localV1.
2. New transport module owner implements pure safe packet construction and compact
   AEAD checkpoint functions/tests, without extracting/editing Quote code until
   its current owner releases those paths. New server composition owns fresh
   begin/page/complete with explicit linked-chat checks and no model registration.
3. Root owns actual authenticated HTTP/tRPC registration, raw single-body/batch
   admission, client/action/rollout checks, no-store/error handling, app-only token
   projection, later explicit decision composition and postcommit dispatch.
   Domain/transport helpers cannot claim these caller duties are installed.
4. Native/dashboard owners implement complete assembly/acknowledgement and retained
   handler fencing; original routes keep their independent current guards.

Required inert evidence: all eight actual native actions through actual draft and
parent; 2,001+ work lines and every nested whole-Order obligation; no private
sentinels; native 191-ID/opaque conversation boundaries; empty versus unknown;
all facts survive assembly; last-line semantic change invalidates old progress;
only two named observation changes preserve semantic identity. Crypto tests cover
bad key/tag/nonce/extra segment/noncanonical encoding/length limits, forged token,
wrong scope/chat, skip/index/reorder/splice/fork and intentional idempotent replay.
Fresh tests cover Session/privacy/legal/currentStore/grant/role/source/contact/
capacity/policy/nested fulfillment/expiry/key drift on **every** operation and
completion after expensive construction. Verify no localV1 before terminal
transport, no native effects/provider/queue, unchanged historical recovery, and
later explicit Confirm still re-reviews and CASes. Actual body/adapter tests must
compare emitted UTF-8 bytes at cap±1, astral/lone-surrogate/control/escaped strings,
1 MiB envelope and batch attacks, false Content-Length, truncated UTF-8, abort,
unresponsive cancellation and source error. Simulate a lost page/completion
response; no out-of-order retry may invent forward progress.

Genuine remaining engineering prerequisites are ownership of new transport/route
and app controllers, exact safe projection review, crypto/key-operation review,
real adapter integration and measured complete-work resource behavior. These are
work to implement/test, not new user permission prompts. If complete source depth
cannot meet existing transaction/device resources, report the measured limitation
and propose a source-owned durable snapshot/streaming design; do not silently
reduce native scope. Strict durable once-only consumption, cross-device durable
progress or a different private-data exposure policy would be new product/schema
choices only if explicitly requested. Actual schema changes still need the
existing authorized target and db:migrate/db:push gates. Clinical/Inquiry expansion,
provider/DB/device runs, activation and parent acceptance remain unauthorized here.

## Inspected evidence and limits

Read-only source review; no production edits, tests, crypto operations, compiler,
DB/provider/network/browser/device runs for this packet. No empirical byte or
memory result is claimed. Root owns Brain/task/evaluation consolidation.

| Source | SHA-256 |
| --- | --- |
| `2026-10-15-booking-public-review-transport.md` | `a67cdc85340e85c74e97097491d6cbef5cbc21bab7badf34d7970de0dbb723d3` |
| `apps/api/src/assistant/general-quote-issue-review-pages.ts` | `9dc9b42f0372869086011c6954216351b943a71207e485375616e8402b35e4a9` |
| `apps/api/src/assistant/general-quote-issue-review-store.ts` | `6113f7ddd8fa9d63c9d699bea9d1b6c3e57a58dc9719b0bb6fd10b3ccc7d2058` |
| `apps/api/src/assistant/general-quote-issue-wire-body.ts` | `115526c0b1b72c3d1c60ccd421ee9faafbcbc624ed0fb5acda79979c31239e5f` |
| `apps/api/src/assistant/general-booking-draft-contract.ts` | `2ba4811f0fa917a96a19d3fcdbbefb44606fcbbc878b3693516434e6abf668f8` |
| `apps/api/src/assistant/general-booking-confirmation-contract.ts` | `ba5b63a16c362ec94d25e776ed354e8ed71553748d4b8e53054fb9be4b6f0aed` |
| `apps/api/src/assistant/general-booking-decision.ts` | `6b1e6d67deb2fd621380f3ef65deba0a007472fa1f2a350e1b1e4432578507f5` |
| `apps/api/src/assistant/proposal-security.ts` | `222bf86776bb0782da30f5e6ff2b9c810ff6b7cef1acf3930051f6cd94ca880a` |
| `apps/api/src/billing/play-refund-review-token.ts` | `a752fe689222e8a9d3548d5c2bb69ece763e0ac3f21aa10122381a99cb03b434` |
| `packages/db/src/staff-invitation-custody.ts` | `4b10d5f4dcbef2f899e602b120d4db7dcf8a200af460183c686ba4df64fe28ed` |
| `packages/db/src/queries/service-commerce-bookings/booking-command-review.ts` | `6bdee7317103b428337108ddd094745cbc99d3ffc521b98dc0d1501d6cb51f94` |

No Brain documentation updates required in this child packet: the only change is
this requested design proposal; root owns consolidated feature/task impact.
