# Booking review: authenticated safe projection, complete pages and approval

15 October 2026. Source integration design only. “Public-safe” below means an
allowlisted DTO for the **authenticated merchant application**, not a public
customer procedure, model tool, guest link or customer booking capability. No
endpoint, action registration, persistence change, provider operation or new
human approval pause is implemented by this packet. Existing acceptance and
launch gates remain unchanged; this is not full G03 acceptance.

## 1. Current source and boundaries

The actual canonical review is
`packages/db/src/queries/service-commerce-bookings/booking-command-review.ts:26`.
It invokes fresh canonical booking authority and source-owned detail/work
calculations, returns `{target,review,asOf}`, and is explicitly SERVER-ONLY. Its
64 MiB logical JSON budget runs after facts have been read/materialized. The
private target digest binds the command, authority, source, capacity/payment,
work and notification evidence. Only `asOf` and the exact generated hold-preview
`details.effects.observedExpiresAt` observation are outside that digest; saved
hold expiry and all other business dates remain bound. Do not regenerate the
canonical target from a smaller display projection.

Current saved original read is
`packages/db/src/queries/service-booking-read.ts:80`, exposed by
`apps/api/src/trpc/routers/service-commerce/bookings.ts:105` through
`apps/api/src/assistant/general-booking-read.ts`. It exposes exact saved booking
policy, resource/current configuration facts, milestones and a limited current
Order payment projection. It expressly says capacity/provider settlement were
not checked. It requires current runtime/source eligibility; it is **not** the
historical exact-effect reader used by confirmation recovery. Reuse their shapes
and wording where applicable, not their different eligibility semantics.

The complete full review has additional private information:

- `booking-review-facts.ts`: membership/access/grants, runtime/policy evidence,
  full availability rules/exceptions, other bookings/holds and reservation IDs;
- `booking-review-projection.ts:242`: contact-basis digest; `:451`: saved recipient
  digest/channel; `:490`: pending reminder IDs, authorization users and digests;
- `booking-review-work.ts`: every Job line/change and whole-Order obligations,
  including nested scope/authorship/reference facts used to establish canonical
  completion. These arrays are not capped at 100 or 2,000.

Never spread `parent.review`, `details.before`, an Order row, authority, payment
query result or notification object into a response. A forbidden-name regex is
an additional check, not the projection contract.

## 2. Authority is the existing intersection

`service-commerce/bookings.ts:184,207,224` applies `assertServiceOperator` to
staff confirm/hold/revise; `service-permissions.ts:10` resolves this to
`canOperatePos` (Owner/Admin/Manager/Operator/Cashier). Native admission then
requires accepted ACTIVE membership, Owner/Admin or an active exact-Store
ATTENDANT assignment (`service-commerce-bookings/shared.ts:126`), the canonical
operational-role ceiling, positive access revision, current Tenant/Store/grants,
readiness and policy. The new full review already composes those current facts.
Do not replace this intersection with an Owner/Admin-only rule, a LEGACY Manager
rule, a generic workspace flag, or the presence of a client-supplied role.

The saved booking read's current payment fields are already exposed through
that operator/attendant path (`service-booking-read.ts:224`), without
`financeProcedure`. Existing Service Job `getJob` is also operator-gated
(`apps/api/src/trpc/routers/services.ts:269`); its serializer in
`packages/db/src/queries/service-work.ts:214` returns exact allocated quantities,
work status and operational Order payment summary. This is evidence for those
specific operational facts, not unrestricted ledger/Finance access.

`apps/api/src/trpc/finance-procedure.ts:15` separately requires Owner/Admin plus
the Finance plan feature for ledger/account procedures. A booking review must
not expose FinanceBook, ledger account/journal IDs, arbitrary payments, balances,
providers or Finance original links merely because booking internals take
financial locks. Do not add a Finance role to ordinary booking transitions.
Current authenticated GENERAL Session/account/privacy/legal/client/action/
rollout checks remain the outer caller's responsibility, as in the actual
`general-booking-drafts.ts` and `general-booking-decision.ts` compositions.

