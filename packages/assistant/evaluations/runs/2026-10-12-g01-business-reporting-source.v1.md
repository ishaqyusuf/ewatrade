# G01 business reporting — source evaluation v1

Date: 12 October 2026. Web/dashboard only. Result: **partial, planned, unbookmarked, not accepted**. Accepted project milestone remains 13/45 (28.9%). Integration proposal baseline at final check: `d4d9fde993bc558db5da149f7c2981fe1c550be8` plus concurrent shared working changes; per-file base/proposed SHA256 values are in `artifacts/assistant-operations-parallel/G01/integration-base-hashes.json`. This chat did not stage, commit, push, restart or activate anything.

## Delivered source

29 owned TypeScript/TSX files listed in `artifacts/assistant-operations-parallel/G01/owned-paths.json`, plus this evaluation and three owned Brain documents. Six strict reporting inputs, six canonical/scoped read adapters, exact original-origin target and native dispatcher, full-path internal callers, URL sheet/Open/content/header, original-object URL helper, and provider-free focused tests.

Item sales now computes complete original group/line/booked-value aggregates before bounded details. Customer debt now computes complete scope totals across every matching account, independently of its detail page; per-account details remain canonical. Proposed canonical arithmetic extraction avoids a second allocation/release rule implementation. Both reports use scope-bound detail cursors and explicitly live request snapshots. No cap10/cap100 refusal is presented as a full larger-business report.

Stock still refuses above 200 source rows; supplier aging retains its canonical 1000-source bound; posted-profit source preflights 200 Book accounts. These are explicit full-scope limitations. Posted finance and supplier aging use existing definitions; incomplete actual profit/cost coverage is never promoted to complete actual profit or zero costs.

## Executed checks

| Check | Result | Evidence / practical limit |
| --- | --- | --- |
| Focused Bun suite | 23 pass, 0 fail, 128 assertions across 8 files | `unit-tests.log`; schemas/authority injection, original scope refusal, cursor/filter binding, 147-group and 147-account aggregate vs detail fixtures, exact money/decimal snapshots, canonical debt arithmetic, collections dates/credit/refunds, canonical stock conversions/transit and overflow, finance unknown coverage, URL assistant/chat preservation |
| TypeScript, full integration proposal in memory | 0 diagnostics | `typecheck-patch.log`; includes all 12 proposed shared files at real module identities, owned source/tests and prepared QA runner. No checkout files overwritten. ES2022/no incremental, 8GB heap; an earlier 4GB attempt exhausted memory and is not a successful check. |
| Owned Biome | Pass, 29 files | `biome.log`; exact owned file list, no foreign formatting |
| Patch applicability | Pass | `git apply --check artifacts/assistant-operations-parallel/G01/integration.patch`; checked only, never applied |
| Guarded runner JavaScript syntax | Pass | `node --check .../run-qa.mjs`; syntax-only check before the separately approved connected run |
| Initial actual content/sheet browser preview | Source-only synthetic proof | Earlier local QA shell rendered item/payment/debt/empty/unavailable states; exact synthetic Customer Open reached native missing-source state, closing restored route. Console warn/error list empty at that check. No live report/native reporting transport or saved-chat acceptance. |
| Refreshed synthetic browser preview | Blocked before rendering | Local dashboard returned 502 Bad Gateway. No restart attempted. Owned tab and exact temporary route files removed. |
| Workshop gallery | Prepared, not rendered | Three numbered directions, selected source rows/visible gaps. File-protocol navigation was denied; no workaround attempted or gallery acceptance claimed. |

The focused tests use mocks/pure projection fixtures. They do not prove that untyped SQL executes against the QA schema, that provider-backed conversation generation behaves correctly, or that deployed/native transport paths are active. No model/provider, hosted configuration, persistent credential/grant, message, DB mutation, fixture deletion or deployment was used.

## Visual evidence

Artifacts under `artifacts/assistant-operations-parallel/G01/`: `item-report-source.jpg`, `payment-report-source.jpg`, `debt-report-source.jpg`, `empty-report-source.jpg`, `overflow-report-source.jpg`, `original-customer-unavailable.jpg` and `workshop.html`.

Screenshots show the earlier synthetic rendering. Item/debt overflow evidence predates the aggregate pagination revision and must not be described as the final behavior. Updated synthetic fixture generator/JSON reflect current report shapes; refreshed rendering failed at the local gateway. Native pagination controls/saved-chat continuity still require browser acceptance; refreshed synthetic content later rendered current totals and finance presentation, as recorded below.

## One approved connected QA read, fixture gate failed

`run-qa.mjs` requires `G01_QA_EXCLUSIVE_SLOT=coordinator-scheduled`, loads root local environment with existing production exclusion, refuses a non-local profile or non-`ewatrade_qa_v1` target, and launches Bun with `--env-file=/dev/null`. The runner checks exact QA Owner `cmuzedc7e000gbw9ky1dioc9f`, Tenant `cmuzedcda000hbw9kd6e50z8u`, Store `cmuzedcow000jbw9kluarpxfs` and actual current_database. Secrets are not printed.

`qa-read-check.ts` opens one repeatable-read transaction with maxWait10000/timeout30000 and uses only caller-owned transaction helpers. It compares full-scope ledger projection with complete canonical per-account totals; complete item value/line totals and payment/refund/customer-credit collections with native source rows; unchanged whole totals/nonoverlapping detail pages; inactive finance actor and unknown creator/item; exact timestamp half-open source boundaries. It intentionally rolls back, then compares saved fact hashes. No test fixture is persisted or deleted. Canonical membership locks require an ordinary transaction; application code performs reads only. Comparison source bounds refuse staged/oversized fixtures rather than truncate. It requires >10 accounts and >10 original item groups for acceptance, so sparse fixtures cannot silently pass.

