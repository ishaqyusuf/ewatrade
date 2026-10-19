# S05 bounded acceptance follow-up — source proposal, 15 October 2026

Status: preparation only. **UNSCHEDULED. No launcher, diagnostic, database,
network, model or provider execution is requested or performed by this packet.**
This proposal inventories the current source and defines what a later reviewed
execution would prove. It neither releases a QA slot nor resumes the stopped
suite. S05 remains partial/planned/unaccepted; assistant acceptance stays
13/45 (28.9%), with 32/45 (71.1%) open.

## 1. Preserve the recorded stop

The authoritative history is
[the original acceptance proposal](2026-10-12-s05-connected-acceptance.md) and
[the coordinator review](../runs/2026-10-12-s05-coordinator-review.md).

- Run 1 expired while starting transactions/constructing fixtures; no connected
  comparison, authority, timing or plan assertions passed. A later read-only
  audit found the fixture Tenant/user anchors absent, not a full graph checksum.
- Run 2 stopped in preflight at median 426 ms, before fixtures.
- Run 3 stopped all seven cases before `plannedIds()` or `$transaction`:
  median 2,503 ms, projections 62.6–107.6 seconds against a 20-second budget.
  **All seven acceptance cases are UNRUN**, not failed product assertions.
- Coordinator stop `60d065ca-4636-48f5-b467-1efdeb7f8719` remains in force.
  A new source freeze does not schedule a run.
- The separately scheduled historical diagnostic completed once: TCP median
  207.6 ms, authenticated connect 2,336.3 ms, SELECT 1 median 206.9 ms and
  constant server planning/execution about 0.02 ms. It suggests contributors;
  it does not identify a cause, establish future stability, measure business
  queries or validate fixture statement estimates. It grants no retry.
- Preserve G01's human pause, D04's authorization-fingerprint hold, E05's
  rejected activation/restart, Paystack pause and G04's independent deferred
  sections. No activation, target/grant substitution, API restart, provider,
  persistent privacy change, schema work, push or release follows here.

## 2. Current executable unit and exact case inventory

Source inspected: `scripts/qa-staff-activity.mjs` and
`packages/db/src/queries/staff-activity.integration.test.ts`.
The launcher currently starts the whole integration file; **it has no one-case
or case-selection argument**. Its recorded command is
`node scripts/qa-staff-activity.mjs` (historical reference only, not scheduled).
Optional `--environment-root` requires an absolute path. Do not run the test
directly to bypass the launcher or invent a narrower supported command.

Let `m` be the fresh preflight median in milliseconds. The existing gate uses
`Math.round(statements × m + extraMs) <= 20_000` before allocating IDs or
starting each transaction. Estimates are assumptions to be replaced by actual
`setupStatements`, `readStatements` and total statement counts if a case runs.

