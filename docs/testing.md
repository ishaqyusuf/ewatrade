# Fast testing and release workflow

Current entrypoint, 27 October 2026. This consolidates the existing focused
verification policy; it does not replace domain authorization or release gates.

## Ordinary development

1. Keep work in small committed slices. Reuse a suitable running stack. Avoid
   concurrent edits to the same feature; use an isolated worktree when needed.
   Resolve its own workspace dependencies, selected profile and generated client.
   Do not assume the main checkout's running API serves a different worktree.
2. Check setup: `bun run qa:doctor --offline`. This loads `.env` plus exactly the
   selected root profile and reuses the existing database-isolation guard without
   connecting. It checks dependency/client presence, not schema/client freshness.
3. Start only required surfaces through the existing root launcher, for example
   `bun run dev --local -f mobile api jobs dashboard`. Do not add another launcher
   or automatically kill/restart a shared stack.
4. Check those local services:
   `bun run qa:doctor --services api,dashboard,mobile --require-qa`.
   Supported: api, dashboard, mobile (Metro), marketing, storefront. Profiles:
   local (default), dev, preview. HTTP probes use local named hosts, never hosted
   Preview/Production. Trust the Portless certificate; do not disable TLS checks.
   `--require-qa` retains the SQL-backed API health read and QA capability check.
   For routine API process discovery, use `bun run qa:doctor --services api`:
   it probes SQL-free `/live` and skips QA capability discovery. Add `--database`
   for SQL-backed `/health` readiness without QA discovery. A liveness pass does
   not prove database availability, schema parity or QA access; other requested
   surfaces and explicit Android diagnostics may still perform connected work.
   Release/smoke readiness remains SQL-backed.
   If Bun does not inherit the trusted Portless CA, run with
   `NODE_EXTRA_CA_CERTS="$HOME/.portless/ca.pem"`; this trusts the existing local
   CA without disabling certificate validation.
5. For an explicitly assigned Android device, add `--device emulator-5556`.
   This reuses the existing helper with `--no-launch`: it installs reverse
   mappings and probes transport, but does not force-stop/open the app. It runs
   only with the local profile. No device is selected or started automatically.
6. Inspect `bun run test:quick --plan`, then run `bun run test:quick` once ready.
   Also run feature-specific checks required by the actual change.

`qa:doctor` starts no services, applies no migrations, seeds no data and changes
no provider configuration. It does not verify jobs, populated QA memberships,
running source SHA, schema parity or native acceptance. `--offline` explicitly
skips runtime probes; it cannot establish service readiness.

For an authorized local customer-login check, start the required storefront with
`STOREFRONT_CUSTOMER_OTP_ADAPTER=test bun run dev --local -f storefront`.
The storefront dev task explicitly passes this flag through Turbo. The registered
test adapter still requires every local-development marker, labels its code as a
test delivery, and sends no messages. This is not provider-delivery evidence.

## Fast source checks

`test:quick` uses staged, unstaged and untracked paths against HEAD. For committed
branch changes use `bun run test:quick --base origin/main`; it compares the merge
base to HEAD and includes current local changes. It never fetches. A missing ref
fails rather than producing an empty successful run.

In a busy checkout, `bun run test:quick --files scripts/qa-doctor.ts package.json`
selects explicit owned paths. This is a scoped result, not whole-checkout approval.
Do not narrow the list to hide a relevant shared change. Deleted paths still
affect selection; configured test files must exist.

The explicit mapping in `scripts/test-quick.ts` selects a small reviewed set:

| Change | Fast smoke selection |
| --- | --- |
| Documentation / QA scripts | QA workflow and environment/isolation tests |
| Dashboard, marketing, storefront | Core + web + domain smoke |
| Mobile | Core + mobile + domain smoke |
| API, auth, DB, jobs, assistant, communications and mapped shared contracts | All client/domain smoke groups |
| Root package/lock/config or workspace manifests | All smoke groups |
| Unmapped source/config | Exit 2 with paths; review and extend the mapping |

