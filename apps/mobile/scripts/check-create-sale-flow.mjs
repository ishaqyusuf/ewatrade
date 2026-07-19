import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const MOBILE_DIR = join(REPO_ROOT, "apps/mobile")
const FILE = join(
  MOBILE_DIR,
  "src/components/mobile/create-sale-sheet.tsx",
)
const source = readFileSync(FILE, "utf8")
const contracts = [
  {
    markers: [
      'type CatalogItem = RouterOutputs["catalog"]["listItems"][number]',
      "item.variants.flatMap",
      "variant.offerings.flatMap",
      'offering.status !== "active"',
      'offering.pricingPolicy !== "fixed"',
      "offering.stores.some((row) => row.isAvailable)",
      "offering.productUnit?.inventoryUnitId",
      'row.kind === "shared_pool"',
      "balanceRevision",
      "configurationVersionId",
    ],
    reason:
      "the picker must flatten current Product and Service Offerings while retaining stock snapshot context",
  },
  {
    markers: [
      "trpc.catalog.listItems.queryOptions",
      "trpc.orders.create.mutationOptions",
      "expectedBalanceRevision",
      "expectedConfigurationVersionId",
      "expectedFixedPriceMinor",
      "offeringId: offering.id",
      "quantity",
      "clientOrderId",
      "schemaVersion: 1",
    ],
    reason:
      "online orders must use the generic catalog and commercial-order contracts with immutable snapshot expectations",
  },
  {
    markers: [
      "useOperationalModeStore",
      "useOfflineCommandStore",
      'kind: "commercial_order"',
      "dependencyClientIds: []",
      "eventVersion: 1",
      "The order will be provisional",
      "Queue order",
    ],
    reason:
      "offline orders must remain visibly provisional and replayable through the generic command queue",
  },
  {
    markers: [
      "Search",
      "Product or service",
      'accessibilityRole="checkbox"',
      'keyboardType="decimal-pad"',
      "Customer name",
      "customerPhone",
      "Select at least one item",
      "Confirm order",
    ],
    reason:
      "the shortest mobile order flow must support mixed items, exact quantities, optional customer details, and validation",
  },
]

const failures = contracts.flatMap((contract) => {
  const missing = contract.markers.filter((marker) => !source.includes(marker))
  return missing.length > 0
    ? [
        `missing ${missing.join(", ")} (${contract.reason})`,
      ]
    : []
})

const legacyMarkers = [
  "retailOps.createSale",
  "catalogItemVariantId",
  "currentOpenSession",
  "Rep session required",
]
const presentLegacyMarkers = legacyMarkers.filter((marker) =>
  source.includes(marker),
)
if (presentLegacyMarkers.length > 0) {
  failures.push(
    `contains legacy order markers ${presentLegacyMarkers.join(", ")}`,
  )
}

if (failures.length > 0) {
  console.error("Generic commercial-order flow check failed.")
  for (const failure of failures) {
    console.error(`- ${relative(REPO_ROOT, FILE)}: ${failure}`)
  }
  process.exit(1)
}

console.log("Generic commercial-order flow check passed.")