| Current case | Estimate and projection | What its assertions cover | Provenance / boundary |
|---|---|---|---|
| `canonical-baseline` | 5 transaction + 30 canonical setup + 8 exact-ID = **43m** | Original command-created order and payment identities, requested order, no withheld extras, Store A, actual Amina actor/membership and payment→original Order link | One canonical Order and one canonical payment; only positive canonical-source baseline |
| `order-payment-pages` | 5 + 6 direct setup + 2 × (6 page + 1 direct comparator) = **25m** | Separate ORDER/PAYMENT page identities in canonical sort order, full `total`/`byStream`, three same-Tenant orders, foreign order excluded, departed actor unavailable and never reassigned to viewer | Synthetic direct rows; source-query comparison, not command evidence |
| `subject-shown-foreign` | 5 + 6 + 7 + 1 + 8 + 2 = **29m** | Amina ORDER filter equals exact-predicate direct read; shown payment/departed/order sequence preserved; genuine foreign order withheld; foreign membership refused | Direct seed; no subject grants are created/revoked at protected API |
| `authority` | 5 + 6 + (8 + 1) + 6 = **26m** | Manager Store-A subset, Store-B withholding, Manager with null Store scope refused, Cashier refused, next in-transaction read after demotion/suspension refused | Fixture membership updates roll back; caller-supplied Store arrays are filter controls, not fresh API grants |
| `all-stream-sweep` | 5 + 6 + 26 all-stream page + 2 direct comparators = **39m** | Total and identities equal seeded orders/payments; every other included stream empty; Finance omitted with `finance_actions` disclosure and no Finance count | Eleven non-Finance streams can be queried, only ORDER/PAYMENT nonempty; no Book is seeded |
| `timing` | 5 + 6 + 1 bulk insert + 6 first page = 18m; extra `4_000 + 16m`; combined **34m + 4_000** | 1,000 direct volume orders plus three same-Tenant baseline orders; first page has ten; exact ten-ID reread and ORDER ten-row page each sampled for a two-second window | Source-query load control; actual sample count 1–10 each, not fixed ten samples or production/SLA evidence |
| `plans` | 5 + 6 + 8 + 6 + 4 = **29m** | Capture actual Prisma SELECT statements for ORDER/PAYMENT loaders; require at least three matching sorted selects; EXPLAIN ANALYZE BUFFERS for at most four with bound parameters | Same direct synthetic fixture and transaction; not all-stream, Finance, production volume or concurrent plans |

Using the historical **206.9 ms** diagnostic purely as arithmetic gives
8,897 / 5,173 / 6,000 / 5,379 / 8,069 / 11,035 / 6,000 ms respectively.
These are neither today's measurements nor approved budgets. The approximate
median ceilings for the existing formulas are 465 / 800 / 690 / 769 / 513 /
471 / 690 ms. The actual fresh gate and rounding decide each case; none of
these numbers changes its 20-second threshold or reserves execution.

Current seed cardinalities:

- Each case creates two synthetic QA Tenants, six users, five memberships
  and three Stores in four batches. The departed user has no membership or
  staff profile from creation; this models unavailable attribution and is
  **not a connected deletion lifecycle**.
- Direct cases insert four Orders (three main-Tenant, one foreign) and one
  payment in two batches. No commands validate those directly seeded records.
- Canonical baseline instead calls `createCommercialOrderInTransaction`
  for one quick-sale Order, `recordCommercialOrderPaymentInTransaction` for
  one payment, then reads its ID. Canonical setup can create additional
  catalog/stock/Finance records through existing commands. Its estimate of
  30 setup statements has not been measured by a passing S05 case.
- Timing adds exactly 1,000 synthetic Orders with deterministic one-second
  spacing inside the fixture's window. It is not a canonical write benchmark.
- Windows are generated around current UTC (one hour before/after now).
  No acceptance of business-local day, offset-boundary, backdating or 92-day
  behavior follows from these connected cases.

## 3. Preconditions to review before any connected reservation

1. **Source review and refreeze first.** Obtain a stable final dependency
   inventory after current Phase 6 integration and other shared work. Re-read
   affected hunks and their source checks, capture complete hashes, then verify
   the hashes immediately before and after any later execution. The old
   28-file comparison is historical and cannot freeze today's source.
2. **Environment remains exact and private.** The explicit `.env.local`
   Development profile must exist; loading uses root `.env` plus that one
   profile. `applyDatabaseProfile` must be able to read the Production reference
   and exclude it. `DATABASE_PROFILE_VERIFIED=1`, `DEV_PROFILE=local`,
   `RUN_DATABASE_INTEGRATION_TESTS=1`, explicit matching
   `QA_ACCESS_ACCEPTANCE_DATABASE_HOST` and
   `QA_STAFF_ACTIVITY_DATABASE=/ewatrade_qa_v1` are launcher-derived assertions,
   not authority to set arbitrary environment values manually.
3. **Exact authorized target only.** Launcher pins URL hostname to
   `ep-royal-dew-awnlogem-pooler.c-12.us-east-1.aws.neon.tech` and pathname to
   `/ewatrade_qa_v1`; in-process guard checks verified local profile, Neon host
   agreement and that database pathname. If the selected profile is another
   Development database, stop. Do not derive URLs/credentials, replace the
   target, point at shared QA, change grants or weaken an equality check.