Coordinator released other suites and designated one exclusive G01 run. Automatic approval review first rejected execution because the coordinator message did not establish trusted user authorization; the process did not start. The user then directly approved one guarded read. That run completed with **exit1**, and no second connected run was attempted.

Actual terminal proof in `qa-read-check.log`: canonicalLedgerAccounts0, itemGroups"0", itemLines0, paymentRows0; inactiveFinanceDenied true with exact FinanceError/FORBIDDEN matching; applicationReadOnly true; fixtureCoverage false; rollback true; savedFactsUnchanged true; proofHash `feda12a4cece4509366f5e66a253e724fc1d94abf71d407363558a0f1ed8f0e1`. Final error: acceptance fixtures required >10 accounts and >10 original item groups. Client disconnected and slot released.

The scope was empty. Complete-scope SQL executed successfully against the QA schema, but real allocation/release/money values, detail pagination and exact nonempty dates were not proven. The logged aggregatePaginationEqual true was a conditional/vacuous empty-scope signal, **not real pagination acceptance**; future runner output now exposes separate checked flags and empty-scope-only ledger comparison. That instrumentation update was source/typechecked only, not rerun against the DB. No fixture was created or deleted.

Before acceptance add/run canonical nonempty allocation/release and >10 pagination fixtures, foreign Tenant/Store/currency and live scoped staff/plan boundaries, stock/supplier/profit canonical database checks, and full API-origin/pagination/native saved-chat continuity. Another connected run requires a fresh coordinated slot and appropriate authorization.

## Handoff and remaining gates

Exact proposed central edits: package exports, canonical ledger projection seam, inventory transaction-client type seam, router, planned dashboard capability manifest/context/tools, staff policy, answer union/Open and GlobalSheets. `integration.patch`, `integration-source.json` and `integration-base-hashes.json` are review inputs; coordinator must check/rebase against its final shared baseline. Common source registries and common Brain files were untouched by this chat.

Required next: reviewed integration; coordinator-approved runtime activation; exclusive connected canonical database tests; current pagination/finance UI and original/saved-chat continuity; explicit staged-report strategy for source/account bounds before claiming unrestricted full-business support. No E05 API restart or workaround activation was attempted. G01 remains partial/unbookmarked.

Brain updated: `.brain/features/assistant-business-reporting-g01.md`, `.brain/plans/2026-10-12-assistant-business-reporting-g01.md`, `.brain/decisions/2026-10-12-g01-report-totals-and-origin.md`. No Prisma schema/migration changes. Coordinator-owned common API Brain additions are in `brain-api-sections.md`.

Parent integration update: coordinator applied the current G01 patch after D04 registration and the G02 committed factory. Public exports/router, canonical arithmetic extraction, inventory DbClient seam, target/global sheet, tools/policy and six planned capability entries are present in shared source. G01 did not apply/regenerate an old patch or edit shared files. Parent retains sibling navigation parameters, prompt/capability coverage and evaluation catalog integration. Original patch remains archived handoff evidence; do not reapply it.

## Final presentation and browser follow-up

All five money-report sources now expose discriminated canonical numeric totals and exact moneyMinor/moneyDetails rows. Shared presentation reads those fields and the existing formatFinanceMoney, preserving exact values beyond IEEE-754 range without converting amounts to Number or parsing sentences. Fresh protected context supplies human Store names; Tenant/Store IDs remain scope/origin/cursor authority checks. Posted-finance original coverage/completeness/gap codes remain in structured sourceCoverage; visible gap labels are readable. The future QA runner compares numeric fields and distinguishes skipped pagination. These changes were provider-free tested and typechecked, with **no second database execution**.

Current actual integrated source typecheck:0diagnostics,0overlay files (`typecheck-integrated.log`).23tests128assertions/8files,29-fileBiome pass. The coordinator's registered source is used; old integration patch was not regenerated/reapplied. Capability IDs are now finance.supplier_aging.report and finance.posted_profit.report per parent's manifest validation.

Following coordinator runtime diagnosis (no restart), the existing local preview navigated successfully after a navigation timeout/state inspection. Current synthetic item totals147groups/10details, collections, debt, supplier aging (exact huge payable) and posted profit with unknown actual costs rendered. Captured `item-report-formatted-source.jpg`, `payment-report-formatted-source.jpg`, `debt-report-formatted-source.jpg`, `supplier-report-formatted-source.jpg`, `profit-report-formatted-source.jpg`. These are current content/formatting proof, not connected native report transport/pagination controls or saved-chat acceptance. No viewport/device override.

Browser console showed duplicate sibling React keys from parent's shared GlobalSheets remount key. Shared source at inspection reused objectScope for ServiceIntakeReceiptSheet, BusinessReportSheet, AssistantCashCountSheet and AssistantDayCloseSheet. Exact finding/recommendation in browser-console-note.md; common file untouched by G01. Therefore no clean integrated-browser claim. Owned temporary preview files/route and tab were removed/closed.

Final reconciliation: The coordinator fixed the shared GlobalSheets sibling keys with service-intake, business-report, cash-count and day-close prefixes while retaining the actor/Tenant/Store scope suffix. G01 verified the source at lines 116, 124, 143 and 146; the shared file was not edited by G01. Screenshots and console observations predate this fix. No post-fix browser or saved-chat continuity acceptance is claimed.

Public source boundary: Presentation is intentionally exported by the owned business-reporting/index.ts. API answer and dashboard content now consume businessReportSummary/businessReportRowValue through @ewatrade/db/business-reporting; no production cross-package private source import remains. The already-public package.json export is coordinator-owned and unchanged. The final import-only change passed the existing two presentation tests (9 assertions) and a three-file Biome check; no broader or connected rerun.
