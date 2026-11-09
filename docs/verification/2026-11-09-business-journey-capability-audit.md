# Business journey capability audit

9 November 2026, Africa/Lagos. Source baseline:
`7c585d5dd0526b71759affca1a23d0de4007c6cb`, main project checkout. Read-only
source/document audit; no runtime, device, database or provider test performed.
Historical records below retain their original target and limitations.

[Four-business specification](../plans/2026-11-09-four-business-launch-acceptance-spec.md)
and [initial launch register](2026-11-09-business-journey-launch-register.csv).

## How to interpret the findings

**Foundation** means relevant implementation exists, not launch acceptance.
**Partial** means the described journey exceeds the implemented boundary.
**Missing** means no implementation of the requested capability was found in the
inspected relevant domains. **Unverified** means there is a plausible foundation
but insufficient positive target/channel evidence. No production settings were
read; source rollout labels do not establish current live configuration.

## Existing journeys for the first two businesses

- **Jawdah has an explicit storefront end-to-end spec** and local receipts:
  images/catalog → four-crate customer request → merchant review/notification →
  delivery charge → payment. The remaining image/service/phone checks were
  recorded 3/3 locally, with synthetic QA media and separate release limitations.
  See [spec](../plans/jawdah-storefront-end-to-end-spec.md),
  [payment flow](2026-10-28-jawdah-storefront-flow.md) and
  [remaining local checks](2026-10-28-jawdah-remaining-checks.md).
- **Jawdah's broader poultry operation is documented separately**, including
  birds, egg/crate stock, collections, mortality, staff and money-first sales.
  It is not one wholly accepted launch run. The repeat record explicitly has
  unfinished steps; money-first 8/8 was a web/backend slice with Demo QA data, not
  native/live Jawdah acceptance. Local Brain sources:
  `.brain/qa/2026-10-01-jawdah-poultry.md`,
  `.brain/qa/2026-10-03-jawdah-poultry-repeat.md`,
  `.brain/qa/2026-10-13-jawdah-money-first-onboarding-qa.md`.
- **Laundry has detailed implemented journey pieces**, not a single accepted
  cross-channel launch journey. Native assistant intake/durable Created/Open job,
  garment choices, service status/history, and completion independent of payment
  are documented. WhatsApp laundry preparation/intake/work writes remain
  unaccepted. Local Brain sources:
  `.brain/features/assistant-laundry-job-drafts.md`,
  `.brain/qa/2026-10-23-assistant-laundry-example.md`,
  `.brain/qa/2026-10-23-service-status-and-created-card.md`,
  `.brain/qa/2026-10-23-service-unpaid-completion.md`.

The new spec consolidates the complete intended first two journeys and adds the
retail cases. It preserves earlier evidence instead of changing historical results.

## Source-backed capability map

Paths below are relative to the repository root; Brain paths are local memory.

