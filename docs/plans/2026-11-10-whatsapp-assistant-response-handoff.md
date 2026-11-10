# WhatsApp assistant response handoff and alternate delivery plan

Date: 10 November 2026. Source baseline: `6d5295eb4` on the existing `main` checkout.
Status: proposed product and engineering plan; implementation has not started.

## Recommended behavior

Keep WhatsApp useful for quick questions and short exchanges. For a result that
benefits from cards, lists, filters, charts, attachments or a substantial review,
send a short useful preview plus **View full response**. That link opens the exact
saved assistant message and answer using the existing web or mobile assistant UI.
The person can continue the same conversation without asking the question again.

After the monthly WhatsApp reply allowance is used, a connected user who has opted
in can continue sending supported read-only questions through WhatsApp and collect
the answers in their private EwaTrade assistant inbox. In-app notifications and
optional verified-email alerts point to that answer. Device push is a later,
separately verified delivery capability. App access, AI/media budgets and abuse
limits still apply; switching the reply destination does not create free AI work.

Here, “customer” means an authenticated EwaTrade user using the platform assistant
number, including a merchant or their authorized staff. Public shoppers talking to
a business-owned WhatsApp number use the separate customer-commerce channel. They
must not receive links into a merchant's private assistant. Supporting shopper
handoffs would require its own public/customer-authenticated design and policy.

## How this extends the existing quota plan

The [9 November quota plan](2026-11-09-whatsapp-response-quota.md) remains the
foundation for reservations, final-slot concurrency, delivery uncertainty,
reporting and optional purchased replies. Its 1,000-reply cap is **planned, not
currently enforced by the inspected source**. Current General admission is based
on tokens; existing WhatsApp transport limits use short time windows.

This proposal changes one recommendation: after reply exhaustion, use an explicit
`app_replies` preference to permit eligible read-only work with app-only delivery.
Without that consent, retain the earlier hard stop before new AI/media work. It
also adds a near-limit warning and replaces a long final WhatsApp answer with a
bounded preview, exact response link and exhaustion footer. These are proposed
extensions, not silent changes to the earlier policy or approved runtime behavior.
Payer scope remains a decision: recommend one canonical owner allowance shared
across eligible businesses, staff and linked numbers, with UTC calendar months.
Do not invent a separate 1,000 allowance for every staff member or reconnect.

## Current foundations and missing pieces

| Area | Existing source to reuse | Gap for this feature |
| --- | --- | --- |
| Shared assistant result | `packages/assistant/src/general/contracts.ts`; canonical conversation messages and stored parts | Stable exact message/answer focus contract; keep the rich result before producing the short transport preview |
| WhatsApp presentation | `packages/assistant/src/channels/render.ts`, `presentation.ts` | Deterministic compact preview policy; current renderer can emit multiple chunks and is not a universal first-three-items renderer |
| Saved General chat link | `packages/assistant/src/channels/conversation-links.ts` produces `/assistant/c/<id>` | Exact answer targeting, verified native entry and sign-in continuation |
| Saved record links | `packages/assistant/src/channels/read-record-links.ts`; `apps/mobile/src/lib/saved-record-link.ts` | Reuse origin validation and navigation-only authority; an individual Catalog record is different from the full assistant answer |
| Web rendering | `apps/dashboard/src/app/(shell)/assistant/c/[id]/page.tsx`; `general-answer-card.tsx` and adjacent General assistant components | Load/focus the requested saved answer; preserve original conversation and current scope |
| Native rendering | `apps/mobile/src/components/mobile/assistant/ask-assistant-screen.tsx`, `ask-assistant-live.tsx`, `use-general-assistant.ts` | Resolve HTTPS response links to the saved native chat and focus its message/answer |
| Native link entry | `apps/mobile/app.config.ts`; `apps/mobile/src/app/+native-intent.tsx` | Extend current onboarding, saved Catalog and customer-chat link handling for assistant responses; do not claim current arbitrary assistant URLs already open natively |
| Native Orders paging | `packages/assistant/src/channels/read-pagination.ts`; API `channel-read-page-turn.ts` | Existing exact Orders continuations are not a general all-products/full-result browser |
| Channel processing | API `channel-turn.ts`, `channel-delivery.ts`; DB `assistant-whatsapp/{conversations,outbox,delivery}.ts`; existing identifier-only jobs | Separate input source from delivery destination while preserving current actor, binding, FIFO, recovery and durable result ownership |
| Notification foundations | `packages/notifications/src/core-types.ts`, `delivery.ts`; existing jobs/email adapters | Shared channels currently declare `in_app` and `email`. Private assistant-ready notification/receipts and app inbox integration need work; generic mobile device push is not established by those contracts |
| Monthly reply control | Existing quota plan, not a shipped monthly ledger | Implement quota accounting once; alternate delivery consumes no WhatsApp reply credit and still consumes its applicable AI budget |

