import { readFileSync, readdirSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const MOBILE_DIR = join(REPO_ROOT, "apps/mobile")
const SOURCE_DIR = join(MOBILE_DIR, "src")
const contracts = [
  {
    file: "app/_layout.tsx",
    markers: ["KeyboardProvider", "<KeyboardProvider>", "</KeyboardProvider>"],
    reason: "the root must provide native keyboard coordination",
  },
  {
    file: "components/mobile/screen.tsx",
    markers: [
      "KeyboardAwareScrollView",
      "bottomOffset={keyboardBottomOffset}",
      'keyboardDismissMode="interactive"',
      'keyboardShouldPersistTaps="handled"',
    ],
    reason: "route forms must remain keyboard-aware",
  },
  {
    file: "app/login.tsx",
    markers: ["MobileScreen", "FormField", 'keyboardType="email-address"'],
    reason: "login email entry must use the email keyboard",
  },
  {
    file: "app/sign-up.tsx",
    markers: [
      "MobileScreen",
      'keyboardAutoScrollEnabled={Platform.OS !== "android"}',
      "keyboardBottomOffset={48}",
      'keyboardType="email-address"',
      'keyboardType="phone-pad"',
    ],
    reason: "business registration fields must remain reachable and typed",
  },
  {
    file: "app/verify-email.tsx",
    markers: ["MobileScreen", "OtpInput", "OtpKeypad"],
    reason: "OTP entry must keep its accessible keypad flow",
  },
  {
    file: "components/mobile/simple-catalog-item-screen.tsx",
    markers: [
      "KeyboardAwareScrollView",
      "bottomOffset={160}",
      'keyboardDismissMode="interactive"',
      'keyboardShouldPersistTaps="handled"',
      "MoneyField",
      'keyboardType="decimal-pad"',
      "KeyboardInlineComposer",
      "BottomSheetKeyboardAwareScrollView",
      'snapPoints={largeTextLayout ? ["96%"] : ["88%"]}',
      'addLabel="Add unit"',
      "Add cartons, packs, or other ways customers buy this",
      "No extra selling units. Your stock unit is enough to begin.",
      "openUnitEditor(unit)",
      "removeUnit(unit.id)",
      "e.g. Half bag, Carton, Pack",
      'placeholder="e.g. 50"',
      "Add selling unit",
      "DEFAULT_UNIT_TRANSACTION_SCALE",
      "draft.unitPrices[unit.id]",
      'unitOverridePrice: draft.unitPrices[unit.id] ?? ""',
      "Enter a valid quantity for",
      'type VariantComposerMode = "variant-type" | "variant-value"',
      "PRODUCT_VARIANT_TYPES",
      "SERVICE_OPTION_TYPES",
      "SERVICE_VARIANT_VALUE_SUGGESTIONS_BY_LABEL",
      "VARIANT_VALUE_SUGGESTIONS_BY_LABEL",
      "selected: true",
      '? "Complete option values"',
      '? "Check" : "Plus"',
      "Option name or choose a suggestion",
      "values, separated by commas",
      'label="Packages or options"',
      'label="Stock unit"',
      'placeholder="Piece, bag, kg"',
      'label="Different prices or options"',
      'actionLabel="Remove"',
    ],
    reason:
      "generic Product/Service, exact quantity, unit, variant/option, and price fields must remain keyboard-safe",
  },
  {
    file: "components/mobile/catalog-variant-manager.tsx",
    markers: [
      "BottomSheetKeyboardAwareScrollView",
      "KeyboardStickyView",
      "offset={{ closed: 0, opened: 16 }}",
      'snapPoints={largeTextLayout ? ["96%"] : ["62%", "96%"]}',
      'keyboardBehavior="fillParent"',
      'keyboardDismissMode="interactive"',
      'keyboardShouldPersistTaps="handled"',
      'label="Qty"',
      '? "Fixed price (optional)"',
      'accessibilityRole="radiogroup"',
      'label="Fixed price"',
      'label="Quote"',
      'label="Description"',
      'label="Customer image link"',
      'label="SKU"',
      'label="Barcode"',
      "unitPrices: Record<string, string>",
      "expandEditor",
      "collapseEditor",
      "snapToIndex(largeTextLayout ? 0 : 1)",
      "snapToIndex(0)",
      'accessibilityLabel="Save option configuration"',
      'name="Check"',
      'name="more"',
      '"Stock unit"',
      '"Needs setup"',
      '"min-h-24 min-w-0 flex-1 gap-3 px-3 py-4 active:bg-muted/70"',
      'className="min-h-7 flex-row items-center gap-1.5 rounded-full bg-muted px-2.5 py-1"',
      '"min-h-11 min-w-16 items-center justify-center rounded-full px-4 active:bg-muted"',
      "isCatalogVariantQuantityReady",
      "isCatalogVariantPriceReady",
      '"Stock invalid"',
      '"Price invalid"',
      'editorExpanded && kind === "product"',
      '"Image, inventory codes, and availability"',
      "Optional customer image, inventory codes, and Store",
      "Inventory codes",
      '"Stock, price, and description"',
      '"-mx-2 min-h-16 flex-row items-center gap-3 border-y border-border px-4 py-3 active:bg-muted"',
      '"Disable entire option combination"',
      '"Enable entire option combination"',
    ],
    reason:
      "the list-only option editor must keep its basic and full-screen fields reachable above the keyboard",
  },
  {
    file: "lib/catalog-variant-readiness.ts",
    markers: [
      "parseExactDecimal(normalized, { maxScale: 2 })",
      "parseExactDecimal(normalized, { maxScale })",
      "majorToMinor(normalized) !== null",
    ],
    reason:
      "combination readiness must reject malformed nonblank stock and price values instead of relying on presentation strings",
  },
  {
    file: "components/mobile/create-sale-sheet.tsx",
    markers: [
      "KeyboardAwareScrollView",
      "BottomSearchFooter",
      'keyboardDismissMode="interactive"',
      'keyboardShouldPersistTaps="handled"',
      'keyboardType="decimal-pad"',
      "focusedQuantityId",
      "sale-add-item-fab",
    ],
    reason: "mixed-order quantity and payment entry must remain keyboard-safe",
  },
  {
    file: "components/mobile/sale-item-picker.tsx",
    markers: [
      "NativeModal",
      "BottomSearchFooter",
      'layout="inline"',
      "alwaysShowSearch",
      'keyboardDismissMode="interactive"',
      'keyboardShouldPersistTaps="handled"',
      'accessibilityLabel="Search product or service"',
    ],
    reason:
      "the large order picker must keep search and Proceed above the keyboard",
  },
  {
    file: "components/mobile/create-sale-customer-sheet.tsx",
    markers: [
      "BottomSheetKeyboardAwareScrollView",
      'keyboardShouldPersistTaps="handled"',
      'keyboardType="phone-pad"',
      'keyboardType="email-address"',
    ],
    reason:
      "quick customer creation must keep phone and email fields reachable in the bottom sheet",
  },
  {
    file: "components/mobile/catalog-setup-helper-picker.tsx",
    markers: [
      "NativeModal",
      'contentContainerClassName="pb-8"',
      'keyboardDismissMode="interactive"',
      'keyboardShouldPersistTaps="handled"',
      '<View className="border-b border-border px-4 py-3">',
      'variant="search"',
      "accessibilityLabel={`Search ${kindLabel} setups`}",
      "label={`Search ${kindLabel} setups`}",
      "placeholder={`Search ${kindLabel.toLowerCase()} setups`}",
    ],
    reason:
      "the quick-setup header search must remain visible with result rows above the keyboard",
  },
  {
    file: "components/mobile/bottom-search-footer.tsx",
    markers: [
      "KeyboardStickyView",
      "useSafeAreaInsets",
      "Math.max(insets.bottom, 8)",
      'testID="bottom-search-footer"',
      'variant?: "default" | "market-day"',
      '"market-search"',
      'variant === "market-day" ? marketDay.canvas : colors.background',
      'className="gap-3 px-4 pb-2 pt-2"',
    ],
    reason:
      "all no-tab searches must share one compact keyboard-safe bottom footer",
  },
  {
    file: "components/mobile/workflow-modal-screen.tsx",
    markers: [
      'contentClassName="px-0 pt-6 pb-0"',
      "contentContainerStyle={{ paddingBottom: 0 }}",
    ],
    reason:
      "full-screen workflows must not reserve a second bottom gutter beneath their footer",
  },
  {
    file: "components/mobile/service-jobs-sheet.tsx",
    markers: [
      "KeyboardAwareScrollView",
      'keyboardDismissMode="interactive"',
      'keyboardShouldPersistTaps="handled"',
      'keyboardType="decimal-pad"',
      "Promised delivery",
      "Instructions",
    ],
    reason:
      "service intake, due commitment, and work-note fields must remain reachable",
  },
  {
    file: "components/mobile/stock-intake-sheet.tsx",
    markers: [
      "KeyboardAwareScrollView",
      'keyboardType="decimal-pad"',
      'label="Reason"',
    ],
    reason: "inventory quantities and reasons must remain keyboard-safe",
  },
  {
    file: "components/mobile/unit-conversion-sheet.tsx",
    markers: [
      "KeyboardAwareScrollView",
      'keyboardType="decimal-pad"',
      'label="Source quantity"',
      'label="Target quantity"',
    ],
    reason: "packaged-stock transformation must accept both exact quantities",
  },
  {
    file: "components/mobile/closeout-sheet.tsx",
    markers: ['keyboardType="decimal-pad"', 'label="Declared quantity"'],
    reason: "custody closeout declarations must use an exact numeric keyboard",
  },
]

const forbiddenContracts = [
  {
    file: "components/mobile/simple-catalog-item-screen.tsx",
    markers: ["Quantity decimal places", "[0, 1, 2, 3, 4, 5, 6].map((scale)"],
    reason:
      "new unit setup should use the hidden two-decimal default instead of exposing precision controls",
  },
  {
    file: "components/mobile/simple-catalog-item-screen.tsx",
    markers: [
      'accessibilityLabel="Change item type"',
      'Alert.alert(\n      "Replace current setup?"',
    ],
    reason: "Product and Service forms must not repeat their type as a badge",
  },
]

const failures = []
for (const contract of contracts) {
  const filePath = join(SOURCE_DIR, contract.file)
  const source = readFileSync(filePath, "utf8")
  const missing = contract.markers.filter((marker) => !source.includes(marker))
  if (missing.length > 0) {
    failures.push({
      file: filePath,
      message: `missing ${missing.join(", ")} (${contract.reason})`,
    })
  }
}

for (const contract of forbiddenContracts) {
  const filePath = join(SOURCE_DIR, contract.file)
  const source = readFileSync(filePath, "utf8")
  const present = contract.markers.filter((marker) => source.includes(marker))
  if (present.length > 0) {
    failures.push({
      file: filePath,
      message: `contains ${present.join(", ")} (${contract.reason})`,
    })
  }
}

for (const filePath of findSourceFiles(SOURCE_DIR)) {
  if (filePath === join(SOURCE_DIR, "components/ui/modal.tsx")) continue

  const source = readFileSync(filePath, "utf8")
  if (/<BottomSheetModal(?:\s|>)/.test(source)) {
    failures.push({
      file: filePath,
      message:
        "uses BottomSheetModal directly instead of the shared modal wrapper",
    })
  }
}

if (failures.length > 0) {
  console.error("Mobile generic keyboard coverage check failed.")
  for (const failure of failures) {
    console.error(`- ${relative(REPO_ROOT, failure.file)}: ${failure.message}`)
  }
  process.exit(1)
}

console.log("Mobile generic keyboard coverage check passed.")

function findSourceFiles(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...findSourceFiles(entryPath))
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts"))
    ) {
      files.push(entryPath)
    }
  }
  return files
}
