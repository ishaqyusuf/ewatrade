# WhatsApp monthly response quota: scenario engineering plan

Date: 9 November 2026. Source audited: `529a4499879995383273113ef99d01e8192d209f`, current `main` checkout.

Status: planning deliverable only. No runtime, schema, quota, payment, Workshop publication or release change is authorized by this document. The requested policy is 1,000 monthly WhatsApp responses and one exhaustion notice with the final reply. Recommendations below are proposals, not approved commercial policy. Current deployed configuration was not queried.

## Outcome and scope challenge

Prevent an account from creating unlimited ordinary WhatsApp assistant work, show customers their allowance, and let EwaTrade operators identify expensive usage. Stop new paid work before it starts when the allowance is exhausted. Keep one final notice with the last permitted response, then suppress further ordinary replies until reset or a verified top-up.

Reuse the existing assistant, permissions, durable inbox/outbox, jobs, delivery receipts, token/media budgets and billing identity. Add one quota domain module and two persistence models for monthly periods and logical-response reservations. A paid credit ledger is a separate dependent billing slice. No Redis, new queue, scheduled monthly reset, new model agent or parallel WhatsApp business engine is needed.

This spans more than eight source files once schema, orchestration, rendering, delivery, API, dashboard and meaningful tests are included. Reduce complexity through sequential slices and one shared reservation implementation, rather than separate counters for each screen or workflow. A raw `COUNT(outbox)` or `maxRequests:1000` patch is smaller but does not meet the counting, concurrency or final-notice contract.

## What already exists

| Concern | Verified source | Current behavior and reuse |
| --- | --- | --- |
| General AI allowance | `apps/api/src/assistant/general-allowance.ts`; `packages/db/src/queries/assistant-budget-policy.ts` | Hosted General: 5,000,000 recorded tokens per Tenant/calendar UTC month; local default 20,000,000. General has no request-count cap. Keep this independent token guard. |
| Scope of General spend | `.brain/features/assistant-allowance.md`; General turn and customer-message generation | Dashboard/mobile General, linked WhatsApp and merchant customer-message AI drafting share the business token budget. The deprecated `remainingRequests` field represents token availability, not replies. Do not reinterpret it. |
| Request and token accounting | `packages/db/src/queries/assistant.ts` | Requests increment at admission; actual tokens are recorded at completion. Failed work can spend tokens. The existing token admission guard can overshoot its ceiling for already-admitted calls; it is not a strict money reservation. |
| Other assistant purposes | `apps/api/src/assistant/workflow-turn.ts` | Setup/Product retain separate count/token controls. Include their WhatsApp reply paths in the new channel quota without replacing their own budgets. |
| Transport abuse limits | `packages/assistant/src/channels/policy.ts`; `packages/db/src/queries/assistant-whatsapp/usage.ts` | Per user: 20 ingress/60 delivery attempts per minute, 200 ingress/2,000 attempts per UTC day. Per Tenant: 100/300 per minute, 1,000/10,000 per day. Counters expire one hour after the window. These are not monthly responses or durable billing history. |
| Existing quota notice | `packages/db/src/queries/assistant-whatsapp/quota-notice.ts` | An ingress rate denial can stage one fixed notice per actor/configured endpoint/UTC day. This is a different policy, not the requested monthly final-reply notice. Reuse delivery machinery, keep distinct notice reasons and keys. |
| Durable orchestration | `apps/api/src/assistant/channel-turn.ts`; DB `assistant-whatsapp/{inbox,processing,outbox}.ts` | Scoped ingress, FIFO, duplicate/replay handling, run recovery, canonical results and immutable rendered chunks already exist. Add admission hooks here, not in prompts or the webhook alone. |
| Delivery and unknown outcomes | `apps/api/src/assistant/channel-delivery.ts`; DB `assistant-whatsapp/delivery.ts` | Provider attempts and receipts are fenced. UNKNOWN is not automatically resent. Reuse those proofs to settle exactly one logical credit. |
| Usage/cost evidence | `AssistantUsageEvent`; `assistant-operations.ts`; `scripts/assistant-usage-report.ts`; API `channel-operations.ts` | Token/model/media/run aggregates exist. WhatsApp operations are an internal helper, not a merchant usage page; actual transport billed amount is explicitly unknown. Voice has estimates when recorded. These do not establish a monthly response ledger. |
| Customer dashboard | `/account/whatsapp`; `/settings/billing`; shared General allowance formatter | Connection management and assistant allowances exist. The billing page's `AssistantAllowance` uses Product Assistant capabilities, not the WhatsApp monthly count. Add a correctly labelled WhatsApp card and scoped usage detail. |
| Operator reporting | `packages/oversight/src/{routes,payment-notifications}.ts` | Oversight has authenticated payment-notification policy/usage routes. Extend its established operator boundary for WhatsApp reporting; do not expose the global operations helper to ordinary users. A WhatsApp operator UI still needs wiring in the existing console. |
| Billing | `packages/db/prisma/models/owner-billing.prisma`; owner-billing queries; Paystack subscription adapter | Owner account, subscription, verified purchases and business coverage exist. No consumable WhatsApp-response purchase/grant flow was found in these inspected paths. A subscription receipt is not automatically a consumable credit grant. |

