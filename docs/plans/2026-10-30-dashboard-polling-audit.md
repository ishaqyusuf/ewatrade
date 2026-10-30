# Dashboard polling audit — 30 October 2026

Part of [DP-204 and the full performance program](2026-10-29-dashboard-performance-program.md).
Source snapshot: `9eb8a0c8b64c6aa00de6f586757eaa209edc8b20`. This is an
audit and implementation queue, not acceptance of DP-204 or a latency improvement.
The program remains **3/27 accepted (11.1%)**. Local only; no deployment.

## Finding

The Midday lessons have been applied to selected owners, but coverage is incomplete.
The shared notification hooks already stop known refusals and keep full previews
behind panel activation. Other owners still use unconditional intervals. Retaining
a component for fast revisits does not make its reads inactive when CSS hides it.

Three inert mounted reproductions demonstrate remaining work:

1. The retained Quick Assistant panel's record links continue Tenant context reads
   after minimization. Three extra reads occurred during the accelerated interval.
2. The same reader continues polling after `FORBIDDEN`. Its private payload was
   correctly erased; three further refused reads occurred. This is wasted work,
   not evidence of a private-data leak.
3. Payments to Check starts two `businessBanking.pendingReports({limit:20})`
   operations under separate cache owners on initial mount. These are two read
   operations; transport batching may combine them in one HTTP request.

These issues justify targeted fixes. They do not explain every slow refresh or
establish that Midday has lower measured latency under comparable conditions.

## Method and limits

A TypeScript AST scan of 1,103 production JS/TS Dashboard source files, excluding
`.test.` and `.fixture.` paths, found **33 `refetchInterval` properties and six
`setInterval` calls across 25 files**. All 39 sites are listed below. This differs
from the older query-option inventory: it includes manual query functions, three
new count hooks and explicit timers. It is not an audit of every recursive timer,
stream, WebSocket, automatic mount/focus fetch or HTTP request.

Installed TanStack Query's `queryObserver.ts` schedules an enabled, valid interval
and executes it when its focus manager is focused, unless background polling is
explicitly allowed. It cannot infer visibility of a retained child panel. A fixed
numeric interval does not stop simply because its query errored. `retry:false`
also does not stop subsequent interval ticks. Existing app query error handling
erases known rejected private payloads; `readPollInterval` separately stops known
`FORBIDDEN`, `UNAUTHORIZED` and `NOT_FOUND` interval work while preserving recovery.

Midday reference inspected locally: `apps/dashboard/src/hooks/use-job-status.ts`.
Its owner requires an enabled job ID and stops on terminal status or query error,
while retaining mount/focus/manual recovery. Follow that explicit owner lifecycle;
do not copy its one-second cadence or substitute a global freshness TTL. EwaTrade
must retain current financial, permission, proof and durable-command authority.

## Query interval ledger

Paths below are relative to `apps/dashboard/src/`. Line numbers identify the
snapshot. “Review refusal” means inspect and prove the owner's recovery contract
before applying the existing error helper; it is a source finding, not an executed
runtime failure for that row. Default browser focus handling is not panel activation.

