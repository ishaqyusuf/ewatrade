# Dashboard section loading contract —29October2026

Implementation contract for partial DP-104/408 in the [full program](2026-10-29-dashboard-performance-program.md).
Primary checkout, local implementation/testing only. Full program denominator27
and accepted count3 remain. No deployment/provider/business submission.

## Reference compared and principle

Target inspected: settings/channels route, customer-channels-workspace,
channels-header, connections-list, conversation-mode-choice, channel labels/types,
service-commerce URL hook, settings primitives and API channels readers.
Midday inspected: settings/page.tsx, inbox/settings/page.tsx,
components/inbox/{inbox-email-settings,inbox-blocklist-settings,inbox-connected-accounts}.
Midday composes independent settings features under thin nonblocking routes.
Adapt that ownership to EwaTrade's current shared settings UI and explicit access
result; do not add suspense over all five reads or broaden query freshness.

## Required file and behavior checklist

- [x] Keep settings/channels/page.tsx thin with the already nonblocking scoped
  prefetch, existing role/Store admission and HydrateClient; no new route/API.
- [x] Reduce customer-channels-workspace.tsx to workspace admission, existing
  header/connections/team/link composition and quote-approval read scheduling.
  Workspace failure refuses all workspace content. Retry only the failed owner.
- [x] Extract manager settings sections into channel-management-settings.tsx:
  ConversationModeSection, ChatHoursRow and QuoteReleasePolicyRow own their scoped
  useQuery results and preserve current query options/commands/open-sheet callbacks.
  Mount only after the workspace grants canManage. Keep all existing loaded labels,
  row order, controls and underlying autosave/confirmation/command ownership.
- [x] Extract pending-quote-approvals.tsx with its existing rows/money labels,
  review URL callback and success-empty state. Keep the independent approval query
  scheduled alongside workspace, avoiding a new client-side access waterfall.
- [x] Add feature-local channel-read-content.tsx for actual pending/error/success
  rendering. Pending/error remains inside the owning row/section. Never display
  a pending/error read as an empty approvals list or invented default settings.
  Retry the corresponding current query only; never trigger manager reads for a
  nonmanager. A fresh workspace refusal removes all admitted management controls.
- [x] Add isolated mounted regression with real QueryClient/useQuery observers:
  blocked sibling, local failure/retry, unchanged scoped inputs, role/refusal and
  Store switch. No database/provider/command execution or new connected fixtures.
- [x] Run owned quick mapping/check, Dashboard types, H01 reuse/H02, one focused
  existing-data browser session plus canonical frozen-source local smoke. Commit
  only owned source/docs, preserve foreign staging; update Brain and conformance.

## Preserved flows and layers

Header/store picker/Connect WhatsApp, existing global sheets, typed URL state,
open/close/history, forms/autosave/revisions, mutation invalidation, business labels,
API/protected procedures/repository checks and command authority remain canonical.
All reads retain Store keys, default freshness and retry:false. Current in-flight
scope cleanup remains; no stale permission, role or business result is authority.
Use existing SettingsPage/Section/Row/Notice/Button/theme wrappers for status.

No replacement table/search/filter/columns/selection/bulk bar, new form/schema,
new sheet/content router/form context, job, dependency or domain package is required:
this surface is a settings workspace and existing sheet/form owners remain intact.
No design exploration or product layout redesign is part of this scheduling fix.
There are no material open product questions.

## Acceptance and conformance

Ready workspace/connections/team remain visible with a pending or failed optional
read. Each failure has an owner-specific retry; denied management controls never
mount. Existing success/empty states, URL callbacks, Store identity and fresh
workspace refusal are preserved. Source and browser evidence must identify their
limits; this slice does not establish full DP-104 or optimized latency acceptance.

Final conformance: feature-local components follow the inspected Midday settings
composition, with EwaTrade useQuery status handling rather than a new global
suspense boundary. Approval scheduling deliberately stays alongside workspace to
avoid a new access waterfall. Existing header/layout/loaded rows/URL hooks/global
sheets/autosave/revision commands and API/repository boundaries remain. No unexplained
contract omission. Canonical smoke is the last frozen-source gate, recorded in the
[receipt](../verification/2026-10-29-dashboard-section-loading.md) before commit.
