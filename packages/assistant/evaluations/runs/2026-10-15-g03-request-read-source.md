# G03 protected generic Service Request read source checkpoint

15 October2026. Backend/model source verified; client integration and G03 acceptance
remain open. **Parent13/45(28.9%)**, all original approval gates retained. This
advances group1 of the full G03 remaining-scope audit; it does not replace or finish
Inquiry/staff intake, disposition, Quote issue/revise, booking/capacity, generic
pickup/delivery, progressive Catalog or second-vertical work.

## Implemented and reviewed

Canonical new service-request-read.ts owns current persisted Member/Tenant/Store
checks, explicit Owner/Admin/LEGACYManager ceiling and positive accessRevision.
Existing generic request reads have no attendant-specific gate; no Quote write
permission was transplanted into read access, and no scoped-staff route/grant added.

Discovery takes at most10+1 with stable createdAt DESC/id DESC seek; same-filter
count and page run in one caller-owned RepeatableRead. Six lowercase statuses,
literal querytrim1..120, cursor≤4096,limit1..10(default10). Cursor binds actor,
member/role/accessrevision,Tenant,Store,status,query,limit. Wrong/changed filters or
current access refuse before source paging. totalMatching:string is authoritative
for this read/filter; later pages are fresh snapshots, not one frozen sequence.
No contacts/details/current prices/token/media in discovery. Original requires
exact request/form/line ownership, at most100lines via101overflow refusal, saved
names/options/full Decimal38,6 string without floating conversion. Canonical
CommerceQuote SERVICE_REQUEST/currentVersion only, no legacy fallback. Accepted
Order is exact sameTenant/Store and nonclinical. Stored version total is never
payable/selectedoffer/acceptance/payment proof. No invented allowedDispositions.

Two new strict protected serviceAssistantRequests queries are registered in real
AppRouter and GENERAL namespace-preserving caller; maxWait10s/timeout30s. Scope
auth-derived only; known FORBIDDEN/CONFLICT mapping unchanged, unknown errors not
retried/masked. New shared inputs/target preserve original provenance without
accepting it as scope. New model allowlists expose availability/phoneLast4 rather
than structured full contacts, preserve exact saved details/quantities, and exclude
future private fields. Customer text remains untrusted data. Stored opt-in is
historical, not sending authority. Saved read continuation hydrates only valid
assistant-owned hints, preserves filters and advances only cursor; no write.

Two planned dashboard-only read capabilities added: services.requests.read and
services.request.original.read. Tools emit accurate read summaries; shared exact
request target is not advertised through answer routing before real consumers.
Current154capabilities; native39writes/65reads/35fullwritegaps unchanged. No rollout
activation or optimistic native declaration. Claude UI jobce41c527 covers pure
native page/original and dashboard original; root owns protected reads/routes/glue.

## Actual source checks

- canonical child: 9pass/97assertions, actual functions with inert transaction stand-ins; independent source review no actionable finding.
- actual router child fixture: 11pass/143assertions, real router/schema/role/error/options with middleware+canonical stand-ins.
- combined source: 46pass/239assertions across5top-level files,32isolated children.
- final focused schema/model/savedcontinuation: 5pass/50assertions, after typed test-target correction.
- scopedlint: 15files clean.
- compiler: exit2:79imported/concurrentdiagnostics,0inG03-owned paths; one test type mismatch corrected before final pass.
- coverage: snapshot current.

The32 child fixtures run isolated to avoid process-wide module mock leakage;
combined parent assertions are not total assertions inside all children. Canonical
and router fixtures explicitly use stand-in transactions/middleware, not a real
DB/HTTP service. Independent native_staff_status reviewed canonical authority,
cursor/count/privacy/snapshots/Quote/nonclinical linkage at exact hashes and found
no actionable finding; reviewer did not run additional tests. Wrapper child covers
actual schemas/currentScope/manager ceiling/error mapping/options with canonical
stand-ins. Structured projection tests include future private fields and exact
large decimal strings. Compiler remains non-green from imported/concurrent paths;
no full-checkout green claim. Source observations in matching JSON are reviewed
bytes, not exclusive control of shared files or a deployable release candidate.

## Remaining work and gates

- Native protected paged/original screens and exact answer/modal routing.
- Dashboard exact original sheet/answer/global access guard and saved continuity.
- Durable source-owned disposition event/replay, fresh authority/revision/explicit
  state policy, caller-owned review/execute/recovery before assistant writes.
  Current mutable updateServiceRequestDisposition is insufficient; no equality-
  based replay receipt, reused customer capability record or unsafe fallback.
- All other G03 lifecycle groups/full saved/native/connected acceptance.

No DB/schema/migration/provider/model/OTP/email/message/runtime restart/activation,
deploy, commit or push. G01 paused, Paystack pause incl repairs/extensions/
registration, D04 drift unattributed12conditionalcasesUNSCHEDULED, E05 rejected
activation/restart, G04sixdeferred, S05sevenUNRUN/retryUNSCHEDULED and exactC04
targets remain. The added reads neither create a new approval gate nor remove one.

## Brain impact

Updated assistant-service-requests feature; API contracts/endpoints/permissions;
numbered phase checklist and tasks/in-progress; prior G03 audit linked to this
checkpoint. Initial UI inventory150 and hubv5152 metadata retained as historical
snapshots, current154/25services metadata appended. No schema/relationship change.
Brain remains ignored/local-only; new coverage/impact/report are ordinary source
artifacts, never force-added or committed. Whole impact result recorded after this
report exists, rather than treating missing evidence as pass.


Final whole mixed-checkout impact passes24records/126capability+8procedure rows.
This is local source impact, not hosted CI or concurrent-owner acceptance. Compiler
config and reproducible focused commands are retained in matching JSON.
