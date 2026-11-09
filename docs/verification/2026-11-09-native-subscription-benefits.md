# Approved native subscription benefits — 9 November 2026

Owner explicitly approved implementation of Workshop `a/v19`,
`b2ed7e07-6eed-4cd9-841d-f56524a0bee9`, including all benefits and scenarios while
preserving Current plan and Usage. Exact selection was recorded before editing.
Canonical review/history:
https://workshop.localhost/ewatrade/legacy/mobile-ui-audit/android-2026-08-24/business-subscription

## Implementation

- Relevant higher-tier pills, one selected package summary and complete grouped
  benefits replace the redundant owner-subscription card and expandable fragments.
  Free compares Starter/Growth/Pro; Starter compares Growth/Pro; Growth has a fixed
  Pro target; Pro retains its complete current benefits. Unknown stays unknown.
- The actual existing Midnight theme and native icons/primitives are retained.
  The legacy Workshop sample is green; no global palette was reverted. Body16/22,
  supporting14/20, primary50 and44minimum touch targets retain system scaling.
- Full-screen action uses the existing BottomSearchFooter action bar and safe-area
  owner, appears after reaching the lower section, and disappears behind settings
  and financial feedback. The sheet entry retains its existing keyboard/scroll
  owner and places the same action at its content tail.
- Subscription settings owns Restore, original-store management, policy links and
  move-plan maintenance. Removing a plan requires explicit confirmation that this
  business returns to Free, records/staff remain and store renewal continues.
  Purchase and explicit business activation remain separate. Paid owners manage
  their store subscription; a refreshed owner plan also blocks stale checkout.
- Restore/coverage return structured outcomes. A settled callback alone cannot
  show success: verification/finalization/refresh and fresh same-scope coverage
  postconditions are required. Timers and results retire on account/business/cache
  change. Auto-close, Done and gesture dismissal complete verified results once;
  parent refresh/top also checks lifetime before and after the request.
- Both canonical and Expo plan catalogs now give Free10 published storefront items
  and Starter the full published catalog within its100-item catalog capacity.
  Growth/Pro remain full catalog. Existing server plan normalization already uses
  canonical storefront limits, so stale persisted3-item values cannot override
  them. Public eligibility/publication, quotas and tenant permissions stay with
  existing server queries; no query/schema/permission rewrite was made here.
- All capacity and feature leaves remain explicit: businesses, catalog items,
  orders, staff, storefront, offline devices marked Coming soon, history/support;
  sales/orders/stock/customer balances, received-money sales, monthly assistant
  questions/drafts without a fabricated quota, invoices/finance, expenses/suppliers,
  staff roles, media, reports, reminders and Growth/Pro customer messages. Settings
  clarifies products/services/drafts, published-only storefront, shared business
  allowance and per-business limits.

Current-plan/Usage JSX and UsageRow source compare byte-identical with the incoming
checkout. The route, hero, counters and Usage styles were not redesigned.

## Author and review

Required exact `claude-opus-5-5 --effort high` launch returned an exhausted5-hour
usage limit before authoring. The isolated restricted/tool-free run exited1 and
made no project edits. Codex took over immediately under the owner/Workshop fallback
rule; this native implementation is Codex-authored, not attributed to Claude.

Fresh shipped Impeccable finish reviewer found two issues: success gesture dismissal
could skip the parent refresh, and a bounded error fixture supplied a contradictory
success message. Both were fixed in one batch and all twelve same-path captures
recaptured. Verdict pass scored both **resolved**, with three regression checks
clear and disposition **ship**, scoped to DOM-adapted native JSX evidence. This is
not whole-device/store approval. Shipped documenter checked source/current theme/
pinned preservation and captures read-only; preserved DESIGN.md and reported its
pre-existing teal/Green Till prose drift from current Midnight source. No sidecar
or new global design system was invented. Native code has no HTML detector verdict.

## Verification and limits

- `qa:doctor --offline`: pass. Existing Metro responds; local API database/QA
  readiness failed. No service restart, fixture creation, sale/payment or connected
  smoke was performed to manufacture acceptance. Existing-data `qa:smoke` cannot
  qualify without API readiness and an explicitly assigned native target.
- Focused final nine-file suite:74 outer tests374assertions, including complete
  plan truth, mirror equality, store disclosures/reconciliation, quota snapshots
  and public storefront pin/projection policy. Outer fixture tests also execute
  isolated28native,29iOS,11panel and4legacy-coverage tests plus disabled-scope proof.
  Added checks cover stale owner checkout, no-op coverage, verified finalization/
  refresh, unexpected Restore enrollment changes and serialized Restore calls.
- Actual native JSX/hook in isolated ReactDOM with bounded DOM/native/provider
  adapters:97 checks across all53 named Workshop scenario inputs, zero script
  errors. Tests include higher-only choices, tab/no purchase, unknown/read-only/
  unavailable/legal gates, explicit activation, confirm/cancel, error/no success,
  scoped late result, protected footer and success completion exactly once. This
  is interaction/source evidence, not a signed-device, live receipt or provider test.
- Full mobile TypeScript was attempted. Final owned source has no diagnostics;
  full pass remains blocked by peer-owned `platform-business-catalog.ts` and
  `public-storefront.ts` generated-Prisma field/type errors. Those concurrent
  schema/query files were preserved. Initial owned icon/scroll-ref type issues
  were corrected; no checks or hooks were bypassed.
- Subscription-flow guard updated for the new hook and concise Manage label; passes.
- H01 regeneration attempted with APP_ENV=local; blocked by10 unclassified
  peer-owned finance.shipments procedures. It failed before writing the snapshot.
  This change adds no API procedure or assistant tool. The reviewed impact record
  states existing catalog quota authority and billing's form-only exclusion.
- Scoped fast smoke passed285tests1818assertions plus QA tooling types and Biome;
  plan had no unmapped paths. The official H02 evaluator passed for the explicit
  owned paths using the reviewed impact record and unchanged coverage snapshot.
  Global H02 remains blocked by the peer schema documentation decision; it was
  not silenced by pretending this subscription change owned that schema.
- Source smoke exposed old capped-Starter test assumptions. The owned existing
  first-N test now uses actual Free10 with an11th hidden item; explicit canonical
  Free/Starter pinned-item tests verify Free's cutoff and Starter's full catalog.
  The peer's appended platform-listed test uses Free for its capped-plan setup in
  the working tree; its entire appended definition remains outside our commit.
  Both the final focused and quick suites include that concurrent test as present.
- A temporary Git index over HEAD stages exact owned files and only our existing
  shared-test patch. It excludes the peer's appended test and preserves the real
  shared index. This avoids committing mixed ownership through a whole-file
  `--only` commit. Proposed cached paths/diff are inspected before commit.

All native/render checks are local source acceptance. No app build/upload, OTA,
provider configuration, live payment, deployment, push or merge was authorized.

## Brain and ownership

Updated ignored local memory: `.brain/features/mobile-owner-ledger.md`,
`.brain/tasks/subscription-benefits-alignment-2026-11-09.md`, `.brain/api/contracts.md`
and `.brain/decisions/2026-11-09-subscription-published-catalog-alignment.md`.
Assistant billing remains form-only, existing catalog operations retain server
permission/capacity/publication admission. No prompt can grant a plan.

Current main checkout retained. Finance/shipment/platform-public-catalog changes
belong to peers. Shared AGENT_CHAT append history is preserved and excluded from
this task's exact-path code commit; no peer-staged changes are included.
