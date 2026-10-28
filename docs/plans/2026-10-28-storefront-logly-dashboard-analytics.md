# Storefront analytics in the business dashboard

28 October 2026 · Proposed implementation plan · Planning complete **3/3**;
implementation **0/7**. EwaTrade audit baseline: `4f88d0091` plus inspected source.
Logly findings refer to the sibling checkout, not verified hosted behavior.

## Outcome and current state

Each authorized business manager can open **Dashboard → Reports → Storefront**
to see that business's public storefront traffic and customer actions, using
Logly's API without a separate Logly login. Add a link from Storefront Studio to
the same report. Preserve the existing operational reports.

The foundation exists, but this report does not:

| Existing capability | Source inspected | Remaining work |
| --- | --- | --- |
| Dedicated `ewatrade-storefront` collection, fixed events and server-derived business attribution | `packages/events/src/storefront-server.ts`, `storefront-client.tsx`; `apps/storefront/src/components/storefront/storefront-analytics.tsx` | Reuse; source presence does not establish live collection. The 23 October Brain record explicitly leaves provisioning/activation unperformed. |
| Reports at `/analytics` | `apps/dashboard/src/app/(shell)/analytics/page.tsx`, `components/dashboard/operations-reports.tsx`, `hooks/use-operations-report-params.ts` | Current queries read orders, inventory and service reports, not Logly. |
| Generic groups and typed event metadata | Local Brain `plans/2026-10-01-logly-generic-analytics-contract.md` | That plan explicitly leaves merchant-authorized analytics UI/API as future work. |
| Logly project read credentials and filtered summaries | Sibling `logly/packages/collector/src/index.ts`, `packages/db/src/queries/index.ts` | Reuse authentication/query foundations; add the bounded aggregate contract below. |

This task prepares a plan only. Product implementation, Logly changes, credential
issuance, collection activation and deployment are future work. No new Workshop
was started. Brain documents remain local-only under repository policy; this
tracked plan is the durable handoff.

## First release

Show 7-day and 30-day presets, a bounded custom range up to 90 days, and an
equal-duration previous-period comparison. Use an explicit `Africa/Lagos`
reporting timezone initially; display it beside the dates. Keep the timezone
explicit so future business timezone support does not silently reinterpret data.

| Metric or chart | Definition and limit |
| --- | --- |
| Visitors | Distinct non-null stored visitor keys across eligible public events in the entire period. Browser identifiers, not unique people. Do not sum daily distinct counts. |
| Recorded visits | Count of `site_visit` events under the current adapter semantics. Do not describe this as a session count. |
| Page views | Count of `page_view` events, including the adapter's existing refresh observations; not guaranteed distinct navigations. |
| Item views | Count of `storefront_item_viewed`; current capture deduplicates each item per mounted public route. Product/Service category breakdown only. |
| WhatsApp clicks | Count of `storefront_whatsapp_clicked`; intent, not a sent message or sale. |
| Request starts / observed submissions | Counts of `storefront_request_started` / `storefront_request_submitted`. Submission means the browser observed success, not durable delivery, fulfillment or revenue. |
| Shares / EwaTrade attribution clicks | Counts of `storefront_link_shared` / `storefront_backlink_clicked`; shares may break down by existing `shared`/`copied` status. |
| Traffic over time / popular public pages | Daily visitors and page views; `/`, `/about`, `/service-request` page-view counts under the same scope and range. |

Never label a ratio of unrelated event counts as a conversion funnel. Verified
orders, payments and revenue remain in canonical commerce reporting. Defer
per-product leaderboards, referrer/campaign attribution, branch/site/domain
breakdowns, exports, raw event inspection and visitor-level drill-down. Existing
collection intentionally strips item IDs, referrers and campaign values.

Existing `groups.business` uses the Tenant, not Store/Site/Host. Therefore v1
reports **all storefront activity attributed to this business**, regardless of
the Dashboard's selected Store. Label that scope visibly. Do not pretend the
active Store filters historic events. Per-Store analytics requires a separate
versioned capture design and cannot be backfilled from current payloads.

## Read architecture and isolation

Flow: authenticated Dashboard → protected EwaTrade tRPC query → reusable
server-only Logly reporting adapter → Logly aggregate API → safe report DTO.
Routes remain thin. Reuse the existing reporting components, date controls,
URL-state conventions and error boundaries rather than a second analytics app.

