# Phase 8 source acceptance inventory — G01 / G02

15 October 2026. Report-only inspection of current source and existing evidence.
**G01 connected QA remains explicitly human-paused.** No test suite, database,
network, provider, browser, runtime or activation command was run for this report.
Only this new report was written. Parent owns Brain, shared status and checklist
reconciliation. Phase 8 stays **0/2 accepted**; assistant **13/45 (28.9%)**.

## Requirement and current implementation map

| Ticket requirement | Current source | What is still unproven or unavailable |
| --- | --- | --- |
| G01 complete item sales and payment collections | `packages/db/src/queries/business-reporting/item-sales.ts`, `payments.ts`; protected `apps/api/src/trpc/routers/business-reporting.ts` | SQL comparisons against nonempty canonical sources, >10 original item groups, real allocation/refund/date boundaries, current protected transport and saved pagination/original journeys. |
| G01 complete posted customer debt | `business-reporting/customer-debt.ts`, shared `customer-ledger/totals-projection.ts` and canonical allocation/release arithmetic | Nonempty >10 account database proof and real foreign Tenant/currency/live role/plan refusals. Full aggregate is independent of the ten detail rows; live pages must never be added into a total. |
| G01 stock, supplier aging and scoped posted profit/cost coverage | `business-reporting/stock.ts`, `finance.ts`, canonical inventory/supplier/report readers | Stock refuses >200 source rows; supplier aging retains its canonical 1000-source bound; posted profit preflights <=200 Book accounts. Staged larger-scope reports are not implemented here. Posted-entry completeness is separate from unknown actual business cost/profit coverage. |
| G01 date/Store/role/currency and origin | Strict `packages/assistant/src/general/business-report-target.ts`; `business-report-origin.ts`; full protected internal caller paths | Existing source guards are present. Current runtime authority, populated database comparisons, cursor continuity after scope changes and full saved-chat/native-object navigation remain acceptance work. |
| G02 physical cash count and variance | `packages/assistant/src/general/cash-count.ts`; API `general-cash-count.ts`; canonical `finance/cash-counts.ts` | Strict physical acknowledgement, exact nonnegative amount including zero, Book/account/time/reference and original expected/observed/difference exist. Persisted independently retried/concurrent HTTP and real saved count/receipt journeys remain open. |
| G02 reconciliation/day summary | API `general-day-close.ts`; canonical `finance/period-close-checklist.ts` / `reports.ts`; dashboard day review | Read-only advisory checklist and posted day summary exist. Financial source completeness/reconciliation is unresolved. This is not an operationally reconciled financial close. |
| Privileged period/fiscal close and reopen | No assistant close/reopen write is exposed by this batch | This is an intentional preserved gate, not missing permission to silently add a write. Stock closeout C05 is a separate record and cannot satisfy this requirement. |

Current manifest rows for six G01 reports and five G02 count/day capabilities
remain planned and dashboard-only (`manifest.ts:170–209,217–299`). Current native
assistant registry has no cash_count_record editor or finance_cash_count receipt
kind, and no report/day original target route. Native parity remains source work
separate from accepted dashboard support; changing a client list alone cannot fill
it. No rollout/client policy was changed in this inspection.

## Reusable evidence, with its original limits

Do not add these overlapping source totals together or relabel historical runs as
fresh current-checkout passes. Reports are the evidence source; no suite was rerun.