Every run also typechecks only the QA tooling and runs Biome on existing changed
JS/TS/JSON files. It does **not** typecheck application graphs. A TypeScript feature
still needs relevant scoped types; changed DB/payment/permission/concurrency
boundaries need focused integration proof when source tests cannot establish the
invariant. The smoke suite is not comprehensive coverage of every mapped file.
Do not auto-discover arbitrary tests: this repository includes connected tests.

Tests receive a minimal environment and an unusable loopback DB sentinel; developer
credentials and opt-in live flags are not forwarded. No database, model or provider
calls belong in the smoke suites. Inspect new suites before adding them. Each stage
has a three-minute timeout and reports elapsed time. This is a budget to measure,
not a claim about runtime. The existing assistant workflow remains independent.

Storefront source smoke explicitly covers current standalone service-request
navigation, listing query contracts, safe link construction/share fallback and
selected public-option enquiries, query-bound public pagination/price policy,
preview navigation, request failure results and detail-history decisions.
Contracts/runtime/templates map to all existing client/domain groups. These are offline helpers/contract checks, not actual
browser, native or public delivery acceptance. `test:quick` passes explicit `./`
test paths to Bun; use that form for focused commands too, so Bun does not treat
them as recursive filters and accidentally discover archived copies. Unknown
packages still fail visibly. Tests are never removed or skipped to hide a failure.

## UI and evidence

The optional repository recipe `docs/verification/verify-ewatrade/SKILL.md` applies
the selected pstack verification pattern to these existing commands. It adds no
runner, daily live sweep or deployment authority.

Pure logic/tooling changes normally need no UI session. For UI changes, finish
the slice, then run one focused session with a representative success and relevant
failure/back path. Sample theme/font/keyboard changes when affected. Browser mobile
viewports do not prove native behavior; record each platform actually exercised.
Use existing QA domain access/Quick Fill and eligible isolated QA records. Avoid
broad fixture matrices or live provider effects for routine checks.

Keep one receipt: source commit and relevant dirty hashes, changed behavior,
commands/results, actual platform/target, limitations and remaining acceptance.
Reuse valid receipts for unchanged relevant source and dependencies. Repeat only
for failures, relevant changes, concrete uncertainty or required checks. Environment
and signed-build differences need their own proof; a source pass does not transfer
automatically to a different deployment/runtime.

Use one stable dated run ID for an execution. Record start/end, relevant path
SHA-256 hashes and lockfile hash alongside the commit (dirty work needs hashes).
For connected checks also record the profile, provider project/branch/endpoint
identity, invariant and cleanup result without credentials. One chat owns a
connected acceptance window on a shared target; others should reuse the receipt.
Unchanged checks can be linked from multiple feature/task summaries without
being counted as independent executions. A meaningful scope/dependency/target
change invalidates that part of the proof; repeat that part only.

### Optional local Activity attribution

With the existing local tracing enabled, add `QA_WEB_ACTIVITY_READS=true` and
`QA_WEB_NAVIGATION_ARTIFACTS=/tmp/<dated-run>` to the normal local web `qa:smoke`
command. It adds two isolated existing-data GETs for Activity choices and a fixed
seven-day UTC list window, outside page timing windows. The private
`activity-reads.json` contains only fixed procedure labels, status/elapsed/decoded
byte counts and allowlisted numeric phases. Missing current tracing, refusal or
malformed responses fail the diagnostic. It requires the canonical local origin
and artifacts; ordinary smoke and Preview remain unchanged. No service restart,
business fixture or write is implied. These API timings are not page-load budgets.
Current `activityAdmission` includes the Store projection; separate
`activityStores` timing remains readable for historical traces and is optional.

## Idle compute and probes

`/live` and `/api/live` are database-free API liveness. Use them for routine
uptime checks after the candidate containing them is deployed. A success proves
only that the API can respond. `/health` and `/api/health` retain database readiness
and its existing account-count response. The doctor/release readiness checks
still use `/health`; don't replace rollout readiness with liveness.

No profile, service, monitor or provider schedule changes automatically when
source checks run. Jobs default to existing cadence. The optional
`JOB_SCHEDULE_MODE=prelaunch` changes five- and fifteen-minute recovery groups to
thirty minutes while retaining hourly/daily groups. It delays physical OTP
cleanup, reminders and recovery as well as optional work; expiry at point of use
remains enforced. Review that tradeoff and separately authorize the target before
setting/deploying it. Revert to `standard` (or unset) and redeploy to restore the
original cadence. Preview remains unscheduled and local scheduling opt-in.