Full linked-work preview is a new display surface of existing canonical booking
effects. Its owner must keep exact linked Job/Order scope and nonclinical checks;
ordinary Job or ledger navigation must still use that original's own current
permission. A booking receipt or preview grants neither. Source ownership should
explicitly review the projection; this does not create a new human execution gate.
ADR-0032 Store capability rules remain source-owned and do not substitute for
clinical/professional authority. Current booking commands support ServiceRequest,
not Inquiry or Prescription booking.

## 3. Proposed explicit safe DTO

Add strict shared `general/booking-review.ts` schemas and one server projection
`general-booking-review-projection.ts`. Construct a discriminated safe document
from the **actual full canonical parent** plus trusted saved draft. Do not accept
an arbitrary parent supplied by a model/client. Dates become exact UTC ISO
strings; business identities retain native bounds up to 191 and exact opaque
content. Conversation IDs retain the existing exact opaque 1..128 contract.
Never shrink identities to a generic 128-character target/route bound, trim or
invent a label. Unknown enrichment is explicitly unavailable. Additional current
labels require their actual authorized source read.

Common public document fields:

- format/projection version; action and exact current draft reference/revision;
- original ServiceRequest business reference/revision/status, exact selected
  Offering/resource references, saved/current distinctions, UTC slot instants,
  named IANA timezone and integer requested quantity;
- complete named effect facts below, optional exact owned booking/hold/Quote
  Version/Order/Job business references, and allowlisted original targets only;
- coverage counts and complete-vs-unavailable status for every populated section;
  read observation `asOf` outside semantic packet identity. No “all work” statement
  when only a summary or subset exists.

Keep all authority IDs, command/idempotency key, private target revision,
proposal payload hash, native command hash, contact/recipient digest, ciphertext,
raw contacts/name, capability token/digest, authorization user, team/grant IDs,
policy evidence/approval references and other customers' reservation IDs out.
Business source/booking/hold/Job/line IDs identify the merchant's exact object;
they are not actor/authentication IDs. Public page/content checksums, if used,
are transport integrity only and must never reuse/expose those private hashes.

| Command | Allowlisted complete review fields | Private or misleading fields to withhold |
| --- | --- | --- |
| Hold | Source reference/revision/status; selected Offering/config revision; resource label/kind/current capacity/revision; exact proposed start/end/timezone/quantity; configured duration/lead/horizon/hold duration; current evaluator's eligibility, reason, remaining capacity; temporary reservation/no booking yet; hold-duration/before-slot expiry rule and separately labelled observed expiry; payment not checked, no notification. | Other holds/bookings, IDs, expiry lists, grants/policies; no reserved guarantee or exact future expiry promise. |
| Confirm | Exact consumed hold reference/status/saved expiry/slot/quantity/config revision; current capacity evaluation excluding that own hold; source; exact accepted Quote Version and linked Order/Job identity/revision/status only when present; `resolvePaymentSnapshot` currency, requirement/deposit/payable/required minor amounts and native stored status; existing limited current Order summary; resulting confirmed revision0; hold consumed/private manage access changed; whether notification intent may be created and reminder lead, delivery unverified; no money collected/provider settlement not checked. | Full Quote/Order rows; customer/contact basis, authorization user, raw notification policy result, private access token; no promise email/WhatsApp was sent. |
| Arrive/no-show | Exact original booking/revision/status/source/Offering/resource/slot/timezone/quantity; relevant saved policy/milestones; canonical before→after status/revision, trimmed canonical reason for no-show, private access changed/revoked; no payment collected. | No invented capacity read for nonreschedule, no invented job completion or notification. |
| Start | Same exact before/after booking facts plus every linked work line, its exact allocation and authorization/status; every canonical proposed line transition; Job revision/time consequence; linked Order fulfillment status. | No new deposit/payment requirement: native work/order eligibility remains authoritative. No unrelated Job/customer or hidden policy/grant facts. |
| Complete | Same booking/work facts; every whole-Order obligation and nested fulfillment/authorization/work fact that contributes to canonical completion; exact projected changes, Job completion consequence and actual `wouldCompleteOrder`. | No “Order completed” claim before execution; no completion inferred only from the booking's own lines. |
| Reschedule | Exact saved before and proposed after resource/slot/timezone/quantity/revision; fresh full capacity evaluation excluding own booking; preserved payment policy; native notification possibility; count and type of pending reminders affected, private manage access changed, delivery unverified. | No other reservation IDs; no reminder IDs, ciphertext, authorizer or digest. |
| Cancel | Exact booking before/after/revision/reason, saved cancellation window/refund rule/currency; current cancellation-allowed fact; existing canonical net recorded PAYMENT-minus-REFUND amount and projected native refund consequence; reminder cancellation count/type, native notification possibility and access revocation; refundExecuted=false. | Raw payment/group rows, accounts/journals or current provider status; refund eligibility is not payment/refund execution or settlement. |