| Existing report | Evidence that can be retained | Limit |
| --- | --- | --- |
| `2026-10-12-g01-business-reporting-source.v1.md` | 23 provider-free tests /128 assertions; source compilation and owned lint at its checkpoint; complete aggregate vs ten-row details using 147-group/account fixtures; current-format synthetic browser captures | One directly approved connected QA read was terminal exit1 because its scope was empty: zero ledger accounts/item groups/payment rows. SQL execution and rollback/unchanged facts are real; nonempty numeric and positive pagination acceptance is absent. A true empty-page equality flag was vacuous. No second connected read was made. |
| `2026-10-12-g01-transaction-seams-source.v1.md` | 41 source tests /230 assertions; five caller-owned canonical seams plus two finance report adapters; guarded nonempty rollback cases authored/reviewed | Connected QA explicitly paused. Prepared 13-account/item/supplier comparisons and genuine valuation/profit scenarios are unexecuted plans, not accepted SQL/timing/rollback proof. Old integration patch is historical and must not be reapplied. |
| `2026-10-12-g02-cash-count-day-close-v1.md` | 27 source tests /176 assertions; canonical zero-count/review/replay/conflict/no-journal rollback pass; synthetic physical count/day/close guidance and object close-state evidence | Initial canonical suite did not fingerprint every prior row. Source workshop/screenshots do not establish saved finance or actual signed client behavior. No financial close performed. |
| `2026-10-12-g02-signed-rollback-diagnostic-v2.md` | Three real signed source rollback cases: completion/replay18.290s, changed token7.339s, stale posted basis14.421s. Full72 covered fingerprints equal, no provider/persistent availability change | Same caller-owned transaction; not persisted pending recovery, independent HTTP concurrency or saved-browser proof. First signed run's budget mismatch remains unexplained; later pass does not erase it. |
| `2026-10-12-g02-recovery-rollback-v1.md` | Five real source rollback cases: receipt fault13.646s, same-key recovery18.202s, expired session4.354s, suspended membership5.932s, foreign marker6.395s;72 fingerprints equal | Retry PENDING baseline recreated inside rollback transaction. Nonowning marker is not an actual foreign Tenant's Book/Store. No durable retry or independent HTTP proof. |
| `2026-10-12-g02-native-read-rollback-v1.md` | Four protected native source read cases: history2.566s, bad cursor2.447s, missing Book2.246s, checklist/day7.111s;72 fingerprints equal, forced rollback | Last observed saved count history was empty. Positive paging and original saved count detail did not execute. Actual registered middleware/saved browser differs from direct canonical/native composition. No new availability read was performed now. |
| `2026-10-12-g02-paused-cache-source-v1.md` | Three isolated cases /33 assertions: real QueryObserver cached success while paused, actual wrappers hide stale payload/control branches | Primitive/query/frame mocks and static rendering are explicit; no browser screenshot was captured, no alternate file-URL workaround occurred. Does not prove actual session switching. |
| `2026-10-12-g02-cash-history-backward-source-v1.md` | One actual-reader in-memory query regression /23 assertions for newer-tuple backward paging, ties, limits, forward behavior and foreign cursor refusal | Source/query proof only; no connected positive page. Existing forward UI/assistant evidence was not rerun. |

G02 has additional later registered-transport/browser evidence in
`.brain/plans/2026-10-12-g02-signed-proposal-acceptance.md:269–348`:

- One conversation-only HTTP attempt returned the exact saved GENERAL chat with
  unchanged72 covered facts. It did not request Finance originals/day data.
- A later authenticated real browser showed the exact day target, snapshot16,
  seven unresolved reviews, unavailable close/reopen, preserved selected chat and
  preserved/restored unsent composer across history opening and Close.
- That browser preservation check **failed** on QaClientAuthorization: one of134
  covered aggregate entries changed while133 matched. No mismatch was excluded,
  attributed or retried. Candidate lastValidatedAt refresh writers are an offline
  hypothesis only. This is not a clean preservation acceptance or proof of D04's
  cause. The separate first signed budget mismatch also remains unexplained.
- Saved count detail and positive paging still lack qualifying original records.
  The later preparation does not establish today's runtime history contents.
  Native limit1 positive paging requires >=2 genuine saved originals under the
  same Book/account; assistant page10 requires >=11; real Book-wide native UI
  page20 requires >=21. An actual saved owning assistant receipt is independently
  required for answer/receipt Open. A rolled-back ID cannot satisfy any saved gate.

