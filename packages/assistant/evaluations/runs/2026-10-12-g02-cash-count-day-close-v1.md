# G02 cash count and day-close review — evaluation v1

Date: 12 October 2026. Scope: web/dashboard, local source integration and one
coordinator-scheduled canonical QA rollback. **G02 remains planned / partial / not
accepted.** Canonical accepted roadmap **13/45 (28.9%)**, unchanged. Source handoff
checklist **5/5 (100.0%)**; ticket acceptance **0/1**. Read-only closing readiness
is not an accepted financial day close.

## Delivered

- Strict `cash_count_record`, exact Book/account/time/physical amount/reference,
  required physical acknowledgement and valid zero. A separately signed app
  confirmation owns the native write; model tools read/draft only.
- Native review shares count normalization and posted ledger basis with the
  original count command. Caller-owned detail and checklist seams retain native
  authority, original command/ledger proof, boundaries and bounded transactions.
  No automatic adjustment, balancing journal, date lock or fiscal close.
- Natural cash account name/code search, bounded original count history, exact
  original observation target, changed-history/adjustment status separate from
  original expected/observed/variance. Receipt recovery uses the native returned
  original identity, including replay. Book identity is required on receipts.
- Canonical close checklist and posted day report at one repeatable-read snapshot.
  Next-open-period checklist is distinct from the day summary. Day summary starts
  at UTC midnight or the later bookkeeping/open-period start, is Tenant Book-wide,
  and preserves incomplete source coverage. Cash/bank flow excludes clearing.
- Dashboard physical count editor, exact original record view, day-close object,
  registered global-sheet patch and answer/receipt opening. Invalid count targets
  fail before native query, with clear close/reopen guidance. Cached current/review
  data is suppressed during fresh authorization fetches and after errors.
- ACTIVE selected Store checks on scoped source reads and writer. Public workspace
  imports replace temporary private relative imports; adapter satisfies the central
  GeneralActionAdapter after coordinator integration.

Owned code/evaluation paths are enumerated exactly in
[owned-paths-v1.json](../../../../artifacts/assistant-operations-parallel/G02/owned-paths-v1.json)
(22 files). Two existing canonical files changed: `cash-counts.ts` and
`period-close-checklist.ts`. No shared registry was edited directly by this child.
The coordinator applied the reviewed
[central patch](../../../../artifacts/assistant-operations-parallel/G02/central-integration-v1.patch)
and owns all shared integration paths/commit sequencing. **Do not reapply or
regenerate that historical patch over the now-integrated shared checkout.** The
coordinator added the public report seam export; no extra common registry patch is
pending from G02. All five G02 manifest entries remain `rollout: planned`.

## Focused results

**27 tests, 176 assertions, zero failures** in the final recorded provider-free run:
[full output](../../../../artifacts/assistant-operations-parallel/G02/focused-tests-v1.txt).
Contracts, native review/replay, lookup isolation, original receipt requirements,
editor exactness/acknowledgement, bounded answer projection, existing native cash
closing proof/checklist and real QueryClient freshness behavior are covered.

Meaningful cases: exact zero and bigint limits; strict untrusted payload rejection;
Book/Store lookup fences and ACTIVE Store filter; physical date/reference bounds;
active Owner/Admin refusal; exact original command replay and changed payload
refusal; original ledger basis/snapshot and no nested transaction; changed
watermark/posted balance/account label freshness; original variance despite changed
history; immutable cutoff milliseconds; Book-required receipt and strict answer
navigation targets; bounded card text; original closing command/ledger proof,
missing/differing/overflow/foreign cash evidence; unresolved checklist; cached
refetch suppresses prior MATCHED data, revocation error suppresses cached data, and
malformed count target disables the query.

API and dashboard focused nonincremental TypeScript checks are clean. Configs and
outputs are under the G02 artifact directory; API includes the guarded runner and
dashboard includes the source preview fixture. Scoped Biome checks cover 21 owned
code/test files, and owned existing-file whitespace checks pass. No broad suite,
provider evaluation, mobile/device/emulator/viewport testing or release was run.

## Scheduled connected canonical suite

Coordinator explicitly scheduled the exclusive QA slot, then the exact command was
run through normal permission review:

```
RUN_G02_CANONICAL_ROLLBACK=1 node artifacts/assistant-operations-parallel/G02/canonical-rollback.mjs
```

The initial restricted-network invocation failed before the first database identity
query, with database-unreachable. Its approved network escalation reached **terminal
exit 0**, returning these five named checks:

1. exact-original-zero-count;
2. canonical-review-basis;
3. original-command-replay;
4. changed-replay-refusal;
5. no-journal-or-close.