Existing payment-report notification quotas and business-owned customer-channel messaging are separate products. This proposal targets the merchant assistant reached through the EwaTrade platform number. Do not silently apply it to OTP, customer notifications or merchant-owned WhatsApp connections.

## Proposed policy, with decisions still open

Two optional owner questions were sent during planning: allowance scope and whether reply 1,000 includes an answer. Until answered, the following remain recommendations.

| Decision | Recommendation | Consequence / alternative |
| --- | --- | --- |
| Paying customer | One server-derived owner billing identity shared across their eligible businesses, staff, Stores and linked numbers | Prevents multiplying the allowance by adding staff/businesses. Per-business is simpler and matches current token scope, but multiplies credits under one subscription. Per-user invites allowance multiplication. |
| Period | Calendar month, UTC, explicit next-reset time in UI | Matches existing General monthly keys. A subscription-anniversary period is possible but requires renewal alignment and a different reset contract. |
| Base allowance | 1,000 logical ordinary assistant responses | No tier variation in this plan. Keep commercial plan eligibility separate from credit availability. |
| Final response | Answer the question and append one deterministic exhaustion footer | A notice-only 1,000th response would provide only 999 useful answers. Owner choice remains open. |
| Exhausted behavior | Hard stop new ordinary work; no repeated quota replies | Delaying generated replies alone does not cap total spend. Soft slowing before exhaustion is a later policy, not part of the initial cap. |
| Customer-facing unit | “WhatsApp replies” / “extra replies” | Model tokens are a different meter. Do not imply that a token purchase necessarily increases reply allowance. |
| Purchased pack | Extra replies allocated to the same paying owner identity | Pack size, price, expiry, rollover, refund treatment and any included token/media allowance need commercial approval before checkout implementation. |
| Once-only notice | At most one base-exhaustion notice per paying identity/UTC month | Top-ups must not reset this marker. If notices at later pack exhaustion are desired, approve a separate entitlement-version rule. |

Use a stable server billing-owner identity even before a paid subscription exists. If the existing account row is absent or billing activation is off, resolve the canonical Tenant owner; use the same owner-user identity and link its billing account later. Do not create an owner billing account as a side effect of reading usage, grant free credits per reconnect, or fall back to the staff sender as payer. Multiple owner memberships or unresolved ownership fail closed for paid work and surface an actionable diagnostic.

Ownership/coverage changes never move already consumed usage or purchased credits to another owner. Re-resolve current ownership before admission and delivery; invalidate pending work when its payer/authority changes. Formal transfer requires a separately reviewed reconciliation command. Releasing/re-enrolling business coverage, switching Stores, or disconnecting WhatsApp does not reset usage.

## Exact counting contract

