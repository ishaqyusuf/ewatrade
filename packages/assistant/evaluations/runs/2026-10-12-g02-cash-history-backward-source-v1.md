# G02 cash-history backward paging — source correction, 12 October 2026

Coordinator assigned this bounded fix after G02's missing saved-count preparation
found that protected finance.cashCounts accepts direction backward but its native
reader ignored direction. No connected QA slot was used: D04 owns attribution.

Before, a backward request from count c returned older b/a. Native
listFinanceCashCounts now seeks newer asOf/id tuples in ascending order, takes
limit+1, then reverses the bounded page for the existing descending presentation.
The backward continuation cursor is the newest returned identity if more newer
records exist. Without a backward cursor, paging starts at the oldest end.
Default/explicit forward behavior stays older tuple/descending/oldest cursor.
Existing authenticated Book, account/CASH cursor lookup, stale-cursor CONFLICT,
limit1–50 and RepeatableRead maxWait10000/timeout30000 remain intact.

Owned source: packages/db/src/queries/finance/cash-counts.ts and
cash-count-pagination.test.ts. API schema already accepts direction; no schema,
permission, shared registry, UI, persistent fixture or runtime configuration edit.

One meaningful new regression calls the actual native reader through an in-memory
read-only Prisma predicate adapter (no global mocks/client connection). It first
failed with expected e/d versus actual b/a. After the fix: **1 test / 23 assertions
pass**, covering nearest newer pages, timestamp ties, continuation through terminal
page, no cursor, default forward and rejection of foreign Book/account/non-CASH
cursors before page loading. Scoped two-file TypeScript EXIT0 (terminal89745);
two-file Biome clean. Existing passing suites/types/browser checks were not rerun.
This validates source queries; it is not SQL/registered HTTP/saved-web acceptance.

Finite missing acceptance packet is ignored G02
saved-count-acceptance-preparation-v1.md. No runner infrastructure was added while
actual history is empty. Native limit1 positive pagination needs >=2 genuine saved
originals in the same Book/account filter; assistant limit10 needs >=11; real native
UI limit20 is Book-wide and needs >=21. Original detail compares immutable facts,
command and ledger basis; saved assistant receipt/answer Open needs an actual owning
saved receipt. No rolled-back identity may satisfy a saved gate.

QaClientAuthorization browser/D04 failures and initial signed budget failure remain
unresolved. Reuse coordinator/D04's full134 aggregate plus row/stable-field hashes
for authorized attribution; no exclusion/fixture/auth repair/tab closure/retry here.
G02 partial/planned/unaccepted; accepted13/45 unchanged. No mobile/provider/model/
send/Confirm/API restart, persistent key/grant/visibility, staging/commit/push.