4. **Effective driver target requires source re-review.** The fixture launcher
   currently checks URL hostname/path, while the repaired diagnostic separately
   rejects query overrides, validates `pg-connection-string`'s effective host/
   port/database, pins 5432 and defeats ambient `PGPORT`. Those diagnostic
   repairs are not present in this launcher/fixture. Review effective target
   equivalence and Production exclusion with offline controls before declaring
   a future fixture run adequately guarded. No guard repair is performed or
   implicitly authorized by this proposal. Never log credentials or URLs.
5. **Bounded lifecycle requires review.** Existing per-case limits are listed
   below; they do not provide a hard whole-process cancellation ceiling.
   Before scheduling, the coordinator needs a reviewed execution envelope,
   actual cancellation/cleanup evidence and ownership of the exact terminal
   handle. A diagnostic's 58-second ceiling cannot be attributed to this suite.
6. **One reservation only after prerequisites.** Any future coordinator release
   must name the complete case set, frozen hashes, guarded command, authorized
   environment root, terminal owner and stop/absence procedure. A baseline-only
   unit is a possible later source design, but the current launcher cannot
   select it. No repeated tries after a budget refusal, timeout, unknown rollback
   state, guard failure or changed fingerprint. Re-freezing does not release
   the slot; peer ACKs and faster historical pings do not release it either.

## 4. Existing rollback, errors and deadlines — actual guarantees

| Layer | Current source bound / behavior | Limitation that must remain explicit |
|---|---|---|
| Fixture client | One connection, `max:1`, `idleTimeoutMillis:0`, connect timeout20s and client query timeout25s | No shared product-client mutation; warm connection is not a stable-latency guarantee |
| Preflight | `beforeAll`40s; one SELECT1 connection probe then five sequential SELECT1 pings | Six read-only statements; Bun hook deadline does not itself demonstrate cancellation of active driver work |
| Budget | Per-case projected work ≤20s before IDs/transaction | Estimates omit a measured setup basis; the 10s reserve is not permission to exceed transaction30s |
| Transaction | RepeatableRead, maxWait10s, timeout30s, fresh option object | Do not nest a root transaction or increase limits |
| Server statement/lock | `SET LOCAL statement_timeout='20s'`, `lock_timeout='10s'` | Transaction-local only; no session or production configuration change |
| Measurement | Two sample windows2s each, 1–10 actual samples each | Window is checked between samples; one last sample can finish after its window and is still constrained by other timeouts |
| Bun case | 50s for wait + transaction + absence | Not proof the underlying work was cancelled at50s |
| Rollback | Every successful assertion block throws its own `Rollback` sentinel; only that sentinel is swallowed | Assertion/driver/timeout errors are retained, not counted as successful rollback |
| Absence | After each attempted fixture, read-only Tenant count for both planned IDs and user count for all six IDs; `absent===true` required | Two anchor counts, not every child table or an unrelated business/auth/chat checksum. Absent read failure is reported; original fixture error propagates |
| Finalization | Fixture `afterAll` disconnect; launcher forwards child exit or signal | No independent whole-process deadline or verified cancellation/cleanup ceiling in current launcher; do not claim40+7×50s is an enforced total bound |

`assertFits` occurs before `plannedIds`; a budget refusal starts no fixture
transaction/write and does not require inventing a rollback audit. If a case
started, its post-case anchor check must be inspected even when assertions fail.
An unexpected failure, disconnect failure, missing metric or uncertain absence is
a stop requiring evidence review, not a reason to retry, delete fixtures or
declare the fixture harmless. Current absence failure text includes the driver
message; a later packet must keep reports free of URLs/credentials and preserve
the underlying safe error code. This proposal does not change error handling.

## 5. Evidence contract for a later bounded execution