One credit buys one logical ordinary assistant response to one accepted request, regardless of model tool steps or transport chunk count. It covers an answer, clarification, ordinary draft/review presentation, deterministic ordinary collector response, ordinary pagination or supported assistant handoff. Count ordinary replies across General, Setup and Product to avoid an alternate-purpose bypass. Batched text ingress that becomes one request produces one credit-bearing response.

Do not count inbound messages, typing/read events, duplicate webhooks/jobs, model tool calls, provider retries, delivery status callbacks, the exhaustion footer itself, or in-app replies. Do not use a provider message ID or raw outbox-row count as the billing identity. A later edit that produces a genuinely new ordinary response uses a new response identity; replay/re-render of the same response does not.

Essential deterministic STOP/disconnect, identity/proof/OTP, privacy controls and canonical confirm/cancel of an already prepared draft remain outside commercial admission. Their bounded status/results also remain available, so quota exhaustion cannot strand a pending decision. These are explicit enumerated exceptions with existing security/transport limits, not a broad “all deterministic messages are free” exemption. Ordinary Help/menu loops must not become an unlimited messaging bypass. Never run a model or media extraction inside an exemption.

Reserve a credit before ordinary model, transcription, image/file processing, domain work that could produce an ordinary reply, or typing feedback. Preserve the dedicated control/identity/status routing before this gate. Already-proven canonical action recovery must also precede new admission so it can settle safely without repeating an effect.

Commit the customer credit once the first chunk is accepted by the provider, using the existing attempt proof or a correlated receipt. Label this meter “sent replies”; provider acceptance is not proof of delivery/read. Keep delivery/read/failed statuses separate. A later failed-delivery receipt does not silently refund an accepted send. A response with some accepted chunks costs one credit. Bound chunks and record physical message volume separately.

If nothing was accepted and all work is proven terminal, release the reply reservation. Record model/media cost even when the reply credit is released. Apply bounded retry/attempt and token/media guards so repeated failures cannot create unlimited free AI work. UNKNOWN keeps its reservation pending, with no blind resend/refund. Release after a crash only when durable proofs show no live worker, unsettled effect or possible provider send remains; elapsed lease time alone is insufficient. An explicitly audited reconciliation can resolve a genuinely stuck reservation.

## Data model and invariants

Names are proposed; Prisma remains schema authority.

1. `AssistantWhatsAppQuotaPeriod`: stable payer identity, UTC period start/end, base limit, verified extra-credit total, committed replies, reserved replies, policy version, once-only base notice reference/state and timestamps. Unique payer + period. Store narrow daily totals only if needed for the selected dashboard query, rather than a second authoritative counter.
2. `AssistantWhatsAppResponseUsage`: unique canonical response key, period/payer, actor/Tenant/Store attribution, inbox/run/message or canonical action-result reference, response class, reservation/settlement state, current worker proof, first accepted outbox/attempt, final-notice ownership and timestamps. No message bodies, transcripts, phone numbers, proof values or raw payment credentials. Links to short-lived content are nullable; deleting chat/outbox content must not refund or cascade-delete the quota evidence.

The response key is derived from the server's canonical inbox/request and response role. It must support deterministic responses without a model run. Related chunks, response revisions and late receipts retain that key. Unique constraints make retries safe: repeating the operation has the same accounting effect.

Core invariants:

```text
effectiveLimit = baseLimit + verifiedGrantedReplies - verifiedRevokedUnusedReplies
committed >= 0; reserved >= 0
new admission requires committed + reserved < effectiveLimit
one logical response -> at most one committed credit
one payer/month -> at most one accepted base-exhaustion footer
no positive balance -> no new ordinary paid work
unknown result -> retain reservation; never infer a refund
month of admission remains pinned through retries and late receipts
```

Use short existing Prisma/PostgreSQL transactions with consistent payer-period -> response lock ordering, unique keys and conditional state transitions. Reconcile existing channel/billing locks before implementation to avoid inverse ordering. No provider HTTP request or model/media call runs while a database lock is held. Reuse the repository's bounded transaction-conflict retry helper; a retried transaction must never repeat external effects.