The public projection copies calculations and decisions from the parent. It must
not reproduce capacity, payment, cancellation, authorization, transitions or
whole-Order completion arithmetic. Safe fields may rename source fields, not
recalculate them. Validate monetary numbers as safe exact integers within their
existing owning bounds (nonnegative amount fields, signed canonical net totals
where supported) before serialization; refuse unsupported facts
rather than round/coerce. Preserve canonical decimal strings verbatim and never
convert them through Number. For cancellation, use the actual canonical result;
do not reinterpret a negative net total or invent a different refund rule.

## 4. Complete work is paged, not clipped

For start/complete, the strict safe work section includes every existing
`work.lines` row: exact business line ID/revision/status/authorization status,
allocatedQuantity string, rework business line reference or null, completedAt;
and every `work.changes` row: ID/revision/from/to/completion-time consequence.
Preserve Job revision and command-time/unchanged consequences.

For complete, retain **every** whole-Order obligation. Safe fields: Order-line
business ID, product/service kind, exact quantity; each product fulfillment's
quantity/time; service authorization quantity/time or null; service fulfillment
quantity/time or null; service policy snapshot; every related work line's ID,
allocated quantity, authorization/status/completion/rework facts. Strip nested
Tenant/Store/authorship IDs and duplicate authority-only order/scope references;
those remain in the private parent digest and are validated server-side. Do not
replace these facts with only `wouldCompleteOrder`. Both the full evidence and
canonical result must be reviewable. If canonical obligations are null, preserve
null and the owning reason; do not relabel it an empty complete list.

A 2,001-line fixture must produce 2,001 safe line facts and all actual changes,
plus every owning obligation/nested line, across pages. No .slice(), first100,
first2000, UI virtualization limit or generic answer-detail bound may define
review completeness. Render large lists with virtualization while retaining
access to every row; all decimal strings and exact business refs survive JSON
roundtrip and assembly. Whole-source logical/resource refusal is explicit and
issues no approval. Native support is not reduced to make a one-response preview.

## 5. Complete page machinery: reuse mechanics, not Quote private DTO

Existing useful implementation patterns:

- `general-quote-issue-review-pages.ts:307` builds a canonical complete document,
  surrogate-safe bounded fragments, a manifest and exact single tRPC/SuperJSON
  envelope accounting; `:437` validates every descriptor, page identity/index,
  byte length, full content digest, metadata and scope before returning content.
- `general-quote-issue-review-store.ts:101` rereads the actual saved pending draft
  and full current parent on **every** manifest/page request; `:129` checks expiry
  again after packet construction. This avoids cached approval bases.
- Quote assembly explicitly issues no approval and trusts only a separately
  authenticated server manifest. It does not prove a human read the material.

Do not call the Quote constructor with a type assertion or expose its binding
(which contains actor/Tenant/payload hash/private target). Extract transport-only
mechanics in a separately owned change, or implement a booking adapter tested
against those exact invariants. Safe booking schemas remain explicit. A public
manifest has draftRef/revision, projection version, safe command summary, exact
counts per work/obligation/change section, documentBytes, page descriptors and an
opaque review reference. Bind it privately to actor/Tenant/Store/conversation,
row fingerprint/localV1 signature basis, exact canonical target, safe content
version/digest, page count and expiry. Display projection changes retire prior
review references even when the canonical target remains unchanged.

