# EwaTrade Vercel runtime optimization

Local implementation on `main`, starting at `1d4e03416`. The incident plan
reports 3h 40m of Active CPU for EwaTrade API in the 30-day team baseline.
Per-route usage for that period is unknown. [Vercel Optimization Plan](https://chatgpt.com/space/page_0876b65e6cf48191b9269bc50bfc9106)

## API measurement

- Filter Vercel runtime logs for `[api:request]`. The standalone Hono entry
  logs the first request per process and a random 1% of later requests.
  Group by Vercel environment, registered route pattern, method, HTTP status and
  known tRPC procedure. For a batch, expand the procedure labels for display and
  count the HTTP request only once. The list is capped at 16, with a truncation
  flag. Unknown routes and procedures use fixed labels. Only server-minted
  request IDs are logged for correlation. The embedded Marketing handler is
  outside this sampler.
- `responseSetupMs` measures elapsed time to a Hono response. Streamed tRPC
  can return HTTP 200 before individual calls finish. Use the existing
  `PERFORMANCE_TRACE` path for controlled tests, joining `[performance]`
  completion/cancellation and phase durations on `requestId`. `DEBUG_PERF`
  logs all requests for a bounded local or protected Preview run. Use the
  normal 1% warm samples for routine profiling. Keep first-in-process records
  separate when estimating route share. `processAgeMs` includes time before
  dispatch and `firstInProcess` marks a possible cold start.
- Built both local Bun entry bundles with the production flags and native
  externals from the Git build. Before was 33,282,854 bytes. After was
  33,284,451 bytes (+1,597), excluding Vercel packaging and external binaries.
  Three fresh Bun processes per route and revision each ran one first call and
  30 warm calls in-process. Import took roughly 1.2–2.1 seconds across both
  revisions. First calls took roughly 5–37 ms and warm medians were under
  1 ms for SQL-free `/api/live`, `auth.legalPublication`, and an unmatched path.
  The noisy macOS sample shows import dominates those cheap first calls.
  It measures elapsed time with no network, DB, provider, or billed CPU load.
  It cannot rank expensive routes or establish a regression or improvement in
  Vercel Active CPU.

## Source changes and local evidence

| Surface | Change and evidence |
| --- | --- |
| Dashboard | One retry for a failed browser query when eligible, down from three. Terminal 4xx responses, including non-JSON gateway refusals, and aborted reads skip retries. Server renders keep their request-scoped query cache, one authenticated upstream transport with a 15-second deadline, and no query retries. The streaming/hydration regression suite verifies no duplicate client read and no cross-actor batching. |
| Marketing | A full Next production build moved `/support` and its `/contact` alias from dynamic rendering to prerendered HTML with a 300-second revalidation interval. The homepage was already static. Repeated anonymous HTTP requests served both pages from the local Next cache with existing metadata and support contact. Existing waitlist/early-access POSTs returned 410 and the tokenless experience preview returned 404. Signup, analytics and assistant handlers are still dynamic. A separate Preview-profile build showed the homepage and support remain request-rendered there so current QA policy can be read at request time. |
| Storefront and storefront-preview | Reuse the canonical loader's publication/digest/template validation and remove duplicate per-render hashing. Verified hosts and active releases still resolve per request. The catalog projection also depends on live listing, stock, entitlement and service eligibility. Cross-request caching needs invalidation for those changes as well as publish/unpublish and domain reassignment. Storefront Preview uses its existing separate CLI project with exact-revision and alias guards. The local guard suite passed. |
| Embedded Oversight API | Declare the `sharp` dependency externalized by the standalone Node bundle and typecheck against ES2022, matching its runtime and the shared BigInt queries. The actual build generated a 15.78 MB bundle. Node loaded the entry, returned 200 for liveness and refused a read without a key (401, no-store). Existing route tests cover validation and lazy DB initialization. |
| Monorepo | Turbo's build keys now include the Vercel environment inputs consumed by Next. The embedded Oversight build tracks its root build script and restores its generated bundle on a cache hit. The dry graph includes Marketing, Dashboard and Storefront's API dependency and Oversight's DB and shared Oversight dependencies. Storefront Preview's isolated CLI packaging has its own path. Hosted skip settings and build outcomes remain unverified. |

Turbo's local affected-package query selected only Dashboard among the apps
for `a284ac2ae`, a Dashboard-only commit. For `0c3848939`, a shared Utils commit,
it selected API, Marketing, Storefront and Oversight via dependencies.
Dashboard was also selected while it had its existing local edit, and Turbo
listed the edited root agent-chat file in both queries.

The owned-path fast suite passed 287 tests. The focused runtime/contract and
dashboard streaming suites passed 61 tests combined. H02 and the WhatsApp
inventory check passed.

## Release verification

1. Use the normal release flow and protected Preview on the same candidate
   before Production. Verify mobile auth, single/batched tRPC, tenant/role
   isolation and expiry, web/mobile checkout, signed webhook retries and
   duplicate delivery, uploads and image/receipt processing, two storefront
   hosts, unpublish/domain remap, and private Preview access. Use configured
   QA identities and provider sandboxes for flows with side effects. Verify
   the prior working deployment and schema compatibility for rollback.
2. Capture dashboard/API project and environment IDs with the deployed SHA,
   and compare a dashboard-only commit and a shared-package commit against the
   hosted project build decisions. Verify dependent rebuilds and unrelated
   skips. A CLI-only Preview does not use Git project skipping.
   [Vercel monorepo build behavior](https://vercel.com/docs/monorepos#skipping-unaffected-projects)
3. Compare matched 24-hour and seven-day windows by release, environment and
   route mix. Use Vercel Active CPU × 1,000 ÷ invocations for the API project.
   Compare p95, 5xx, process starts, memory, bundle storage and marketing CDN
   hit rate. If CPU is aggregate-only, run matched single-route trials in
   protected Preview to separate initialization from request work. Retries,
   images, receipts, assistant, webhooks, liveness and unknown paths remain
   hypotheses for cost attribution. The 25% lower CPU per 1,000 calls target is
   provisional. Investigate any sustained latency/error regression. Roll back
   on tenant leakage or auth and webhook failures.
   [Vercel Active CPU metric](https://vercel.com/docs/functions/usage-and-pricing)

Vercel CLI authentication metadata was inaccessible within this session's
filesystem permissions. No provider inventory or settings were changed. The
local web smoke browser exited before navigating. Marketing and Storefront
full TypeScript graphs exhausted the local heap. The existing H01 gate reports
three unclassified growth procedures (`growthIntent.recordSeePlansTap`,
`growth.activeNudge`, `growth.dismissNudge`). Supplementary unchanged suites also
failed on the retired Production QA early-access fixture and the signup-email
subprocess output assertion. Those failures are outside the changed request
paths and remain visible for release qualification. The capped storefront fixture
now checks the current Free plan cap. Starter is now uncapped.
