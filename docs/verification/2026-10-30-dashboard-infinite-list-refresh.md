# Dashboard infinite-list refresh —30 October2026

DP-203/406/501 source slice under the [full27-ticket program](../plans/2026-10-29-dashboard-performance-program.md).
Parent `cd4cdce2e`, frozen owned source/test/impact/lock hashes retained privately.
Acceptance remains **4/27 (14.8%)**. Current checkout, local implementation only.

## Confirmed defect and correction

Service intake's success callback invalidates `orders.listPage.queryKey()`, while
the Orders table and contact-history reader use infinite options. Prescription
staff intake and seven workspace success callbacks similarly invalidate an ordinary
`prescriptions.queue` key while the queue uses an infinite key. The ordinary key's
query-type segment does not match infinite cache entries. A retained list can stay
stale until another read or reload; a broad page refresh cannot reliably substitute
for matching its actual client key.

Three callback sites now use their existing procedure path keys. Active variants
refetch once each; inactive variants become stale for re-entry. Inputs, paging,
filters, command callbacks, detail refresh, draft clearing, navigation, pricing,
money, clinical scope and server authority stay intact. No global invalidation,
retention increase or new freshness policy. Midday's Customer form explicitly
invalidates ordinary and infinite keys; EwaTrade's existing path-key pattern covers
both query types and all relevant filters.

Two existing Prescription intake JSX-valued props gain equivalent braces so Bun
can import the actual form in its test process. Initial parser failure is preserved.
Normalized emitted JavaScript for all three product files is identical after
reversing only the intended key-method changes. In particular, the command and
money/clinical behavior are unchanged; this is no pharmacy feature activation.

## Regression and audit evidence

- Actual mounted Service intake form supplies the captured production success
  callback. Real tRPC options/keys, QueryClient and two infinite observers reproduce
  **zero** refetches with the old matcher. Corrected matching refreshes both active
  filter variants once and updates their result, marks an inactive Store variant
  stale without fetching it and preserves unrelated Catalog cache data. Existing
  route refresh still occurs once. No mutation is submitted.
- Actual Prescription forms/workspace hooks mount through SSR with real form/query
  contexts; presentation leaves are inert. Eight captured success callbacks all
  fail against the old matcher and pass with path keys: staff intake, transcription,
  clearer-media request, line verification, transcript revision, pharmacist submit/
  review and quote issue. Each refreshes both active queue variants once, marks
  the inactive variant stale and preserves unrelated data and existing selection.
  Only inert queue queries are permitted; uploads and mutations throw if attempted.
  SSR callback capture is not a rendered clinical interaction or command proof.
- Combined focused result: **14 cases/115 assertions** across two actual-callback
  fixtures and the existing Service job invalidation test. Three isolated entry
  wrappers pass separately. The final fixture reflection guard is typed and rerun;
  initial fixture typing diagnostics were corrected without type assertions.
- AST audit of1108 production source files finds26 direct infinite option calls for
 17 procedures. Before: three ordinary-key overlaps, manually confirmed as these
  invalidations. After: zero. This covers direct `trpc` chains, excluding aliases,
  manual keys, dynamic dispatch and imported helpers; it is not a complete mutation
  dependency graph or proof that every invalidation is precise.
- Full Dashboard and both fixture graphs typecheck. Owned seven-path quick scope
  passes237 tests/1533 assertions plus QA tooling types/Biome, zero unknown mappings;
  unrelated Agent Chat/staged explainers excluded. Final fixture guard has separate
  type/runtime/format proof; product code is unchanged from the quick-check input.
  H01 unchanged API/capability evidence reused; reviewed H02 passes one client
  impact record, zero capability/procedure deltas.

## Local smoke and remaining work

Canonical existing-data development smoke first fails **13:43:23.637Z–13:43:54.367Z**
at login, with QA Quick Fill absent and no changed form reached. Failure screenshot
and receipt preserved. A subsequent read-only capability GET returns200/available.
The unchanged canonical retry passes **13:44:49.434Z–13:45:12.683Z** with exact frozen
source/lock hashes: QA login, populated Catalog, existing order draft/total and
Cancel. No business command or clinical page is exercised. The server's QA policy
path can fail closed; the exact intermittent missing-entry cause remains unproven.
No availability gate, policy TTL or authorization rule was weakened to pass.

No service restart or runtime switch. Development Dashboard49718, API48226,
Storefront46668 and Marketing90981 remain unchanged. `runtimeVerified:false`; no
optimized timing claim, release qualification, deployment, provider change, business
fixture, upload, payment or clinical command. Previous optimized artifact/timings
predate these client invalidation changes and are not requalified by this smoke.

Private `/tmp/ewatrade-dashboard-program-20261029/infinite-refresh-*` and initial
`intake-infinite-*` preserve red/green/type/quick/H02 logs, source parity, AST audit,
frozen inputs, failed/passed receipts and liveness evidence. Brain BRAIN/task/QA/
navigation, Service Commerce and Prescription checkpoints updated locally. No API,
database/schema or durable architecture change requires corresponding docs/ADR.

DP-203 remains open: audit all command-to-read dependencies, including Service
intake's Customer creation, Order debt and initial-payment effects on Finance,
Customer/ledger/search reads. These key corrections alone do not establish full
financial freshness, all59 route behavior or performance-budget acceptance.