| Requested behavior | Finding | Inspected evidence and exact limit |
| --- | --- | --- |
| Business/Store, catalog, prices and stock | Foundation | Catalog/Inventory/Orders and existing poultry/laundry records support these domains. Current merchant plan/role/runtime must still qualify. |
| Categories, sizes, variants, brand/compatibility facts | Foundation / unverified business fit | `packages/assistant/src/general/product-create.ts`, `packages/assistant/src/setup/contracts.ts`, `packages/assistant/src/product/contracts.ts`, and catalog forms retain options, sparse variants, prices, units and code fields. No Hypnos/Alhaq operating pass exists. Brand/compatibility must use actual merchant facts. |
| Curated/reviewed 50-product setup | Partial | Generic setup helpers/preparation exist. `SETUP_DRAFT_MAX_ENTITIES=200` is a draft bound, not proof of 50 saved Products proof. Product-mode keys are `product`, `product-2`, `product-3`; no evidence of a completed 50-item photo/variant WhatsApp setup or supplied real catalog data. |
| Product photos and text on WhatsApp | Partial | `packages/assistant/src/channels/media.ts` and `workflow.ts` support media/draft preparation; app Catalog has uploaded-photo authority. `simpleProduct` rejects photo/options/variant/pack records for chat-ready save. Media ingress is not a complete product-photo save pipeline. |
| Rich product review/save entirely in WhatsApp | Missing within current native boundary | `apps/api/src/assistant/channel-proposal-review.ts` only permits simple product native review and rejects photos/illustrations; `packages/assistant/src/channels/flows/definitions.ts` says packs, variants and photos continue in the app. Existing preparation/app review must be extended, not bypassed. |
| Multiple-product batch and recovery | Partial | Existing three-product WhatsApp workflow and saved draft controls are present (`setup/contracts.ts`, `channels/workflow-action-review.ts`, `channels/workflow.ts`). 50 Products may use multiple batches, but resumable complete business acceptance is absent. No new 50-per-message requirement is assumed. |
| Final saved Product link | Partial / unverified | `packages/assistant/src/channels/render.ts` uses scoped record links; `workflow-action-result.ts` links the original saved workflow. Existing `channel-product-confirmation.integration.test.ts` covers simple product creation/read targets. This does not prove rich batch results contain individual exact Product links or installed-app routing. |
| Open exact record in installed app or dashboard | Unverified | Scoped Catalog read targets and dashboard navigation exist (`general/read-record-target.ts`, channel rendering). No actual saved-product WhatsApp → installed-app/fallback evidence was found for these businesses. Preserve normal authentication/scope. |
| Optional barcode/SKU storage | Foundation | `packages/db/prisma/models/catalog.prisma` stores optional SKU/barcode on ProductUnitOffering with per-Tenant uniqueness. Code identity is exact offering/unit, not just a product name. Leading-zero string checks exist. |
| Camera/photo code capture while editing a product | Foundation / device proof separate | `apps/mobile/src/components/mobile/barcode-field.tsx`, `barcode-camera-screen.tsx`, `apps/mobile/src/lib/barcode-scan.ts` and tests. Call sites are catalog setup and assistant variant editors. Capture support must not be called scan-to-sale. |
| QR recognition | Missing in current camera allowlist | `barcode-camera-screen.tsx` lists EAN/UPC/Code128/Code39/Code93/ITF14/Codabar, but not `qr`. An arbitrary code string field is not QR decoding. Add supported QR recognition and safe payload mapping as part of the identification journey. |
| Scan code during sale to select exact Product/variant | Missing integrated journey | Inspected barcode camera/field call sites do not wire into sale entry. Code snapshots on saved Order lines do not implement lookup. Requires scoped exact-code resolution and sale-entry integration, plus unknown/ambiguous/manual recovery. |
| Named shipment with expected items and progress | Missing | Relevant Prisma models have supplier bills/purchase recognition and Inventory receipts, but no named incoming-shipment aggregate/workflow was found. Purchase/receipt primitives are reusable foundations. |
| Foreign purchase prices and shipment rates to NGN | Missing | `.brain/features/currency-inputs.md` explicitly states no exchange conversion; relevant Finance models use a Book currency and do not supply shipment FX facts/rates. `domains.prisma` exchangeRate fields concern domain-registration quotes, not imported goods. CNY import support is not established by a currency symbol fallback. |
| Shared shipping-cost allocation and item landed totals | Missing | Existing Inventory costs and Finance supplier purchase/recognition sources have no inspected shipment-wide freight apportionment workflow. Existing valuation must remain authoritative. |
| Edit landed costs and future selling prices | Partial | Catalog revisioned price updates/history and source-owned cost mechanisms exist; no shipment calculation/override review integrates them. Do not describe this as absent price editing generally. Local Brain: `features/generic-catalog-inventory-units-stock-operations.md`. |
| Inbound arrival updates stock once | Partial | Canonical Inventory receive and supplier recognition support stock/cost effects, replay and ownership. `finance-purchase-recognition.prisma` separates invoice/ownership/receipt. No named shipment partial-arrival orchestration. WhatsApp stock Flow explicitly continues in app and creates no purchase/payment. |
| Full shipment lifecycle entirely through WhatsApp | Missing | `stock_receive` Flow is app continuation. Capability manifest has supplier purchase registration/recognition as source `app_review`; that is not native shipment creation/cost allocation/receipt. |
| Product share from a published site | Foundation / host preference partial | `apps/api/src/catalog/product-share.ts` validates current published release/runtime/public projection. `packages/db/src/queries/catalog-product-share.ts` builds the tenant platform subdomain and loads its live Site. Dashboard share is documented; native share was outside that delivery. Preference for a merchant's verified alternate/custom host is not proved. |
| Share a product with no generated/published site, then browse that business | Missing | Current productShare requires a real Site/active release and eligible LIVE public projection. The older apex-path proposal in `.brain/features/product-sharing-public-storefront.md` is expressly a proposal, not canonical current routing. No-site fallback cannot be claimed from existing generated business subdomains. |
| Central order/payment links independent of site | Foundation / full dual-mode unverified | Public receipt/request/token routes and canonical payment links exist; Jawdah proves a local payment journey. No new no-site retail journey has passed. Requested domain/path and compatibility must be resolved without renaming the platform. |
| Website and customer-bot orders, merchant notifications | Foundation / channels partial | Storefront request/confirmation/notification domain and Jawdah flow exist. Merchant WhatsApp assistant and customer-owned business channels have separate routing/authority. Website proof does not prove all customer-bot paths or real notification delivery. |
| Customer follow-up, payment and WhatsApp sales | Foundation / scoped gaps | Simple-sale native review, payment links and canonical Orders exist. Finance purchase/stock and manual-payment review include app/form-only boundaries in capability inventory/manifest. No source supports “everything on WhatsApp”; supplied evidence never authorizes money/provider effects automatically. |
| Records/history in dashboard/mobile | Foundation / unverified four-business reconciliation | Order snapshots, stock ledger, cost/price history, jobs and assistant durable receipts exist. No complete four-business target-bound acceptance run is recorded by this audit. |