Near exhaustion, distinguish “all slots temporarily reserved” from “all replies used.” At 998 committed with one outstanding reservation, defer another ordinary request until that outcome settles. Reserve the final slot only when 999 are committed and no other ordinary reservation can still change that boundary. This small durable boundary barrier prevents two final notices or a premature “1,000 used” claim when another in-flight request fails. Existing jobs/FIFO recovery resume the deferred request within its original expiry; do not start a new model run or extend its response window. Concurrent business bindings share this same payer barrier.

For the final response, claim the period's notice ownership and create its immutable rendered content with the response settlement transaction. Append the fixed footer to the final reply bubble, reserving renderer space and obeying chunk/length limits. Do not enqueue a separate 1,001st quota message. For long answers, the footer occurs once in the last chunk; it does not earn a second credit. Keep “notice staged,” “provider accepted,” and “delivered” distinct. Only a proven unsent terminal response can relinquish notice ownership. UNKNOWN cannot.

Partial delivery is a real limitation: earlier chunks may be accepted while the final chunk containing the footer fails. Retry/reconcile that original final chunk using existing delivery rules; never manufacture an additional quota notice. Surface the failed notice to operators and the quota state in Dashboard. If guaranteed single-bubble final delivery is commercially required, approve a bounded final-answer/handoff renderer in the design phase; do not truncate financial facts or URLs silently.

Recheck current entitlement before dispatch. If a verified top-up arrives while a final notice is staged but unsent, replace the unsent rendered revision through the existing immutable-version mechanism to omit stale exhaustion copy. Never mutate already-started/UNKNOWN content. If it already sent, the dashboard shows the now-restored balance; the message remains truthful to its send-time state. No automatic unsolicited WhatsApp “balance restored” push is needed.

Month reset creates/selects a new period on demand. No midnight cron and no reset of prior rows. Pending/UNKNOWN responses remain pinned to their original period, obey their original deadlines and cannot be replayed against the new month's credits. Reset date and usage period must reflect this admission-based attribution.

## Processing flow

```text
Signed webhook -> recipient routing -> identity/proof/control/status handlers
   -> scoped durable inbox -> existing worker claim/recovery
   -> fresh permissions + canonical payer + request classification
      -> essential deterministic action/control: canonical bounded path
      -> ordinary response: reserve payer/month credit
          -> exhausted: terminal quota block, no AI/media/send
          -> reserved boundary busy: existing bounded defer/recovery
          -> reserved: shared assistant/media/domain path
              -> durable result + immutable outbox (+ final footer if owned)
                  -> fresh authority -> provider attempt outside transaction
                      accepted/receipt -> commit credit once
                      proven no-send failure -> release once, retain AI usage
                      unknown -> hold + receipt-only reconciliation
```

Preserve run recovery and canonical business effects independently from sending. Quota reservation is not permission, payment verification or confirmation of a merchant write. Recover a result committed before a process crash instead of repeating the write or charging a second credit.

## Customer and operator dashboards

Reuse `/account/whatsapp` for connection-context usage and `/settings/billing` for the owner allowance/top-up entry. Proposed primary card: **“WhatsApp replies: 742 of 1,000 used. 258 available. Resets 1 December, 00:00 UTC.”** Display purchased balance and pending reservations distinctly. During a pending final send, show “Final reply processing,” not a confirmed delivered quota notice. At exhaustion, explain that ordinary WhatsApp replies are paused; app access remains governed by its existing entitlements/token budget.

Read API returns explicit response fields: period, payer scope label, base/extra limit, sent/reserved/available replies, reset timestamp, state, policy version and authenticated top-up destination/readiness. Preserve existing General allowance and snapshot contracts. Update the shared “no reply cap” formatter so it clearly refers to in-app General usage and separately discloses WhatsApp's channel limit. Do not turn the deprecated General `remainingRequests` number into a reply balance or disable the app when WhatsApp alone is exhausted.