### EwaTrade authority

- Propose `storefrontAnalytics.summary` with strict input `{ from, before }`;
  both are ISO instants. Server resolves timezone and fixed project. Reject
  unknown fields and invalid, reversed or greater-than-90-day ranges.
- Permit current active business OWNER/ADMIN only in v1, using fresh existing
  tenant/membership authority. Regular or scoped staff remain denied until a
  separately reviewed permission grants business-wide traffic visibility.
- Resolve Tenant from the authenticated server context. Never accept a caller's
  Tenant, project, business/group key, host, endpoint, arbitrary events or filters
  as authority. Validate membership before cache lookup and return.
- Resolve current storefront reporting availability from existing Site/plan/QA
  policy. QA must not query production analytics. A missing current published
  storefront yields an explicit `no_storefront` state in v1; historical reporting
  after unpublication is deferred. Reporting cannot initialize or publish a Site.
- Fix upstream project to `ewatrade-storefront`; use a distinct server-only
  project **read** credential, provisionally `LOGLY_STOREFRONT_READ_KEY`.
  Do not reuse the ingest key or global Logly operator key. Reuse the configured,
  server-controlled collector base URL; never take an upstream URL from input.
- Keep credentials, pseudonymous group keys, visitor references and upstream raw
  responses out of browser payloads, logs, errors and model inputs.

### Logly API work needed before UI wiring

The existing `GET /v1/dashboard/event-summary` applies `groupType`/`groupKey`
through shared SQL conditions. However, `/overview` does not apply those context
filters, and `/funnel` also lacks group scope. Do not use either as a fallback
for this business report. A project read key authorizes the project; it does not
independently enforce an EwaTrade membership or business boundary.

There are two distinct identity transformations:

1. Storefront produces `grp_` + HMAC-SHA256 using `LOGLY_IDENTITY_SECRET` over
   `JSON.stringify(["ewatrade-storefront", tenantId, "business", tenantId])`.
2. Logly ingestion hashes that incoming key again with its own secret over
   `JSON.stringify(["group", internalProjectId, "business", incomingGroupKey])`.

Existing filters match the **stored** key. Sending the EwaTrade `grp_…` directly
as `groupKey` cannot reliably select those rows. Do not scan `/groups`, match
business display names, share Logly's hashing secret or add a dedicated business
database column to work around this.

Propose a generic aggregate endpoint, provisionally
`POST /v1/dashboard/group-summary`, authenticated by a project read credential.
This is a non-mutating read using a JSON body so group references stay out of URLs:

- Required: fixed authorized project, `groupType`, `groupInputKey`, `start`,
  `before`, `timezone`. EwaTrade constructs all scope fields server-side.
  `groupInputKey` means the original incoming group reference; never overload
  existing stored-key semantics. Redact it from request/body logs and return
  no group or visitor identity. EwaTrade's browser sends only its date range.
- Logly resolves the authorized internal project and performs its own group
  hashing with the same implementation as ingestion. A missing/invalid group
  refuses the request; zero matching rows returns a scoped empty aggregate.
  Never omit the group condition or return demo data on missing database/config.
- Bound the dates, timezone allowlist, event names and response cardinality.
  Apply the same project/group/time/event scope to **every** count, trend,
  category/route breakdown and previous-period query at the database boundary.
- Return aggregate event counts, whole-window distinct visitor count, daily
  buckets, permitted breakdowns and equivalent previous-period aggregates.
  Calculate timezone buckets in SQL; UTC daily totals cannot be shifted later
  into correct Lagos calendar-day totals. No arbitrary SQL or raw event pages.
- Use half-open `[start, before)` intervals for current and previous periods.
  Existing event queries use inclusive `end`; do not silently reuse that
  behavior for adjacent comparison windows.
- Include source mode and capture/ingestion freshness fields only where actually
  supported. Explicitly distinguish unavailable metadata from a genuine null
  last-event timestamp. No event exists does not prove collection is healthy.
- Check query plans for group predicates and period aggregates using existing
  indexes first. Add a migration only if measured query evidence requires one;
  no EwaTrade analytics mirror/outbox or new scheduler is needed for v1.