Retain separately: guard refusal, preflight values, budget UNRUN, attempted
fixture failure, successful rolled-back assertions and absence outcome. Never
convert Bun's pre-transaction failure count to seven product failures or passes.

For each actually attempted case, record its source/command, terminal handle and
exit, start/end time, exact case name, stage, setupMs/setupStatements,
readStatements/total statements, caseMs/outcome and absent. For timing, retain
actual sample counts/p50/max and rowsInWindow. For plans, retain the actual
bounded loader statements/plans with credential-safe handling. Compare measured
statement counts with estimates; any material drift needs source/budget review,
not a silent threshold change. Finish with unchanged final dependency hashes
and the exact scope of absence evidence. No SLA, full S05 acceptance or native
certification follows from a passing seven-case subset alone.

## 6. Missing acceptance, even if those seven cases later pass

- **Ten other streams:** nonempty Stock operations/counts, amendments, product
  returns, service fulfillment/authorization/work/assignment, price changes and
  Finance postings. Verify canonical attribution/reversals and exact per-stream
  totals, not only empty-stream assertions. Product-scoped prices and exact
  stock-operation-type row/count filters need connected positive evidence.
- **Finance:** real same-Tenant Books, canonical Finance entitlement and current
  Book scope at API, allowed source kinds/no mirrored double counting, reversals,
  Store-wide versus business-wide exclusions, wrong/removed Book and cursor
  refusal after entitlement change. `financeBookIds:null` cannot prove these.
- **Public wrappers and grants:** exercise `listStaffActivityPage` and
  `readStaffActivityShown` public RepeatableRead wrappers plus protected
  `retailOps.staffActivityPage`/`staffActivityShown` and canonical
  `staffActivityScope`. Current fixture only calls InTransaction helpers;
  hard-coded Store/Book arrays do not prove server scope derivation/revocation.
- **Concurrency/recovery:** cross-transaction role/status/Store/Finance changes,
  concurrent reads and actual close/reopen access transitions. Same-transaction
  demotion is narrower evidence. No real HTTP/session or saved-answer path runs.
- **Privacy/security:** actual subject removal/deletion/restriction while open,
  unknown versus unavailable historical actor, no invented current assignee,
  payroll/attendance/sign-in/device exclusions, foreign-Tenant/Book isolation,
  safe failures and no saved target labels during denied/refetch/paused states.
  Persistent account mutations need a separate bounded plan with restoration;
  none is authorized or included here.
- **Time and pagination:** business-timezone boundaries, exact [from,to) dates,
  backdated record time versus effective time, same-time multi-stream sort,
  cursor scope changes and complete multi-page continuity through saved cards.
- **Browser/native:** authenticated authorized QA identities/current source,
  fresh exact-event Open/Close, stale/paused/denied and pending reopen, current
  view labels, same chat/draft preserved, Owner/Manager/Cashier and Store changes.
  Original Parts B/C remain unreleased and G01/E05 gates remain intact.
- **Original records:** current `general-model.ts` activity mapping opens native
  same-Store Orders/payments and Products only; stock/service/Finance activity
  references still fall back to dashboard. Newly added native Finance movement/
  expense receipt routes and staff lifecycle originals do not implement the
  separate `finance_entry` activity target. Dashboard still returns `Open from
  Finance` for a journal entry. Cross-Store originals say Switch to Store;
  this disclosure does not accept an end-to-end cross-Store journey.

## 7. Dependency inventory for final coordinator refreeze

This is a path inventory, not a claim that any old packet is unchanged. Root
must capture final complete hashes after current Phase6 integration and include
the transitive authority/command dependencies affected since12October.