No second assistant engine, duplicated business rules or detached “WhatsApp result
viewer” is needed. Reuse each platform's existing typed cards and editors. Planned
or unsupported capabilities remain unavailable even if their preview could fit.

## What stays in WhatsApp and what opens in the assistant

The following is the proposed presentation policy while WhatsApp replies remain
available. After exhaustion, the delivery policy below takes precedence.

| Request or result | WhatsApp | Full assistant experience |
| --- | --- | --- |
| Greeting, help, short explanation, one clarification | Complete compact reply | Optional saved chat; no forced click for a short useful answer |
| One simple fact, such as a supported stock quantity or order status | Answer plus relevant scope/as-of/caveat | Optional original record link or exact answer link |
| Product, customer, order, stock or supported service list | First up to three meaningful rows, scope and a “more available” statement when proven; one response link | Existing list/cards, authorized detail, deterministic supported paging and filters |
| Supported business summary/report | Headline and one or two key facts, with currency, period and material qualifications | Rich answer/charts where implemented; otherwise the existing report page with an honest capability label |
| Long explanation or several answer cards | Short summary; essential warnings remain visible | Full saved response and all its supported cards |
| Simple supported write while quota remains | Existing exact-version native review and Confirm/Edit/Cancel behavior | Optional full review; this plan does not remove current supported native actions |
| Complex edit, import, multi-step financial review or unsupported native action | Clear description of the next step and authenticated continuation | Existing canonical form/review and explicit confirmation; GET/navigation never saves |
| Receipt for an existing action | Preserve effect, amount/status and uncertainty truthfully; link for detail | Original canonical receipt/result; no second execution |
| Identity, email/OTP proof, STOP/disconnect, privacy and bounded recovery | Existing deterministic dedicated handlers | Relevant account/settings destination when appropriate; never model-interpreted proof |
| Unsupported or forbidden capability | Clear refusal or existing supported destination | No invented result, entitlement or write authority |

Choose the policy from validated typed result/capability metadata plus bounded
length checks. The model may propose ordinary prose but cannot choose a trusted
URL, authorize access, decide billing state or hide a material warning. Avoid a
configurable routing-rule builder for the first version.

Example, assuming only a bounded page is known:

> Here are the first 3 products in your Shop catalog:
> 1. Layer mash — ₦18,000
> 2. Grower mash — ₦17,500
> 3. Starter mash — ₦19,000
> More products are available. View the full response: [authenticated response link]

Use a total such as “3 of 48” only when the canonical query provides an authorized
exact total. A saved page is not the whole catalog. Do not fetch the entire catalog
just to create this preview. Keep full labels in the app and identify shortened
labels in WhatsApp. Preserve money/unit/time semantics; do not truncate a link,
financial fact or safety-critical qualification to meet a cosmetic preview limit.

## One link into the same saved answer

Proposed public entry shape, not an existing route:
`https://dash.ewatrade.com/open/assistant-response/<messageId>`.
The server resolves its conversation and optional answer identity under current
authorization. One message containing multiple cards can carry a validated answer
identifier when needed; it never carries the answer body or credentials.

1. Persist the ordinary assistant message and typed answer parts before staging
   its WhatsApp preview. Link only to the committed canonical message.
2. An installed compatible app may open the HTTPS link directly through iOS
   Universal Links or verified Android App Links. Otherwise the web route opens.
   A browser-first redirect is not required for native delivery.
3. Web resolves to the existing saved chat, for example
   `/assistant/c/<conversationId>?message=<messageId>&answer=<answerId>`.
   Native resolves to `/ask-assistant?conversationId=...&messageId=...&answerId=...`.
   New focus parameters are proposed contracts; current consumers must be extended
   and tested rather than assuming they already work.
