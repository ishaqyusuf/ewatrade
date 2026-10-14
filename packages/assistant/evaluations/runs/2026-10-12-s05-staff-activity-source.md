# S05 daily staff activity — source packet handoff

12 October 2026. Implementation-agent packet 1 for S05, **ready for coordinator
review**. Not accepted; capability stays `planned`. Overall 13/45 unchanged.

## Before / after

Before: S01 history covered staff lifecycle/Store-access events only. "What did
Amina do today?", "Who changed this price?" and "Stock adjustments by staff this
week" had no tool or canonical read.

After: `listStaffActivityPage` (packages/db) composes eleven actor-attributed
canonical streams into one time-ordered page:

| Stream | Source | Relation | Time | Store |
|---|---|---|---|---|
| ORDER | `CommercialOrder.createdByUserId` | performed | createdAt | order Store |
| PAYMENT | `CommercialOrderPayment.recordedByUserId` | performed | recordedAt | payment Store |
| STOCK_OPERATION | `StockOperation.actorUserId` (receipts, adjustments, corrections, count/closeout finalisation, transfer dispatch/receive/cancel …) | performed | createdAt (backdated `effectiveAt` shown) | operation Store |
| STOCK_COUNT | `StockCount.actorUserId` (started) | performed | createdAt | count Store |
| ORDER_AMENDMENT | `CommercialOrderAmendment.actorUserId` | performed | createdAt | order Store |
| PRODUCT_RETURN | `ProductReturn.actorUserId` | performed | createdAt | return Store |
| SERVICE_FULFILLMENT | `CommercialServiceFulfillment.actorUserId` | performed | performedAt | order Store |
| SERVICE_AUTHORIZATION | `CommercialServiceAuthorization.actorUserId` | **approved** | authorizedAt | order Store |
| SERVICE_WORK | `ServiceWorkEvent.actorUserId` | performed | createdAt | job Store |
| SERVICE_ASSIGNMENT | `ServiceWorkAssignment.assignedUserId` | **assigned** | assignedAt | job Store |
| PRICE_CHANGE | `CatalogPriceChange.changedByUserId` (nullable) | performed | createdAt | none (all Stores) |

Each item links its canonical record (order, payment→order, stock operation, stock
count, service job→order, product/offering), recorded outcome, time, Store and
actor. Rules: never the current assignee; a null historical actor is `unknown` and
never matches a person filter; a user with no membership/profile in the business is
`unavailable`; `total` and `byStream` are full counts for the filters (never the
page); amounts are per record, not totals; Store views exclude tenant-wide price
changes and say so; window ≤ 92 days, end exclusive; cursor bound to Tenant, Store
scope and filters.

Authority: viewer re-read inside the transaction (active OWNER/ADMIN/MANAGER).
`retailOps.staffActivityPage` passes `storeIds: null` only for Owner/Admin; other
roles get `[activeStore]` after `canStaffAccessStore`; scoped staff fail closed at
the existing staff procedure policy (Owner/Admin only for scoped access).

GENERAL: `readStaffActivity` (limit 10) answers with a generic card — up to six
lines like `14:05 · Amina did: Payment recorded · cash · ORD-1042 · Wuse` in the
request's offset, exact total, unknown-actor note. Capability `staff.activity.read`
v1, roles Owner/Admin/Manager, clients dashboard+mobile (no Open target, so the
native card renders it), rollout **planned**.

## Owned paths

- `packages/db/src/queries/staff-activity.ts`, `staff-activity.test.ts` (new)
- `packages/db/src/queries/index.ts` (one export line)
- `apps/api/src/schemas/retail-ops-staff-reads.ts` (one export)
- `apps/api/src/trpc/routers/retail-ops-staff.ts` (`staffActivityPage` + import)
- `apps/api/src/assistant/general-staff-activity.ts`, `.test.ts` (new)
- `apps/api/src/assistant/general-tools.ts` (`readStaffActivity` tool + import)
- `apps/api/src/assistant/general-context.ts` (`staff.activity.read` domain access)
- `packages/assistant/src/capabilities/manifest.ts` (new entry), `COVERAGE.md` (regenerated)
- `packages/assistant/impact/2026-10-12-s05-staff-activity.json`
- Ignored Brain: `.brain/api/endpoints.md`, `.brain/features/assistant-business-operations.md`

No schema, migration or permission-policy change. No database connection.

