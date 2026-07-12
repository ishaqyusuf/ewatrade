import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const MOBILE_DIR = join(REPO_ROOT, "apps/mobile")
const FILES = {
  createSale: join(MOBILE_DIR, "src/components/mobile/create-sale-sheet.tsx"),
  quantityStepper: join(
    MOBILE_DIR,
    "src/components/mobile/quantity-stepper.tsx",
  ),
}

const CONTRACTS = [
  {
    file: FILES.createSale,
    markers: [
      "BottomSheetSectionList",
      "ProductSectionHeader",
      "getSellableItems",
      "product.variants.map",
      "return [primaryItem]",
      "SellableOption",
      "disabled={isOutOfStock}",
      "QuantityStepper",
      "formatMoney(total",
    ],
    reason:
      "create sale must keep virtualized product rows, display-only product headers, variant/base-unit selection, stock disabling, quantity entry, and total preview",
  },
  {
    file: FILES.createSale,
    markers: [
      "PaymentOption",
      'setPaymentMethod("cash")',
      'setPaymentMethod("transfer")',
      "Complete transaction",
      "paymentMethod",
      "customerName",
      "selectedCustomer",
      "retailOps.customerBook",
      "visibleCustomerOptions",
      "Enter customer name",
    ],
    reason:
      "checkout must preserve cash/transfer payment capture, customer entry, and customer-book selection",
  },
  {
    file: FILES.createSale,
    markers: [
      "retailOps.createSale",
      "canCreateProductionSale",
      "selectedItem?.remoteVariantId",
      "currentOpenSession?.remoteId",
      "customerEmail: selectedCustomer?.email",
      "customerPhone: selectedCustomer?.phone",
      "quantity: quantityValue",
      'syncStatus: "synced"',
      "createSale(localSaleInput)",
      "Local queue",
    ],
    reason:
      "sale submission must keep production tRPC creation when remote ids exist and local queued fallback while offline or unsynced",
  },
  {
    file: FILES.quantityStepper,
    markers: [
      "Pressable",
      "haptic",
      'name="Minus"',
      'name="Plus"',
      'keyboardType="numeric"',
      'inputMode="numeric"',
      'inputTextAlign="center"',
      "normalizeWholeNumberInput",
      "parseWholeQuantity",
      "formatWholeQuantity",
    ],
    reason:
      "quantity control must keep plus/minus haptic buttons, centered numeric entry, and whole-number normalization",
  },
]
const FORBIDDEN = [
  {
    file: FILES.createSale,
    patterns: [
      {
        pattern: /FlatList|ScrollView/,
        reason:
          "create-sale product rows must stay virtualized through BottomSheetSectionList",
      },
    ],
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

for (const contract of FORBIDDEN) {
  const source = readFileSync(contract.file, "utf8")

  for (const forbidden of contract.patterns) {
    if (!forbidden.pattern.test(source)) continue

    failures.push({
      file: contract.file,
      message: `contains forbidden ${forbidden.pattern} (${forbidden.reason})`,
    })
  }
}

if (failures.length > 0) {
  console.error(
    "Create-sale flow check failed. Restore the virtualized product picker, quantity stepper, checkout capture, production sale, or offline fallback contract.",
  )

  for (const failure of failures) {
    console.error(`- ${relative(REPO_ROOT, failure.file)}: ${failure.message}`)
  }

  process.exit(1)
}

console.log("Create-sale flow check passed.")
