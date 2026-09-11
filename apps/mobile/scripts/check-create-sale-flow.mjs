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
const customerBookSource = readFileSync(
  join(MOBILE_DIR, "src/components/mobile/customer-book-sheet.tsx"),
  "utf8",
)
const modalSource = readFileSync(
  join(MOBILE_DIR, "src/components/ui/modal.tsx"),
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
const offlineOrderSource = readFileSync(
  join(MOBILE_DIR, "src/lib/offline-order.ts"),
  "utf8",
)
const completeSource = [
  source,
  customerSheetSource,
  customerBookSource,
  modalSource,
  checkoutModelSource,
  pickerSource,
  pickerModelSource,
  offlineOrderSource,
].join("\n")
const contracts = [
  {
    markers: [
      "getCreateCustomerSheetMaxHeight(height)",
      "CREATE_CUSTOMER_SHEET_SNAP_POINTS",
      'keyboardBehavior="extend"',
      "isCreateCustomerSaveDisabled",
      "hasCreateCustomerDraft",
      "enablePanDownToClose={!hasDraft}",
      "<AppBottomSheetBackdrop",
      "dismissible={!hasDraft}",
      "Optional contact",
      'leadingIcon="User"',
      'leadingIcon="Phone"',
      'leadingIcon="Mail"',
      "CUSTOMER_SHEET_PRESENT_DELAY_MS",
      "createCustomerModal.present,",
      "customerModal.present,",
      "fill={colors.mutedForeground}",
    ],
    reason:
      "the compact customer form must distinguish required and optional details, cap its sheet, disable invalid saves, and avoid trigger touch-through",
  },
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
      "initialPayment:",
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
      "setCompactPickerVisible(true)",
      "visible={compactPickerVisible}",
      "hasUnloadedChoices: Boolean(catalog.hasNextPage)",
      "FullScreenSaleItemPicker",
      "SALE_ITEM_PICKER_COMPACT_LIMIT = 5",
      "getSaleItemPickerPresentation",
      "openSaleItemPicker",
      "addSaleItemPickerLine",
      "removeSaleItemPickerLine",
      "Search product or service",
      "alwaysShowSearch",
      "focusedQuantityId",
      'layout="inline"',
      "lineCountsByOfferingId",
      "Add another",
      "onRemove(line.id)",
      "onPress={() => onAdd(item)}",
      "onEndReachedThreshold={0.35}",
      "catalog.fetchNextPage()",
      "!isOffline &&",
      "recentOrders.fetchNextPage()",
      "Line total",
      'className="w-20 gap-1"',
      'accessibilityRole="button"',
      'keyboardType="decimal-pad"',
      "Create customer",
      "Skip · Continue as guest",
      "paddingHorizontal: 8",
      'className="px-2"',
      "active:bg-accent",
      "Search customer, phone, or email",
      "Amount received",
      "All amount paid",
      "minorToMajorInput(totalMinor)",
      "Balance due",
      '<View className="gap-5 px-4 pb-36">',
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

const compactPickerStart = pickerSource.indexOf(
  "export function CompactSaleItemPicker",
)
const fullScreenPickerStart = pickerSource.indexOf(
  "export function FullScreenSaleItemPicker",
)
const compactPickerSource = pickerSource.slice(
  compactPickerStart,
  fullScreenPickerStart,
)
for (const marker of [
  "<NativeModal",
  "onRequestClose={onClose}",
  "transparent",
  "visible={visible}",
]) {
  if (!compactPickerSource.includes(marker)) {
    failures.push(
      `compact item picker is missing native-overlay marker ${marker}`,
    )
  }
}
if (compactPickerSource.includes("BottomSheetModal")) {
  failures.push(
    "compact item picker must not use a root-portaled bottom sheet inside the native order route",
  )
}

const legacyMarkers = [
  "compactItemModal.present",
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

if (source.includes("contentContainerClassName=")) {
  failures.push(
    "checkout spacing must use a NativeWind-interoped inner View instead of an unsupported KeyboardAwareScrollView contentContainerClassName",
  )
}

for (const marker of [
  'snapPoints={["72%"]}',
  "maxDynamicContentSize={620}",
  "paddingBottom: 220",
  "Customer details",
]) {
  if (customerSheetSource.includes(marker)) {
    failures.push(
      `customer sheet still contains oversized legacy marker ${marker}`,
    )
  }
}

for (const marker of [
  "createCustomerModal.present()",
  "customerModal.present()",
]) {
  if (completeSource.includes(marker)) {
    failures.push(
      `customer sheet launch must be deferred instead of calling ${marker}`,
    )
  }
}

if (failures.length > 0) {
  console.error("Generic commercial-order flow check failed.")
  for (const failure of failures) {
    console.error(`- ${relative(REPO_ROOT, FILE)}: ${failure}`)
  }
  process.exit(1)
}

console.log("Generic commercial-order flow check passed.")
