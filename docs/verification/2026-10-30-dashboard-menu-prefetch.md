# Dashboard submenu prefetch — 30 October 2026

Local DP-103/501 scheduling slice; parent `3896f716c`. Program remains **3/27
accepted (11.1%)**. No application restart or deployment. Private evidence:
`/tmp/ewatrade-dashboard-program-20261029/menu-prefetch-*`.

## Finding and change

Expanding Settings previously mounted nine child `Link prefetch` instances.
An isolated Chromium reproduction using the actual MainMenu and installed Next
App Router Link/link registry schedules nine Full child tasks before any child
intent, alongside 15 automatic PPR parent tasks. The pre-change assertion fails
with “Submenu expansion queued 9 full prefetches before intent; expected 0”.
These are framework scheduler tasks, not measured HTTP requests or SQL reads.

Only submenu children now use the small local IntentLink. It starts with native
prefetch disabled and enables full warming after mouse enter, keyboard focus or
touch start. Eligibility belongs to the exact href; a changed href cannot inherit
it. Caller handlers run first and can prevent warming. Native Link still owns
anchor rendering, navigation, modifiers, cancellation and cache behavior. Root
links retain automatic prefetch. No custom cache, timer, click interception,
router refresh, role/scope, URL, style, command or API change.

Tradeoff: an untouched child no longer has a fully warmed destination; a direct
click may wait on its normal route load. Intent starts warming it, and current
loading boundaries remain. This bounds speculative work; it is not a measured
improvement to click or refresh latency.

Midday's current MainMenu also explicitly prefetches children (local reference
`apps/dashboard/src/components/main-menu.tsx:132`). Blindly copying it would keep
this burst. This adapts the scheduling/resource-budget lesson to EwaTrade's menu.
The installed Next guide also documents intent-based prefetch. Installed Next
already disables prefetch in development: this change does **not** explain the
reported development refresh delay. Prepared optimized config has
`cacheComponents:false`; the proof uses the same full/automatic strategies.

## Focused proof

Eleven Chromium cases /52 assertions pass:

- Inventory, Finance, Reports and Settings expansion schedule zero Full child
  tasks; each retains 15 automatic parent tasks as a positive control.
- Hover, focus and synthetic touch start warm only their destinations; repeated
  intent reuses the task. Focus remains on the native anchor.
- A cold click dispatches native push with the existing close callback and no
  speculative Full task. Collapse cancels a warmed task; reopening needs intent.
- Changed href, query/hash, composed/prevented handlers, replace and scroll=false
  retain their contract. Current scoped Cashier links speculate no unlisted route.
- Development visibility and intent schedule no prefetch work, as before.

The fixture uses real MainMenu/IntentLink, React DOM, installed App Router Link,
registry/cache-key and Chromium IntersectionObserver/events. Icons/classes,
pathname, router state/dispatch, scheduler transport and Flight are inert ports.
All URL requests are intercepted at `navigation.invalid`; unknown requests and
page errors fail. It measures task scheduling, not destination rendering, actual
Back/scroll restoration, mobile behavior, grants, route bytes or latency. Touch
is a dispatched desktop event, not a device pass. Current menu filtering is
exercised, not live permission enforcement.

The bundle explicitly resolves App Router Link (standalone `next/link` otherwise
resolves the Pages entry) and defines production/development mode. Native parent
PPR task counts prevent an incorrectly disabled bundle from falsely passing.
The inert navigator port matches this installed Next dispatcher. An initial
missing port failed cold-click proof; the corrected fixture passes. No product
change was made to bypass the failure.

Run the isolated entry with the repository's already installed QA Chromium:

```sh
bun --env-file=/dev/null test ./apps/dashboard/src/components/dashboard/menu-prefetch.browser.test.ts
```

This imports the existing QA browser launcher; it neither downloads a browser nor
starts a service. The fixture-type check extends Dashboard tsconfig, includes
only the four owned test files, and sets isolatedModules=false because installed
Next declarations expose ambient const enums; production Dashboard types keep
their existing settings. Runtime enum values come from actual installed JS.

## Verification and remaining acceptance

Dashboard types and the explicit four-file fixture/entry type graph pass. The
isolated entry passes all11 inner cases; the owned fast scope selects nine paths,
all four smoke groups and no unknown mappings. It passes237 tests/1,533 assertions,
QA tooling types and Biome. Foreign staged work is excluded. H01 coverage is
current; H02 passes for client with zero capability/procedure rows. The first H02
invocation used the API directory, which has no such script; the corrected root
command passes. Offline doctor and diff whitespace checks pass.

Frozen canonical local smoke passes02:16:40–02:17:01UTC: exact QA account, populated
Catalog, sale draft item/total, cancel without submission. Copy:
`menu-prefetch-smoke-passed.json`, `runtimeVerified:false`. Eight source/lock hashes
match afterward; four prepared optimized manifests remain unchanged. This is an
ordinary development smoke, not proof that the optimized build contains this
source, nor a full route speed/Back/error/grant check. The exact menu scheduling
proof is the isolated Chromium fixture described above.

This slice does not close DP-103/501, per-family acceptance or the full27-ticket program.
The prepared9eb8 optimized candidate remains separate from this source. The
older965f timing window was already completed/restored; the newer candidate
coordination request remains pending. No additional service switch is inferred.