## Release

Use the existing root release command and `release.config.ts`. Older instructions
using `release:run`, `release:status` or `release:plan` are historical and no longer
match root scripts. Current non-deploying entrypoint: `bun run release status`.

`bun run release plan --preview` is a dry run of deployment actions but can read
providers/sign in to EAS. It is not an offline QA command.

When deployment is separately requested, the existing release command selects
changed components and uses clean committed source. Database source changes select
the existing guarded DB step. Android uses fingerprint compatibility to choose
OTA versus build. Do not add another deployment system or bypass these checks.
Production branch/target confirmations and store publication gates stay intact.

Local: focused behavior. Preview: short integration smoke and change-specific
runtime/config checks. Production: safe health/rollout checks. Avoid replaying full
manual acceptance in each environment. Current shared mobile release config covers
Android only; iOS requires its explicit signed-build/acceptance path.

## One-time smoke setup

The smoke runner reuses existing QA domain entry and exact account selection.
It creates no tenants and submits no sale/order. Web checks login, the selected
catalog item, an order draft's total and cancellation. It blocks business-write
HTTP requests. Android checks QA business selection, the catalog, a sale draft
through Checkout and cancellation without Confirm. It preserves app data,
offline queues and permissions. Native smoke is not a complete persistence or
money/authorization integration test.

Android uses normal sign-out before selection and after draft cancellation,
because the QA selector is intentionally available only at signed-out login.
It preserves app data/offline queues and leaves the client signed out. Scroll
targets are centered away from the floating footer; the hidden next action is
revealed before continuing. Choose an existing unique sellable offering and the
exact total displayed by each platform (native may omit `.00`).

1. Copy `qa.smoke.example.json` into the main checkout's ignored
   `.scratch/qa-release/smoke-local.json`. Replace sample values with an existing
   QA domain, exact account option/profile label, visible item and expected total.
   No production business or real payment credentials belong in this file.
2. Run `bun run qa:smoke:install-browser` once. This downloads the lockfile's
   Playwright Chromium into the shared project-local cache. Browser execution uses
   Node, with an isolated profile; no saved browser login is imported.
