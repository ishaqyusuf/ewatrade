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
      "keyboardBottomOffset={420}",
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
      'snapPoints={["88%"]}',
      "Unit</Text>",
      "Add the units customers can buy this product in",
      "No additional selling units yet.",
      "openUnitEditor(unit)",
      "removeUnit(unit.id)",
      "Example: Bag, Carton, or Piece",
      "Example: 50",
      "Save unit",
      "isMoreVisible",
      'label="Qty"',
      "unitPrices: Record<string, string>",
      "Selling prices by unit",
      "updateVariantUnitPrice",
      "DEFAULT_UNIT_TRANSACTION_SCALE",
      "draft.unitPrices[unit.id]",
      "fixedPriceMinor: draft.unitPrices[unit.id]?.trim()",
      "Enter a quantity for",
      "Optional notes for this variant",
      "Optional stock keeping code",
      "Optional barcode number",
      'type VariantComposerMode = "variant-type" | "variant-value"',
      "KNOWN_VARIANT_TYPES",
      "VARIANT_VALUE_SUGGESTIONS_BY_LABEL",
      "selected: true",
      'hideSubmitButton={variantComposerMode === "variant-value"}',
      "Variant name or choose a suggestion",
      "values, separated by commas",
      'label={kind === "product" ? "Add variant" : "Add options"}',
    ],
    reason:
      "generic Product/Service, exact quantity, unit, variant/option, and price fields must remain keyboard-safe",
  },
  {
    file: "components/mobile/create-sale-sheet.tsx",
    markers: [
      "KeyboardAwareScrollView",
      'keyboardDismissMode="interactive"',
      'keyboardShouldPersistTaps="handled"',
      'keyboardType="decimal-pad"',
      'keyboardType="phone-pad"',
    ],
    reason: "mixed-order quantity and customer entry must remain keyboard-safe",
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