## Checks actually run (local, uncommitted source)

| Command | Result |
|---|---|
| `bun test packages/db/src/queries/staff-activity.test.ts` | 7 pass, 27 assertions (in-memory transaction fake) |
| `bun test apps/api/src/assistant/general-staff-activity.test.ts` | 3 pass |
| `EWATRADE_DATABASE_URL=<unreachable placeholder> bun --env-file=/dev/null test apps/api/src/assistant/general-tool-schemas.test.ts` | 2 pass, 13 assertions (no connection made) |
| `bunx tsc --noEmit -p packages/db` / `-p apps/api`, filtered to touched files | 0 diagnostics in touched files (30 pre-existing db errors elsewhere) |
| coverage regenerate + `--check`; `bun scripts/assistant-impact.ts` | current; gate passes |

Regression definitions: performed/approved/assigned separation; exact counts across
pages; cursor covers every record once and refuses changed filters; inclusive start
and exclusive end at a +01:00 local day; backdated stock operation counts on its
recorded day; unknown and departed actors; product-scoped price changes and refusal
of a product filter on other streams; Manager Store bound, Store views excluding
price changes, Owner/Admin-only business view; Cashier/no-membership refusal;
foreign subject; >92-day window; relation/stream mismatch; current assignee never
reported. Biome flags `noExplicitAny` only in the test fake, the same pattern as
`staff-history.test.ts`.

## Not done / decisions

- **Finance actions** (journal entries, bills, money movements) are not included:
  they need Book scope and `financeProcedure` entitlement per row. Planned packet 2.
- **Connected evidence**: no isolated-database rollback run; needs the guarded
  Development profile. Comparison of projected events with canonical audit sources
  on real data is open.
- **Performance**: 22 queries per page (find + count per stream) inside one
  RepeatableRead transaction. `StockOperation.createdAt` and payment/order actor
  columns are not all indexed for actor+time; measure on QA before enabling.
- **Write-time attribution gaps**: `CatalogPriceChange.changedByUserId` is nullable
  (legacy rows unknown). No other attribution columns were added.
- Store-access history and lifecycle remain S01's `readStaffHistory`.

## Acceptance steps for the coordinator (after enabling for a QA business)

Web (`/assistant`) and native Ask, Owner then Manager then Cashier:

1. "What did Amina do today?" → model resolves Amina via directory, then reads
   activity for today's local day. Card lists did/approved/was-assigned lines with
   Store and the exact total; ask "show more" → continues with the same cursor.
2. "Who changed the price of Rice 50kg?" → price changes only; a legacy change says
   "Unknown (not recorded)".
3. "Show stock adjustments by staff this week" → STOCK_OPERATION stream; each line
   names its operation type. There is no operation-type filter yet, so the total
   counts all stock operations (gap to decide).
4. Manager: same questions return only the current Store and note price changes
   are left out of a Store view. Switch business/Store mid-chat → refused/re-scoped.
5. Cashier: refused by role.

## Review repairs — [coordinator review](2026-10-12-s05-coordinator-review.md)

