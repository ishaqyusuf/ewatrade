# G03 immutable Quote issue/revise: canonical review and command design

15 October 2026. **Design only.** This packet adds no action, endpoint, source
implementation, schema, migration, provider call or acceptance. It describes the
remaining complete issue/revise slice after the frozen caller-owned issuance
extraction. Root owns Brain, source assignment and integration. Existing approval
and execution boundaries remain unchanged; this proposal introduces no human gate.

## 1. Outcome and scope

An authenticated merchant can prepare, edit, review and explicitly confirm a
nonclinical Service Request or Commerce Inquiry Quote, or a new immutable version
of its exact current Quote. The review must disclose every Offer Option, its own
lines and totals, current source/catalog/availability facts and complete commercial
release effects. Confirmation rechecks the same canonical facts, then commits the
version, applicable release/approval effects and GENERAL receipt in one transaction.

This is not customer selection/acceptance, an Order, booking, reservation, payment,
work release, pickup/delivery or provider delivery. Those remain distinct commands.
Prescription requests and Pharmacy Inquiries retain their separate professional
and production gates and are unavailable through this nonclinical action. Full G03
still includes Inquiry/staff intake, disposition, capacity/bookings, progressive
Catalog, generic fulfilment and second-vertical/persisted/client acceptance.

## 2. Current source and exact reuse

Source references below were inspected in the working tree for this packet. Line
numbers describe that snapshot and may move during subsequent integration. The
issuer linked-label proof repair is now assigned separately to the canonical
source owner; its forthcoming guarantee requires its own final source verification.

| Rule/fact | Existing source | Required reuse |
| --- | --- | --- |
| Intent normalization and legacy versus options payload hash | `packages/db/src/queries/commerce-quotes.ts:525`, `:1138` | Share these canonical functions; retain legacy hashes and default semantics. Do not reimplement normalization in the adapter. |
| Source load, source-line preparation, source transition | Same file `:650–1007` | Source-owned handler remains authority; split read preparation from release writes. |
| Current active membership, attendant, compatibility default, policy, different selected approver | `service-commerce-quote-release.ts:93–184` | `resolveQuoteReleaseRuntimeFacts` is read-only. Reuse its explicit missing-policy compatibility behavior; a generic role is not a replacement for configured attendant assignment. |
| Native Service caller ceiling and policy | `apps/api/src/trpc/routers/service-access.ts:143–165`, `packages/db/src/queries/service-public.ts:621–714` | Retain manager predicate and Store resolution, then fresh persisted access and canonical Service policy. |
| Native Inquiry caller ceiling, workspace readiness and policy | `apps/api/src/trpc/routers/service-commerce/inquiries.ts:134–151`, `packages/db/src/queries/commerce-inquiries.ts:172–193`, `:608–695` | Reuse operator/workspace/source vertical checks, using a pure policy branch for review. Do not substitute broader workspace access for Service Request manager access. |
| Offerings, source snapshots, quantities, line prices and adjustments | `commerce-quotes.ts:1397–1630` | Extract one canonical resolver/calculator used by review and new-version execution, preserving source-specific outcomes and snapshots. |
| Price suggestions and provenance | `service-commerce-catalog-pricing.ts:35–239` | Read-only suggestions; explicit committed prices remain merchant intent, not automatic catalog prices. Keep `includeTenantHistory:false`. |
| Verified private source links and availability attestations | `service-commerce-catalog.ts:1099–1210`, `service-commerce-catalog-source.ts` | These resolvers read and compare exact source fingerprints; reuse them rather than accepting client `catalogSourceVerified` or revision claims. |
| Non-mutating tracked availability | `catalog-inventory.ts:259` | Use `getConfiguredCatalogOfferingAvailability`; the ordinary `getCatalogOfferingAvailability` can upsert a balance at `:143`. Never invoke that default from review. |
| Current vertical policy without READ audit | `service-commerce-policy.ts:345` | Use `assertServiceCommercePolicyAllowedReadOnlyInTransaction`. The ordinary assertion records audit rows. Retain nonclinical/launch restrictions. |
| Terms assertion | `commerce-quotes.ts:77`, `store-conversation-account-terms.ts` | Read exact current publication acceptance, without pretending text safety passed. Immediate release requires it; private preparation retains its current distinct Terms behavior. |
| Immutable version, pending approval, supersession and release | `commerce-quotes.ts:1633–1848` | Preserve DRAFT versus ISSUED behavior, CAS of current version, maker-checker, source facts and audits. Revision must show whether confirmation releases or requests approval. |
| Pure existing approval review precedent | `commerce-quote-decision-review.ts` | Reuse architectural pattern and protected original identity, not its decision-specific policy or narrower review bounds. |
| GENERAL signed target and atomic recovery | `apps/api/src/assistant/general-proposals.ts:256–379` | Existing completed receipt recovery precedes adapter execution. Current authority and revision still apply; never replay native token rotation to recover GENERAL. |

