# Phase 9 / G05 manual-message source follow-up

15 October 2026. Independent source review only. G05 remains **unaccepted**;
assistant parent acceptance remains **13/45 (28.9%)**. This review changed only
this report. It did not edit product source, contact an owner room, connect a
database, send or queue a message, promote rollout, restart, deploy or push.

## Scope and actual ownership evidence

The reviewed operation records content that a member says they **already shared
themselves** with a saved Service Job's Order customer. It is not a provider send,
preview persistence, assistant-channel WhatsApp turn, or consent implementation.
The channel enum describes the member's reported sharing method; storage remains
MANUAL/COMPLETED with a separate share record.

Existing records establish the following, with different evidentiary limits:

1. `.brain/features/assistant-business-operations.md:6617` records the old named
   Agent Chat release `310e6761`, answering handoff `201a77c2`, and explicitly says
   to await the implementation's frozen packet. It releases particular source
   paths plus thin native procedure/schema seams and a focused router test. It
   grants no connected, provider, mobile or rollout acceptance.
2. `packages/assistant/evaluations/runs/2026-10-13-g05-service-message.md` and its
   matching impact record describe an implemented source handoff and historical
   offline results. They explicitly leave concurrency, connected rollback,
   browser UI and a focused native router test open. The source report contains
   no complete SHA256 dependency freeze.
3. `packages/assistant/evaluations/runs/2026-10-15-phase-continuation.md` records
   the later provider-free canonical **8/44** and adapter **5/31** runs, performed
   as separate processes with an inert initializer. These prove their bounded
   source cases at that checkpoint, not a current owner release or connected
   acceptance.
4. The current phase checklist still requires G05's frozen implementation packet
   before independent acceptance. No current owner-approved dependency freeze was
   found in the inspected report, impact record or recorded Brain/AGENT_CHAT
   entries. This report's observations/hashes below are a reviewer snapshot,
   not that missing owner freeze. No other room identity was adopted or messaged.

## Source traced and retained properties

| Boundary | Observed source and limit |
| --- | --- |
| Strict intention | `packages/assistant/src/general/service-message.ts:9–18`: exact Job, three manual-share channels, bounded message/reason, literal alreadyShared, strict extra-field rejection. There is no drafted recipient/Store/Tenant. |
| Adapter input/review | `apps/api/src/assistant/general-service-message.ts:44–77,128–146`: parses the action, derives server scope, locks/reviews before prepared execution, pins the canonical target revision and discloses staff reporting, no send, no verified delivery and customer tracking. |
| Fresh authority | `packages/db/src/queries/service-manual-message.ts:46–105,118–132`: persisted actor/Store authority, explicit scoped-Manager refusal, exact Job/Order Tenant+Store linkage and nonclinical guard; remote sharing needs the Order phone. |
| Record and replay | Same file `:167–272`: Order FOR SHARE then Job FOR UPDATE; re-review/expected revision check before writes; stable command key; replay compares persisted message/channel/recipient-contact/creator/share facts; first write creates MANUAL/COMPLETED intent and one share in caller's transaction. Lock order/atomicity/concurrency remain source evidence until connected proof. |
| Native API seams | `apps/api/src/trpc/routers/service-communications.ts:104–119,136–151`: protected current-scope wrappers with RepeatableRead history and Serializable write, 10s maxWait/30s timeout, same canonical functions. The other provider-capable procedures in that router are distinct and were not called. |
| Native API schema | `apps/api/src/schemas/services.ts:496–513`: strict bounded write fields and command ID; strict exact-Job read limit. This direct form command does not expose the assistant's signed approval token as caller authority. |
| Editor | `apps/dashboard/src/components/general-assistant/general-service-message-editor.tsx:33–64,82–104,155–160`: exact original Job remains selected; channel/text/note edits; fresh unchecked acknowledgement required before parent onSave. Save is draft editing followed by ordinary review/confirmation, not canonical execution. Existing tests are static/helper checks, not mounted browser proof. |
| Outcome navigation | Adapter `:111–116` returns order kind with intent recordId and exact orderId. `apps/dashboard/src/hooks/use-assistant-receipt.ts:195–201` opens the saved Order using orderId. It does not navigate to the exact message/share record. No dashboard/mobile consumer of serviceCommunications.listMessages or typed readServiceMessages original target was found. This is an original-message journey gap, not proof that the related Order link is wrong. |
| Tool/rollout | `apps/api/src/assistant/general-tools.ts:1558–1568` uses protected canonical history with truthful wording. `packages/assistant/src/capabilities/manifest.ts:213–214`: both capabilities remain planned, dashboard only. Full WhatsApp delivery work is separate. |