Owner/admins with the existing appropriate business access can view permitted business usage. Only the payer owner sees account-wide totals and billing details across businesses. Staff get only the scoped availability necessary to use the assistant; they must not enumerate sibling businesses, coworkers' private chats or billing history. Top-up links take staff to an owner-contact/permission state and never confer purchase authority. Server derives payer and all authorization; callers cannot select arbitrary owner IDs. Refresh/invalidate across logout, business switch and owner/coverage change, using existing session cache-generation rules.

EwaTrade operator view, behind existing Oversight authentication: paginated customer/owner rows with business/staff breakdown, daily ordinary response totals, pending/UNKNOWN reservations, quota blocks, physical accepted/delivered messages, model input/cached/output tokens, voice/image activity, estimated cost with rate version, missing-cost coverage and last activity. Filters: month, business, usage percentage and blocked/error state. Initially show 80%/90%/100% dashboard indicators without sending more WhatsApp warnings. Record blocked admissions as bounded aggregate counts, not raw denied message content or one permanent row per spam message.

Cross-customer visibility belongs to the operator console, never the normal merchant dashboard. Reuse the established console's transport/auth adapter; do not create a second admin app merely for this feature. Confirm its current UI repository at implementation time. Unknown provider costs remain “unknown,” not zero. Reports need no message text.

## Cost protection beyond counting replies

The cap limits logical customer usage, not an exact currency amount. Physical chunks/retries, prompt size, model/tool calls, voice and image processing have different costs. Keep existing per-minute/day transport and media limits, bounded steps/output (General currently six steps / 2,000 max output tokens; Workflow eight / 2,000), bounded retries, permissions and token budgets.

Retain the 5m General token ceiling. Buying extra replies must not silently erase it or raise Setup/Product/media ceilings. If reply credits remain but a token/media guard refuses, report that specific reason and do not consume a reply credit. The top-up page must disclose whether a pack includes any model/media allowance. Never advertise a purchase as restoring service when another exhausted guard will still block it.

A strict currency ceiling would require reserving worst-case model/media spend before each provider operation and reconciling actual usage, plus verified rates/provider controls. That is not supplied by the current completion-based token guard. Treat tighter spend reservations as a separately sized prerequisite if the owner requires a guaranteed cash ceiling; do not claim this 1,000-response feature gives one. Also consider a platform-wide configured emergency pause for new assistant work, using the existing channel gate, since many individually capped customers can still create substantial aggregate spend.