| ID | Source owner | Cadence and activation/stop contract | Evidence or next action |
| --- | --- | --- | --- |
| P01 | `hooks/use-business-notification-reads.ts:28`, unread count | 60s, mounted private owner; known refusal stops | Existing mounted hooks/bell proof; retain focus recovery |
| P02 | same file:42, payment count | 30s, same contract | Numeric projection; retain five-claim badge semantics |
| P03 | same file:56, plan count | 60s, same contract | Existing count/read proof |
| P04 | same file:70, website count | 60s, same contract | Preserve current website audience refusal |
| P05 | same file:86, payment preview | 30s, open preview owner; known refusal stops | Actual bell open/close proof |
| P06 | same file:104, plan preview | 60s, open preview owner; known refusal stops | Actual bell open/close proof |
| P07 | same file:122, website preview | 60s only when `poll`; false otherwise; known refusal stops | Preserve nonpolling panel consumer |
| P08 | `components/assistant-whatsapp/whatsapp-connections.tsx:53`, connection pages | 30s while mounted, actor-keyed, private fresh mount | Review refusal; measure infinite-page refresh cost |
| P09 | same file:72, selected chat context | 15s, selected chat plus cache generation | Selection time/actor checks remain; review refusal. Effect refetch is not proof of a duplicate pending read |
| P10 | `components/assistant-whatsapp/connect-whatsapp.tsx:49`, context | 15s, current actor/Tenant/Store | Review refusal without weakening link authority |
| P11 | same file:66, availability | 15s when context matches, no retry | Review refusal; `retry:false` alone does not stop polling |
| P12 | same file:84, link status | 2s while enabled/link/unexpired; confirmed/cancelled/expired stop | Bounded by local expiry; review refusal recovery |
| P13 | `components/catalog-item/form.tsx:274`, product state | 2.5s only chat mode and no query error; conversation/generation/visit key | Already error-gated; measure idle/terminal budget before changes |
| P14 | `components/open-assistant-read-record.tsx:26`, Tenant context | 15s whenever mounted, generation key/private fresh mount | **Reproduced:** hidden optional reads and repeated refusal; A1/A2 |
| P15 | `components/business-banking/payments-to-check.tsx:70`, arrivals | 30s private first page, separate infinite owner | **Reproduced:** duplicate initial first page; A4. Review refusal |
| P16 | `components/business-banking/payment-report-review.tsx:143`, receipt check | Helper checks visibility, failure, report identity and elapsed budget; no background polling | Preserve required fresh receipt review; no blanket directory TTL |
| P17 | `components/store-conversations/conversation-workspace.tsx:62`, queue | 5s selected Store view, no background polling | Required visible queue; review refusal and aggregate budget |
| P18 | `components/product-assistant/assistant-allowance.tsx:15`, capability | 30s while mounted, zero freshness | Billing/product chat owner; review refusal and owner lifetime |
| P19 | `components/staff/order-visibility-card.tsx:27`, access setting | 30s only `review`, focus always | Overview review stays fresh; other uses disable interval. Review refusal |
| P20 | `components/domains/domain-progress.tsx:16`, domain order | 5s, 30s UNCERTAIN; REGISTERED or REFUNDED stop | Required durable progress; FAILED may still await refund. Review refusal/budget |
| P21 | `components/general-assistant/assistant-composer.tsx:107`, voice capability | 60s only active, no retry | Existing hidden-root proof; review refusal while preserving gateway recovery |
| P22 | `components/general-assistant/assistant-links.tsx:63`, product capability | 30s while full workbench mounted | Review refusal; shared JSX occurs in mutually exclusive branches, not three concurrent mounts |
| P23 | same file:70, allowance | 30s while full workbench mounted, no retry | Same owner review; no demonstrated duplicate mount |
| P24 | `components/general-assistant/general-chat.tsx:149`, pending proposals | 60s when active and available | Existing visibility proof; answer-card descendant was stubbed. Review per-query refusal |
| P25 | `components/storefront-requests/storefront-requests-inbox.tsx:150`, counts | 30s private inbox owner | Required active inbox freshness; review refusal |
| P26 | same file:288, product orders | 30s while selected tab mounts list | Tabs mount one list; no evidence both lists poll together. Review refusal |
| P27 | same file:1096, service requests | 30s while selected tab mounts list | Same contract; preserve queue and command freshness |
| P28 | `components/setup-assistant/use-setup-attachments.ts:210`, attachment status | 1.5s while reading IDs exist; READY/FAILED removes reading state | Source gap: no query-error/elapsed stop if reading remains. Prove bounded refusal recovery; do not cancel committed uploads blindly |
| P29 | `components/storefront/storefront-proposals.tsx:99`, generation runs | 3s with active returned run, enabled open or tracking | Closed durable tracking is intentional; rejected cleared data removes active predicate. Optional results remain open-owned |
| P30 | `components/storefront/use-storefront-content.ts:140`, generation | Open/run/current generation, no error, active status, two-minute bound; 1.5s then 10s, no background | Existing bounded owner; preserve explicit recovery |
| P31 | `components/public-payment/use-receipt-preflight.ts:32`, private preflight | Token/start required; DRAFT-running only; 2.5s then 6s, three-minute bound | Proof-sensitive exception, not directory cache. This row does not cover every receipt route |
| P32 | `components/orders/overview/order-overview.tsx:172`, change options | 15s only open approval, no retry | Required approval freshness; refusal-cleared data stops predicate; preserve transient recovery |
| P33 | `components/orders/overview/order-change-approvals.tsx:352`, pending approvals | 30s while mounted, no retry | Required visible queue; review refusal at actual owner |

