# Dashboard partial-stream attribution —30 October2026

DP-003 measurement slice of the [27-ticket/59-route performance program](../plans/2026-10-29-dashboard-performance-program.md).
Acceptance remains **4/27 (14.8%)**. Application candidate `abf8aae83`, Next16.4.3
BUILD_ID `KRKyPfsdjz-gY_DEgb_mF`, reused unchanged. No application/API/schema,
cache policy, transaction, permission or provider change in this slice.

## Measurement correction

An inert loopback stream demonstrates the gap: the browser receives2049 decoded
bytes before abort, while Playwright completed-response sizing reports0. The old
observer intentionally lacks completed-size measurements for failed requests;
that missing value cannot establish zero received work.

The existing local artifact observer now initializes a dedicated Chromium session
before its first action. It records numeric `Network.dataReceived.dataLength`
counters for requests begun in the active window, without reading response bodies.
Window-end copies prevent later chunks from changing returned results. Redirects
terminate the prior entry before reusing the protocol request ID. Listener cleanup
and disposal release the session. Four allowlisted classification headers are
transiently inspected; no headers, URLs, inputs, credentials, bodies, procedure
names or actor/Store IDs are retained in these counters.

Fixed `routePrefetch` and `routeNavigation` labels distinguish header-marked Next
requests. Prefetch is not automatically waste: the inspected Midday main menu also
prefetches parent links. Website already starts counts and list independently;
the earlier Finance warm sample has no browser API starts and substantial route
work. Those observations do not establish a new browser-query waterfall.

## Focused optimized observation

Canonical existing-data local smoke with `QA_WEB_ACTIVITY_STARTUP=true` passes
**13:31:18.822Z–13:31:59.907Z**. Same standard QA login/Catalog/draft-cancel journey,
plus only Activity refresh and return after Overview; zero business writes.
Source/lock and build-manifest hashes match the frozen inputs. The receipt records
parent `be170b032`, dirty owned tooling, and `runtimeVerified:false`; it is not a
release-qualified receipt. No full-family or long lifecycle sweep repeated.

| Observation | Activity refresh | Activity warm return |
| --- | ---: | ---: |
| Content readiness |3121ms |2617ms |
| Header-marked prefetch starts, Playwright |26 |4 |
| Last prefetch finish, Playwright |938.8ms |34.7ms |
| Navigation Flight starts, Playwright |0 |1 |
| Navigation Flight last finish |— |457.3ms |
| Activity list/filter batch start |1132.5ms |458.5ms |
| Activity batch first headers |1796.3ms |1104.4ms |
| Activity batch finish |2949.9ms |2236.6ms |
| Activity batch decoded bytes observed |26562 |26562 |

List and filters share one HTTP stream: their identical byte labels must not be
added. Across all browser API requests, refresh observes27565 decoded bytes in
three requests; warm observes26562 in one. All four API streams are classified
cancelled by Chromium/Playwright, while completed-size measurements are absent.
The new counters therefore add evidence previously missing from these streams.

Refresh's26 header-marked prefetch requests observe42038 decoded bytes. Warm route
work has five Playwright requests but only two independent protocol observations:
4167 navigation bytes and1974 prefetch bytes. This discrepancy is preserved;
protocol observations are not a complete one-to-one accounting of Playwright
events, including cached/intercepted work. Zero measurements mean unavailable.
Do not use the received-byte denominator as the request-start denominator.

These are partial decoded bytes received by window end, not encoded transfer,
headers, complete payload sizes, CPU or SQL. There are no uncancelled failures or
HTTP errors in these two windows. Cancellation does not prove RPC failure or
success inside a200 stream. API setup headers do not expose the full streamed
transaction, and server-to-server reads remain invisible. Single samples are not
p95, accepted budgets, causal speedups or a render profile. Warm Activity remains
slow; its dominant observed API interval warrants further server attribution,
while this sample gives no latency reason to disable parent prefetch.

## Validation and restoration

-32 inert browser-driver cases pass, no skips, including real abort/partial-byte,
  immutable late-chunk snapshot and redirect cases. An initial redirect assertion
  ran before the independent terminal event; the fixture now waits50ms for that
  event. This fixture-only wait adds no application delay.
- Five observer/budget unit cases/18 assertions, QA tooling types and owned
  four-path quick scope47 tests/195 assertions plus Biome pass, zero unknown
  mappings. A dummy-string formatting failure was corrected before frozen smoke.
  Foreign Agent Chat and staged explainers are excluded.
- H01 unchanged API/capability evidence reused; H02 reports no gated change.
- Optimized Dashboard stopped; root `bun run dev --local -f dashboard` restores
  development listener49718. API48226, Storefront46668 and Marketing90981 remain
  unchanged. Generated next-env bytes match the original. Lightweight trusted-CA
  API/Dashboard doctor passes. No push, deployment, provider action or fixture.

Private `/tmp/ewatrade-dashboard-program-20261029/received-bytes-*` preserves frozen
inputs, logs, numeric artifacts, canonical receipt and restoration evidence.
Brain BRAIN/task/QA/navigation checkpoints updated locally. No API/database/ADR
update is needed for this QA-only measurement change. All23 open program tickets
remain open; the previous nine-family baseline and lifecycle proof remain valid
within their documented scope.