[Terminal result](../../../../artifacts/assistant-operations-parallel/G02/canonical-rollback-result-v1.json).
Root `.env`/local-profile and production-identity guards selected only exact
`ewatrade_qa_v1`. Exact QA Tenant `cmuzedcda000hbw9kd6e50z8u`, Store
`cmuzedcow000jbw9kluarpxfs`, Owner `cmuzedc7e000gbw9ky1dioc9f`, QA classification,
owner email and existing active cash Book/account were required. Original zero
observation/replay and mismatch were exercised in one maxWait 10000 / timeout 30000
transaction with deliberate rollback. Book sequence/closed-through and
command/count/journal/line totals matched before/after, and the owned command was
absent after rollback. This did not fingerprint every prior row; native commands
created only rollback-owned records and did not edit prior reconciliation records.
No fixture deletion, persistent record, new staff grant, provider/model/key/email,
API restart or runtime activation occurred. **Exclusive QA slot released.**
This is canonical-source evidence, not signed assistant HTTP or saved-browser
acceptance. No additional connected suite was started.

## Desktop source UI evidence

A three-direction source workshop compared 01 Compact review (selected), 02 Count
first, and 03 Comparison ledger; surrounding accepted Finance components were reused.
Temporary development-only `/qa-g02-source` mounted the actual source components
with explicit synthetic data. Browser exercised physical acknowledgement refusal,
zero edit and preserved 23:59:59.999 cutoff, original variance/current history,
posted day/incomplete coverage, all unresolved closing checks, and sheet close with
unsent preview draft retained. A follow-up mounted the actual registered count sheet
with invalid Book params, verified its clear guidance, and closing cleared only
owned params. Its query was disabled; it performed no saved-finance read.

Six screenshots:

- [workshop comparison](../../../../artifacts/assistant-operations-parallel/G02/workshop-source-v1.jpg)
- [editor](../../../../artifacts/assistant-operations-parallel/G02/editor-source-v1.jpg)
- [final original count/current review](../../../../artifacts/assistant-operations-parallel/G02/original-count-source-v1.jpg)
- [posted day summary](../../../../artifacts/assistant-operations-parallel/G02/day-close-source-v1.jpg)
- [unresolved closing checks](../../../../artifacts/assistant-operations-parallel/G02/day-close-blockers-source-v1.jpg)
- [native sheet invalid-target guidance](../../../../artifacts/assistant-operations-parallel/G02/invalid-count-target-source-v1.jpg)

Initial source browser console had one development Fast Refresh warning and no
errors. Final follow-up console had zero warnings/errors. Both owned tabs and the
exact temporary source route were removed. The synthetic preview file remains in
ignored artifacts for review. These screenshots do not certify stable saved runtime,
real model behavior, real global-factory chat state or signed mutation.

## Remaining acceptance gates and risks

- Validate complete registered signed proposal edit/review/confirmation, fresh
  approval/revision, immutable receipt atomic rollback/replay/fault/restart recovery
  against canonical originals, through actual HTTP and saved web runtime.
- Exercise fresh role/plan and Store revocation, cross-Tenant/Book/Store, ambiguous
  cash account/count selection, later backdated postings and receipt failures in
  scheduled exact-owned QA evidence. Do not infer these from source mocks.
- Verify real global factory open/close keeps the selected assistant conversation
  and unsent draft. Source preview exercised component state only; real cached-fetch
  and denied-read behavior has QueryClient source evidence but awaits saved browser.
- Preserve existing inventory closeout as C05. Physical count, separate variance
  correction, privileged date lock and fiscal close/reopen remain distinct. Native
  posted reports always expose incomplete source coverage, so G02 cannot certify an
  operationally reconciled financial day close. No close write exists in this batch.
- No accepted capability activation, hosted deployment, provider call, paid spend,
  persistent key, mobile change or API3095/PID73073 restart. E05 approval gate is intact.

## Brain impact and handoff

Updated dedicated `.brain/features/assistant-cash-count-day-close.md` and
`.brain/decisions/2026-10-12-assistant-cash-count-day-close.md`. They record internal
seams, additive count read `bookId`, scope/permission/contract behavior and partial
G02 task state. No Prisma model/migration change. The coordinator should append the
checkpoint to common API/coverage/task documents during final integration without
changing the accepted denominator/tally. The child did not stage, commit, push,
reset, stash or modify shared status catalogs, and preserved all foreign work.

## Coordinator integration review

Shared registrations applied and formatted; native original-name presentation now
labels the current account name. Answer and receipt navigation share the registered
object parameter map, so opening a count/day review closes sibling overlays without
clearing assistant/chat keys. Seven strict contract/manifest coverage checks34assertions
pass, final focused dashboard compilation passes after navigation refinement. Full
coverage generation passes with five G02 entries planned. Existing native Order
procedures absent from prior inventory are classified planned D01/D02/D03; no new
acceptance is inferred. Two old classifications removed where now owned by G02 manifest.
Pre-existing proposal-editor noArrayIndexKey lint remains outside this change; four
refined production files pass Biome. The synthetic screenshot precedes the additional
current-name label; it is source component evidence only. Full G02 remains partial.
