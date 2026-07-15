import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const MOBILE_DIR = join(REPO_ROOT, "apps/mobile")
const FILES = {
  dashboard: join(MOBILE_DIR, "src/app/dashboard.tsx"),
  firstProduct: join(
    MOBILE_DIR,
    "src/components/mobile/first-product-setup-sheet.tsx",
  ),
  store: join(MOBILE_DIR, "src/store/retailOpsStore.ts"),
}

const CONTRACTS = [
  {
    file: FILES.dashboard,
    markers: [
      "shouldPromptFirstProduct",
      "FirstProductSetupSheet",
      "setupModal.present",
      "Add item",
      "stockUnitCount",
      "inventory.stockUnitCount",
    ],
    reason:
      "dashboard must keep new-owner empty-inventory detection and first-product modal entry points",
  },
  {
    file: FILES.firstProduct,
    markers: [
      "BottomSheetKeyboardAwareScrollView",
      "SetupFlowHeader",
      "SetupInlineNotice",
      "SetupSection",
      "SetupSummaryRow",
      "StatusBanner",
      "QuantityStepper",
      'type FirstProductSetupStep = "details" | "stock"',
      "setupStep",
      "Continue to stock",
      "Add item and stock",
      "Item name",
      "Product description",
      "Enter product description",
      "description.trim().length <= 1000",
      "shared product page and link preview",
      "Primary unit",
      "Price per unit",
      "Product image link",
      "Enter product image link",
      "isProductImageUrlInput(imageUrl)",
      "Enter a valid image link.",
      "Current stock",
      "normalizeWholeNumberInput",
      "isWholeNumberInput(startingStock)",
    ],
    reason:
      "first-product setup must stay keyboard-safe and split item details from current-stock entry",
  },
  {
    file: FILES.firstProduct,
    markers: [
      "trpc.retailOps.unitTemplates",
      "LOCAL_UNIT_TEMPLATES",
      "applyUnitTemplate",
      "unitTemplateKey",
      "Sub-units or variants",
      "Add more sub-units or variants",
      "You can skip this and continue with only the primary",
      "createVariantDraft",
      "conversionMultiplier",
      "inferConversionMultiplier",
      "Variant price",
      "No variants yet",
      "You can skip this and continue with only the primary",
    ],
    reason:
      "first-product setup must keep unit templates, optional variants, manual prices, and conversion multipliers",
  },
  {
    file: FILES.firstProduct,
    markers: [
      "trpc.retailOps.createProduct",
      "shouldUseLocalQueue",
      "isLocalSessionToken",
      "addFirstProduct",
      "description: input.description",
      "imageUrl: input.imageUrl",
      "remoteId: productionProduct.product.id",
      "remoteVariantId: defaultUnit?.id",
      'syncStatus: "synced"',
      "startingStock: productInput.openingStockQuantity",
      "createProductMutation.mutate(input)",
    ],
    reason:
      "first-product setup must keep production product creation plus local/offline fallback and remote-id reconciliation",
  },
  {
    file: FILES.store,
    markers: [
      "addFirstProduct",
      "currentStock: startingStock",
      "startingStock",
      "description",
      "imageUrl",
      "stockMovements",
      'note: "Opening stock"',
      'type: "opening_stock"',
      "shouldQueueSync",
      'createSyncEvent(\n                    "product_setup"',
      "deviceId: state.offlineDeviceId",
    ],
    reason:
      "local first-product setup must create opening stock movement and queue product setup sync when pending",
  },
]
const failures = []

for (const contract of CONTRACTS) {
  const source = readFileSync(contract.file, "utf8")
  const missingMarkers = contract.markers.filter(
    (marker) => !source.includes(marker),
  )

  if (missingMarkers.length > 0) {
    failures.push({
      file: contract.file,
      message: `missing ${missingMarkers.join(", ")} (${contract.reason})`,
    })
  }
}

if (failures.length > 0) {
  console.error(
    "First-product flow check failed. Restore the empty-inventory prompt, two-step setup, unit/variant handling, production creation, or opening-stock local queue contract.",
  )

  for (const failure of failures) {
    console.error(`- ${relative(REPO_ROOT, failure.file)}: ${failure.message}`)
  }

  process.exit(1)
}

console.log("First-product flow check passed.")