These are proposed additions, not claims about currently available API fields.
Recheck the target Logly version and contract at implementation time. Extract
EwaTrade's existing group-reference derivation into a shared server-only helper
with compatibility fixtures so ingest and read cannot drift. Preserve the exact
existing digest; do not use the Dashboard project's attribution helper instead.
Identity-secret rotation changes group history: preserve the existing secret
for v1, or design a bounded version-aware union with correct deduplication before
rotation. Never respond to a mismatch by broadening the query scope.

## Dashboard behavior and reliability

- Add a Storefront report section/tab at `/analytics` while retaining existing
  URLs and reports. Load its data only for an eligible manager who opens it.
  Changing business cancels old requests, clears prior results and shows the new
  business's loading state. Old responses must never populate the new context.
- Keep server cache entries scoped to project, Tenant/group identity version,
  timezone and exact range, with a proposed 60-second TTL. Browser query keys
  include authenticated business/context lifetime and range. Recheck authority
  even on a cache hit; clear data on logout, business switch or lost membership.
- Use no interval polling. Query on opening/range change and explicit Refresh,
  with request deduplication, bounded upstream timeout and no unbounded retry.
  Avoid duplicating the collector's previous-period work in the browser.
- Return a discriminated DTO: `available`, `empty`, `not_configured`,
  `collection_disabled`, `no_storefront`, `unavailable`. Authentication and
  permission failures remain ordinary protected-query errors, never zero data.
  Non-available states have no fabricated numeric totals. Label timestamps as
  report fetched time versus latest observed event; neither proves ingest health.
- Upstream timeout/429/5xx or invalid JSON gives an isolated retryable report
  state; operational reports and storefront browsing continue working. Do not
  serve another business's cache or convert failure to a successful zero.
- Explain that DNT/GPC, blocked storage/network, disabled collection, retention
  and browser-only observations can reduce counts. Show known collection start
  and coverage only if backed by provider/release evidence; no invented history.
  A zero previous denominator displays “No comparison”, not infinity.

## Ordered implementation roadmap

| ID | Deliverable | Acceptance |
| --- | --- | --- |
| LSA-01 | Freeze metric definitions, business-wide scope, DTO, permission and date contracts; inspect actual target configuration read-only | Approved contract with no invented item/session/conversion data; current source and live state recorded separately. |
| LSA-02 | Add Logly's generic scoped aggregate endpoint using existing credential/hash/query modules | Ingest-to-read digest compatibility, complete-window aggregates, timezone/period boundaries and project/group isolation pass; endpoint rejects missing scope/demo fallback. |
| LSA-03 | Add EwaTrade server adapter and protected query; register router/env mapping and assistant impact | Fresh OWNER/ADMIN authority, strict dates, fixed upstream scope, scoped cache and safe DTO; no client credential/identity leak. No database schema change expected. |
| LSA-04 | Preview the report in Workshop with real metric/empty/error/scope states and record the exact owner-approved revision | Canonical `ewatrade/storefront/template-library` space, stable report direction and immutable revisions; preserve existing template selections/history. Follow exact Opus 5.5/high author preference and documented Codex takeover if unavailable. This plan does not start a Workshop or select a design. |
| LSA-05 | Implement approved report and Studio link using shared reports UI | Dates/history, visible business scope, loading/empty/error/retry and business-switch behavior work without replacing operational reports. |
| LSA-06 | Complete focused source, permission, aggregate and representative UI verification; update Brain and assistant evidence; commit owned source | Pass the relevant checks below; document actual platform/source/target and remaining hosted limits in one receipt. |
| LSA-07 | Separately authorized provisioning and coordinated release, then actual eligible-business ingest/read acceptance | Scoped read credential, dedicated project/origins/collection readiness and exact Preview/Production candidate proven; rollback documented. No synthetic production event or merchant fixture to manufacture acceptance. |

Dependency order: LSA-01 → LSA-02 → LSA-03; LSA-04 can follow the frozen contract;
LSA-03 + LSA-04 → LSA-05 → LSA-06 → LSA-07. Implementation is **0/7**;
the seven milestones include eventual rollout, so local source completion alone
must not be reported as end-to-end completion.

Likely EwaTrade changes: `packages/events` server reference/reporting modules and
exports, `apps/api/src/schemas` and `trpc/routers` plus router registration,
Dashboard report components/hooks, Reports route and Studio navigation. Logly work
belongs in its collector, shared contracts and DB query modules. Keep all changes
in their respective existing checkouts; this task edits neither runtime.