### Concrete remaining seams and limits

1. The frozen `prepareCommerceQuoteIssue` snapshots intent/Terms, normalizes,
   screens customer text and generates private token/hash state. It is **not** a
   pure review function: it performs configured text screening and has no DB
   pricing/eligibility snapshot. Never call it for draft validation or a read tool.
2. `issuePreparedCommerceQuoteInTransaction` contains no direct screening call,
   but its released/released-replay branches call
   `appendReleasedQuoteActionMessagesInTransaction`. That function still calls
   `assertStoreConversationTextScreened(option.label)` in
   `store-conversation-action-release.ts:208–209` while the transaction is open.
   The extraction preserved this inherited behavior. A complete provider-free
   transaction seam therefore needs a further source-owned proof path, described
   in section 5; claiming the entire current call graph is provider-free is false.
3. The pricing resolver is embedded after Quote upsert/replay checks. A fake Quote,
   rollback-only dry run or invoking the writer and undoing it is not a pure read.
   Move the shared read/calculation portion into a canonical module/function.
4. The Service handler's `validateLines` is currently empty (`:938` approximately),
   and its active Offering preparation does not independently check an explicit
   `sourceLineId` against that Request; missing IDs are inferred by Offering.
   Draft Offering resolution does perform the source-link check. Do not describe
   every current active Service line as independently source-validated. A complete
   reviewed binding needs a source-owned exact Request-line ownership resolver
   shared with execution, with compatibility cases reviewed explicitly. This is a
   canonical hardening dependency, not an adapter-only invented policy.
5. `lineTotal` (`:447`) converts an exact product to Number, and new-version subtotal
   accumulation does not by itself prove safe-integer line/aggregate values. Native
   `assertPreparedQuoteOptionTotals` (`:1943`) checks safe final totals in approval
   validity, but the immediate new-version path does not call it before persistence.
   Review must not fabricate precision. Source-owner work must reject unrepresentable
   line/subtotal/adjustment/total values in the shared calculator and writer, with
   meaningful boundaries. The persisted version/option/line monetary columns are
   Prisma `Int` in `prisma/models/commerce-quotes.prisma`, so safe-JavaScript-integer
   checks alone are insufficient: valid persisted nonnegative amounts must also fit
   the existing signed32-bit storage bound (2,147,483,647), plus any narrower existing
   input bound. Oversized values currently risk a late persistence failure, not a
   representable reviewed total. Do not change storage or silently round money.
6. Price suggestion input is capped to the first 100 unique Offerings inside the
   existing helper, while Quote options allow 20 options × 100 lines. Preserve the
   full supported issue/revise intent. Explicitly report missing suggestion coverage
   beyond the bound; absence is not a zero price or permission to silently drop lines.
   Extending provenance coverage, if needed, belongs to that source owner.

## 3. Canonical read-only projection and immutable target

Proposed server-only API (names are a design contract, not current exports):

```ts
type QuoteIssueReviewScope = {
  actorUserId: string; tenantId: string; storeId: string
}
type QuoteIssueOperation =
  | { kind: 'issue'; source: NonclinicalQuoteSource }
  | { kind: 'revise'; source: NonclinicalQuoteSource;
      quoteId: string; quoteVersionId: string }
type NonclinicalQuoteSource =
  | { kind: 'service_request'; id: string }
  | { kind: 'commerce_inquiry'; id: string }

// Internal intent retains native exact fields and server operation identities.
reviewCommerceQuoteIssueReadOnlyInTransaction(
  tx, scope, operation, intent, publication
): Promise<{ target: { id: string; revision: string };
             review: CommerceQuoteIssueReview }>
```