1. **Every page record shown.** The answer now renders one whole line per page
   record (up to the tool's 10) and says `N of TOTAL shown; ask to continue for the
   rest`. The probe now reports 10 event lines, `10 of 14 shown` and no missing
   record labels.
2. **Budgeted whole records.** Count, exclusion, unknown-actor and not-included
   notes are reserved first; remaining space is shared per line, shrinking the
   outcome text (then long names/Store) with "…", never dropping a record or a
   note. Long-text probe: 991 characters, count explanation and exclusions kept.
3. **Consistent unknown-actor copy.** Removed "Only actions recorded with a person
   are shown"; now "Older records without a recorded person show as Unknown and are
   not counted for anyone." Probe: unknown shown, contradictory claim gone.
4. **Stock operation type filter.** `stockOperationType` (mirrors Prisma
   `StockOperationType`) filters rows **and** counts; valid only with
   `stream: STOCK_OPERATION`. Tool description tells the model to use it for
   "stock adjustments by staff".

Checks: `bun test packages/db/src/queries/staff-activity.test.ts` 8 pass;
`general-staff-activity.test.ts` 3 pass (placeholder DB URL, no connection);
`bun --env-file=/dev/null artifacts/assistant-operations-parallel/s05-answer-review-probes.ts`
with the placeholder URL prints the repaired results above; scoped types clean.

Still open (S05 packet 2): authorized finance histories with Book scope; an Open
target per event to its canonical record with same-chat return (needs a staff
activity global sheet on dashboard and native routing); connected comparisons,
privacy/deletion, timezone/role journeys and a performance measurement.

## Second review repairs — 12 October 2026

1. **Labels never cut.** Each line keeps time, relation and the full canonical
   record label; only the outcome (then names over 24 / Store over 18 chars)
   shrinks. `staffActivityFitCount` computes how many leading records fit whole
   with the notes. `readFittedStaffActivityPage` (used by `readStaffActivity`)
   reads 10, and if fewer fit, reads again with exactly that limit (up to three
   times), so the returned cursor continues right after the last record shown;
   nothing is skipped. If the card is ever handed more than fits, it shows only
   whole records and says "Some records did not fit this card; ask again with a
   narrower filter." Note for the coordinator fixture: its long-label probe calls
   the card directly with ten oversized rows, so it reports the five unshown
   rows; on the tool path those five are the next page.
2. **Finance disclosed.** The footer lists every `coverage.notIncluded` item:
   "Finance actions, sign-ins, attendance and payroll are not included."

Checks: `general-staff-activity.test.ts` 4 pass (new: 120-character distinct
labels, fit count, direct-card disclosure, fitted re-read limits `[10, fit]` with
cursor after the last shown row); fixture finance probe now `true`; scoped
types clean.

## Packet 2 — authorized finance postings (12 October 2026)

New stream `FINANCE_POSTING` over `FinanceJournalEntry` (actor, Book, optional
Store, `recordedAt`, sequence, reversal link):

- **Authority**: `retailOps.staffActivityPage` passes `financeBookIds` only when
  the canonical `assertFinanceAccess` (Owner/Admin + plan finance feature) passes,
  using that business's Books; otherwise the stream is omitted and the card says
  "Finance actions … are not included." The query also requires
  `book.tenantId` = the viewer's business. The cursor key includes the Books, so
  a page continued after finance access changes is refused.
- **No double counting**: only an allow-list of finance-originated source kinds
  (`financeActivitySourceKinds`: expenses, bill/owner-bill/purchase payments and
  reversals, money movements and reversals, owner contributions/withdrawals,
  cash-count adjustments, customer receipts/credit allocation/release/held-credit
  refund/ledger reversal/openings, purchase bills and recognition, supplier
  advances/allocations/openings/reversals, opening balance, inventory cost
  review). Postings that mirror sales, stock, service or purchase-receipt work
  (cost of goods, order billing/collection, stock moves) stay under those streams.
- **Store views** keep only postings with that Store; business-wide postings are
  left out and disclosed ("Business-wide finance postings have no Store…").
- Each event links `finance_entry` (entry ID + Book) labelled `Journal <sequence>`,
  outcome "<kind> posted", reversal and back-dated effective time shown.

Checks: `staff-activity.test.ts` 10 pass (finance hidden without Books, allow-list
excludes cost-of-goods, foreign Book ignored, reversal outcome, Store view
disclosure, cursor refused after finance access change);
`general-staff-activity.test.ts` 5 pass (finance/Store disclosure copy); scoped
types for db and api clean.

Still open for S05: an Open target from each event to its canonical original
(needs a staff-activity global sheet on the dashboard and native routing —
shared global-sheet paths), connected comparisons against canonical sources,
privacy/deletion and timezone/role journeys, and a performance measurement (now
12 streams).

## Packet 3 — Open from the answer to each shown event (12 October 2026)

Released seams: b40d7f02 (clients/target), 85c41c43 (router procedure and
schema export, applied), f9346f01 (manifest procedures line, applied). Review
35bc8ad8 and b145d4d4 repairs below.

- **Answer target** `staff_activity` (`packages/assistant/src/general/staff-activity-target.ts`):
  exact filters, the page cursor (null = first page), limit, and the shown
  events (stream, event ID, time, summary, record ref). It is a navigation DTO
  only. Streams and stock operation types mirror the db lists, and a test
  asserts the streams are equal.
- **Fresh authority on Open** (review item 1). `readStaffActivityShown`
  (`packages/db/src/queries/staff-activity.ts`) re-reads only the shown
  stream+ID identities. It runs through the page's exact authority path,
  which is now the shared `authorizeActivity`: active viewer role, Store scope
  and existence, subject membership, tenant-wide exclusion, finance Books.
  The answer's filters still apply. It keeps the answer's order, never adds
  records and returns a `withheld` list. Procedure (applied):
  `retailOps.staffActivityShown`, sharing a `staffActivityScope(ctx)`
  preamble with `staffActivityPage`. `staff.activity.read` lists it.
  - Dashboard sheet and mobile screen render nothing from the saved target
    until this read returns. Each shown identity then shows the server row or
    "No longer available to you." (no saved summary or label). Any
    FORBIDDEN/NOT_FOUND refuses the whole view.
- **Store-correct Open** (review item 2). Store originals (order, payment,
  stock operation, stock count, service job) open only when the event's
  canonical Store is the active Store. Otherwise the row shows "Switch to
  <Store> to open". The Store is never switched and no chat or draft state
  changes. Products are business-wide and open from any Store. Dashboard
  Opens also require the registered original (sales, catalog, service intake
  off `/services`), else "Not available with your access". Finance shows
  "Open from Finance". Mobile opens orders/payments (own Store) and Products
  natively; every other kind shows "Open this record on the dashboard."
- **Current re-read** (review item 3) is opt-in and labelled current. Its
  state lives in a body keyed by the target, so it resets on every new target
  and on close.
- **Cache display** (releases 85c41c43, b145d4d4, 1a4eeb23). Both clients
  render only a read completed by the current mount (`freshShownRead`). Each
  mount also owns its reads: `mountOwnedRead` gives the cache entry a
  per-mount id (`nextReadMount`, unique per mount, unlike `useId`). The
  generated tRPC fetch is wrapped so it still receives the SDK's canonical
  key (procedure path and exact input) and the query's cancellation signal;
  the adapter treats any key of length 3 or more as prefixed, so it must
  never see the local key. `trpc.abortOnUnmount` aborts that mount's requests
  on close, so a reopen never joins a request started under earlier access.
  Both use gcTime 0 and refetchOnMount "always"; mounts are keyed by
  user/business/Store (plus role on mobile).
  Controls (dashboard `staff-activity-sheet.test.ts`):
  - Transport: actual `createTRPCOptionsProxy` + `createTRPCClient` with a
    local mock link (no HTTP/server/DB). The mounted read calls exactly
    `retailOps.staffActivityShown` with the original input. Closing while
    pending aborts that call's signal. Reopening after an access change is
    "checking" until its own second call returns, then shows only the changed
    result. A negative run with the earlier key-appending helper fails (no
    call reaches the link), reproducing review 1a4eeb23.
  - Query library: the generic QueryObserver open/close/reopen control is kept
    as additional evidence. With a shared key it fails, reproducing review
    b145d4d4.

Checks (12 Oct 2026, final frozen source, no database connection):
- Tests: db `staff-activity.test.ts` 11 pass. `packages/assistant/src` 227 pass.
  API `general-staff-activity` + `general-tool-schemas` 9 pass (placeholder
  DB URL; the manifest expectation includes staffActivityShown). Mobile
  assistant 16 pass. Dashboard `staff-activity-sheet.test.ts` 4 pass.
- Full `tsc`: dashboard 0 errors, api 0 errors. packages/assistant has 1
  error, in committed, unmodified `contracts.test.ts:264` (not this packet).
  Mobile exits 2 with 85 errors, none in S05 Open hunks. Two are in the shared
  packet file `ask-assistant-live.tsx` (lines 340/371, `ChatPhotoThumb`
  attachmentId string|undefined), outside the S05 hunk and not repaired here.
  No native type-green claim.
- Coverage: `assistant-coverage --check` fails only on the unrelated
  `orders.activity.uploadTarget` and `orders.activity.confirmUpload`. The
  generator exits before writing, so COVERAGE.md is not regenerated (not
  hand-edited). A scratch preview shows `retailOps.staffActivityShown`
  supported by `staff.activity.read`.
- `bun assistant:impact` has one problem: `retailOps.staffActivityShown`
  unknown against the stale COVERAGE.md. It clears once coverage can
  regenerate.

Remaining gaps: no connected or runtime evidence. Missing:
- Screenshots and controls of the fresh read against a real business:
  role/Store/finance/privacy change while a target is open, withheld rows,
  pending close/reopen on device and in a browser.
- Cross-Store original navigation (disclosed partial only).
- Native originals for stock, service and finance.
- A journal-entry original on the dashboard.
- Performance of the exact-ID read.
