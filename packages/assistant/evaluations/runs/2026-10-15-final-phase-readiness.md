# Assistant final-phase readiness — 15 October 2026

Read-only source/evidence inventory for Phases10–12. **Release readiness is not
proven.** Overall acceptance stays **13/45 (28.9%)**,32 open. Phase10 is0/5,
Phase11 is0/1 and Phase12 is0/4 accepted. This packet adds no parent bookmark.

Only this new report is changed by this readiness subtask. No provider research,
network/browser/device/DB request, hosted-CI run, suite rerun, runtime change,
activation, push or deployment was performed. A separately requested repair to
one Phase6 test's typing is recorded by the coordinator, outside this report's
readiness work. Existing approval gates remain in force.

## Phase10 — external collections and payouts

**Human Paystack pause remains controlling. Do not repair, extend, register or
execute paused provider work.** Existing source findings may be inventoried.
F01→F02 and F03→F04→F05 dependency order remains. Prior provider documentation
reviews are dated12October; this audit neither updates nor certifies current
provider/account eligibility, prices, limits or policies.

| Ticket | Existing evidence/source | Concrete unresolved exit |
| --- | --- | --- |
| F01 | Pure amount/source/currency/held-money repairs reviewed; seven-model collection/payout persistence foundation applied historically; unregistered collection commands and guarded integration fixture exist. | Fresh existing-intent replay authority/Store/customer-source binding finding remains. Separate committed received-event boundary, required30s transaction behavior, concurrent manual/online receipt exclusion and exact saved source/currency/held receipt integration are unaccepted. Source presence is not registered availability. |
| F02 | Pending milestone; collection intent foundation is a prerequisite. | Reviewed payment-link lifecycle and separately confirmed sharing, canonical expiry/settlement, durable duplicate/out-of-order reconciliation and saved original receipts remain unaccepted. Do not implement under pause. |
| F03 | Historical provider-doc/policy/domain proposal and corrected same-reference/approval-status interpretation exist. | Merchant account entitlement/country/currency, funding, verification, fees/limits, purpose/role/step-up/key-custody/stop policy and complete reviewed domain remain unaccepted. Existing checkout credentials do not establish transfer authority. |
| F04 | Pure verification/review contract exists; unsafe-derived-total and empty-payee-name findings were corrected/revalidated in later packet. | Persisted beneficiary/version/fresh verification, step-up, exact fee approval, durable intent/outbox claim, stable dispatch reference and web/native approval/receipt integration remain unaccepted. No source correction authorizes dispatch. |
| F05 | Pending milestone; durable reference and authoritative events depend onF04. | Unknown/late/failed/reversed recovery with no second intent/reference, no invented success, authoritative settlement and auditable correction remain unaccepted. No provider refund work under pause. |

The latest F01 review also rejects treating the reported110s rolled-back fixture
as proof of the required30s or independent received-event transaction boundary.
Do not rerun it, change its timeout, repair shared grants or register commands to
close this report. Held money remains the recorded manual-refund/customer-credit
policy; that does not authorize an external payout or customer communication.

References: `runs/2026-10-12-collections-payouts-coordinator.md`,
`runs/2026-10-12-f01-coordinator-review.md`,
`runs/2026-10-12-f03-coordinator-review.md`,
`runs/2026-10-12-f04-coordinator-review.md`, and the canonical Phase10 checklist.
Earlier ticket-table prose still mentions already repaired F01/F04 pure findings;
use the later packet's precise limits without silently promoting the milestone.

## Phase11 — actual native acceptance

A04 remains partial. Phase4/5 and the concurrently integrated Phase6 editors,
strict value helpers, exact originals, mount-owned reads and late-response fences
are source evidence. Registry membership, static component fixtures and responsive
dashboard screenshots do not prove native acceptance.

Latest retained device evidence in
`runs/2026-10-15-phase5-native-money-source.md` and
`.brain/qa/2026-10-15-assistant-operations-phases.md` records ADB reaching the running
QA emulator/app at **signed-out OTP verification**. This supersedes the older
stopped-device/no-advertised-surface observations. This report does not inspect
live device state; the next device session must recheck it. No code request,
login, account creation, device wipe, reinstall or restart is implied here.

Required device packet, using a current authenticated and authorized QA session:

1. Pin actual app build/runtime version, source commit, device/OS and API target;
   prove declared capability/contract versions match the server. Record exactly
   which mobile operations remain unsupported or form-only.