The source-owned resolver takes immutable normalized intent, reuses source handlers
and returns an internal execution plan plus stable evidence. A separate serialization
function projects the review. Both the writer and review use the same line/pricing/
availability calculation. A pure branch selects configured availability and pure
policy through internal source-owned dependencies, not a client `readOnly` or
`skipValidation` flag. Trusted mutation callbacks are never called by review.

Read transaction: bounded RepeatableRead, existing 10s maxWait/30s timeout; one
complete snapshot or refusal. No policy audit, inventory creation, stale approval
supersession, token generation, moderation, source transition, notification, message
or provider operation. Read failures must not become an empty eligible review.

`CommerceQuoteIssueReview` must expose these typed facts:

- authenticated scope, source kind/id/current revision/status; exact current Quote
  and version identity/sequence/status, or explicit absence; operation issue/revise;
- Store currency; 1–20 ordered options, 1–100 ordered lines per option; full label,
  customer notes, promises, fulfilment and expiry; exact normalized quantities;
  explicit committed unit prices, included/alternative/declined/unavailable outcomes;
  independent line/subtotal/discount/tax/fee/total facts in integer minor units;
- immutable source names/options versus current Offering names/status/availability,
  source-line mapping, configured scale/kind and attestation/source-link provenance;
  suggested price and override information with explicit unavailable/coverage facts;
- exact release policy revision/mode and compatibility default, actor attendant
  eligibility, another eligible selected approver where required; current Terms
  requirement/acceptance, not generic global-role eligibility;
- effects: private new DRAFT + pending approval, or immediate ISSUED/public acceptance
  capability + applicable original-source transition + audits; exact previous-version
  and pending-approval supersession; linked conversations eligible for canonical
  messages/account invitation/unread notification intents; text screening still
  required/not checked; delivery unverified; no customer acceptance/Order/payment;
- `asOf` and coverage/limits, excluded from the stable digest when merely a read clock.

Retain canonical 20/100 limits, refuse oversized serialization with an explicit
complete-review-unavailable result, never truncate a confirmable preview. A precise
serialized byte budget must be measured/selected before contract freeze against
the full canonical bounds and native transport. The model can receive a compact
summary plus exact app review target; the authenticated app must disclose all
confirmable fields, not a partial model excerpt. No fabricated aggregate across
mutually exclusive options. A price suggestion is advisory, not an availability,
reservation, current payable selection or accepted price.

### Stable digest contents

Use canonical deterministic serialization plus SHA-256 under a versioned domain
such as `commerce-quote-issue-review:v1`. This digest is distinct from the unchanged
native payload hash. It binds the normalized command and operation identities;
actor/membership/current role/access mode/access revision/Store assignment; active
Tenant/Store/currency; source id/kind/revision/status and relevant immutable source
line snapshots; exact absent/present current Quote and current version, sequence,
status/selection/approval facts that affect revision/release; full resolved options,
prices and snapshots; Offerings/kind/status/quantity scale/Store availability;
attestation id/type/source fingerprint/expiry/configuration/balance revision and
quantity; price suggestion evidence actually used; current policy decision/revision/
validity and release-team policy/selected eligible membership set; Terms publication
version/hash and applicable acceptance; exact linked conversation set and stable
blocked/linkage/existing-Quote-message/invitation facts controlling release effects.

Sort unordered sets, preserve ordered options/lines, represent Dates as exact UTC
instants and quantities as canonical decimal strings; never hash floating formatted
money. Do not hash newly generated `asOf`/evaluation timestamps or prospective DB
IDs/times, otherwise every fresh read becomes stale. Keep actual effective/expiry
facts that matter. Fresh execution must still reevaluate now/expiry; the digest
does not freeze time. Review cannot derive a current target from an old stored DTO.

Issue requires absence of a canonical source Quote; revise requires the exact
existing source/Quote/current version and uses that Quote's stored `clientQuoteId`.
Discover by canonical `(tenantId, sourceType, sourceId)` identity, validate Store,
then separately check operation key collision. Never manufacture a second Quote
for a quoted source or accept model-supplied current-version assertions. Accepted
versions remain non-revisable. Already-QUOTED source release is a no-op source fact,
not a new initial transition. All other native revisable statuses and prior pending
approval supersession retain their canonical semantics; do not invent a UI-only
status policy.