Page input is strict scalar `{conversationId,draftRef,revision,reviewRef,pageRef}`;
no caller scope, arbitrary offset/manifest, parent JSON or proof callback. Each
request enters current fresh authenticated GENERAL authorization, exact linked
chat ownership and actual pending store read/review, then rebuilds and compares
the entire original private binding and safe packet identity. Any drift/expiry/
revocation retires the packet; never mix pages from different targets, roles,
Stores, revisions or generations. This is a live complete preview, not a durable
snapshot claim. Explicit edits produce a new review and invalidate old approval.

## 6. Approval only after complete exact-revision transport

Existing `generalBookingDraftApprovalToken` is a SERVER-ONLY localV1 helper;
it binds action/version/payload/target/role/conversation/key plus row scope,
revision and expiry. It does **not** bind page consumption, and no current booking
module proves page consumption. Never claim current staging/read already meets
this requirement merely because the row stores a hash of that token.

A concrete bounded implementation needs an app-only review-completion protocol:

1. Begin a fresh exact revision manifest without returning the approval token.
2. Fetch pages sequentially with a server-authenticated opaque progress
   checkpoint; advance only the next exact index of the same packet. The client
   decodes the full bounded response and verifies the page; then retains the next
   checkpoint. App assembly checks all pages, exact bytes and complete counts.
3. Use either a dedicated server-owned review-session record or an authenticated
   encrypted stateless checkpoint with a distinct versioned review domain.
   Plain unsigned client indices/hashes or an arbitrary client manifest are not
   proof. Do not overload proposal payload/executedResult/error fields to store
   progress; their current row-integrity/CAS contracts have other meanings.
4. Prefer the schema-free sequential encrypted checkpoint for the next bounded
   slice, subject to source-owner security review. Its private data binds scope,
   conversation/draft/revision, full row/target and projection/packet digests,
   expiry and next index. It reveals no private IDs/hashes. Verify it before
   current reads, but treat it only as transport evidence; fresh authority and
   actual current parent still run for every page/completion. Bound its exact
   encoded size so the strict scalar request still fits the chosen request/body
   limit. Key rotation restarts unfinished transport; it does not erase verified
   historical effects. Crypto is local, never a provider; retain no TX/callback.
5. Complete input is strict `{conversationId,draftRef,revision,reviewRef,
   finalCheckpoint,acknowledged:true}`. Recompute the current parent/packet,
   require nextIndex===pageCount and complete matching binding, then release the
   **actual existing localV1 approval token**, not a new native command identity
   or an ordinary GENERAL token. Final expiry/readback must survive packet work.
6. Only the application review controller exposes explicit Confirm after full
   validated assembly and user acknowledgement; model tools cannot fetch the
   token or complete app-only review. The final command still calls actual fresh
   `decideGeneralBooking` and its second fresh review/claim/native transaction.
   A completion checkpoint never replaces that review or authorizes a command.

Sequential server-issued checkpoints establish that all exact pages were made
available in sequence, not that a person read every word or that a malicious
client rendered them. Client complete-assembly/render acknowledgement and the
existing explicit confirmation are separate facts. Do not label an HTTP fetch as
human approval. If stronger durable cross-device consumption evidence is a
product requirement, select real owned persistence explicitly; do not claim a
process cache or JSON checksums provides it. Neither option adds an invented
waiting period or second staff approver to booking.

## 7. Wire/resource limits are three different boundaries

1. Raw incoming HTTP bytes must be bounded **before JSON.parse**, including
   whitespace/malformed UTF-8/framing/batch/body-spoof cases. Existing booking
   scalar composers' 4,096-byte parsed JSON checks do not do this. Reuse the
   actual bounded `general-quote-issue-wire-body.ts` reader through a strict
   single-operation envelope or an owned equivalent in the eventual route;
   choose and test a scalar raw cap with checkpoint headroom. No batch loophole.
2. The canonical 64 MiB logical command+review check occurs after source graph
   materialization. Keep its all-or-refuse semantics; it is not a DB query cap,
   streaming-read guarantee, memory ceiling, timeout guarantee or HTTP response
   limit. Booking work/obligation arrays remain schema-unbounded. Resource
   overflow must say complete review unavailable, never return truncated facts.