## Current-source observations and finite gaps

1. **No new arithmetic/authority defect was confirmed by source reading alone.**
   Current cash-count review holds the canonical Book lock through confirmation
   (`cash-counts.ts:101–130`); command reuse locks/replays through the canonical
   finance command (`:133–163`); original detail retains original basis/difference
   separately from later history/adjustment status (`:176–258`). The read-only day
   helper uses checklist/report within one RepeatableRead transaction and same
   snapshot (`general-day-close.ts:79–108`). These are structural observations,
   not current connected correctness proof.
2. **A small defensive composition gap is visible.** Dashboard
   `assistant-day-close-view.tsx:12–16` compares Book, snapshot and cutoff before
   showing a day summary, but omits currency equality. API
   `general-day-close.ts:121–128` checks all four, including currency. The protected
   same-Book canonical readers normally constrain currency, so this review does
   not claim a reachable ordinary-data corruption or proven runtime defect. A
   source-owner can independently add a mismatched-currency component regression
   and align the guard without lifting G01's connected-QA pause. No repair or test
   was executed in this report-only scope.
3. **Freshness proof should match reopening scope.** Current report/count/day
   dashboard wrappers suppress fetching/paused/error data. Their source predates
   the later mount-owned fresh-read helper used by newer native editors. Existing
   tests cover cached refetch, denied and paused reads, not every same-key reopen
   joining an earlier in-flight request. This is a finite source-only regression
   opportunity; absence of a generation helper alone is not proof of leakage.
   Keep existing query-client clears and current-authority behavior while proving
   the exact reopened-case before deciding a repair is needed.
4. **Larger report scope is deliberately unsupported today.** Source stock
   `stock.ts:5,22–34` returns unavailable above200 rows rather than a partial total;
   posted finance `finance.ts` rejects >200 Book accounts; supplier aging inherits
   its1000-source canonical bound. A documented staged report design/controlled
   exclusion can continue offline. Do not weaken limits, sum pages, invent complete
   actual profit, or treat this inventory as authorization to expand scope.
5. **Full mobile support remains a concrete source gap.** A bounded future packet
   can reuse exact shared count values/acknowledgement, current fresh Book/account
   reads and exact original Book/count/day/report identities in native controls.
   Finance UI changes must follow the standing three-direction Workshop rule and
   preserve accepted surrounding components. Mobile native source and device
   acceptance cannot be inferred from dashboard/native API naming.

## Dependency freshness, not a new freeze

Read-only SHA256 comparison against
`artifacts/assistant-operations-parallel/G01/seam-source-hashes.json` found **all six
listed TypeScript source/test files match**: customer-ledger accounts/opening,
finance accounts/supplier-aging, business-reporting finance and transaction-seams
test. Reuse their existing bounded source evidence; no reason to rerun just to
produce fresh numbers.

Comparison against older G01 `owned-source-hashes.json` found **26/29** source files
matching. Three current files differ: business-report-content.tsx,
business-report-sheet.tsx and business-reporting/finance.ts. Later reports explain
presentation, paused-cache and transaction-seam follow-ups; drift is not by itself
a new regression. The later seam snapshot matches current finance.ts. Neither old
snapshot certifies all current shared dependencies.

G02 `signed-proposal-owned-paths-v4.json` records its historical sourceFrozen flag,
terminal results and released slot; it is a path/state record, not a current
cryptographic closure or proof a process is live. Current paths include subsequent
paging/cache and shared proposal-authority changes. Do not inherit its flags as a
new execution reservation.

Before any later proposed acceptance run, obtain a current owner's bounded source
packet and refreeze these actual dependencies:

- G01 reporting queries/cursor/presentation/types; canonical ledger allocation and
  release projection; stock reporting/conversion; supplier aging; Finance reports,
  access/source-coverage and caller-owned seams; strict inputs/target/origin; full
  protected router/staff-policy/caller; tools/answer/navigation/global sheets.