## 4. Protected review, action and original contracts

Add strict auth-bound protected review/context routes, for example
`serviceCommerce.assistantQuoteIssueContext` and
`serviceCommerce.assistantQuoteIssueReview`. Wire input contains source/operation and
editable business intent only, never actor/Tenant/Store overrides, callbacks, raw
tokens, authority flags, price-source verification booleans or internal handles.
Source IDs are selected from protected discovery; no arbitrary JSON/ID form fields.
The native Service and Inquiry permission ceilings are different and stay separate;
both compose current persisted membership/Store authority and ADR0032 attendant
compatibility/configured-team authority. Pharmacy source/content refuses before
business details are returned. Inquiry workspace reads must be pure too: ordinary
`getServiceCommerceWorkspaceAccess` uses audited policy evaluation, so extract/share
its policy calculation with a pure reader rather than invoke its audited default.

Proposed strict GENERAL actions: `service_quote_issue` and `service_quote_revise`.
Both have a discriminated Request/Inquiry source and options using their respective
canonical fields; revise additionally retains exact Quote/current-version identity.
Service intent retains its existing all-included/full wrapper behavior; Inquiry
retains its alternatives/partial/unavailable and attestation behavior. No clinical
union. Explicit integer amounts are safe, nonnegative, source-bounded; quantity
strings use canonical scale; exact UTC expiry preserves original precision. No
top-level adjustments mixed with option-owned fields. Server preparation assigns
stable client Quote/version/option command IDs, never from model authority.

Operation identities must be settled before canonical hashing/review and retained
through edit/review/confirmation retries. Because GENERAL currently generates its
idempotency key after adapter draft preparation, integration needs an explicit
server operation-identity allocation step, or stored server-completed IDs; it cannot
silently assume the eventual proposal key is already available. For revise, reuse
the existing Quote identity and create only the new version/option operation IDs.
Pending draft edits update intent/review/signature before execution; a completed
operation cannot be edited/reused with new intent.

New original target must be the exact `{sourceKind, sourceId, quoteId, quoteVersionId}`
plus navigation origin, not only approvalId (immediate releases have none). A pure
protected original returns the immutable saved version/options/lines, saved creator/
times/release facts and separately current eligibility. It must not call native
reconciling detail or public token access. Token/capability/provider fields are never
model/receipt/URL fields. Dashboard/native original Open retains chat draft and Back
stack; live authority/fresh-read and callback generation fences match existing
original-screen patterns. Exact saved version never floats to current version.

Receipt includes source kind/id, Quote/version id/sequence, actual stored release
state, optional exact approvalId, stored created/issued times and validated option
summary/original target. Pending approval is private, rejected replay remains
rejected, released is not accepted/ordered/paid/sent/delivered. Server verifies exact
new version/operation identity and stored effect state before completing GENERAL.
Native raw tokens stay server-owned; GENERAL recovery returns its saved receipt
under current original-record authority without native replay/token rotation.

## 5. Outer preflight and transaction composition

1. Draft/Edit/Review calls the pure canonical review. Save updates proposal intent,
   target digest/revision and signature only. Full native editor exposes all fields
   and retains selected offerings across bounded pages with explicit provenance;
   unavailable/stale/private facts withhold Save. Separate Confirm is mandatory.
2. A fresh authenticated short read validates the exact pending proposal/revision,
   approval token, current rollout/authority/origin and complete canonical target.
   A completed proposal takes the existing protected saved-receipt recovery path;
   cancellation never screens or issues. Do not pay for provider preflight based
   only on model IDs or an unauthenticated approval token.
3. Close that transaction before async text screening. Snapshot exact intent,
   publication and trusted callbacks; call canonical `prepareCommerceQuoteIssue`
   once. Its opaque WeakMap handle retains exact normalized text, native legacy/
   options hash and private token. It is process-local, never durable or serialized.
4. Complete the remaining linked-message proof seam in its source owner: collect
   exactly the normalized/trimmed option labels which `quoteSnapshot` presents,
   screen outside the transaction, and carry opaque module-registered evidence.
   Released-message materialization must validate evidence against its actual saved
   labels and expected source/scope/intent before reusing screening. Copied/forged/
   changed-label proof fails. No `alreadyScreened:true`, provider bypass env, client
   proof or mutable callback. Ordinary native callers retain their screening default.
   A shared canonical preflight can avoid duplicate screening of identical texts;
   preserve native screens and transaction behavior until this source seam is proven.