2. Exercise Owner/Admin, scoped Manager and restricted Cashier/Operator paths;
   verify cross-business/Store/Book and revoked/expired authority refuses without
   leaking previously cached names, amounts or controls.
3. For each supported write family: natural request→exact draft→Edit→fresh review→
   separate explicit confirmation→canonical effect/readback→exact receipt→owning
   original→Close/back to same saved chat, preserving an unsent composer draft.
4. Verify zero/large/fractional money and quantity inputs as appropriate, native
   keyboard/scroll/safe-area/large-text controls, disabled/double-press behavior,
   loading/paused/denied and accessible error/retry states.
5. Verify app background/resume, reload/reopen, offline/reconnect, response loss,
   session expiry and business/Store switch during an in-flight review/decision.
   Confirm completed replay returns the same result without another effect.
6. Verify historical original objects, payment/Order/Book identities and staff
   invitation/access/status originals; current access checks must not substitute
   another object. Unknown legacy/missing objects need honest unavailable states.
7. Preserve the distinction between access removal, membership suspension and
   separately reviewed service reassignment. A job ID must not be routed to an
   unrelated Order/object to pretend full native handover support.

Any planned capability still needs its existing availability/connected gate;
source tests or a signed-in device do not authorize promotion. Connected write
and side-effect evidence must use the specifically authorized target/scope and
cleanup/rollback policy. Earlier web-only accepted milestones retain that scope.

## Phase12 — engineering acceptance

| Ticket | Existing source/evidence | Still required |
| --- | --- | --- |
| H01 | Dependency-free manifest/classifications, generatedCOVERAGE, capability gate tests and coverage check in `assistant-gate.yml`; local current checks have prior evidence. | Freeze reviewed source and dependency/lockfile versions, run actual clean-runner workflow on that exact candidate, retain job/run URL+SHA and full check result. Independently review every mapping/exclusion, action/version/policy/renderer/test link. A green generated snapshot is structural evidence, not accepted merchant journeys. |
| H02 | Domain/client/auth/adapters classified; actual added-vs-unchanged and missing-rollout repairs independently revalidated; impact records and PR checklist source exist. | Exact candidate diff/base and reviewed records must align; clean hosted-CI evidence and Brain impact rationale for behavior/API/permission/schema/exclusions remain. Brain is local_only and unavailable to hostedCI, so hosted passes cannot certify its contents. Never force-add Brain to hide that limit. |
| H03 | Versioned scenario catalog; deterministic/manual-web reports; persistent run/model/prompt/outcome/errorCode and usage/latency groundwork. | Versioned per-capability conversational matrix and recorded outcomes for success/ambiguity/denial/stale/injection/replay/outage; regression thresholds, redaction, action lifecycle counts, cost/usage and safe tool-error operational proof. Catalog definitions and source tests are not model runs. |
| H05 | Authority-vs-rollout split and actual isolated decision-path8cases/29assertions; historical saved dashboard receipt/Open/Close preserves draft. | Current phase/domain/API/DB/dashboard/native acceptance, connected rollback/no-duplicate proof, selected exact release/canary/rollback plan, applicable approval, deployed version/inventory, observed canary/operating limits and final receipt. No release approved by this report. |

The current workflow includes checkout, frozen Bun install, capability/channel
boundaries/inventory, isolated phase-regression wrapper, coverage current check and
impact diff check. The wrapper now includes Phase6 originals/status/invitation/
access source fixtures. This is workflow inventory; no hosted job execution was
observed. Broad native/API dependency compiler graphs retain known diagnostics;
root's current integrated compiler and owned-path repairs must be recorded before
claiming a frozen candidate. This report makes no full type-green claim.

H03 details: `AssistantRun` stores provider/model/promptVersion, status/errorCode
and start/completion times. `AssistantUsageEvent` stores reported token classes,
stepCount/duration/outcome; proposal records carry actionVersion. Current GENERAL
completion records available usage and duration; usage summaries group safe
counts/identifiers without reading message text. This is useful groundwork.
It is not evidence of complete per-action draft/confirm/success/failure/recovery
instrumentation, actual tool-error redaction, operating dashboards/alerts, or
current monetary cost accounting. Do not translate missing token/cost values to
zero. The evaluation catalog explicitly marks most listed model runs "None yet"
and states other capabilities still lack versioned fixtures. Its older sentence
excluding mobile evaluations needs alignment by the coordinator with the broader
active goal; it cannot silently exclude Phase11.