4. Preserve an allowlisted pending destination through ordinary sign-in and app
   bootstrap. A wrong account gets no preview of private content. A business/Store
   mismatch offers explicit selection and revalidation; never silently retarget
   the answer to the current business or change WhatsApp's active binding.
5. Open, load and scroll/highlight the exact answer, with its original as-of time
   and a small “From WhatsApp” source indication. Opening does not rerun a model,
   create a duplicate chat or charge another WhatsApp credit.
6. Render the saved bounded result. “Load more” uses its server-validated query
   provenance and current canonical reader. Show that fresh pages may reflect
   changed data; a refresh is separate from the original saved answer.
7. Continue follow-ups in the same authorized chat. App-origin turns reply in the
   app; the next WhatsApp-origin turn follows its current delivery policy.

App opening is a best-effort platform behavior, not a guarantee for every installed
app. User preferences, unsupported old builds and embedded browsers can keep the
link on the web. Provide **Continue on web** and an intentional **Open in app**
action where supported; never use redirect loops or force installation. Preserve
the exact destination across either choice. Native association/manifest changes
may require a new signed build; do not promise OTA-only delivery.

Both message and answer must belong to the actor's permitted conversation and
original business/Store. Check current membership, role, entitlement and any
record-level restrictions on every read/detail/paging request. A forwarded URL
confers no access. A locator is not login or a bearer grant. Account logout and
scope changes clear pending private UI/cache state. Removed access, deleted/expired
content and unavailable capabilities show safe recovery without resurrecting
retained privileged data. Disconnect keeps existing app history according to
current policy but revokes future WhatsApp processing and pending channel sends.
No stateful work occurs on GET; link preview crawlers get generic metadata only.
Use private/no-store response handling and exclude locator/query content from
analytics, referrers and message-body logs.

## Quota warning and alternate delivery

Recommend a warning at 900 of 1,000 sent logical replies, appended once to an
ordinary answer, followed by one final exhaustion notice with the last allowed
reply. Both markers belong to the shared payer/month ledger and require concurrent
claiming and receipt-aware recovery. A warning is not a separate message or a
second credit. Users arriving late or missing a warning still see current state
in app settings and the final response. Do not announce “100 remaining” without
accounting for pending reservations and current verified extra credits.

| State | Processing and destination |
| --- | --- |
| Below warning threshold | Normal WhatsApp answer or compact preview plus link |
| Near limit | Same response, plus one short notice that app replies can continue; configure delivery preferences through authenticated settings |
| Final ordinary reply | One bounded useful preview plus exact answer link and once-only exhaustion footer in the same bubble; full result already exists in app |
| Exhausted, `app_replies` opted in | Accept supported read-only questions from the still-authorized linked sender; persist answers in the same app chat, notify privately, send no ordinary WhatsApp acknowledgement, typing feedback or reply |
| Exhausted, no opt-in | No new ordinary model/media work. Existing bounded rejection/control behavior and app status remain; do not imply an answer was generated |
| Exhausted, mutation requested | No new domain mutation. Record an app-visible “Continue in EwaTrade” status; the user initiates/reviews the write in the authenticated app. Existing pending Confirm/Cancel/recovery retains its explicit narrow exception |
| AI/entitlement/media allowance unavailable | App-visible reason/status, no generated answer and no silent unbounded queue |
| Monthly reset or verified extra replies | New WhatsApp-origin requests become eligible again under current preferences; never resend historical app-only results or send an unsolicited reset message |

Suggested final copy for a user who has already opted in:

> [Short answer preview]
> Your WhatsApp reply allowance is now used for this month. You can still send supported questions here; replies will appear in your EwaTrade assistant.
> View your response: [authenticated response link]

For a user without opt-in, replace the continuation promise with “Open EwaTrade to
continue or enable app replies.” The footer must not promise email or push unless
that user's selected destination is verified, enabled and operational. Put the
response link and footer in one bounded bubble so a successful early chunk does
not hide a failed final notice. Preserve the earlier UNKNOWN/reservation rules;
accepted is different from delivered, and neither proves the user read it.