- G02 strict count/read/target schemas; canonical cash counts/commands/Book lock/
  access/posted basis and checklist/reports; adapter/day helper; proposal scope,
  linked session and fresh decision/recovery/receipt paths; Finance protected
  middleware/router; count editor/views/read-state/global sheets/navigation.
- Each exact verifier/runner/profile/production-exclusion guard; selected target
  identity; saved-facts inventory and budgets; D04-owned authorization diagnostic;
  relevant generated-client/schema identity and test evidence dependencies.

No legacy integration patch, persistent availability flag, different database URL,
longer transaction limit or substitute runner is an acceptable refreeze shortcut.

## What can continue while preserving the pause

1. Review/freeze the already authored G01 nonempty caller-owned rollback packet
   without executing it; record stale dependencies and unavailable fixture cases.
2. Author meaningful provider-free regressions for the defensive day currency
   composition and exact reopened-read freshness case under explicit file
   ownership. Run only affected checks after an actual change/finding.
3. Prepare a finite saved-count acceptance proposal using the existing threshold
   and exact original-identity contract. Do not build unused runners or create
   persistent records to satisfy an empty scope. Current qualifying data, target
   authority and a bounded reviewed reservation must exist before execution.
4. Reconcile the G02/D04 authorization diagnostic requirements and source packet
   offline. Preserve full covered hashes/stop conditions; never exclude the changed
   authorization row, invent attribution, repair grants or rerun to obtain green.
5. Continue separately owned native parity or larger-report design/source packets
   with their required UI/design reviews and planned rollout preserved.

None of these steps lifts G01's explicit human QA pause. Actual G01 resumption
requires the owner's instruction. G02 connected/HTTP/browser retries are not
scheduled by this report. Financial close/reopen remains privileged and unavailable
while source completeness is unresolved. Paystack, D04, E05, G04 and S05 boundaries
also remain unchanged.

## Current reviewed-byte observations

These are reviewer hashes, not source-owner release or acceptance:

| Path | SHA256 |
| --- | --- |
| apps/api/src/assistant/general-day-close.ts | 90f19b9a5844131f7378e83b3cace9ca6ef39806f44d67c8cca378c01a0b7540 |
| apps/api/src/assistant/general-cash-count.ts | caddbc9539074094084a63c1f630d28e173c84cf6485cf3746deda8a84502526 |
| packages/db/src/queries/finance/cash-counts.ts | 272b9d4a86b380b04a766d6768369315aa937d5cd44a8eed300f3b15f341ace0 |
| packages/db/src/queries/finance/period-close-checklist.ts | 45ae8a7f30738b29e93b119a7132f11591498a5ce696ba3f8247cebbb959cb33 |
| apps/dashboard/src/components/finance/assistant-day-close-view.tsx | 5c77bcb57774534ee806b819aaee7f11bdb885ecf9566285c900ed9f3715355a |
| apps/dashboard/src/components/sheets/business-report-sheet.tsx | 46683ce94473a4055bee0ab6068e92901ca685ff675ef8240adfdad41f26a7c2 |
| apps/dashboard/src/components/sheets/assistant-cash-count-sheet.tsx | 3b92a6cf7fcced0d08a61b8c24bd5e8d62889b5bf20280d5016620aca2af0e40 |
| apps/dashboard/src/components/sheets/assistant-day-close-sheet.tsx | 1b42abd6d24a0edfc54dbc817fa41c0669e747df36bf8bebde1592b00c3e6048 |

Checklist: requirement/source/evidence map **complete**; dependency comparison and
unblocked next packets **complete**; G01 nonempty connected acceptance **paused**;
G02 persisted/concurrent/qualifying saved originals and clean preservation
acceptance **open**. No acceptance box checked. No Brain files edited by this
report-only child; parent owns consolidation into the canonical checklist.
