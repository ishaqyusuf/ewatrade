# QA login refresh ownership —30 October 2026

Local DP-204/408, polling-audit T03/A3 implementation. Parent `d5918e050`.
[Full27-ticket/59-route program](../plans/2026-10-29-dashboard-performance-program.md)
remains **4/27 accepted (14.8%)**. No deployment, service restart, provider change,
business fixtures or business submissions. This is bounded read activity evidence,
not a page-load improvement or full General-family/DP-204 acceptance.

## Cause and implementation

The raw60s QA access timer fetched while the document was hidden or the browser
offline. Mount, focus, interval and manual-refresh triggers could overlap; generation
checks rejected old responses but did not stop duplicate network work.

The existing component now owns one abortable GET. Refresh starts only while visible,
online and no explicit authorize/select operation or other GET is pending. Focus,
visibility return and reconnect share this owner. Hide/offline/unmount abort the
obsolete browser fetch and release its slot. Aborted/obsolete/inactive deliveries
cannot update profiles/errors; an old finally block cannot clear a newer request.
The60s timer remains, with guarded callbacks. No freshness cache or debounce window
is added. Browser abort does not prove cancellation of already admitted server work.

Explicit authorize/select cancel only their superseded background GET and continue
through the exact existing POST payloads, current server checks, error and redirect
paths. While those operations are pending, automatic GETs remain suppressed.
The access-expiry effect is byte-identical and still clears access/selection while
hidden. The entire rendered body is byte-identical; explicit operation bodies are
identical after excluding the single cancellation call added to each. Signed QA
grant/reference/Session, eligibility, profile/Store scope and token expiry authority
are untouched. No API/mobile/schema/protocol change or QA permission expansion.

Midday reference: `tracker-timer.tsx` owns a conditional60s query and fresh focus
recovery; `inbox-sheet-details.tsx` ties optional reading to its owner activation.
EwaTrade retains the existing same-origin QA cookie/GET/POST boundary and state,
adding local cancellation/single-flight ownership instead of a second query cache
or a copied freshness window.

## Focused evidence

- Actual QaLoginEntry with installed React/DOM reproduces **six failures** before
  the fix: overlapping reads, hidden/offline mount reads, hidden interval work,
  missing hide and unmount cancellation. Existing expiry/refusal recovery cases
  pass in that red run (2pass/6fail,48 assertions).
- A strengthened explicit-selection case then reproduces the obsolete GET not
  being cancelled (8pass/1fail). Final **nine cases/77 assertions pass**, including
  current visibility/reconnect recovery, deduplication, late old delivery while a
  new read remains pending, unmount cleanup, hidden expiry, refused selection
  clearing and later recovery. The isolated wrapper passes.
- LoginForm/profile picker/presentation are inert ports. Fetch is fully replaced
  by an allowlisted same-origin synthetic GET port and one inert refused select
  response; no network, grant, sign-in, redirect or account write occurs there.
  This tests actual parent state/request ownership, not real picker interaction,
  browser visibility throttling, server authority or provider acceptance.
- Full Dashboard and explicit fixture/entry TypeScript graphs pass. A fixture-only
  Bun getter-spy type mismatch was corrected with a restored property descriptor;
  focused fixture/types/Biome pass afterward. Owned three-path quick plan/check
  passes237 tests/1533 assertions plus QA tooling types; zero unknown mappings.
  Foreign Agent Chat/staged explainers excluded. H01 unchanged valid evidence is
  reused; H02 passes with zero capability/procedure row changes.
- Canonical existing-data local web smoke passes **12:21:58.534Z–12:22:21.201Z**
  with all three owned source hashes and lock frozen and verified unchanged.
  Actual QA authorize/profile selection/login, populated Catalog, existing sale
  draft total/cancel and navigation/sheet cancellation pass; no business submission.
  This is the relevant current development UI journey. Hidden/offline/expiry
  transitions are established by the inert owner fixture, not a browser matrix.
  `runtimeVerified:false`; no release qualification or optimized timing claim.

Private evidence `/tmp/ewatrade-dashboard-program-20261029/qa-refresh-*` stores
red/final/wrapper/type/quick/H02 logs, source/lock hashes, parity checks and copied
canonical receipt. Tracked evidence contains no cookies, credentials, actor/Store
IDs, private profile payloads or request bodies. Development stays running; no
Dashboard/API/Storefront/Marketing restart. Root optimized `zMN4q6wxzuTfj0KPK4a8Y`
excludes this and the preceding Service/connection source slices.

The pinned39-site [polling audit](../plans/2026-10-30-dashboard-polling-audit.md)
records T03/A3 as implemented. P28 attachment error/completion budget and aggregate
per-family background/focus/reconnect budgets remain open. No ticket is newly
accepted. Brain BRAIN/task/QA/navigation, QA selector and QA accelerator pointers
updated locally. No API/schema/durable architecture contract change; API docs,
migration and new ADR are not required. Other23 tickets remain open.
