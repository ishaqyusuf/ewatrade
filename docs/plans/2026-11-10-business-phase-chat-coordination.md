# Five managed business phase chats

10 November 2026. The owner requested continuation across all five phases and a
managed chat for each. All five were created in the existing EwaTrade project,
using its current local checkout. No worktree, branch change, model override,
deployment or new provider authority was introduced.

Coordinator: `01a1c511-a483-75b0-b017-0152cab33c12`, host `local`.
Dispatch source: `2ecf668cc55775d9731a5afc95c5b5ccded55b47` on `main`.
The existing modified `AGENT_CHAT.md` was preserved and excluded from this commit.

## Chat registry and ownership

| Phase | Managed chat ID (host local) | Assigned remainder |
| --- | --- | --- |
| 1 — Retail core, scanning and app links | `01a1c532-df8a-7aa3-9bdd-8a863c230a73` | T1–T3: existing shipment backend follow-through, actual scanner camera/recovery proof, exact Workshop implementation evidence, app/web link limitations. First use of the named EwaTrade QA emulator after resolving its serial. |
| 2 — Shipment screens and landed-cost flow | `01a1c532-fad9-7f40-a027-1ae797f43268` | T4: approved existing dashboard/mobile shipment UI; focused repairs and remaining create/confirm/cost/price/arrival proof in an agreed data window. |
| 3 — WhatsApp workflows and native sales design | `01a1c533-0d6b-7220-9fe4-ed71b34ebc0f` | T5–T7 local completeness and evidence; T10 native catalog-sale implementation against owner-selected v17 (subsequent authorization below). At dispatch this was design-only. |
| 4 — Public catalog and product sharing | `01a1c533-18e6-72f1-91fc-5146451a82b6` | T8: existing public-page/share/consent behavior; remaining save/refetch, media, WhatsApp-draft and eligible no-site link evidence. |
| 5 — Four-business acceptance and coordination | `01a1c533-2099-78a0-9420-552b617d429c` | T9: sole shared acceptance-register writer; evidence reconciliation, connected test windows, J06/J11 and available poultry/laundry acceptance, explicit external/data gates. |

Every chat received the takeover receipt, current gap tickets, existing source and
design revisions, owned-source boundaries, required verification/commit workflow,
and the restrictions below. All five reported active initial turns in the first
bounded `wait_threads` snapshot. Phase 1 had already passed offline doctor and was
diagnosing the zero-check Android runner; this is startup progress, not phase
completion or native acceptance.

## Shared-checkout coordination

- Claim exact paths through the existing Agent Chat protocol before editing;
  preserve other owners' staged/unstaged work. Include the phase/chat identity in
  messages without impersonating Claude. Read the current claims/history as well
  as actual unread messages; one recipient's acknowledgement is not a global lock.
- Each phase owns its new `docs/verification/2026-11-10-business-phase-N.md` and
  `.brain/tasks/2026-11-10-business-phase-N.md`. The coordinator retains aggregate
  takeover/dispatch documentation and shared Brain task summaries.
- Phase 5 alone edits the 72-case CSV and the shared four-business acceptance run.
  Other phases supply evidence and defects to that owner. Phase 1 owns canonical
  shipment repairs; Phase 2 owns shipment UI/shared draft helpers; Phase 3 owns
  channel/general assistant composition. Shared command/receipt helper changes
  require an explicit owner handoff, not concurrent edits.
- Phase 5 coordinates connected nonproduction acceptance and source-stable test
  windows. Confirm the source/target and active owners before a smoke window;
  preserve the existing hard source-drift refusal. Documentation commits can
  invalidate a receipt too. Do not infer a hold from an idle chat or this registry.
- Phase 1 has first use of `EwaTrade_Assistant_QA` after verifying the actual
  serial (previously `emulator-5556`). Other phases arrange a handoff; do not take
  another project's emulator or run competing native smoke. Reuse shared services
  and coordinate any required restart.
- Commit only owned, checked changes. Do not push, merge, rewrite history, change
  branches or create/reuse a worktree. Managed chats continue independently; this
  registry is not an automation or an automatic approval mechanism.

## Preserved boundaries

The last scorecard is **6 local PASS / 1 FAIL / 47 BLOCKED / 18 NOT_ASSESSED**, with
72 stable cases. A created chat, source check, synthetic hook test, old receipt or
local dirty runtime does not promote a case. Hypnos/Alhaq merchant-approved
catalog/price/stock/photo/shipment data and the real laundry price list remain
dependencies. Ordinary `qa:smoke` must not create business fixtures or submit a
sale/payment to pass. Full write acceptance must remain within the already
authorized nonproduction scope; no new data authority is inferred here.