## Confirmed correctness finding: terminal delivery evidence can fall outside the history slice

**P2 — retain truthful known delivery when bounding displayed attempts.**
`packages/db/src/queries/service-manual-message.ts:312–332` selects only the newest
three attempts, then derives provider_delivered/provider_sent_unconfirmed/
provider_failed solely from that slice. Known older delivery can therefore be
forgotten. `packages/db/src/queries/service-public.ts:1525–1607` allows subsequent
attempt records after an intent is COMPLETED; later failed/pending receipts do
not delete earlier delivered evidence. There is no source invariant making the
problematic four-attempt state impossible.

A new provider-free in-memory reproduction ran against the actual
listServiceJobMessagesInTransaction function. Its query stand-in obeyed the
requested nested take value, returning a COMPLETED SMS intent with three newest
FAILED attempts and an older DELIVERED fact. Actual output:

```json
{"actualDeliveredFact":true,"requestedTake":3,"projectedKind":"provider_failed","projectedStatus":"COMPLETED"}
```

Execution used `bun --env-file=/dev/null` and
`EWATRADE_DATABASE_URL=postgresql://fixture:fixture@127.0.0.1:1/assistant_source_tests`.
Membership/Store/Job reads and the query projection were in-memory stand-ins;
the actual canonical history function supplied take=3 and classification. No
database/provider request or persistent test fixture was made. This is a new
source-case demonstration, not an additional accepted milestone or a connected
delivery event. The existing history test (`service-manual-message.test.ts:365`
onward) covers manual plus provider_pending, but not older terminal evidence
outside the displayed window.

The implementation owner should choose a small bounded existence/aggregate
projection for authoritative delivery facts independently of the three displayed
attempts (or an equally explicit canonical terminal summary). Keep attempts
bounded and private; do not expand to unlimited history or change dispatch.
Add cases for delivered/sent facts beyond the latest three, cancelled state,
subsequent failure/pending records, and pure staff-reported shares. No repair
was made by this reviewer because source ownership was not released for it.

## Bounded next packet, not an execution authorization

1. **Owner freeze and source repair.** Obtain the current owner's exact owned
   paths, hashes, dependency list and terminal check outputs. Include canonical
   command/test, adapter/test, contract/test, editor/test, native schema/router,
   relevant dispatcher predicate, service authority/policy, protected caller,
   shared proposal recovery, manifest and receipt/open-target dependencies.
   Reconcile changed dependencies rather than treating this snapshot as release.
   Resolve the confirmed classification finding in the owner's files first.
2. **Provider-free source proof.** Run the repaired semantic cases plus the
   existing canonical/adapter checks as isolated processes with inert env.
   Add the previously released but still absent focused native router test:
   strict smuggled-input rejection, active Store and Owner/Admin/legacy-Manager
   scope, canonical same-transaction input, transaction options/error mapping,
   denied current authority and no enqueue/provider branch. Current source tests
   and static markup do not replace that wrapper proof. Compile the owned graph;
   attribute existing unrelated diagnostics explicitly.
3. **Prepare, then separately review one connected rollback proposal.** Specify
   exact selected authorized nonproduction target, synthetic Tenant/actor/Store/
   Job/Order identities, maximum runtime/transaction limits, fixture ownership,
   forced rollback/cleanup and exact unchanged-facts snapshots before any run.
   Proposed cases: all three sharing methods; missing phone refusal; exact
   recipient/Store/Tenant; signed success/edit/stale review/cancel; replay and
   changed payload/contact/actor; fresh suspended/scoped/foreign/clinical refusal;
   intent+share+proposal atomic rollback; two concurrent same-key attempts with
   one durable effect; dispatcher exclusion with no queue invocation. This step
   is a proposal only. No connected runner or retry is scheduled here.
4. **Saved client/original journey.** After the appropriate gate and frozen
   runtime are available, exercise real dashboard draft → edit → renewed
   acknowledgement → exact recipient/content review → explicit confirmation →
   saved history/reload → recovery. Verify no-send/tracking disclosure and exact
   current authority. Show the exact original manual-share fact, or explicitly
   leave that original-message navigation requirement open; opening a related
   Order alone does not prove it. Use synthetic historical-sharing facts, never
   send a real message to create evidence. Planned availability must stay planned
   unless separately authorized; no persistent toggle/restart workaround.
