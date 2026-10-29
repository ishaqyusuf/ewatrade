# Catalog detail performance follow-up

Owner reported slow refresh and repeated Overview/Orders/Activity loads on
29 October 2026. Target: the existing local Catalog detail sheet. Local only;
no business submissions, fixtures, provider changes or deployment.

## Four-step execution checklist

- [x] Reproduce refresh and tab revisits on the exact existing QA item.
- [x] Compare Midday and trace query lifetime, scope and loading dependencies.
- [x] Implement retained visited panels and remove redundant/serial read work.
- [ ] Complete source, permission and actual browser acceptance; commit owned work.

## Findings and measurements

Current user tab refresh took8657ms to prices; recent activity was still loading.
Clicks, Close and Escape subsequently did not respond in that tab. A fresh tab in
the same IAB profile responded normally; the input failure is not attributed to
application tab state. Fresh-tab repeat measurements reproduced the actual defect:
Activity2550ms, Overview2656ms and Orders2175ms, all showing loading skeletons.
An earlier first measured cycle was2803/2937/2151ms respectively.

Each inactive panel unmounted its observer, immediately discarded results through
`gcTime:0`, and forced a fresh read on mount. The current reader freshness check
also hides data while a read is fetching. Together these intentionally fresh-read
rules became an unnecessary reset for every in-sheet tab revisit.

The Catalog route prefetched an unscoped Overview key. The modal consumes a key
with actor, Tenant, Store, role/access fingerprint, generation and unique visit;
that prefetch could not hydrate this consumer. It was removed rather than making
unscoped data satisfy a protected reader.

Refresh also waits for a second authenticated Activity RPC after Overview arrives.
After the first fix, prices6505ms/full Overview8906ms demonstrated that waterfall.
Do not describe these small development samples as LCP or production results.

## Midday contract

Reference: Midday `customer-details.tsx`, `sheets/customer-details-sheet.tsx`,
`hooks/use-customer-params.ts` and `trpc/query-client.ts`. Customers use30s freshness,
with the shared QueryClient retaining unused data for10min. The transferable
lesson is to preserve useful results and match data ownership to UI lifetime.
EwaTrade keeps its stricter visit/role/generation/fresh-read rules; this change
retains observers within the existing authorized open sheet instead of copying
Midday's global retention intervals.

- Route: thin list/filter/settings orchestration, existing list hydration retained.
- Sheet/header/content/URL hook: existing ownership and deep links retained.
- Content: only visited panels stay mounted; inactive panels remain hidden/inert.
  Untouched tabs remain lazy. Scope/item changes, closing and fresh Overview
  validation still reset the content. Existing refetch, rejection, cache clearing
  and mutation invalidation semantics remain.
- Repository: independent item graph and last-order reads overlap. Overview and
  its bounded2-event preview start together under the same server-derived scope.
  Preview failure falls back to the existing independent error/retry UI.
- API: existing protected Overview response gains nullable `recentActivity`;
  no caller-supplied authority, new endpoint, command or permission.
- Presentation: reuse the same event list for preview and full Activity. Existing
  table/columns/filter/actions/form/sheet design stays intact; redesign is outside
  this performance correction.

## Evidence and acceptance

Browser red loop: select Activity→Overview→Orders twice; wait for the selected
tabpanel and disappearance of `output[aria-label="Loading item details"]`.
The baseline repeats showed a skeleton every time. After retaining visited panels,
warm Activity113ms, Overview117ms and Orders181ms had zero skeletons, with all3
panel DOM nodes retained. Automation/transport overhead is included in timings.

Repository regression was observed red before the parallel-read fix (order read
had not started while the item graph remained pending), then green. Focused tests
also verify actor/Tenant/Store and2-event bounds, no stock access without Inventory
permission, preview failure isolation, foreign-reader cache isolation, generation
changes, role narrowing and canonical query invalidation.

The running local API returned an old Overview payload without `recentActivity`
after the combined-read source change. Its browser refresh9282ms therefore does
not validate the new API path. Requested coordination before refreshing the
shared API, as required by docs/testing.md. Final acceptance status below is
updated only after actual checks; no deployment/release qualification is implied.

## Final source and focused runtime acceptance

Owner approved an API-only restart. The verified API listener was stopped and
restarted using `bun run dev --local -f api`; other services were preserved. The
new payload rendered the preview directly with prices (DOM children DIV/UL),
with no second preview loading stage. First refresh after restart8620ms to prices/
8630ms full; a warm refresh4154/4161ms. These are single development observations,
not a controlled production speedup. Refresh still needs further server profiling.

Final fresh-panel Orders2215ms and Activity5100ms remain materially slow; first
Activity observation includes a second wait after the browser's locator deadline.
Final warm repeats: Orders135ms, Activity139ms, Overview168ms, zero skeletons and
three retained panel nodes. Closing reduced panel count to0; reopening showed a
fresh skeleton, then one Overview panel ready at2924ms. This verifies retention
is bounded by the current open sheet, without relaxing fresh-reader cache rules.

Validation: focused14 tests/81 assertions pass; owned-path root fast225/1224 pass;
full Dashboard types and optimized build pass; API production source graph passes
using its existing config with test roots excluded. Full API types report5 foreign
test-fixture errors in general-customer-allocations, product-share and customer-ledger;
none involve these owned paths. This is explicitly not a full API typecheck pass.
Existing Next middleware deprecation/build warnings remain. No schema changes.

Temporary tagged instrumentation removed. Source-scope/role/generation/freshness
refusal checks and canonical query invalidation remain unchanged. Midday conformance
audit passes for the targeted performance correction; UI redesign and broad global
cache-policy changes are intentionally outside scope. Screenshot and metric artifacts
are private/local. Canonical smoke and commit details follow in the closing record.

Private logs/metrics/source hashes: `/tmp/ewatrade-catalog-performance-20261029/`.