No provider/customer/OTP send, real-phone test, hosted configuration, new paid
effect, build/upload/OTA, Site publication or deployment is authorized by dispatch.
Workshop work preserves the implemented baseline, stable direction, immutable
history, existing selections and documented current review surface/mirror
exceptions. Use exactly the standing Claude Opus 5.5/high author when available;
otherwise the coordinating agent takes over directly and reports the fallback.

At dispatch, T10 was the owner's requested native-sale plan/design continuation.
The later direct owner selection and product implementation authorization below
supersede that product-code gate. Runtime/provider/release authority stays separate.

## Current references

- [Takeover source, checks and limitations](../verification/2026-11-10-five-phase-takeover.md)
- [T10 native WhatsApp catalog-sale plan](2026-11-10-whatsapp-native-catalog-sales.md)
- [Shared acceptance run](../verification/2026-11-09-four-business-acceptance-run.md)
- [Stable 72-case register](../verification/2026-11-09-business-journey-launch-register.csv)
- [Local Brain gap tickets](../../.brain/tasks/2026-11-09-four-business-gap-tickets.md)

This is dispatch/ownership documentation. It claims neither additional business
acceptance nor completion of the five phases.

Dispatch validation: five distinct ready chat IDs and active startup turns were
verified through the app tools. Local references and whitespace pass; the owned
documentation quick check passed51tests/254assertions plus QA-tooling types, with
zero unknown mappings. These checks validate dispatch documentation only.

## Subsequent T10 authorization — 10 November 2026

The coordinator independently read the owner's direct reply in Phase3 chat
`01a1c533-0d6b-7220-9fe4-ed71b34ebc0f`: **“Select v17 and authorize T10 product
implementation.”** Human message `01a1c541-5e1a-7b83-8db3-ca940a2bb8a2`, turn
`01a1c541-5dbc-7d23-ab59-78f2307ce78f`, answers the exact-revision question for
`d329aac5-7648-450c-a4bd-4218b4a1b36b`. Phase3 owns the now-authorized T10 product
implementation; its initial design-only dispatch instruction is historical.
Canonical authority, complete delivered-page proof, current confirmation and
focused money/permission/concurrency checks remain required. No hosted flag,
provider send, new paid effect, build/upload/OTA or release is authorized. H23/A23
remain BLOCKED and the 72-case statuses remain6/1/47/18 until actual case proof.
Phase5 records the same supersession in commit `2426fe6f2`; no new hold is implied.

## Current operating checkpoint

The owner receives updates and important decisions only in the coordinator chat.
Managed chats send evidence and recommendations to the coordinator and do not ask
the owner to follow them individually. Routine implementation choices favor the
smallest practical change; reuse valid focused checks and keep actual money,
permission, concurrency and release requirements visible.

Focused source milestones are committed: Phase1 `1f3234316`, Phase2 `6845ba652`,
Phase4 `923c7e98f`. Phase3 checkpoint `c85d5ff4f` is guarded and default-off;
paid four-line native confirmation still fails the30s transaction deadline.
Workshop v17 remains selected without a T10 implementation receipt. Phase5 owns
the attempts/cleanup ledger; no further speculative patch or connected rerun is
active. The coordinator's [current breakdown and practical remaining gates](../verification/2026-11-10-five-phase-takeover.md#managed-phase-source-checkpoint-and-practical-remainder)
distinguishes finished source from merchant, target, camera and paid-sale proof.
The original fully-native objective is unfinished; no status, local commit or
source test silently marks it complete or authorizes release.

Owner priority now explicitly selects **app pilot first; native paid sales remain
disabled**. Phase5 prepares the smallest existing-data/manual-entry app readiness
scope, initially using existing Jawdah Poultry QA data. Phase3 does not resume the
native paid query/transaction loop. R23 remains outstanding; no deployment, provider,
new native artifact or merchant-data authority is added. All owner-facing updates
and important decisions continue only in the coordinator chat.

The owner subsequently approved the exact`5e770dbfe` Preview-only pilot rollout
and explicitly allowed its one executor worktree. Database, Dashboard, Marketing,
API, Storefront and isolated Preview jobs deployed successfully; matching web smoke
passed with clean/verified runtime proof. The hold is released after receipt
validation; the original checkout was preserved and temporary worktree removed.
Native paid remains OFF/deferred, Production/mobile/provider activation excluded.
Actual merchant/write/native acceptance is not inferred from this scoped pilot.