At the exact boundary, transport destination is durable and separate from input
source: `inputChannel=whatsapp`, `replyDestination=whatsapp|app`, reason and policy
version. Fresh sender/grant/scope and eligibility checks precede admission. Choose
and persist app-only mode before model/media work; it does not reserve a WhatsApp
reply. A reserved WhatsApp response keeps its original reservation through receipt
settlement. UNKNOWN must not be refunded or rerouted as a fresh response. An
already-saved result can still be read in app regardless of its transport status.
Preference or ownership changes before unsent delivery invalidate/replan only via
the same durable request; never create another model run or domain effect.

This is an extension to the earlier hard-stop design. Implement the monthly quota
foundation before relying on this boundary. Keep token/media budgets, inbound rate
limits, bounded active jobs and backlog expiry in both modes. Start app-only mode
with text read-only questions and a read-only tool allowlist. Domain guards must
refuse proposal creation, confirmation and writes even if a model misclassifies
the request; there is no ungated model classifier before budget admission.
Voice/file interpretation and new writes wait for separate scoped acceptance. Essential identity/privacy/control/recovery traffic
retains its existing bounded path and may still incur transport cost. Therefore
1,000 logical replies is not a strict total-provider-cost ceiling.

## Inbox, in-app notifications, email and device push

The saved assistant conversation is the source of truth. Add an actor-private
**Replies from WhatsApp** entry/unread indicator to the existing assistant saved
chat list, accessible on web and mobile. It should include answers and terminal
statuses, source time, unread state, exact answer navigation and current delivery
mode. Do not put private staff conversations in a business-wide activity feed or
send them to the billing owner merely because they pay for the shared quota.

A ready result creates one recipient-specific notification intent in the same
commit boundary, using an idempotency key from result + recipient + channel.
An identifier-only existing job resolves fresh authorization/contact/preferences
before dispatch. Persist attempts and outcomes separately from answer readiness.
Retries must not duplicate the answer, notification receipt or business effect.
Use the established durable outbox conventions; avoid a new queue service or
continuous polling. Refresh the active chat on focus using existing scoped read
lifecycle rules; verify how an open chat discovers externally completed messages.

| Destination | Initial policy | Failure behavior |
| --- | --- | --- |
| Assistant inbox | Always retain the permitted result/status once accepted | Recover durable processing; never claim success before result commit |
| In-app bell/unread | Actor-private opt-in notification using existing foundations where compatible | Answer remains available even if notification projection fails |
| Verified email | Optional generic “Your EwaTrade response is ready” plus exact link; short batching/rate cap, no private answer body | Suppress invalid/bounced/opted-out contact; show delivery failure in app, no new WhatsApp fallback |
| Device push | Later phase only after device registration, consent, user/environment binding, token lifecycle and actual native transport proof | Denied permission, stale token or unavailable provider leaves inbox usable; do not promise device delivery |

Persist preferences per authenticated recipient/linked identity, with a policy
version and consent time. An owner cannot opt staff into personal email delivery.
Use the existing verified account contact, never an address parsed from an ordinary
WhatsApp prompt. On email/contact changes, permission loss or disconnect, suppress
pending outbound notifications according to current authority and retained app
history policy. Coalesce bursts into a bounded notification where appropriate;
each answer still has its own saved identity. Do not send both email and device
push for every answer by default. Reading, deletion, retention/export and account
deletion need explicit integration; notification receipts do not grant content
access and deleting a conversation does not refund quota usage.

## Technical boundaries and persistence work

Keep route/channel orchestration thin. Shared assistant contracts/presentation own
classification and preview composition; canonical domain modules own all reads and
writes; DB queries own atomic state; communications/email adapters own transport;
existing jobs own dispatch and recovery. Extend strict typed schemas and existing
RPC readers rather than accepting raw scope, tool calls or URLs from clients.

Prefer the existing conversation, message/parts, channel request/result and
notification structures. Add only the missing durable fields/records: recipient
fallback consent/preference; request delivery decision; private result-read receipt;
notification intent/attempt if no compatible existing store exists. Confirm the
appropriate owner and privacy lifecycle in H1 before choosing schema. Do not reuse
short-lived action-review tokens or Orders paging records as long-lived answer
identity, and do not turn app-only notifications into WhatsApp outbox rows.

