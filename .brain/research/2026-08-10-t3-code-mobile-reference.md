# T3 Code mobile reference

Date: 2026-08-10  
Authoritative repository: <https://github.com/pingdotgg/t3code>  
Snapshot reviewed: [`9821bca1ceb97f137a9d93f1080fe1954b6641d3`](https://github.com/pingdotgg/t3code/commit/9821bca1ceb97f137a9d93f1080fe1954b6641d3)
Final release/CI verification: [`78f462c4e18c8ea5e5037dc916389a3b72246025`](https://github.com/pingdotgg/t3code/commit/78f462c4e18c8ea5e5037dc916389a3b72246025)

## Executive conclusion

T3 Code is a useful engineering and mobile-product reference for EwaTrade, not
an architecture template. Its strongest lessons are to keep connection and
domain state outside screens, make reconnect/resume and queued writes explicit,
preserve workspace state across phone/tablet presentations, performance-budget
large operational lists, and automate mobile preview builds and screenshot
coverage. EwaTrade should apply those principles through its existing Expo,
tRPC, React Query and constrained offline-order architecture rather than adopt
T3 Code's Effect RPC, agent-session domain, or custom native terminal/diff
modules.

This note uses only first-party sources from the official repository. Statements
under **Observed** are direct source evidence; statements under **EwaTrade
inference** are recommendations derived from that evidence and the current
EwaTrade Brain/mobile source.

## What was verified

### Product and current state

**Observed:** The root README describes T3 Code as an agent-harness control
surface with native iOS and Android, web, and Electron desktop clients. The
repository is a monorepo containing `apps/mobile`, `apps/web`, `apps/desktop`,
`apps/server`, and shared packages. The README also warns that the project is
very early. [Root README](https://github.com/pingdotgg/t3code/blob/9821bca1ceb97f137a9d93f1080fe1954b6641d3/README.md),
[apps tree](https://github.com/pingdotgg/t3code/tree/9821bca1ceb97f137a9d93f1080fe1954b6641d3/apps)

**Observed:** The reviewed mobile app uses Expo 56, React Native 0.85, React
Navigation, Uniwind, secure storage, SQLite, notifications, sharing, widgets,
quick actions, haptics, image input and workspace packages for contracts,
shared utilities and client runtime. It also contains app-local native modules
for the composer, Markdown rendering, review diffs, native controls and a
terminal. [Mobile package](https://github.com/pingdotgg/t3code/blob/9821bca1ceb97f137a9d93f1080fe1954b6641d3/apps/mobile/package.json),
[mobile modules](https://github.com/pingdotgg/t3code/tree/9821bca1ceb97f137a9d93f1080fe1954b6641d3/apps/mobile/modules)

**Observed:** Release `v0.0.32`, published August 7, 2026, includes mobile work
on scroll jank, instant sends/thread opening, reconnect-on-resume, image input,
update checks, QR pairing and phone/tablet presentation. The current stable
release at final verification was `v0.0.33`, published August 10, 2026; it adds
mobile reconnect visual stability, consolidated thread settings, a mobile usage
dashboard and automated production EAS releases. Main and nightly releases
were still changing rapidly at review time. [v0.0.32 release](https://github.com/pingdotgg/t3code/releases/tag/v0.0.32),
[v0.0.33 release](https://github.com/pingdotgg/t3code/releases/tag/v0.0.33),
[main commits](https://github.com/pingdotgg/t3code/commits/main/)

### Architecture and source organization

**Observed:** T3 Code documents one authenticated typed RPC WebSocket between
clients and a server-owned execution boundary. `packages/client-runtime` owns
nonvisual connection/authentication/RPC/cache/domain state shared by web and
mobile; platform clients supply storage, navigation and UI layers. The guidance
explicitly keeps transport construction and retry loops out of UI components.
[Internal architecture](https://github.com/pingdotgg/t3code/blob/9821bca1ceb97f137a9d93f1080fe1954b6641d3/docs/internals/overview.md),
[client runtime](https://github.com/pingdotgg/t3code/tree/9821bca1ceb97f137a9d93f1080fe1954b6641d3/packages/client-runtime)

**Observed:** Mobile code is primarily feature-sliced (`connection`, `home`,
`threads`, `files`, `review`, `sharing`, `terminal`, `settings`, and others),
with a smaller common component layer for loading, empty, error, status and
platform-header primitives. [Mobile features](https://github.com/pingdotgg/t3code/tree/9821bca1ceb97f137a9d93f1080fe1954b6641d3/apps/mobile/src/features),
[mobile components](https://github.com/pingdotgg/t3code/tree/9821bca1ceb97f137a9d93f1080fe1954b6641d3/apps/mobile/src/components)

### Mobile UX and resilience patterns

**Observed:** The app composes safe-area, keyboard, theme, authentication,
incoming-share and navigation providers at the application boundary. Its root
stack includes deep-linked workspaces, task/thread detail, files, review,
terminal, Git sheets and settings. Overlay routes are deliberately excluded
from the adaptive workspace path so opening a sheet does not change the active
thread or flip the sidebar layout. [App composition](https://github.com/pingdotgg/t3code/blob/9821bca1ceb97f137a9d93f1080fe1954b6641d3/apps/mobile/src/App.tsx),
[navigation stack](https://github.com/pingdotgg/t3code/blob/9821bca1ceb97f137a9d93f1080fe1954b6641d3/apps/mobile/src/Stack.tsx),
[adaptive layout](https://github.com/pingdotgg/t3code/tree/9821bca1ceb97f137a9d93f1080fe1954b6641d3/apps/mobile/src/features/layout)

**Observed:** Connection lifecycle, app-state wakeups, background activity,
durable storage and a thread outbox are separated from screens and have focused
tests. Release work shows that reconnect, catch-up and long-feed performance
were practical product problems, not theoretical abstractions. [Connection source](https://github.com/pingdotgg/t3code/tree/9821bca1ceb97f137a9d93f1080fe1954b6641d3/apps/mobile/src/connection),
[thread outbox](https://github.com/pingdotgg/t3code/blob/9821bca1ceb97f137a9d93f1080fe1954b6641d3/apps/mobile/src/state/thread-outbox.ts),
[v0.0.32 release](https://github.com/pingdotgg/t3code/releases/tag/v0.0.32)

### Tests and delivery tooling

**Observed:** The mobile source has many colocated unit tests for connection,
storage, outbox, navigation, list models, review, sharing, terminal and
presentation logic. Repository CI runs checks, typechecking and tests plus
native Swift/Kotlin static analysis. [Mobile test files](https://github.com/pingdotgg/t3code/search?q=repo%3Apingdotgg%2Ft3code+path%3Aapps%2Fmobile+test&type=code),
[CI workflow](https://github.com/pingdotgg/t3code/blob/9821bca1ceb97f137a9d93f1080fe1954b6641d3/.github/workflows/ci.yml)

**Observed:** Mobile has separately installable development, preview and
production variants. Preview builds are label-gated, cancel superseded runs
and use a native-runtime fingerprint policy. Production automation publishes
an OTA only when a finished native build matches the current platform
fingerprint, avoiding delivery of JavaScript to an incompatible native binary.
A dedicated workflow captures and validates store/showcase assets across
iPhone, iPad and Android phone/tablet sizes in light and dark appearance.
[Mobile README](https://github.com/pingdotgg/t3code/blob/9821bca1ceb97f137a9d93f1080fe1954b6641d3/apps/mobile/README.md),
[EAS preview workflow](https://github.com/pingdotgg/t3code/blob/9821bca1ceb97f137a9d93f1080fe1954b6641d3/.github/workflows/mobile-eas-preview.yml),
[EAS production workflow](https://github.com/pingdotgg/t3code/blob/78f462c4e18c8ea5e5037dc916389a3b72246025/.github/workflows/mobile-eas-production.yml),
[screenshot workflow](https://github.com/pingdotgg/t3code/blob/9821bca1ceb97f137a9d93f1080fe1954b6641d3/.github/workflows/mobile-showcase-screenshots.yml)

## Recommended improvements for EwaTrade

All items below are **EwaTrade inferences**, not claims made by T3 Code.

### 1. Make OTA compatibility and build identities fail-safe

EwaTrade currently uses Expo's `appVersion` runtime policy, while its mobile
dependencies and config include native modules. Adopt a native fingerprint
runtime policy and publish an OTA only when a completed build for that platform
matches the fingerprint. This prevents a JavaScript update from reaching a
binary that lacks required native code. Keep store-build and OTA decisions
observable in CI summaries and retain an explicit rollback path.

Give development, preview and production distinct app names, schemes, bundle
identifiers/packages and icons so internal QA can coexist with the installed
production app. EwaTrade already distinguishes development visually, but its
current preview configuration resolves to the production identity.

### 2. Add one explicit mobile connection supervisor

Centralize foreground/resume, online/offline, authentication refresh, retry,
stale-data signalling and bounded catch-up outside route components. React
Query/tRPC should remain EwaTrade's transport/cache stack. The supervisor must
respect EwaTrade's existing strict offline contract: only supported
`commercial_order` commands enter the durable outbox; online-only Catalog,
Inventory, Staff, Service and standalone payment writes must stay blocked.

Acceptance should cover high latency, packet loss, app suspension/resume,
business switching, token expiry, duplicate replay and large pending queues.
This is a high-value lesson because EwaTrade already has a durable offline
order design but its network lifecycle should be equally explicit and tested.

### 3. Move incrementally toward feature slices

EwaTrade currently has a strong route layer but a broad
`components/mobile/*` area containing whole workflows, shared primitives and
domain models. Move only when touching a feature: colocate each feature's
screens, pure models, queries/mutations, empty/error/loading states and tests;
keep genuinely reusable primitives in a small common layer. Do not perform a
large filesystem rewrite without a separately approved plan.

### 4. Define adaptive phone/tablet workspace behavior

Add an explicit navigation contract for compact phones, larger phones and
tablets. Sheets/modals should not reset the selected Order, Customer, Catalog
Item or Service Job, and a tablet inspector/sidebar must not be inferred from
route presentation state. Preserve the current full-screen rule for workflows
that exceed roughly half a phone screen, but define when tablet split-view or
side panels are beneficial.

### 5. Performance-budget operational lists and feeds

Set measurable budgets for first render, scroll smoothness, search-result
updates and mutation feedback on Orders, Customers, Catalog, Payments,
Service Jobs and audit timelines. Use stable row identity, bounded pages,
memoized pure projections and localized optimistic state. Do not adopt T3
Code's list library solely because it appears in that repository; profile
EwaTrade's current React Native lists first.

### 6. Expand mobile-native entry points selectively

Evaluate deep links, push-notification-to-record navigation, launcher shortcuts
and the platform share sheet for high-frequency EwaTrade actions. Relevant
examples are opening a specific Order/Service Job, starting a sale, scanning or
sharing an EwaTrade Store link, and attaching customer-supplied request media.
Prescription/request media must continue through EwaTrade's private-media,
authorization, safety, retention and jurisdiction policy gates; a generic
share inbox cannot bypass those boundaries.

### 7. Make visual QA first-class

Add cancel-in-progress, opt-in preview builds where EAS cost and turnaround
justify them. Automate a phone/tablet and light/dark screenshot matrix for
critical EwaTrade states, extending T3 Code's approach with:

- keyboard-open and safe-area layouts;
- empty, loading, error, offline, stale and conflict states;
- long currency/customer text and accessibility font scaling;
- role-restricted and approval-required states;
- sensitive-data masking and private-media authorization failures.

### 8. Consolidate state primitives and degraded/reverse states

EwaTrade already has empty-state, status-banner, status-badge, skeleton and
query-refresh primitives. Define one reviewed vocabulary and require every new
mobile feature to cover its loading, empty, error, disconnected, unauthorized,
disabled, retry and successful reversal paths. This is a consistency and QA
improvement, not a request for new visual styling.

## Suggested priority

1. **Now:** fingerprint-gated OTA compatibility and side-by-side build
   identities; connection/resume tests; list/feed performance baselines.
2. **Next:** screenshot matrix for critical existing flows; adaptive tablet
   navigation contract; incremental feature slicing during planned mobile work.
3. **Later, product-gated:** share inbox, widgets/shortcuts and additional
   native modules only where a validated merchant workflow justifies their
   maintenance and privacy cost.

## Caveats and non-recommendations

- T3 Code controls remote coding agents; EwaTrade is a multi-tenant commerce
  and operations product. Reuse engineering and interaction principles, not
  its domain model or server event model.
- The repository changes rapidly. Revalidate any implementation-level pattern
  against the pinned snapshot and then-current stable release before use.
- The mobile README says the app is not distributed, while the pinned root
  README and `v0.0.32` release link live iOS/Android distribution. Treat the
  mobile README's distribution statement as stale documentation, not current
  product status.
- Open issues are user reports and risk signals, not verified root causes.
- Effect RPC, event-sourced agent state, and custom Markdown/diff/terminal
  native modules solve T3 Code-specific constraints. They are not recommended
  EwaTrade migrations.
- T3 Code's newer Expo/React Native versions are evidence of its current stack,
  not an upgrade recommendation. EwaTrade should use its normal Expo upgrade
  process and compatibility gates.
