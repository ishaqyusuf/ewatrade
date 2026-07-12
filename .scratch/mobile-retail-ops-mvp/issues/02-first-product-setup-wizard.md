# 02 — First Product Setup Wizard

**What to build:** a newly verified owner with no sellable inventory is guided through a short first-product setup flow that captures product name, primary unit, primary unit price, optional variants, and starting stock. The flow should use production APIs when online and fall back to the local queued setup path only when offline or production is unavailable.

**Blocked by:** 01 — Owner Signup, OTP, And Business Entry.

**Status:** implementation-complete

- [x] New owner entry detects when the active business has no sellable product or inventory setup.
- [x] The first-product modal or wizard collects product name, main unit name, main unit price, optional sub-units or variants, and per-unit prices.
- [x] Starting stock is captured after product units are defined and becomes an auditable stock movement.
- [x] Online completion persists product, units, price snapshots, and starting stock through production APIs.
- [x] Offline or unavailable completion queues the product setup with idempotency data for later sync.
- [x] Unit suggestions can use production templates online while keeping simple local defaults offline.

## Progress

- Protected product setup and catalog-price APIs now live in `apps/api/src/trpc/routers/retail-ops-products.ts` and are merged back into the stable `retailOps.*` namespace. `retailOps.unitTemplates`, `retailOps.createProduct`, `retailOps.productUnitPriceAt`, `retailOps.priceHistory`, and `retailOps.updateProductUnitPrice` keep their mobile procedure names while no longer living inside the larger core Retail Ops router. `bun run --cwd apps/mobile qa:first-product-flow`, `bun run --cwd apps/mobile qa:retail-ops-api-boundary`, `bun --filter @ewatrade/api typecheck`, `bun --cwd apps/mobile tsc --noEmit --pretty false`, `bun run --cwd apps/mobile qa:mvp-source`, and `bun run --cwd apps/mobile qa:mvp-contracts` passed.
- Added an optional compact product description field to first-product setup so the first shared product page and WhatsApp/social metadata can use real product copy instead of only generic fallback text. The description stays optional, uses prompt-style placeholder copy, is bounded to the API's 1,000-character limit, passes through production `retailOps.createProduct`, persists in local fallback product state, and replays through queued offline `product_setup` sync. `bun test apps/api/src/schemas/retail-ops.test.ts apps/mobile/src/lib/retail-ops-sync.test.ts apps/mobile/src/store/retailOpsStore.test.ts`, `bun run --cwd apps/mobile qa:first-product-flow`, `bun --cwd apps/mobile tsc --noEmit --pretty false`, `bun --filter @ewatrade/api typecheck`, `bun --filter @ewatrade/db typecheck`, `bun run --cwd apps/mobile qa:mvp-source`, and `bun run --cwd apps/mobile qa:mvp-contracts` passed.
- Added a compact unit-template selector to the first-product sheet that reads `retailOps.unitTemplates` online and falls back to local bag/kilogram presets offline or when production templates are unavailable.
- Selecting a template pre-fills the primary unit and common sub-units while leaving prices manual, then sends `unitTemplateKey` to `retailOps.createProduct`.
- Updated variant conversion copy to match the backend fractional multiplier contract, such as half bag `0.5` and quarter bag `0.25`.
- Split first-product onboarding into a two-step sheet: item details, primary unit, price, and optional variants are entered first, then the owner continues to a dedicated current-stock step. This keeps the setup lighter while preserving the same production and local queued payloads.
- Added a dashboard entry trigger that opens the first-product setup sheet once per active empty business, using production summary stock-unit count when online and local empty-inventory state when offline or production reads fail.
- Added focused DB query coverage for production first-product setup. `packages/db/src/queries/retail-ops-products.test.ts` proves `createRetailOpsProduct` creates the product with normalized metadata and fallback unit-template context, creates primary and variant units with conversion ratios for bag, half bag, and quarter bag, creates inventory items with opening stock, writes durable opening-stock ledger movements for each unit, and persists durable product setup price-history rows after the transaction.
- Extended focused product DB query coverage for the first-product read side. `packages/db/src/queries/retail-ops-products.test.ts` now proves unit template listing merges durable tenant/system templates over fallback defaults while keeping one template per key, and unit price-history listing merges durable rows with metadata fallback rows through the product-variant metadata path.
- Extended API boundary coverage for product unit pricing. `apps/api/src/schemas/retail-ops.test.ts` now proves effective-price reads, price-history filters, and unit price updates normalize safe mobile payloads and reject unsafe ids, prices, and limits; the Retail Ops API boundary guard now protects `productUnitPriceAt`, `priceHistory`, and `unitTemplates` tRPC procedures plus their focused query-module delegates.
- Live Expo/database validation remains pending outside this scoped implementation pass.
