import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const MOBILE_DIR = join(REPO_ROOT, "apps/mobile")
const FILE = join(MOBILE_DIR, "src/components/mobile/create-sale-sheet.tsx")
const source = readFileSync(FILE, "utf8")
const customerSheetSource = readFileSync(
  join(MOBILE_DIR, "src/components/mobile/create-sale-customer-sheet.tsx"),
  "utf8",
)
const checkoutModelSource = readFileSync(
  join(MOBILE_DIR, "src/components/mobile/sale-checkout-model.ts"),
  "utf8",
)
const pickerSource = readFileSync(
  join(MOBILE_DIR, "src/components/mobile/sale-item-picker.tsx"),
  "utf8",
)
const pickerModelSource = readFileSync(
  join(MOBILE_DIR, "src/components/mobile/sale-item-picker-model.ts"),
  "utf8",
)
const completeSource = [
  source,
  customerSheetSource,
  checkoutModelSource,
  pickerSource,
  pickerModelSource,
].join("\n")
const contracts = [
  {
    markers: [
      'type CatalogItem = RouterOutputs["catalog"]["listItems"][number]',
      "item.variants.flatMap",
      "variant.offerings.flatMap",
      'offering.status !== "active"',
      'offering.pricingPolicy !== "fixed"',
      "row.storeId === storeId && row.isAvailable",
      "row.storeId === storeId",
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
      "trpc.catalog.listItemsPage.infiniteQueryOptions",
      "trpc.tenant.featureAvailability.queryOptions",
      "trpc.orders.create.mutationOptions",
      "trpc.orders.recordPayment.mutationOptions",
      "expectedBalanceRevision",
      "expectedConfigurationVersionId",
      "expectedFixedPriceMinor",
      "offeringId: offering.id",
      "quantity",
      "clientOrderId",
      "clientPaymentId",
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
      'type SaleStep = "customer" | "items" | "review"',
      "Step {current} of 3",
      "FlatList",
      "BottomSearchFooter",
      "No items added yet",
      "sale-add-item-fab",
      "CompactSaleItemPicker",
      "FullScreenSaleItemPicker",
      "SALE_ITEM_PICKER_COMPACT_LIMIT = 5",
      "getSaleItemPickerPresentation",
      "commitSaleItemPickerDraft",
      "Search product or service",
      "alwaysShowSearch",
      "focusedQuantityId",
      'layout="inline"',
      "selectedChoices.length",
      "onRemove(choice.id)",
      "draft[item.id] ? onRemove(item.id) : onAdd(item)",
      "onEndReachedThreshold={0.35}",
      "catalog.fetchNextPage()",
      "!isOffline &&",
      "recentOrders.fetchNextPage()",
      "Line total",
      'containerClassName="w-20"',
      'accessibilityRole="checkbox"',
      'keyboardType="decimal-pad"',
      "Create customer",
      "Skip · Continue as guest",
      "Search customer, phone, or email",
      "Amount received",
      "All amount paid",
      "minorToMajorInput(totalMinor)",
      "Balance due",
      "paymentSummary.receivedMinor",
      "Select at least one item",
      "Confirm sale",
    ],
    reason:
      "the staged mobile order flow must support bottom-search selection, compact quantities, customer choice, review, and partial payment",
  },
]

const failures = contracts.flatMap((contract) => {
  const missing = contract.markers.filter(
    (marker) => !completeSource.includes(marker),
  )
  return missing.length > 0
    ? [`missing ${missing.join(", ")} (${contract.reason})`]
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