## Focused verification and release criteria

- **Isolation:** two businesses and two projects; a manager of A gets no B data,
  counts or breakdown labels. Forged extra scope fields, revoked membership,
  staff, anonymous and QA requests fail before production provider access.
- **Correct aggregates:** data exceeding one event page, duplicate event IDs,
  missing visitor keys, repeated visitors across days, empty groups, Lagos day
  boundaries, adjacent periods and zero denominators. Assert exact totals and
  distinct counts without reading a page and summing it.
- **Identity compatibility:** original capture reference → Logly stored digest →
  read scope matches. Wrong project, secret/version or group never falls back to
  unscoped data; different business names cannot affect identity.
- **Lifecycle and resilience:** retained requests/cache during business/account
  switches, logout and permission loss; timeout/429/5xx/malformed response;
  disabled/unconfigured collection; invalid/oversized date ranges. No credentials
  or private identifiers in browser/network DTOs or diagnostic output.
- **Repository checks:** follow `docs/testing.md`: offline doctor, inspect
  `test:quick --plan`, scoped fast source checks, relevant events/API/Dashboard
  types and assistant H01/H02. New canonical query needs a reviewed assistant
  impact record. Logly runs its corresponding focused query/auth/contract checks.
- **UI:** one representative authorized existing-data Dashboard session with
  date change, empty/error and business-switch/back behavior; use existing
  `qa:smoke` workflow. No sales/payments, merchant fixtures, extra theme/device
  matrix or deployment to repair a failed test. Ordinary QA data is excluded from
  collection, so QA smoke cannot prove live ingestion; use an injected read
  boundary locally and record that limitation explicitly.
- **Hosted:** only after separate rollout authorization, prove actual existing
  eligible-business events appear in the intended project and exact scoped
  report. Preview keeps existing collection refusal; verify Preview with safe
  isolated read fixtures, never by weakening that gate. A hosted collection-off
  or no-traffic result remains an honest unavailable/empty result, not acceptance.

Operational rollback disables the report read feature/credential without
changing storefront commerce or deleting history. Rollout configuration should
separately control reporting reads and collection; report reads must not turn on
tracking. Pricing/retention/credential privileges and actual target readiness are
implementation-time facts to inspect, not assumptions made by this plan.

## Assistant and Brain impact

Assistant access is **planned**: the future canonical read is
`storefrontAnalytics.summary`, with the same fresh OWNER/ADMIN business scope.
V1 ships a Dashboard report only; no new model tool or WhatsApp response is
authorized by this plan. At implementation, classify the procedure explicitly in
assistant coverage and record why conversational access is deferred. Never expose
Logly keys, visitor-level data or a broader read endpoint to the model.

Local Brain updates for this planning delivery: `features/storefront-analytics-seo.md`
and `tasks/backlog.md`. Runtime API/database contracts and accepted architecture
decisions are unchanged; update relevant API/feature/task/assistant records when
implementation is actually delivered. Do not force-add ignored Brain files.

Planning checklist: [x] audit EwaTrade and earlier plans; [x] inspect Logly read
and hashing boundaries; [x] prepare scope, roadmap and acceptance criteria.
Documentation validation is recorded in the delivery response; it does not
establish runtime, collection, feature or release acceptance.

## Planning verification receipt

- `qa:doctor --offline`: pass; no runtime or database probes.
- `test:quick --plan --files <this plan>`: maps to core with no unknown paths.
- Scoped `test:quick`: blocked at unchanged QA tooling
  `scripts/qa-web-smoke.mjs:129` (`shell` possibly null, TS18047). No green fast
  workflow/typecheck claim. The four selected core suites were then executed
  directly using the runner's own `quickEnvironment`: **47 pass, 193 assertions**.
- Assistant H01 check reports a stale shared coverage snapshot; H02 reports
  client/domain changes without an impact record in the concurrent checkout.
  This delivery changes only this plan and ignored Brain notes; those runtime
  files were not edited or regenerated to manufacture passing gates.
- Seven roadmap milestones, scope/progress declarations, whitespace and both
  local Brain pointers checked. No runtime/browser/provider acceptance attempted.