## Concrete release decision fields — required before any approval request

These values are missing for the requested wider release. Historical Production
receipts for earlier assistant features are not this candidate's receipt. Current
inspected checkout HEAD was `0b4dee0e26fc0959ab9096f210e378abd04d3160` on main;
shared uncommitted work means that is **not a frozen release candidate**.

| Required field | Present status / exact missing decision or artifact |
| --- | --- |
| Environment and target | Preview-as-canary is a prior proposal, not a selected/approved target. Missing exact environment, deployment project/account identifiers and dashboard/API/jobs URLs; later Production needs separate explicit authority. |
| Source/build versions | Missing frozen full candidateSHA, reviewed diff/base, lockfile/toolchain, dashboard/API/jobs build IDs; for native, build/channel/runtimeVersion/update ID. |
| Capability allowlist for this release | Missing explicit capabilityIDs+versions+clients+roles/Store/Book scope with each accepted evidence link and proposed rollout state. The13 accepted web milestones are not automatically an exact capability/version release list. |
| Exclusions | Must explicitly retain all unaccepted/planned scope, native unsupported originals/handover, H04 boundaries and provider/WhatsApp exclusions as applicable. Do not infer broader release from another channel's independent work. |
| Availability change | Missing exact manifest diff naming any planned→nonplanned transitions. `generalCapabilityEnabled` treats every nonplanned state as available; merely calling it source/pilot does not provide a tenant-scoped canary. Owner previously removed env switches/allowlists; no new one may be invented. |
| QA identity/data/action scope | Missing specifically authorized QA actor/business/Store/Book, source records, maximum writes/side effects and saved-state/cleanup policy. Preserve C04 named isolatedDB requirement; do not substitute root's shared target. |
| Current contract/DB compatibility | Missing exact schema/migration ledger and API/mobile compatibility evidence for selected candidate; any required migration/push or shared-dependency refreeze is a separate scoped action. |
| Canary observation contract | Missing start/end/duration, sample/traffic scope, named observer, expected exact flows, permission/no-duplicate/receipt invariants and numeric error/latency/cost/availability stop thresholds. Defaults are not invented here. |
| Rollback code and owner | Missing known-good rollbackSHA/build IDs, exact per-capability planned-state diff, owner and permitted release action/target; compatibility/data-forward plan where needed. Planned-plus-reviewed-release is the existing source lever, not an executed recovery. |
| Rollback verification | Missing actual pending-noConfirm/cancel, completed exact-receipt replay, current revoked/session/Store denial and original-object return observations on the selected target, with no duplicate effects. Isolated source evidence is reused within its limits. |
| Approval and execution | Missing approval of concrete scope/environment/version/capability changes, approved canary/rollback and any provider/message/data actions. Existing stop/rejection boundaries are not overridden by this template. |
| Final operating receipt | Missing actual deployed aliases/buildSHAs, manifest/version inventory, job/run evidence, canary results/failures, remaining limits/exclusions, operator recovery steps and final acceptance bookmark. |

Existing gates remain: G01 connected QA human pause; Paystack pause; unresolved
D04 global authorization mismatch and twelve conditional cases unscheduled; E05
activation/API-restart automatic rejection with no alternate activation/restart;
G04 six connected sections deferred; S05 retry unscheduled and shared dependencies
requiring refreeze. This report requests or performs none of those actions.

## Coordinator handoff

- [x] Inventory Phase10 paused source/evidence without extending provider work.
- [x] Specify remaining actual native device acceptance with current evidence limits.
- [x] Separate H01/H02 workflow source from hosted acceptance and local_only Brain.
- [x] Identify H03 measured groundwork versus unproven conversation/operating scope.
- [x] Prepare explicit missing release/canary/rollback fields for later review.
- [ ] Fill selected target/version/capability scope after all applicable prerequisites.
- [ ] Obtain applicable approval, execute/observe and issue the resulting receipt.

Brain impact: root coordinator should link this report in Phase10–12 checklist/QA
and keep every parent acceptance open. No merchant behavior/API/schema/permission
change is made by this report. No new test run is necessary for this prose audit;
existing exact evidence is reused without summing repetitions as added coverage.