3. Every outgoing manifest/page needs actual encoded single-operation tRPC+
   installed SuperJSON envelope accounting under the chosen 1 MiB wire cap plus
   explicit reserve, like Quote's current 4,096-byte reserve. Count UTF-8 JSON
   escapes, not character length/compressed bytes; test astral/surrogate/control
   strings. Fragments may split semantic rows but not surrogate pairs. If a
   manifest itself overflows, refuse whole packet; do not silently drop pages.

Use no whole64MiB client repost of pages at completion. Sequential bounded
checkpoints avoid an ever-growing page-proof array exceeding scalar admission.
Client assembly/resource limits must be explicit and preserve supported native
work depth or fail whole review, without presenting partial totals as complete.

## 8. Minimal complete follow-on ownership and checks

1. Source/domain owner: explicit safe projection, schemas and complete counts;
   actual all8 canonical fixtures, private sentinel scan, exact191-ID support,
   2,001+ Job lines plus whole-Order nested facts and exact decimals; no source
   authority/calculation duplication. Review monetary/exposure fields against
   actual booking/Job read owners and independent Finance navigation guards.
2. Transport/security owner: reusable pure fragment/envelope/assembly machinery,
   versioned private packet binding and bounded sequential checkpoint/completion;
   strict input/single-body framing and no client manifest trust. Tamper/skip/
   duplicate/reordered/mixed-generation pages fail; empty work sections and null
   coverage remain distinct; missing labels/unknown dates are not invented.
3. GENERAL API owner: fresh manifest/page/complete entrypoints, linked-chat checks
   on every TX, current role/key/grants/source/target/expiry checks before and
   after expensive work; original localV1 token only on completed exact review.
   Changed contact, capacity, policy, nested fulfillment, source/booking/Job
   revision or role invalidates all old pages/completion/token issuance.
4. Native/dashboard UI owner: complete assembler/controller, all rows accessible,
   explicit acknowledgement/Confirm, edit→new review, scope/read-generation and
   unmount fences for page responses/buttons; independent original route guards,
   return stack and no raw ID/JSON entry. Preview “will/may” versus receipt
   “recorded”, no sending/delivery/settlement claim.
5. Independent review and combined source compiler after freezes. Meaningful
   inert actual-store→actual-parent→safe-packet→page-completion→actual localV1
   token→actual decision tests all8; expired/key-rotated terminal recovery still
   requires exact native proof and never needs new pages/approval. Actual SQL
   Serializable rollback/concurrency, device/backend/provider QA and rollout
   remain distinct existing acceptance work. Do not run them from this packet.

## Evidence snapshot and limits

Read-only source inspection only; no tests or compiler rerun for this design.
Relevant inspected SHA-256 values:

| Path | SHA-256 |
| --- | --- |
| `service-commerce-bookings/booking-command-review.ts` (DB queries) | `6bdee7317103b428337108ddd094745cbc99d3ffc521b98dc0d1501d6cb51f94` |
| `service-commerce-bookings/booking-review-projection.ts` | `94ef5630b0910adae704dce48624fdd8cfebe101e5e9e6d2ac196a98c0bfe8c4` |
| `service-commerce-bookings/booking-review-facts.ts` | `27569059054eba130e273b188ddd99b7dab43c1db23380b6347480419bb6cf6a` |
| `service-commerce-bookings/booking-review-work.ts` | `1690032bcf3ae17dbec5af78676159c57b30b0b85c6527cb3a10d73555af0040` |
| `packages/db/src/queries/service-booking-read.ts` | `8e021fbd5d6b5d875324c84b062aac45da5c68936375d49d40ee362a837c671a` |
| `apps/api/src/assistant/general-quote-issue-review-pages.ts` | `9dc9b42f0372869086011c6954216351b943a71207e485375616e8402b35e4a9` |
| `apps/api/src/assistant/general-quote-issue-review-store.ts` | `6113f7ddd8fa9d63c9d699bea9d1b6c3e57a58dc9719b0bb6fd10b3ccc7d2058` |
| `apps/api/src/assistant/general-booking-draft-contract.ts` | `2ba4811f0fa917a96a19d3fcdbbefb44606fcbbc878b3693516434e6abf668f8` |

This packet creates only this proposal file. Root owns Brain/checklist impact.
No public-review projection, page-consumption proof, approval-release endpoint,
public registration, permission widening or acceptance completion is claimed.