## What actually needs work

1. **Rich/resumable WhatsApp catalog setup**: photo/variant products,50-item
   completion, exact saved-product results and safe correction/retry.
2. **Shipment management**: named consignments, expected items, partial arrivals
   and links to canonical purchase/receipt/cost records.
3. **Shipment FX and landed costing**: source currency/rates, freight allocation,
   exact reconciled totals and reviewed overrides distinct from selling prices.
4. **QR recognition and scan-to-sale**: add QR decoding and connect code capture
   to exact scoped offering lookup and sale selection; code fields and the current
   one-dimensional barcode scanner alone do not finish this journey.
5. **No-site public product/business catalog**: explicit public eligibility,
   browse other products, safe requests and central order/payment links.
6. **Correct link destinations**: eligible business-site host preference, exact
   product result links and tested native/web fallback. Existing dashboard links
   are useful partial support.
7. **WhatsApp channel completion**: shipments and laundry work currently have
   app-only/planned boundaries. Review and extend canonical capabilities with
   permissions, confirmations and exact design cases before claiming parity.
8. **Operating proof**: merchant notifications, customer-bot/website requests,
   payment, stock and histories need case-specific target/channel evidence.
   This is a verification gap wherever the underlying behavior already exists.

## Audit validation and documentation impact

- Offline `bun run qa:doctor --offline`: PASS for selected-profile database
  isolation and dependency/generated-client presence; runtime deliberately skipped.
- `bun run test:quick --plan` inspected before writing and again for the three
  owned document/register paths: core only, zero unsupported mappings.
- One focused documentation smoke over those three explicit paths: **51 tests
  passed, 254 assertions**, QA tooling types passed. This narrower scope certifies
  tooling/source smoke only, not business behavior, UI or release acceptance.
- Document/register consistency passed: 72 unique cases, 12/12/24/24 business split,
  initial statuses/evidence, matching requirement IDs, local Markdown links, all
  to-spec sections and no implementation file paths in Implementation Decisions.
- No business flows executed, new fixtures, live services started or provider
  requests made. Source/document reading is not runtime acceptance.
- Local Brain feature/index/task records point to the tracked spec and preserve
  planning versus launch status. Brain is ignored/local-only by repository policy;
  it must not be force-added. No API/database docs or ADR change is needed:
  this is requirements planning and source reconciliation, not an adopted runtime
  architecture, schema, permission or contract change.