Quota periods/reservations stay owned by Q1–Q6 in the earlier plan. This work
consumes that contract and adds the boundary integration; it does not build a
second counter. Retain separate metrics for logical sent replies, physical provider
accepted/delivered messages, AI tokens/media, app-only completions, quota blocks,
preview clicks, app/web opens, notification attempts and outcome uncertainty.
Count repeated opens separately from unique result access. Reconcile provider
cost by actual account/rate/categorized delivery rather than equating one logical
reply or one model run with one Meta charge.

## Platform and pricing findings

Apple documents one HTTPS URL opening the installed app directly, with browser
fallback when absent, and requires both site association and app entitlement.
It also documents browser-context exceptions. Android verified App Links associate
an HTTPS domain with the signed app. These support the proposed destination
behavior, subject to actual app/host/version acceptance:
[Apple universal links](https://developer.apple.com/documentation/xcode/allowing-apps-and-websites-to-link-to-your-content),
[Apple associated domains](https://developer.apple.com/documentation/xcode/supporting-associated-domains),
[Android App Links](https://developer.android.com/training/app-links).

Meta's public [pricing page](https://business.whatsapp.com/products/platform-pricing)
explains delivered-message billing and the rolling 24-hour customer-service
window, but its accessible service-exemption wording conflicts with secondary
reports of October 2026 pricing changes. The detailed current developer pricing
page required login or returned a rate limit during this review. Therefore a
universal Meta “1,000 responses per customer” cap/free allowance is **not verified**
here. Treat 1,000 as EwaTrade's proposed commercial logical-reply allowance, separate
from provider/account limits, billable physical messages and AI budgets. Confirm
the effective sender/account rate card, free-tier scope and window/template rules
before rollout or promising savings. Do not send extra out-of-window WhatsApp
notices as a fallback; ordinary template approval/billing rules still apply.

## Focused acceptance scenarios

These are planned checks, not tests executed by this planning task.

| ID | Scenario and required result |
| --- | --- |
| WHR01 | Short fact stays useful entirely in WhatsApp; rich list produces at most three preview rows and a valid exact-answer link |
| WHR02 | Link opens the identical saved message/cards on web and mobile without a second model run, conversation or WhatsApp credit |
| WHR03 | Multiple answers, long labels, currencies, paged-only result and unknown totals retain their meaning and honest completeness |
| WHR04 | Installed current app, absent app, old app and browser preference all reach a usable exact answer or honest web fallback |
| WHR05 | Signed out/wrong account, business/Store mismatch, forwarded link, removed role and record restriction disclose no private content |
| WHR06 | Cold/warm start, sign-in return, logout/scope change and externally completed message discovery preserve only current authorized context |
| WHR07 | Saved as-of result stays distinct from fresh pages; changed cursor/source or deleted/expired result gives safe recovery |
| WHR08 | Near-limit and final-slot concurrent staff/business requests produce one warning/notice and obey the earlier quota ledger invariants |
| WHR09 | Final useful preview/link/footer is one bounded bubble; UNKNOWN/late/failed receipts never produce a 1,001st ordinary message or duplicate credit |
| WHR10 | After exhaustion, opted-in text reads complete in app with no ordinary WhatsApp send/typing; not-opted-in input starts no model/media work |
| WHR11 | Exhausted mutation, unsupported capability and ambiguous request create no new business effect; existing pending control/recovery remains bounded |
| WHR12 | AI budget, entitlement, abuse limit, stopped link or full backlog prevents new work in both delivery modes and creates an honest app status where authorized |
| WHR13 | Duplicate webhook/job, crash after result commit, failed notification and retried dispatch yield one canonical answer and deduplicated intents |
| WHR14 | Email destination/consent changes, staff privacy and notification revocation hold; push permission denial cannot hide the saved result |
| WHR15 | Month reset/top-up changes only future admission, not old app-only results or UNKNOWN reservations; no unsolicited WhatsApp resend |
| WHR16 | GET/link-preview crawler never saves/executes/generates; logs/metadata/caches contain no private answer or credential; export/deletion preserves accounting policy |

Reuse existing renderer, route-parser, canonical read, grant/permission, channel
worker/delivery and notification evidence when the relevant source is unchanged.
Add focused pure preview/route tests and mounted exact-answer/notification-state
checks. Use guarded non-production DB concurrency tests for quota and durable
intent uniqueness; mocked transactions cannot prove those properties. Plan one
focused web journey and actual iOS/Android link journey for changed native handling,
using compatible signed builds. Browser viewport tests do not prove app opening.
Use the existing-data `qa:smoke` workflow, no sale/payment submission or fabricated
fixtures to pass UI smoke. Feature money/permission/concurrency and release gates
remain separate; there is no 1,000-message live provider flood.

## Ordered delivery roadmap

The following seven slices are estimates of scope, not accepted implementation.
The earlier quota roadmap Q1–Q6 remains a separate dependency and is not counted
again as newly completed work here.

| Slice | Deliverable and exit condition |
| --- | --- |
| H1 | Pin routing/exemption rules, payer/period, exact message-focus and consent contracts. Update stable cases from the implemented canonical WhatsApp Workshop direction, append immutable case versions, mirror the existing private Site, and record the approved exact revision before product implementation |
| H2 | Add authenticated exact-response resolution and web focus using existing typed results; cover sign-in/scope/restriction/stale-result states with no generation on open |
| H3 | Add native HTTPS route parsing, pending sign-in destination, message focus and association paths; prove compatible signed iOS/Android handling and web fallback |
| H4 | Add deterministic preview classifier/renderer and trusted response links; preserve existing short replies/native writes and complete financial/receipt meaning |
| H5 | Integrate the implemented monthly quota reservation contract, once-only warning/final bubble and opted-in text read-only app delivery. Persist destination before work, retain shared AI/abuse budgets and prove boundary/recovery races |
| H6 | Add private Replies from WhatsApp/unread, in-app ready notices and optional verified-email alerts with durable intents, preferences, bounded batching and privacy lifecycle |
| H7 | Record candidate/platform evidence and approved rollout; add device push only as a separately accepted extension. Verify metrics, no unintended WhatsApp sends and safe disable behavior |

H2–H4 form the first useful release candidate independently of exhaustion fallback.
H5 depends on the quota ledger; H6 makes unattended fallback discoverable. H1 design
review precedes runtime implementation; actual Workshop authoring uses the standing
Opus 5.5/high preference and Codex takeover policy. This task does not start a
Workshop, select a revision or change its private mirror. Native sales T10 and the
four-business 72-case acceptance program keep their existing owners and gates.

On disabling the feature, stop new preview/fallback admissions while keeping
already-saved authorized answers accessible and recovering in-flight work under
its original identity. Never convert all pending app-only answers into WhatsApp
sends. Separate switches for preview and app-only fallback allow staged rollback.

## Decisions before implementation

Recommended defaults: first three rows for lists; one headline/two facts for rich
summaries; warning at 900; final useful answer preview/link/footer at 1,000;
owner-wide UTC-month accounting; app fallback opt-in per recipient; text read-only
requests first; private inbox plus in-app notices; verified email optional;
device push later. Payer scope, notification consent/retention, exact capabilities,
warning frequency for shared staff and effective Meta billing require resolution
in H1. Purchased reply prices/expiry/refunds remain the earlier separate commercial
slice. No paid checkout destination should be advertised before it exists.

Planning checklist: current foundations audited; routing/fallback contract defined;
implementation sequence and acceptance specified — **3/3 complete (100%)**.
Delivery roadmap above: **0/7 implemented or accepted (0%)**. Quota Q1–Q6 remains
**0/6** under its planning evidence; this document grants no implementation,
provider action, schema application, message send or deployment approval.

## Planning validation

`bun run qa:doctor --offline` passed profile isolation/dependency/client presence;
no runtime probes or database connection. Initial `bun run test:quick --plan`
selected core smoke for the pre-existing unrelated `AGENT_CHAT.md` modification,
with no unknown paths. Final `test:quick --files` was restricted to this plan and
the linked 9November plan to exclude unrelated Agent Chat work: QA tooling types
passed, no changed JavaScript/TypeScript/JSON needed Biome, and four offline core
suites passed **51 tests / 254 assertions**. This is documentation-scoped smoke,
not application feature acceptance. Relative-link checking passed **159 links**
across the two plans and two local-only Brain files; Git whitespace checks passed.
Brain impact check updated `.brain/features/whatsapp-assistant.md` and
`.brain/tasks/backlog.md` locally under the repository's ignored/local-only policy;
no force-add. No API/database/permission contract changed, so no schema/endpoint
or architecture ADR update is required for this proposal. Source review and public
platform research support the plan; no feature, native, live WhatsApp or
provider-billing acceptance is claimed.