External verification on 9 November: [Meta's pricing page](https://whatsappbusiness.com/products/platform-pricing/) distinguishes delivered messages, category and recipient market and describes service-message exemptions. This plan assumes neither a universal per-reply price nor a free allowance tied to our 1,000 logical responses. Confirm the actual sender/account billing and effective rate card before pricing packs. Actual invoices are not available from the current usage projection.

Transaction approach uses established [PostgreSQL row locking](https://www.postgresql.org/docs/current/explicit-locking.html) and the installed Prisma client's transaction API. Repository runtime is Prisma 7.6.0; use the matching generated client's existing transaction helpers and [versioned Prisma 7 transaction reference](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions), not newer unversioned API examples. No ORM/runtime upgrade is proposed.

## Top-up lifecycle

Link copy proposal: **“You've used your 1,000 WhatsApp replies for this month. Replies are paused until {reset date}. Get extra replies: {trusted authenticated billing URL}.”** Attach after the ordinary final answer. Use “your account” for a shared owner allowance and show the scope in Dashboard. Substitute “Ask your account owner to add replies” for staff; do not expose account-wide details in chat.

The real target must exist before displaying an actionable purchase promise. Reuse the authenticated billing shell, with server-created checkout bound to payer, exact pack, currency/price, expiry and a request key. A browser return URL is navigation, not payment proof. Only a verified provider event creates one immutable credit grant, unique by provider/environment/transaction/item, in the same transaction that updates the allowance. Duplicate/out-of-order callbacks must not add credits twice. Preserve grant/consumption/refund attribution and audit history; refund only the unused approved portion or follow an explicitly approved consumed-credit debt policy, never reset consumed usage.

Existing Paystack subscription plans do not prove a consumable product exists. Confirm supported one-off checkout/verification and legal/billing policy in the billing slice. Native consumable products and external purchase-link rules require separate current store-policy review if surfaced in native apps. No native purchase integration is implied here. Pack pricing, expiry, carryover and provider activation are unresolved gates.

Before paid top-up readiness, the dashboard may explain the monthly reset and top-ups coming later, but the WhatsApp footer must not contain a fake/broken “buy” URL. The requested full cap-plus-purchase-link experience is not accepted until its real top-up destination and verified grant flow work. Splitting delivery does not mark the commercial feature complete early.

## Scenario and failure matrix

| ID | Scenario | Required behavior / failure handling | Verification planned |
| --- | --- | --- | --- |
| Q01 | Ordinary reply below allowance | Reserve before paid work, commit one credit on first accepted chunk | Domain unit + worker/delivery integration |
| Q02 | One answer, several chunks or tool steps | One customer credit, several physical messages recorded | Renderer/delivery integration |
| Q03 | Reply 1,000 | Ordinary answer plus fixed footer once; no standalone 1,001st message | Boundary integration + designed conversation/UI acceptance |
| Q04 | Several staff/businesses race for final slot | Shared payer lock and boundary barrier admit one final response; no premature notice | Concurrent transaction integration |
| Q05 | 998 committed, outstanding request later fails | Defer final admission until settled; do not announce 1,000 early | Concurrent failure integration |
| Q06 | Messages after exhaustion | Signed ingress/control handling continues; no model/media/typing/ordinary outbox; aggregate blocks | Worker integration with spies on expensive boundaries |
| Q07 | Duplicate webhook/job/receipt or renderer revision | Same response key; one reservation/commit/notice | Existing replay suites extended |
| Q08 | Model/media fails or provider rejects before acceptance | Proven terminal no-send releases reply; retain actual cost; bounded retries | Failure integration |
| Q09 | Send timeout or worker dies after provider call | UNKNOWN holds credit/notice; correlated late receipt settles once, no blind resend | Delivery/crash integration |
| Q10 | Some chunks accepted, final footer chunk fails | Charge one; recover original chunk only; show notice failure to operator | Partial delivery integration |
| Q11 | Crash after canonical merchant commit | Recover exact saved effect/result; no repeat write or charge | Canonical action recovery regression |
| Q12 | Quota reached while draft awaits Confirm/Cancel | Essential existing decision and bounded receipt remain usable with no model bypass | Action/control integration |
| Q13 | STOP/privacy/OTP/status while exhausted or disabled | Existing dedicated routing remains usable and isolated from model input | Routing regressions |
| Q14 | Midnight UTC, late receipt or old queued work | New period on demand; old work pinned to old period and original expiry | Clock-based unit + integration |
| Q15 | Reconnect, Store/business switch, staff added | No fresh allowance; same owner identity | Scope integration |
| Q16 | Membership/payer/coverage changes during a run | Fresh authority fails closed; no foreign send/credit transfer; settle safely | Revocation/ownership regression |
| Q17 | Top-up before final notice sends | Verified grant once; revalidate unsent revision, suppress stale footer; never mutate UNKNOWN | Billing/delivery concurrency integration |
| Q18 | Duplicate/forged payment or browser success redirect | No unverified credit; unique verified grant; show pending/failed payment honestly | Provider adapter + money integration |
| Q19 | Refund/chargeback after partial consumption | Preserve usage; apply approved unused-credit/debt policy, no minting/refund loop | Money/concurrency integration |
| Q20 | Dashboard API unavailable or stale session | Unavailable state, never fake zero/unlimited; purge cross-account data | API permission + one focused browser flow |
| Q21 | Staff or merchant requests other owner/global data | Scoped denial, no sibling-business/private-chat exposure | Permission tests |
| Q22 | Token/media ceiling reached before reply count | Specific reason; no paid work or spent reply; avoid misleading top-up offer | Budget regression |
| Q23 | Payer resolution or quota database unavailable | Fail closed before paid work, operator diagnostic; normal existing app/control paths | Worker error integration |
| Q24 | Cleanup/account deletion/history export | No quota reset through chat deletion; privacy export/retention follows reviewed attribution | Privacy regression |

Every planned new boundary above has an error outcome and verification requirement. No implementation or new test has run; this table is a test specification, not measured coverage.

## Test coverage map

```text
PROPOSED CODE PATHS                         USER FLOWS / REQUIRED NEW EVIDENCE
quota domain [GAP: not built]               allowance below cap -> normal response Q01
  reserve/commit/release                    last reply + one notice Q03-Q05
  period/payer/notice ownership             silence after cap + usable controls Q06,Q12-Q16
worker/media admission [GAP]                no expensive work after exhaustion Q06,Q22,Q23
outbox/receipt settlement [GAP]             retry/crash/partial/unknown send Q02,Q07-Q11
owner/merchant read API [GAP]               correct scope + session change Q20,Q21 [integration]
operator aggregates [GAP]                  bounded reports, cost unknown visibly [integration]
verified top-up grant [GAP]                 payment/duplicate/refund Q17-Q19 [money integration]
dashboard presentation [GAP]                balance/reset/purchase pending Q20 [browser]

EXISTING REUSE, NOT RE-RUN IN THIS TASK:
transport usage integration, daily quota-notice tests, delivery/worker replay tests,
General budget admission/allowance tests, owner billing verification/coverage tests.
These cover existing foundations, not the proposed monthly feature.
```

Add domain tests alongside the proposed DB quota module and extend existing `channel-turn`, `channel-delivery`, `assistant-channels`, notice/renderer and operations suites. Require real guarded non-production transaction tests for final-slot races, crash settlement and verified credit grants; mocks cannot prove locking/unique constraints. Do not run a 1,000-message provider flood. Boundary fixtures belong only in explicitly authorized integration targets, never existing-data UI smoke. Deterministic notice policy needs no model judgment; if ordinary prompt/output behavior changes, select the matching assistant eval cases then.

Future verification starts with `bun run qa:doctor --offline`, inspects `bun run test:quick --plan`, selects only owned paths when excluding concurrent work, and runs the relevant H01/H02 assistant gates, source types/lint and focused suites once ready. Follow `docs/testing.md` for `qa:smoke` with existing data. No sale/payment submissions or manufactured fixtures during UI smoke. A payment-specific sandbox acceptance is a separate explicitly authorized money check.

For approved Prisma implementation, use root `db:migrate` and `db:push` with the repository's explicit selected non-production profile and target checks; let Prisma generate migrations. No manual migration SQL or production schema operation from this plan. Record candidate/target evidence before rollout; Preview smoke must match the eventual Production candidate. QA success alone does not authorize deployment.

## Implementation sequence and design lifecycle

1. **Policy and conversation design.** Resolve payer scope and final-reply semantics, response/exemption classification, top-up commercial terms, retention and cost-ceiling requirement. Update stable cases in canonical Workshop `ewatrade/assistant/whatsapp-system` from its implemented direction, append immutable versions, and mirror the existing private Site in the authorized design delivery. The newer `assistant/conversations` library is documented as unselected/unimplemented; do not treat it as permission to replace the implemented baseline. Record owner-approved exact revision before product implementation. No Workshop change is made by this planning task.
2. **Quota domain and persistence.** Add period/response models, unique/index constraints, privacy handling, clock policy and transactional reserve/settle/recovery with boundary tests. Update Brain schema/relationships/migrations only when actually changed.
3. **Channel enforcement and notice.** Integrate all ordinary General/Setup/Product/deterministic/media paths, preserve essential actions/controls, connect outbox/receipt settlement and fixed final footer. Add H01/H02 and API/permission documentation for the actual feature change.
4. **Customer and operator visibility.** Add scoped usage API/card/detail and operator projection using existing shells/auth; correct ambiguous “no reply cap” copy. Verify one focused browser session with relevant failure/back/session paths. Mobile feature/release work is separately scoped if required.
5. **Verified top-ups.** Implement approved pack/catalog/checkout/grant/refund terms and truthful authenticated destination. Test duplicate/money/concurrency paths and reset/top-up interaction. Do not activate an unready provider or substitute subscription receipts as credit purchases.
6. **Acceptance and authorized rollout.** Audit/shadow attribution without new provider messages, verify exact candidate in approved non-production scope, then separately authorized controlled enforcement and real-channel checks. Monitor denied admissions, unknown reservations, notice failures, model/media cost and operator query load. Keep records when disabling enforcement; prefer an existing assistant pause over rollback that silently opens unlimited spend.

Sequential implementation in the current checkout; no worktree or parallel-agent execution is authorized. The customer/operator presentation depends on the contract and quota domain, billing depends on the commercial decisions, and all enforcement/settlement steps touch the same accounting invariant. Commit coherent owned slices and preserve concurrent release candidates.

Engineering sizing estimate, not a delivery promise: core quota + enforcement + visibility is approximately 4–7 engineer-days including focused integration work; a complete new paid pack flow adds approximately 3–5 engineer-days plus external review/activation time. An agent can shorten source authoring, but actual money/provider/concurrency acceptance and owner review still determine delivery. Re-estimate after policy/design and the billing adapter spike.

## Not in scope

- Changes to the shared in-app General reply allowance or existing Setup/Product/token/media ceilings: channel quota is separate.
- Adaptive response delays, tier-specific quotas, per-staff subquotas and automated upsell warnings: hard cap plus visibility first.
- A strict global or per-customer currency ledger: requires separately sized worst-case spend reservation and verified rates; current cap is not a cash guarantee.
- OTP, payment-report notifications, customer-service-channel messages or unrelated Meta sender configuration: different transport/domain authorities.
- Native consumable purchases, mobile store submission or OTA: separate policy/native acceptance scope.
- Retrospective charges or reconstructing exact old reply consumption from expiring counters: no reliable monthly reply ledger exists yet.
- Provider checkout activation, actual charges, hosted DB changes, Workshop/Site publication and deployment during this planning task.

Launch recommendation: start accounting at the approved cutover (or a prior explicit shadow start), show a full 1,000 base allowance, and retain an `accountingStartsAt` marker for a partial first month. Do not silently charge historical traffic. Any backfill is a separately reviewed estimate, never mixed with verified charged replies.

## Review and roadmap status

Architecture reviewed: shared payer, pre-work reservations, provider uncertainty, final-slot barrier and canonical action recovery are covered as proposals. Code-quality review: one quota module, no parallel counter engines, additive contracts, no prompt-controlled allowance or privilege. Test review: 24 specified scenarios, all feature evidence still pending. Performance review: one indexed payer/period read or short transaction per admission/settlement; no growing history scan per reply, no lock over provider work, bounded paginated operator aggregation, reuse existing recovery. The payer lock serializes short accounting only; do not serialize all AI generation for the month.

Recommendations remain unapproved. In particular: payer scope, final-answer semantics, pack commercial terms, and whether a strict money ceiling is required. This draft is not an implementation-clearance or full interactive engineering-review acceptance. No independent reviewer/subagent ran. Follow-up work is captured in this plan and the Brain backlog, not a second TODO registry.

Planning checklist: current-state audit complete; scenario/architecture/test plan complete; implementation roadmap/documentation complete, **3/3 (100%)**. Product roadmap Q1–Q6 above: **0/6 implemented or accepted (0%)**. Existing WhatsApp W46/W47 and broader acceptance counts remain unchanged.

Planning validation: `qa:doctor --offline` passed its offline profile/dependency/client checks (freshness/runtime not certified); `test:quick --plan` selected four core source-smoke tests on the initially clean checkout, with no unknown paths. No tests executed, no database connection/provider call/UI session or payment was performed. Documentation/link and Git diff checks are recorded with the final commit.