P01–P07 retain zero freshness/retention, fresh mount, cancellation and private
generations. Existing evidence: [notification polling](../verification/2026-10-29-dashboard-notification-polling.md)
and [compact counts](../verification/2026-10-30-dashboard-notification-counts.md).
Those receipts establish their stated owner behavior, not runtime acceptance of
the other 26 query sites.

## Explicit timer ledger

Three timers are local UI clocks; three can trigger network work.

| ID | Source owner | Contract and classification | Next action |
| --- | --- | --- | --- |
| T01 | `components/assistant-whatsapp/whatsapp-connections.tsx:75` | 10s `now` update for UI freshness/expiry; **UI clock** | Do not count as a network poll |
| T02 | `components/assistant-whatsapp/connect-whatsapp.tsx:102` | 1s expiry display; **UI clock** | Preserve local link expiry |
| T03 | `components/qa/qa-login-entry.tsx:82` | 60s QA access GET plus focus refresh; pending-operation/generation guards and expiry timeout | Source finding: raw timer lacks visibility/online guard; A3 |
| T04 | `components/store-conversations/use-store-conversation-realtime.ts:123` | 5s read recovery, enabled/conversation/visible/online gates, single in-flight plus queued poll, listener/timer cleanup | Source finding: after await only scope identity is checked, not current enabled/unmounted lifetime; A5 |
| T05 | `components/general-assistant/use-general-assistant.ts:308` | Immediate durable run recovery plus at most six 1.5s interval rounds; run ID/not busy; cleanup | Intentional bounded command-result recovery may outlive optional panel visibility |
| T06 | `components/setup-assistant/use-setup-voice-recorder.ts:225` | 250ms recording duration, finishes at maximum; recorder cleanup; **UI clock** | Do not count as network work |

T04's recovery helper drains cursor pages until null and rejects a nonadvancing
cursor. Individual pages are bounded at 100; the whole drain has no page/time cap
or lifetime cancellation. The caller enables it when timeline data exists. A late
response may reach callbacks/read acknowledgement after cleanup under the same
scope. That remains a **source hypothesis**, not a reproduced production bug or
permission bypass. Build an inert delayed-response test before changing behavior.

## Execution subtasks within existing tickets

These are subtasks, not six new top-level tickets. Keep the 27-ticket denominator.
Order the demonstrated defects first, then source hypotheses, then the remaining
owner rollout. Product implementation and passing acceptance remain outstanding.

| Subtask | Parent tickets / layers | Work and acceptance |
| --- | --- | --- |
| A1, high | DP-204/407, Assistant UI ownership | Carry actual visibility through retained answer/record-link descendants. Hidden optional record reads stop; reopen performs a fresh authorized read before opening records. Preserve history/drafts and active command recovery. Test actual answer-card placement, not only a stub |
| A2, high | DP-204/201, read hooks | Start with P14, then inspect every ledger refusal gap. Reuse existing `readPollInterval` where its classification fits. Known refusal stops intervals and erases private data; focus/manual recovery can succeed and resume cadence; transient failures keep appropriate recovery. Include P28's bounded completion/error state separately |
| A4, high | DP-203/405, Finance query owner | One admitted first-page result on mount instead of two independent reads. Preserve polling only page one, later-page refresh only when first page changes, zero private retention, load-more, rejection/scope reset and post-review list/count freshness. Prove one read with installed tRPC/query observers before browser timing |
| A3, medium | DP-204/408, QA entry owner | Add visibility/online activation to raw refresh only if mounted proof confirms unnecessary work. Resume fresh on visibility/focus/reconnect, dedupe concurrent triggers; expiry and current capability checks stay authoritative |
| A5, high investigation | DP-204/406, conversation hook/domain helper | Inert delayed-response proof for disable, unmount and scope change, including multi-page recovery and queued polls. Prevent late optional callbacks/read acknowledgement if reproduced; preserve ordered messages, idempotency and intentional acknowledgements. No real messages or commands for the reproduction |
| A6, medium | DP-204/401–409, all remaining ledger owners | Apply only demonstrated activation/error/budget fixes in small slices. Separate optional reads from required visible finance/approval/access queues and durable job progress. Recheck aggregate requests, focus/reconnect bursts and interval exceptions per family |