5. **Keep wider G05 work separate.** Store settings signed rollback/browser
   acceptance, receipt/reminder recipient/content review, channel consent and
   truthful delivery/recovery remain required or explicitly controlled exclusions
   under G05's full scope. Manual-share source cannot earn provider-sending,
   consent or whole-G05 credit. Mobile parity is absent for these two declared
   dashboard-only capabilities and is not supplied by the separate WhatsApp
   channel. Any future source/mobile/provider proposal needs its own ownership
   and preserved approval boundaries.

G01's human pause, Paystack's pause (including repair/extension/registration),
D04's fingerprint boundary, E05's rejected activation/restart, G04's six deferred
connected sections and S05's unscheduled retry remain unchanged. No alternative
runner, target substitution, rollout bypass or queue activation is authorized.

## Reviewer source snapshot

These SHA256 values identify inspected bytes only; they are not an owner freeze
or proof that shared dependencies stopped changing. The earlier 13/75 run is
retained as bounded historical evidence, not relabelled as a new full rerun.

| File | SHA256 |
| --- | --- |
| packages/db/src/queries/service-manual-message.ts | cacd871ca1d619d5e877236ae3deb9934f4863664ae8c6116945b57fe3c07ec3 |
| packages/db/src/queries/service-manual-message.test.ts | 2d694b99202a382af5473b101ede04fab7fa0c5f8a2a883cabbf57da62b4a223 |
| apps/api/src/assistant/general-service-message.ts | a6d71874fedcf20b2a159156029b94eddb4e99b15c222808674470cc55d1059e |
| apps/api/src/assistant/general-service-message.test.ts | ad745f517bf13c04d5968d0bc2782ab972a1c59db96c670bf968f0f17c9ba890 |
| packages/assistant/src/general/service-message.ts | 1167cefb1f3b1cd9f928c57beddfc461dc84d76a221d708955afbb4d11123f2c |
| packages/assistant/src/general/service-message.test.ts | ff18501267f52f9dba62e400983e544ca75598380d2790bbdf4e97e4f72447d1 |
| apps/dashboard/src/components/general-assistant/general-service-message-editor.tsx | d56f8bac52eb97fe2ef157c61550861429596981ab3b3efc15e5be31ff8f0b80 |
| apps/dashboard/src/components/general-assistant/general-service-message-editor.test.tsx | 32ffd4b4f8b8c727785afa6c7d7f1b7c52688ce8091e8a4883eb01c3e6ebe501 |
| apps/api/src/trpc/routers/service-communications.ts | 0c0ac94d1863a254738b1d70be041dbe2e81f71f711ae6137a7ac9d5dad69b9c |
| apps/api/src/schemas/services.ts | eb34924be459e0e721487f1ecb4e0048639a5419e7e834bfa371f25c320ed6c9 |
| apps/dashboard/src/hooks/use-assistant-receipt.ts | 413d4efeb4b84e8e4b1f727c02b83640e36a578d3cc1448f78b4c07ba34e1aac |

## Checklist and Brain impact

- [x] Trace strict/manual-only command, authority, editor, read and original link.
- [x] Separate historical path release/source checks from current owner freeze.
- [x] Reproduce a concrete provider-free classification defect; leave product repair
  with its owner and prepare a bounded next packet.
- [ ] Current owner dependency freeze, source correction and focused router proof.
- [ ] Separately authorized connected/concurrency and saved-client acceptance.
- [ ] Wider settings/consent/delivery/recovery and full G05 acceptance.

Phase 9 acceptance remains **0/3**; assistant acceptance **13/45 (28.9%)**.
Parent owns consolidated Brain/checklist/impact updates. No Brain files were
edited by this report-only subtask; its source finding and pending gates require
parent reconciliation, not an implementation completion claim.


## Later source continuation — 15 October

The finding and missing-source snapshot above remain historical. New native/editor/
exact-original packet repairs terminal-history classification and adds protected
router proof, bounded replay and both client consumers. See
[Current source checkpoint](2026-10-15-g05-native-manual-share.md) for final hashes,
independent findings/repairs and checks. This does not retroactively accept the old
packet or complete connected/native/wider G05 acceptance. Parent13/45 unchanged.