| Area | Exact primary paths to re-review/freeze |
|---|---|
| Execution / target / environment | `scripts/qa-staff-activity.mjs`; `scripts/qa-staff-activity-latency.mjs` (historical diagnostic, no rerun); `scripts/database-profile.mjs`; `scripts/environment-profile.mjs`; `packages/db/src/queries/acceptance/qa-access/database.ts`; selected root profile identity privately verified, never copied into public inventory |
| Fixture / query / canonical seeds | `packages/db/src/queries/staff-activity.integration.test.ts`; `packages/db/src/queries/staff-activity.ts`; `packages/db/src/queries/staff-activity.test.ts`; `packages/db/src/queries/staff-directory.ts`; `packages/db/src/queries/commercial-orders.ts`; `packages/db/src/queries/commercial-payments.ts`; `packages/db/src/queries/index.ts`; generated Prisma client/schema/runtime adapter versions and changed quick-sale/stock/Finance transitive command dependencies |
| Protected API and current authority | `apps/api/src/trpc/routers/retail-ops-staff.ts`; `apps/api/src/schemas/retail-ops-staff-reads.ts`; `apps/api/src/trpc/finance-procedure.ts`; `apps/api/src/trpc/init.ts`; current Tenant/staff middleware and grant helper dependencies resolved by imports |
| GENERAL dispatch and answer | `apps/api/src/assistant/general-staff-activity.ts`; `apps/api/src/assistant/general-staff-activity.test.ts`; `apps/api/src/assistant/general-tools.ts`; `apps/api/src/assistant/general-context.ts`; `packages/assistant/src/general/contracts.ts`; `packages/assistant/src/general/staff-activity-target.ts`; its test; `packages/assistant/src/capabilities/manifest.ts`; `packages/assistant/src/capabilities/COVERAGE.md`; `packages/assistant/package.json`; root `package.json`/`bun.lock` |
| Dashboard original navigation/cache | `apps/dashboard/src/components/sheets/staff-activity-sheet.tsx`; its test; `apps/dashboard/src/hooks/use-staff-activity-params.ts`; `apps/dashboard/src/hooks/use-assistant-receipt.ts`; current global sheet/auth scope registration, original Order/Catalog/Inventory/Service consumers and tRPC client cache clear |
| Native activity/cache/originals | `apps/mobile/src/components/mobile/assistant/staff-activity-screen.tsx`; `apps/mobile/src/components/mobile/assistant/general-model.ts`; its test; `apps/mobile/src/app/staff-activity-modal.tsx`; `apps/mobile/src/components/mobile/assistant/ask-assistant-live.tsx`; `apps/mobile/src/hooks/use-auth.tsx`; `apps/mobile/src/trpc/client.tsx`; current native original-record route consumers |
| Controls / delivery evidence | `packages/assistant/evaluations/fixtures/staff-activity-review.fixture.ts`; `packages/assistant/evaluations/fixtures/s05-open-review.fixture.mjs`; `packages/assistant/impact/2026-10-12-s05-staff-activity.json`; both12October source/review reports and original proposal; this follow-up proposal; any newly refrozen current packet evidence |

Manifest/contracts/general context/tools/router/package and client original seams
are shared with later G04, service, money, native and WhatsApp work. Preserve
foreign hunks, identify changed dependencies explicitly and obtain current
ownership before any source repair. Old hash equality for a smaller subset is
not final integration evidence. This packet makes **no** shared edits.

## 8. Preparation checklist and next safe action

- [x] Preserve seven UNRUN cases and the no-retry condition.
- [x] Inventory current scopes, provenance, formulas and actual rollback bounds.
- [x] Identify effective-target and whole-process-bound review prerequisites.
- [x] Enumerate missing full S05 acceptance and shared refreeze dependencies.
- [ ] Root final shared-source inventory/hashes and source review.
- [ ] Separately reviewed guard/lifecycle treatment and bounded execution unit.
- [ ] Explicit coordinator reservation, only after the above; currently absent.
- [ ] Connected comparisons/authority/performance and full browser/native/privacy
  acceptance, still gated and unproven.

The unblocked deliverable here is complete proposal preparation. Next safe work
is root source review/refreeze and other authorized offline implementation;
there is no scheduled or implicit connected continuation. Brain/checklist updates
belong to the coordinating root in this change set.