Each implementation slice needs narrow source/types checks and the relevant
existing mounted/transport regressions. Use one canonical existing-data UI smoke
window where UI behavior changes. Measure optimized request/byte/useful-content
costs per family under DP-003; these source counts cannot supply those timings.

## Diagnostic evidence and verification boundary

Private evidence root: `/tmp/ewatrade-dashboard-program-20261029/`.

- `polling-audit-current.json`: AST site inventory; scanner is the private
  `.scratch/dashboard-performance-program-poll-audit.ts`, not a new public runner.
- `polling-audit-hidden-record-red.log`: actual QuickAssistantPanel and
  OpenAssistantReadRecord with real query observers, a focused browser-like host
  and an inert content placement matching the inspected descendant chain. The
  production 15s interval is accelerated to 15ms; hidden read delta was three.
- `polling-audit-refused-record-red.log`: same owner plus actual app QueryClient;
  private payload cleared, three extra refusals. Ports are inert. This does not
  claim a full GeneralChat history integration. Existing Assistant visibility
  fixture stubs GeneralAnswerCard, explaining the descendant coverage gap.
- `polling-audit-payments-duplicate-red.log`: actual PaymentsToCheck with installed
  tRPC options/client, real cache observers and an inert observable transport.
  Two identical first-page operations/two cache owners; no accelerated poll.

All three diagnostics intentionally fail the desired acceptance assertion. They
are **red reproductions**, not passing acceptance tests, and remain private rather
than being added to the normal smoke suite. No DB, provider, real message, payment,
invitation or business fixture was used. Their fixtures clean up mounted roots.
Other ledger rows are source review or explicitly linked prior evidence.

This documentation slice changes no product source and leaves the prepared
optimized `9eb8a0c8` build intact. The earlier `965f64794` Dashboard-only window
was already executed and development mode restored. A newer candidate's timing
window must retain its separately requested scope and restoration requirement;
this audit neither switches the shared service nor authorizes deployment.

Documentation verification: `qa:doctor --offline` passes. Explicit owned-path
`test:quick --plan` selects only the core workflow suite, with no unknown mappings;
the execution passes 47 tests / 195 assertions and QA tooling types. Ledger IDs
match all 33 query sites and six timer sites across 25 files. All four prepared
optimized build manifest hashes remain unchanged. `git diff --check` passes.
No application types or UI rerun is required for this documentation-only slice;
the deliberately red diagnostics remain open implementation obligations.

H01 coverage is current with explicit `APP_ENV=local` and the inert loopback DB
sentinel. An initial ambient-environment invocation selected the smaller non-QA
router and reported stale coverage; comparison showed only that environment's QA
registration difference. No snapshot was rewritten to hide it. H02 passes with
no gated change for this documentation-only slice.

## Implementation follow-up: P14 / A1 — 30 October 2026

[Assistant record lifetime slice](../verification/2026-10-30-dashboard-assistant-read-lifetime.md)
carries activity through the actual retained chat subtree and unmounts only the
optional private reader when hidden. Reopen requires fresh authorized context;
known refusals stop intervals with recovery preserved. The strengthened fixture
now includes actual answer cards and the complete panel/content/chat chain. It
passes eight tests / 64 assertions after reproducing the hidden/refused/cancellation
gaps. P14's A2 guard is included; other A2 owners and A3–A6 remain outstanding.
This follow-up does not change the historical snapshot or accept DP-204/407.