3. For Android, install [Maestro](https://docs.maestro.dev/) once, connect the
   explicitly named device and use an already-installed EwaTrade Dev/Preview app.
   `MAESTRO_BIN` and `ANDROID_ADB_PATH` can select existing binaries. The runner
   never installs an APK, starts an emulator or clears app state.
   Local Android smoke automatically reuses the no-launch connection helper to
   check API/Metro/QA and restore USB reverse mappings. Maestro also receives the
   resolved SDK ADB path. The native flow has a four-minute timeout.
   The standard local CLI install is `~/.maestro/bin/maestro`; expose it on PATH
   or set `MAESTRO_BIN` to that executable. The local setup verified on 26 October
   uses Maestro 2.12.0 with existing Java 17 and the `EwaTrade_Assistant_QA` AVD.
   If that AVD's host graphics renderer crashes, launch it with
   `-gpu swiftshader -feature -Vulkan -no-snapshot-load -no-snapshot-save`.
   Reuse its app data and verify the explicit serial with `adb devices -l`.
   If ADB has restarted and the Dev app retains a stale connection, reconnect
   once with `bun run mobile:android:connect --device SERIAL --require-qa`.
   That existing launcher force-stops/reopens the Dev app without clearing data.
   A host-side doctor pass alone does not prove the running phone has reconnected.
4. Prepare a separate `smoke-preview.json` in that same directory: use
   `https://preview-dashboard.ewatrade.com`, `com.ewatrade.preview`, its exact QA
   profile and the installed EAS `buildId`. For an OTA candidate also set
   `android.updateGroupId`. Read-only update inspection uses the existing EAS CLI
   session; no account switching or update publication is performed by that read.

```sh
bun run qa:smoke --target local --surface web --config .scratch/qa-release/smoke-local.json
bun run qa:smoke --target local --surface android --config .scratch/qa-release/smoke-local.json
```

Worktrees and release clean copies share the main repository's ignored receipt
directory. Results include commit, target, surface, config/toolkit fingerprint,
timestamps, runtime IDs, actual checks and passed/failed state. Artifacts are
private/local; do not commit screenshots, session data or QA config. No browser
cookie/storage-state file is saved. Missing tools/targets fail visibly.

Preview web smoke reuses the Vercel CLI and existing owned-deployment validator;
it checks canonical API/dashboard ownership, Ready state and `gitSource.sha`
before and after the journey. An earlier deployment qualifies only when the
existing component/workspace dependency graph proves no source difference from
the candidate. Unknown commits or changed component source fail. It refuses a
deployment that moves during the test.

Preview native smoke correlates read-only EAS build metadata with the installed
Android build number. The non-production QA chooser exposes its actual embedded,
development, recovery or running OTA identity. Maestro checks that identity before
and after the journey. Downloaded updates must match the inspected Preview update
group/project/commit. An emergency fallback or old installed update cannot pass
as the candidate. Existing native compatibility/signing gates remain separate.
Local smoke is useful development evidence; it never qualifies Production.

For an authorized local performance check, the existing web smoke can also write
private navigation diagnostics:

```sh
QA_WEB_NAVIGATION_ARTIFACTS=/private/tmp/ewatrade-navigation bun run qa:smoke --target local --surface web --config .scratch/qa-release/smoke-local.json
```

This opt-in is restricted to the canonical local Dashboard host. It measures the
existing Catalog refresh and Catalog/Overview transitions, checks shell retention,
and opens/cancels the existing order and stock sheets. It records request counts,
available response-body byte counts, in-flight requests at readiness, cancellations
and fixed numeric API Server-Timing phases. URLs, query strings, headers, payloads,
credentials and error text are excluded. Background requests can share a window;
server-to-server reads are invisible to the browser. Missing phase evidence is not
zero SQL work, and overlapping work durations are not additive page latency.

For the full Dashboard representative pass, add `QA_WEB_ROUTE_FAMILIES=true` to
that same local-artifact command. This is optional and uses the existing runner,
write interception and current QA account; it creates no fixtures. It requires an
existing eligible Owner profile, including a Finance book and the configured
Catalog row. Missing access/data or a visible content error fails, never skips a
family or creates records to pass.

The pass records one full refresh and one warm return after navigation away for
each DP-401–409 representative: Overview, Catalog, Orders, Customers, Finance,
Website requests, Activity, General settings and Reports. Readiness uses the
configured Catalog row, loaded customer summary, three Finance panels, selected
request list, recorded Activity region, server settings and sales headlines;
Overview/Orders loading placeholders must finish. Healthy empty list states are
allowed where the existing page supports them. It does not open records, submit
commands, generate content, export data or change scope.

`route-families.json` checkpoints each action with fixed family/path/readiness
labels, numeric request/timing diagnostics and running/passed/failed state. A
failure preserves earlier samples with its fixed family/phase, without response
bodies or private error text. Interrupted runs may remain running and never count
as passed. The final `performance.json` includes all18 family samples. After Finance returns,
two isolated GETs read its current Book and bounded owed summary outside all page
timing windows. The summary uses the current-currency read mode and must return
the same resolved Book ID as the metadata read. Their fixed procedure labels, status, elapsed time, decoded JSON
byte counts and allowlisted numeric Server-Timing phases appear separately under
`diagnosticReads` in `route-families.json`. A refusal, missing/mismatched Book or malformed
summary fails DP-405; no fixtures or financial writes are used. Book/customer IDs,
names, amounts, raw headers and response bodies are not retained. These isolated
requests have their own fresh admission; their counts do not describe server-render
work or prove the running API revision. Decoded JSON bytes are not compressed wire
bytes. Soft
navigation checks shell identity on departure and return; full refresh naturally
creates a new shell. The runner returns to Overview for its existing screenshot.

These are representative action-to-content samples, including driver overhead,
not full domain acceptance, Core Web Vitals, p95 or numeric budget qualification.
Finance setup, additional report charts/Stock panels, Studio, detail/tab/Back,
public-token and scope/error journeys retain their separate obligations. Build
mode and served source still need the independent identity evidence below.

For a permitted existing QA Owner profile, add `QA_WEB_NOTIFICATION_COUNTS=true`
to that local artifact command to verify the three compact closed-bell responses,
absence of closed private-preview requests, and open/read/close behavior. A private
notification-bell.png is captured outside navigation timings. It submits no read
acknowledgement or other business command. The opt-in requires the canonical local
host plus navigation artifacts; profiles denied an existing notification domain
must not be used to manufacture a passing count result.

With PERFORMANCE_TRACE enabled, streamed tRPC JSONL/SSE responses expose only
`ew_responseSetup` in response headers. Full numeric request/phase facts are emitted
in the fixed server trace when the body completes, errors or is cancelled; cancelled
work is partial. Do not treat response setup as full query/request completion or
missing header phases as zero work. The existing numeric parser accepts this fixed
setup label without retaining arbitrary descriptions or response content.

QA-derived session diagnostics additionally split fixed numeric `qaProofFacts`
(joined binding read) and `qaDomain` (existing managed-domain check) within
`sessionProof`. They export no session/grant identity, domain value or SQL. A
positive phase sample can show the changed runtime path is active; source/build
presence alone cannot. Overlap/sample/mode and release-identity limits still apply.

Database diagnostics distinguish `connection` (physical socket/TLS/auth setup,
inside `pool` checkout) and `poolBusy` (whole checkout begun with no idle connection
at the configured maximum). `poolBusy` includes queueing and possible replacement
connection setup; it is not pure wait time. Absent phases mean no observed event
in the captured trace, not proof of database capacity or work outside that trace.
The shared Prisma adapter uses a30-second idle window in both tracing modes,
with its existing max/min and transaction limits. No keepalive SQL is added.

Record the actual build mode, served candidate, source/lock hashes and sample limits
separately. The local smoke receipt's checkout SHA does not establish the identity
of an already-running optimized build; `runtimeVerified: false` remains meaningful.
Changing a shared Dashboard runtime still requires coordination under the ordinary
development rule above. No deployment is implied.

The opt-in also saves private Catalog and Overview screenshots beside the numeric
summary. Catalog capture occurs after measured readiness, outside the timing window.

## Candidate verification and release

`bun run qa:candidate` runs the bounded source smoke from clean committed source,
or reuses a matching successful receipt. `bun run release` automatically uses that
check through an optional hook in the existing sibling `local-infra-kit`. The hook
runs **inside its existing clean-copy flow**, before provider/deployment actions;
no second checkout/deployment system is introduced. Other toolkit consumers keep
their default behavior. A missing hook version fails rather than skipping checks.

The normal release command now:

1. Pins the candidate SHA and performs/reuses clean source checks.
2. Determines required surfaces from the existing selected component graph.
3. For Preview, uses the existing release executor, then runs only those smoke
   surfaces. Android explicitly skipped by the existing option is not promoted
   or counted as tested.
4. For Production, requires matching passed Preview smoke **before** deployment.
   Same commit, config/toolkit fingerprint, verified runtime IDs and a receipt
   no older than 24 hours are required. Relevant changes invalidate reuse.
5. Uses the existing Production executor and performs a short configured API
   health read afterward, instead of repeating full UI acceptance in Production.

Status/plan/env/mark keep their existing non-deployment semantics; they do not
run smoke or establish QA acceptance. Fast-source success never authorizes release
by itself. Existing Production prompts, schema/native/provider and store gates
are preserved. This local verification layer does not replace protected hosted
assurance or human authorization.

If Preview deploys but device/login prerequisites prevent smoke, the command
reports incomplete acceptance. Install/open the intended candidate through the
already-approved path, correct setup and rerun `qa:smoke --target preview` for the
needed surface. Do **not** redeploy merely to repeat a failed test. The release
gate remains closed until valid evidence exists. Production health failure also
reports a completed rollout with failed health; it never retries or rolls back
automatically.

`bun run qa:smoke:driver` verifies the real Node/Playwright driver against an
intercepted HTML fixture, including refusal of business writes. It is not app
acceptance. The source suite tests receipt rejection and provider/native identity
rules without calling those providers. No hosted environment or branch-protection
setting is configured by this implementation. iOS acceptance remains separate.