5. Open the fresh authorized GENERAL Serializable transaction. Recheck current
   proposal/revision/signature/status/rollout and all scope/channel leases. Recompute
   the canonical pure review inside this snapshot, compare its complete target digest
   with the signed stored digest, and validate preflight belongs to this exact
   operation/payload/publication. Scope/Terms/policy/catalog/source/version/link-set
   drift refuses before Quote writes. Never let an adapter silently build a new
   preflight inside `prepareExecution`; it already runs inside the transaction.
6. Claim proposal once; execute the prepared canonical issuer using the same tx and
   no nested transaction. Preserve source authority, replay/hash/collision checks,
   private DRAFT approval, conditional supersession/current-pointer updates, release,
   audits and canonical linked messages/invitation/unread intents. Read back exact
   stored command result, strip raw tokens, persist receipt and complete proposal.
   Any command/receipt failure rolls everything back.
7. Handle bounded serialization retries through the existing own-transaction runner
   and same preflight/token/identities. Do not expand timeouts or add provider waits
   under locks. A process loss discards preflight; recovery first reads the durable
   proposal result, and only a still-pending valid intent obtains fresh preflight.

All outer confirmation callers require explicit support, including
`decideGeneralProposal` and the direct transaction-local caller
`processAssistantWhatsAppAction` in `channel-action-turn.ts`. For linked channels,
preflight must precede the proof/receipt committing transaction without consuming
the action proof early; revalidate lease/generation/exact decision after screening.
Until that integration exists, classify these new actions as exact authenticated
app-review handoff, not native channel writes. Native app handoff is still part of
complete assistant support; no text “yes” can replace an exact signed confirmation.

### Existing approval path is a separate remaining composition dependency

`apps/api/src/assistant/general-quote-decision.ts:149–162` obtains its prepared
decision from inside GENERAL `prepareExecution`. The prepared decision's execute
closure in `commerce-quote-decision-review.ts` calls the canonical approval helper.
`approveCommerceQuoteVersionDecisionInTransaction` still screens the stored version
options when pending (`commerce-quotes.ts`, the `approval.status === PENDING` branch),
and its released-message path can reach the linked-label screening above. Its pure
review explicitly reports screening not checked, which is truthful; current
execution is not transitively provider-free.

The newly assigned issuer proof repair must not be credited as fixing approval or
all legacy callers. Approval needs its own exact stored-version text preflight,
fresh approval/Quote/version/policy/author/current-actor Terms and decision binding,
and explicit outer-entrypoint transport before it can reuse opaque screening
evidence in a caller-owned transaction. Rejection must remain screen-free. Preserve
ordinary native approval's intentional stale reconciliation, exact replay and token
privacy; completed GENERAL recovery still returns its original receipt first.
These are source/API composition tasks under existing authority, not a new human
permission gate or authorization for a real provider check.

## 6. Locking, concurrency and source ownership

The current issuer relies on Serializable execution, unique command/source/version
constraints and conditional current-version/source transitions; inspection found no
explicit Quote/team row-lock API in the issuer. Do not claim a read snapshot locks
the aggregate or reuse the unrelated financial Order lock token as Quote evidence.

Canonical ownership must define one lock/CAS protocol shared by Quote issue/revise,
approval/rejection, Request disposition, Inquiry transition and customer acceptance/
booking consumers. Preserve existing GENERAL lock order (channel identity →
membership/Store) before source/Quote/release-policy/team facts; release already
locks linked conversations in sorted order. Proposed source/Quote locks or source
revision predicates must be introduced through canonical commands, with all inverse
writers audited. Missing Quote rows require unique source identity plus Serializable
predicate conflict/retry, not an imaginary row lock. A fresh digest alone is not a
post-read concurrency lock. Source revision and current pointer must not advance
past an accepted/withdrawn/converted disposition unnoticed.

Minimal source work sequence, each retaining its owner's rules:

1. Canonical Quote owner extracts exact source/line/pricing resolver, pure policy/
   inventory branches, stable evidence/digest, safe-money and source-line ownership
   guards; ordinary wrapper/hash/native behavior regression-tested.
