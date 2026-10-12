# S01 — recorded staff lifecycle and access history

12 October 2026. Source milestone; S01 remains partial and unbookmarked.
Full roadmap: 13/45 accepted (28.9%); 32 awaiting acceptance (71.1%):
12 partial, 19 pending and one deferred mobile ticket A04.
Evidence kinds: deterministic-integration and manual-web. Provider/model:
not-applicable. No model calls, mobile work, messages, schema changes, persistent
capability activation, API restart or deployment.

## Implementation

Canonical `listStaffHistoryPage` and caller-owned
`listStaffHistoryPageInTransaction` read recorded lifecycle/access events under a
fresh ACTIVE Owner/Admin membership in an active Tenant. Directory legacy Manager
permission does not grant history access. Protected `retailOps.staffHistoryPage`
derives Tenant/actor; GENERAL `readStaffHistory` invokes that same procedure with
at most ten events. `staff.history.read` v1 remains planned and dashboard-only.

Strict inputs support subject/actor membership, Store, stream, event type,
inclusive-start/exclusive-end timestamps and a Tenant/filter-bound cursor.
Store filtering uses original before/after Store snapshots, including removed
assignments and archived same-Tenant Stores, and excludes business lifecycle
events. Page/count share one RepeatableRead request snapshot; later pages are
live requests. Ordering is timestamp, stream and each stream's SQL ID order.
Before/after values, source, actor, subject and timestamp remain separate facts.

Only allowlisted access fields are projected. Missing fields stay null; no
invented ACTIVE status. Foreign identities/Store references and private JSON are
redacted. Same-Tenant historical profiles may establish a historical identity.
Catalog probes avoid querying absent event/profile tables. A missing requested
stream yields unknown full total plus known matching count. History coverage is
always partial because legacy writes can lack durable events. Zero recorded events
never establishes an absence of past employment/access changes.

## Verification

Ownership review caught an automatic-semicolon-insertion error in the helper: a
standalone return made its saved-facts comparisons compare undefined values. The
initial 12.766s/9.800s runs do not establish unchanged facts. The return expression
was repaired; both focused checks were rerun sequentially with real SQL snapshots.
Corrected results below supersede those initial saved-facts claims.

- Nine focused DB/API tests, 78 assertions, pass. These cover tied cross-stream
  pagination, exact totals, strict/date/event filters, Store snapshots, foreign
  redaction, fresh Owner/Admin/revocation, malformed/missing snapshot facts and
  missing-stream unknown totals. Missing-table coverage is a mock check; no actual
  tables were dropped. Scoped owned query/router/formatter/helper types pass.
- Exact guarded `ewatrade_qa_v1` rollback run exited 0 in 13.750s. Five synthetic
  audit rows (three lifecycle, two access) at tied timestamps paginate across
  three pages; Store filter counts two and actor filter four. Foreign identity,
  Store and private sentinel are hidden. The outer transaction deliberately
  rolls back; full saved staff facts are unchanged. No membership status, access
  grant, invitation or user was changed. This is projection evidence, not native
  staff-action execution or saved lifecycle evidence.
- Actual fresh GENERAL/protected router reads exited 0 in 9.485s: current saved
  history has zero recorded events and explicit partial coverage. Foreign actor
  membership and Store filters produce unavailable answers. Three actual answers;
  all saved staff facts unchanged. Source visibility was temporarily changed only
  inside the test process and restored in finally; persistent manifest/runtime
  were unchanged.
- Actual dashboard answer component renders these real protected-tool results in
  a guarded temporary QA route. Browser caught a server UTC/browser local-time
  hydration mismatch. Extracted reusable `GeneralAnswerCard` now renders an ISO
  timestamp for the server/first client render, then browser-local time after
  hydration. Reload has no new warning/error logs and no issue badge. Screenshot
  saved; owned browser tabs and temporary route removed. Existing chat uses the
  same component. Closest Midday analogue: stateless chat message presentation.
  This is answer rendering evidence, not saved chat or a native history overlay.

Local detailed evidence: `artifacts/assistant-operations-web/s01-history-rollback.json`,
`s01-history-real-reads.json`, `s01-staff-history-answer-web.jpg`, and retained
`s01-history-answer-preview.tsx` (not a shipping route).

## Remaining acceptance

Actual saved dashboard chat/history object Open/Close, a global staff history
sheet, real directory same-name/multi-page fixtures and suitable durable history
fixtures remain open. All three S01 read capabilities remain planned. No S01
acceptance bookmark. E05's three remaining procedures still await local activation/
owned QA API restart approval; no rejected step was retried. Full goal remains active.
