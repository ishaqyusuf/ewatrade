# Subscription benefit alignment — Workshop first, 9 November 2026

The owner requested app benefits aligned with marketing: Free public storefront10,
Starter full catalog, and complete benefit details for each plan, with Workshop
updated first. This is stage1 of2; runtime/app alignment awaits exact revision
review. No app/backend/billing-catalog/product-database/provider/release change is made here.

[Review Owner ledger a/v10](https://workshop.localhost/ewatrade/legacy/mobile-ui-audit/android-2026-08-24/business-subscription/directions/a?rev=bf06b0f6-f10d-4b8f-b485-ac344a770751).
Exact revision: `bf06b0f6-f10d-4b8f-b485-ac344a770751`.

## Preserved baseline and history

The existing implemented a/v9 `e33d8ec7-faa5-453c-a84b-f72d9ca5fb00`
and its source commit `e047ed676` are the baseline. Same direction key, Workshop,
project and permanent path. The upper current-plan/vertical Usage renderer is
byte-identical; the base CSS is unchanged. Changes begin below Owner subscriptions.
All53 financial states and all15 scenario mappings remain. Alternatives b/c and
historical d are untouched. Catalog confirms every prior revision preserved,
selectedRevisionId still v9, implementationCount1. New v10 is not selected or
implemented; the old implementation receipt does not approve its new benefits.

## Proposed benefits

| Plan | Catalog items | Public storefront | Owner allowance | Team | Orders/month |
| --- | --- | --- | --- | --- | --- |
| Free | 10 | Up to10 published items | 1 business | Owner only | 50 |
| Starter | 100 | Full published catalog, up to100 items | 1 business | Owner +2 staff | Unlimited |
| Growth | 1,000 | Full published catalog, up to1,000 items | 3 businesses | Owner +10 staff | Unlimited |
| Pro | Unlimited | Full published catalog | 10 businesses | Owner +50 staff | Unlimited |

“Full catalog” removes the separate storefront cap; it does not turn Starter's
100-item catalog allowance into unlimited inventory. Products, services and drafts
count toward catalog capacity; storefronts display the items the owner publishes.
Allowances are per covered business, with the business cap belonging to the owner.

An independent **Compare all benefits** disclosure opens four read-only tabs:
Free, Starter, Growth and Pro. The floating config panel exposes the same four
views. Free is not a fourth paid checkout offer. Selecting benefits never changes
current plan, ownership, purchase state or coverage. Expanded benefits and monthly
offers are independent, and Reset clears both.

All plans explicitly show sales/orders/stock/customer balances, simple received-
money sales and monthly assistant questions/drafts without inventing a numeric
assistant quota. Every paid plan explicitly repeats inherited invoices/finance,
expenses/suppliers, staff roles, photos/videos/documents, advanced reports and
order reminder emails. Growth/Pro explicitly include customer messages.

Device allowances1/1/5/20, report history30/30/180/730days and
Community/Standard/Priority/Dedicated support are shown. Offline sales retains
**Coming soon**, matching marketing's public availability wording. No native
lifecycle or release acceptance is inferred from that allowance. Monthly store
sample prices and missing-disclosure gates remain unchanged.

Sources: `apps/marketing/src/lib/marketing-offers.ts`, the global assistant note
in `pricing-v15.tsx`, current `apps/mobile/src/lib/retail-ops-subscription.ts` for
history/device/support, and the owner's explicit storefront correction. Preview
bundles `benefits.json`, `coverage.json` and `author-notes.md`. Current source
catalog caps remain3/3 until a later approved app/catalog implementation.

## Verification

- Offline QA doctor passed; source smoke plan scoped to this documentation receipt.
- Canonical shared Workshop rendered with normal certificate validation. No new
  server, product route, account login, API/model/payment call, fixture DB write,
  provider configuration or deployment.
- Published v10 passed116 browser assertions with zero script errors and zero
  external requests. Assertions include all53 financial states, complete features
  and capacities across four views, keyboard tab navigation, panel synchronization,
  reset, cancel/no grant, awaiting verification, explicit enrollment, independent
  paid-offer/benefit views, staff/offline safety, theme, compact size,
  collapse/reopen and screen navigation retaining preferences. This is simulated
  preview evidence, not native/store acceptance or measured feature-test coverage.
- Source comparison confirms identical upper renderer and preserved base CSS;
  browser comparison confirms identical Free upper markup to v9.
- Local evidence: `/private/tmp/billing-benefits-verification.json` and
  `/private/tmp/billing-benefits-{free,starter,growth,pro}.png`.
- First browser attempts exposed test timing/case assumptions: the shared panel
  synchronizes on animation frames and Preview only is visually uppercase. Tests
  were corrected; no product/source behavior was changed to manufacture a pass.

## Provenance, next stage and Brain

Actual author: Codex continuing the established Workshop fallback. The safely
bounded exact Opus5.5/high CLI path has no API-key authentication in this session.
No new model launch, broad filesystem grant, rejected-launch retry or private
payment evidence transfer was attempted. No Opus output is claimed.

Stage1 Workshop ready; stage2 app alignment remains pending review of exact v10.
The Workshop skill requires: “Before applying a choice, record the accepted exact
revision”. Prior v9 approval is preserved and does not select v10. After review,
app work must align both canonical plan definitions and the native mirror, complete
native benefit copy, and verify storefront cap behavior and existing billing gates.
Selection will not authorize provider activation or deployment.

Local-only Brain records: `.brain/features/mobile-owner-ledger.md`,
`.brain/decisions/2026-11-09-subscription-marketing-benefits-alignment.md`, and
`.brain/tasks/subscription-benefits-alignment-2026-11-09.md`. Assistant authority
and all API/schema/domain commands are unchanged at this preview stage. Runtime
entitlement and native implementation work remains unstarted for the new revision.

Documentation-only fast smoke passed:51tests/254assertions across4files, with QA
tooling types and no applicable Biome files. Scope is this owned receipt; no app
acceptance is implied. Source/runtime acceptance remains separate.