2. Conversation release owner implements exact opaque outside-TX screening reuse,
   pure linked-effect projection and current Terms/publication binding; proves replay,
   blocked conversations, invitation/notification and sequence behavior unchanged.
3. Canonical Quote/source owners settle shared source-revision/CAS/lock protocol and
   preexisting operation replay behavior. No private helper copy in API adapters.
4. Root integrates strict contracts/read routes/GENERAL outer preflight/capabilities/
   manifest and receipt recovery. UI owner implements complete native/dashboard
   editor/review/original flows after contract freeze. Planned rollout remains closed.

No schema addition is assumed for this Quote slice: immutable versions/client IDs
and existing GENERAL durable receipt already exist. If the lock/recovery design
needs schema changes, produce a separate exact source-owned proposal first; existing
target-aware DB authority applies. This document authorizes no migration/push or
connected action, and does not invent an additional approval gate.

## 7. Independent acceptance tests before integration can be called complete

Source-only cases can be authored/run with inert transaction stand-ins and fixture
screening, explicitly distinguished from actual DB/provider/device proof:

1. Pure review denies every mutation delegate and provider/screening entry; current
   Request versus Inquiry role, Store, active membership/access revision, configured
   attendant/compatibility and nonclinical policy matrix; no audited workspace call.
2. Compare writer and pure builder for legacy/service/options/inquiry branches:
   normalized labels/defaults, source-line mapping, outcomes, scale, all monetary
   adjustments, exact no-rounded totals, suggestion override/provenance, unavailable
   suggestion coverage after100 Offerings, and full20options/100lines boundaries.
3. Foreign/current source-line IDs, private draft verified links, stale fingerprint,
   expired/insufficient attestations, inventory configuration/revision changes,
   missing existing balance: fail without source-link, stock or catalog mutation.
4. Stable same-fact digest despite new checked/evaluation clocks; every meaningful
   intent/source/current version/currency/price/availability/policy/team/Terms/link
   change invalidates it. Missing versus existing Quote, accepted-version refusal,
   current-version change and prior pending approval supersession are explicit.
5. Immediate release versus approval-required review exactly discloses canonical
   effects, Terms requirements and all linked conversation behavior; review neither
   screens nor claims delivery. Complete preview overflow refuses before confirm.
6. Outer preflight exact tuple/payload/publication/callback immutability, forged or
   serialized handles, changed labels, provider failure and no provider wait inside
   tx. Actual linked-conversation fixture is essential: the existing31/99 issuance
   suite does not prove transitive screening absence for that branch.
7. Proposal edit/revision/expiry/cancel/completed recovery, exact duplicate command,
   changed-payload ID reuse, P2034 bounded retry with same token/IDs, receipt failure
   atomic rollback and no raw token in model/receipt/log/URL. Changed authority after
   preflight refuses; completed recovery does not issue/re-screen/rotate a token.
8. Actual native/dashboard components expose/edit all supported fields and all
   saved rows; exact UTC precision, unsafe money, multi-page selected offerings,
   stale cache/paused/refused reads, actor/Store/role changes, queued field edits and
   late callbacks; save only revises proposal. Saved original/version and Back/chat
   draft continuity cannot be substituted by a related current Order link.

Separately gated connected evidence must prove PostgreSQL uniqueness/SSI/CAS and
cross-command races, source/approval/conversation/receipt rollback, durable recovery,
actual moderation/provider behavior and bounded transaction timing, signed/saved
browser/native journeys and a second nonclinical service vertical. Tests/proposals
do not authorize those runs or make full G03 accepted. G01 human QA pause, Paystack,
D04, E05, G04, S05 and the existing signed/target authorization boundaries remain.

## Evidence and Brain impact

Read-only source audit and this new proposal file only; no existing product/source,
Prisma, API, contract, metadata or Brain file changed. No tests were rerun to refresh
numbers. Reused exact frozen issuance evidence is31tests/99assertions plus scoped
Biome; it proves the bounded extraction cases, not the future review or full action.
Root must record Brain/checklist impact on integration, particularly the transitive
linked-message screening limitation in current preflight documentation. The proposal
does not release another source owner's files or change parent acceptance.
