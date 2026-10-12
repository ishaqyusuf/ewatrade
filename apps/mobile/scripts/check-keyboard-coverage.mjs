import { readFileSync, readdirSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const MOBILE_DIR = join(REPO_ROOT, "apps/mobile")
const SOURCE_DIR = join(MOBILE_DIR, "src")
const contracts = [
  {
    file: "components/mobile/finance-reports/finance-reports-screen.tsx",
    markers: [
      "if (editing)",
      "FinanceFormBody",
      "<FinanceBankDateField",
      'label="From"',
      'label="Through"',
    ],
    reason:
      "report date editing must use the keyboard-aware form body outside report scrolling",
  },
  {
    file: "components/mobile/finance/finance-cash-count-form.tsx",
    markers: [
      "FinanceFormBody",
      "MoneyField",
      'label="Count reference"',
      "onChangeValue={setAmount}",
    ],
    reason:
      "physical cash amounts and references must remain above the software keyboard",
  },
  {
    file: "components/mobile/finance/finance-cash-action-form.tsx",
    markers: [
      "FinanceFormBody",
      'label="Investigated reason"',
      'label="Correction date (YYYY-MM-DD, UTC)"',
    ],
    reason:
      "cash investigation reasons and correction dates use the shared keyboard-aware body",
  },
  {
    file: "components/mobile/finance/finance-counts-screen.tsx",
    markers: ["if (creating)", "FinanceCashCountForm", "FlatList"],
    reason:
      "cash creation leaves the virtualized count history before the keyboard opens",
  },
  {
    file: "components/mobile/finance/finance-form-body.tsx",
    markers: [
      "KeyboardAwareScrollView",
      "bottomOffset={120}",
      'keyboardDismissMode="interactive"',
      'keyboardShouldPersistTaps="handled"',
    ],
    reason: "shared Finance forms must coordinate the software keyboard",
  },
  {
    file: "components/mobile/finance/finance-money-form.tsx",
    markers: [
      "FinanceFormBody",
      "MoneyField",
      'label="Description"',
      "onChangeValue={setAmount}",
    ],
    reason:
      "money movement amounts and descriptions must use the keyboard-aware Finance body",
  },
  {
    file: "components/mobile/finance/finance-account-screen.tsx",
    markers: [
      "if (editing)",
      "FinanceFormBody",
      "<FinanceBankDateField",
      'label="From"',
      'label="Through"',
    ],
    reason:
      "statement date editing must leave the virtualized history for a keyboard-aware body",
  },
  {
    file: "components/mobile/finance/finance-movement-screen.tsx",
    markers: [
      "FinanceFormBody",
      'label="Reason for correction"',
      "<FinanceBankDateField",
      'label="Correction date"',
    ],
    reason:
      "money correction reasons and dates must remain reachable above the keyboard",
  },
  {
    file: "components/mobile/finance/finance-bank-date-field.tsx",
    markers: [
      "<FormField",
      "maxLength={10}",
      'helper="YYYY-MM-DD · UTC"',
      '"Calendar"',
    ],
    reason:
      "Finance date fields keep typed UTC days with a calendar fallback inside their keyboard-aware bodies",
  },
  {
    file: "components/mobile/finance/finance-screen.tsx",
    markers: [
      "if (creating)",
      "KeyboardAwareScrollView",
      "bottomOffset={120}",
      'keyboardDismissMode="interactive"',
      'keyboardShouldPersistTaps="handled"',
      "MoneyField",
    ],
    reason:
      "expense creation must leave the virtualized history and use a keyboard-aware form body",
  },
  {
    file: "components/mobile/finance/finance-expense-forms.tsx",
    markers: [
      "KeyboardAwareScrollView",
      "bottomOffset={120}",
      'keyboardDismissMode="interactive"',
      'keyboardShouldPersistTaps="handled"',
      "FinanceExpensePaymentForm",
      "FinanceExpenseCorrectionForm",
      "MoneyField",
      'label="Reason for correction"',
    ],
    reason:
      "expense payments and correction reasons must remain reachable above the software keyboard",
  },
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
    file: "components/mobile/green-till/auth-screen.tsx",
    markers: ["<MobileScreen", "keyboardBottomOffset={24}"],
    reason: "auth forms must render inside the keyboard-aware route screen",
  },
  {
    file: "app/login.tsx",
    markers: ["<LoginScreen />"],
    reason: "the login route must render the keyboard-aware login screen",
  },
  {
    file: "components/mobile/login/login-screen.tsx",
    markers: [
      "<ClassicLoginScreen",
      "<FormField",
      'keyboardType="email-address"',
    ],
    reason: "login email entry must use the email keyboard",
  },
  {
    file: "components/mobile/appearances/classic/login-screen.tsx",
    markers: ["<GreenTillAuthScreen"],
    reason: "login fields must stay in the keyboard-aware auth screen",
  },
  {
    file: "app/sign-up.tsx",
    markers: ["<AccountAgeEntry />"],
    reason: "the sign-up route must reach the keyboard-aware registration form",
  },
  {
    file: "components/mobile/sign-up/account-age-entry.tsx",
    markers: ["<SignUpScreen"],
    reason: "the age check must hand off to the registration form",
  },
  {
    file: "components/mobile/sign-up/sign-up-screen.tsx",
    markers: [
      "<ClassicSignUpScreen",
      'keyboardType="email-address"',
      "<PhoneField",
    ],
    reason: "business registration fields must remain reachable and typed",
  },
  {
    file: "components/mobile/appearances/classic/sign-up-screen.tsx",
    markers: ["<GreenTillAuthScreen"],
    reason: "registration fields must stay in the keyboard-aware auth screen",
  },
  {
    file: "components/mobile/phone-field.tsx",
    markers: ['keyboardType="phone-pad"'],
    reason: "phone entry must use the phone keypad",
  },
  {
    file: "app/verify-email.tsx",
    markers: ["<VerifyEmailScreen />"],
    reason: "the verify-email route must render the OTP screen",
  },
  {
    file: "components/mobile/verify-email/verify-email-screen.tsx",
    markers: ["<ClassicVerifyEmailScreen", "<OtpInput", "<OtpKeypad"],
    reason: "OTP entry must keep its accessible keypad flow",
  },
  {
    file: "components/mobile/appearances/classic/verify-email-screen.tsx",
    markers: ["<GreenTillAuthScreen"],
    reason: "OTP entry must stay in the keyboard-aware auth screen",
  },
  {
    file: "components/mobile/catalog-setup/catalog-setup-view.tsx",
    markers: [
      "KeyboardAwareScrollView",
      "editors.length === 0 && !unitEditorDraft && !helperPickerOpen",
      "bottomOffset={activeFooterHeight + 12}",
      'keyboardDismissMode="interactive"',
      'keyboardShouldPersistTaps="handled"',
      "onHeightChange={setFooterHeight}",
      "KeyboardInlineComposer",
      "onHeightChange={setComposerHeight}",
      "<RetainedEditorStack",
      "bottomOffset={editorBottomOffset}",
      "onHeightChange={trackEditorFooter(entry.key)}",
      "composerHeight + 12",
      "activeEditorFooterHeight + 12",
      '? "Complete option values"',
      '? "Check" : "Plus"',
      "values, separated by commas",
      "formGuidance.options.namePlaceholder",
      "<SellingUnitEditor",
      "<CatalogSetupHelperPicker",
    ],
    reason:
      "the Product/Service setup body, option composer and detail editors must keep focused fields above their measured footer, composer and the keyboard",
  },
  {
    file: "components/mobile/retained-editor-stack.tsx",
    markers: [
      "KeyboardAwareScrollView",
      "enabled={active && !obscured}",
      "bottomOffset={bottomOffset}",
      'keyboardDismissMode="interactive"',
      'keyboardShouldPersistTaps="handled"',
    ],
    reason:
      "each focused catalog detail editor (stock, codes, prices, description, options, category) must scroll its fields above the keyboard",
  },
  {
    file: "components/mobile/appearances/classic/catalog-setup.tsx",
    markers: [
      "MoneyField",
      'label="Main unit"',
      "placeholder={guidance.stockUnit?.placeholder}",
      'label="Selling price"',
      'label="Fixed price"',
    ],
    reason:
      "essential prices must use the money keyboard and the stock unit stays labelled",
  },
  {
    file: "components/mobile/catalog-setup/catalog-setup-units.tsx",
    markers: [
      "openUnitEditor(unit)",
      "openUnitEditor()",
      'kind: "remove-unit",',
      "Add a carton or pack",
      "No other way yet. Customers buy by the",
    ],
    reason:
      "selling units are added and edited in the keyboard-safe unit editor and removed after confirmation",
  },
  {
    file: "components/mobile/catalog-setup/selling-unit-editor.tsx",
    markers: [
      "NativeModal",
      "KeyboardAwareScrollView",
      "enabled={!referencePickerOpen}",
      "bottomOffset={footerHeight + 12}",
      'keyboardDismissMode="interactive"',
      'keyboardShouldPersistTaps="handled"',
      "onHeightChange={setFooterHeight}",
      "Add selling unit",
    ],
    reason:
      "the full-screen unit editor must keep its fields above its sticky save footer and the keyboard",
  },
  {
    file: "components/mobile/appearances/classic/selling-unit-editor.tsx",
    markers: [
      'keyboardType="decimal-pad"',
      "onChangeDraft({ relationCount: value })",
      "MoneyField",
      'label="Unit name"',
      'placeholder="e.g. Carton"',
      "UNIT_SUGGESTIONS",
    ],
    reason:
      "the unit relation quantity must use a numeric keyboard and the unit price MoneyField",
  },
  {
    file: "components/mobile/catalog-setup/classic-detail-editors.tsx",
    markers: [
      'keyboardType="decimal-pad"',
      "<MiniInput",
      'label="SKU"',
      'label="Barcode"',
      'label="Description"',
    ],
    reason:
      "opening stock and per-choice prices must use numeric keyboards; codes and description stay in the keyboard-aware editor",
  },
  {
    file: "components/mobile/catalog-setup/catalog-setup-details.tsx",
    markers: [
      'keyboardType="decimal-pad"',
      'label="Customer guidance (optional)"',
    ],
    reason:
      "service opening stock must use a numeric keyboard and guidance stays reachable",
  },
  {
    file: "components/mobile/catalog-setup/catalog-setup-options.tsx",
    markers: [
      'keyboardType="decimal-pad"',
      "accessibilityLabel={`Price for ${combination.name}`}",
    ],
    reason: "per-choice prices must use a numeric keyboard",
  },
  {
    file: "components/mobile/catalog-setup/catalog-setup-model.ts",
    markers: ['type VariantComposerMode = "variant-type" | "variant-value"'],
    reason: "the option composer keeps its name and value entry modes",
  },
  {
    file: "components/mobile/catalog-setup/use-catalog-setup.ts",
    markers: [
      "DEFAULT_UNIT_TRANSACTION_SCALE",
      "draft.unitPrices[unit.id]",
      'unitOverridePrice: draft.unitPrices[unit.id] ?? ""',
      "Enter a valid quantity for",
      "selected: true",
      "getCatalogOptionSuggestions(formGuidance",
      "getCatalogOptionValueSuggestions(formGuidance, activeGroup.name",
    ],
    reason:
      "exact quantities are validated, unit prices can be overridden and option suggestions follow the business guidance",
  },
  {
    file: "components/mobile/catalog-setup/catalog-variant-manager.tsx",
    markers: [
      'import { Modal } from "@/components/ui/modal"',
      "<NativeModal",
      "KeyboardAwareScrollView",
      "bottomOffset={footerHeight + 12}",
      'keyboardDismissMode="interactive"',
      'keyboardShouldPersistTaps="handled"',
      'key={model.editorExpanded ? "details" : "basics"}',
      "<BottomSearchFooter",
      "onHeightChange={setFooterHeight}",
      'accessibilityLabel="Option editor actions"',
      "Save option changes",
      '"Disable entire option combination"',
      '"Enable entire option combination"',
    ],
    reason:
      "the full-screen option editor must keep its basic and detail fields above its sticky save footer and the keyboard",
  },
  {
    file: "components/mobile/catalog-setup/catalog-variant-basics.tsx",
    markers: [
      'keyboardType="decimal-pad"',
      'label="Opening quantity (optional)"',
      "MoneyField",
      '? "Fixed price"',
      'accessibilityRole="radiogroup"',
      'label="Fixed price"',
      'label="Quote"',
      'label="Description"',
      'actionLabel="Remove"',
      "expandEditor",
    ],
    reason: "option quantities and prices must use numeric and money keyboards",
  },
  {
    file: "components/mobile/catalog-setup/catalog-variant-details.tsx",
    markers: [
      "MoneyField",
      "editor.draft.unitPrices[unit.id]",
      "collapseEditor",
      '"Stock, price, and description"',
      '"-mx-2 min-h-16 flex-row items-center gap-3 border-y border-border px-4 py-3 active:bg-muted"',
    ],
    reason: "per-unit option prices must use MoneyField in the expanded editor",
  },
  {
    file: "components/mobile/catalog-setup/catalog-variant-model.ts",
    markers: [
      "unitPrices: Record<string, string>",
      '"Stock unit"',
      "isCatalogVariantQuantityReady",
      "isCatalogVariantPriceReady",
      '"Stock invalid"',
      '"Price invalid"',
    ],
    reason: "combination readiness must reflect exact stock and price validity",
  },
  {
    file: "components/mobile/appearances/classic/catalog-variant-manager.tsx",
    markers: [
      'name="Check"',
      'name="more"',
      '"Needs setup"',
      '"min-h-24 min-w-0 flex-1 gap-3 px-3 py-4 active:bg-muted/70"',
      'className="min-h-7 flex-row items-center gap-1.5 rounded-full bg-muted px-2.5 py-1"',
      '"min-h-11 min-w-16 items-center justify-center rounded-full px-4 active:bg-muted"',
    ],
    reason: "option rows keep their readiness and menu affordances",
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
    file: "components/mobile/appearances/classic/create-sale-items.tsx",
    markers: [
      "KeyboardAwareScrollView",
      "bottomOffset={actionsHeight + 12}",
      'keyboardDismissMode="interactive"',
      'keyboardShouldPersistTaps="handled"',
      "ClassicSelectedOrderLine",
      "onAdd={() => addOffering(entry.offering)}",
      "BottomSearchFooter",
      "alwaysShowSearch",
      'itemKind === "service" ? "Search services" : "Search items"',
      'layout={largeText ? "stacked" : "inline"}',
      'testID="sale-next-step"',
    ],
    reason:
      "sale-line quantities must scroll above the keyboard and the floating search and Proceed footer",
  },
  {
    file: "components/mobile/appearances/classic/create-sale.tsx",
    markers: [
      "accessibilityLabel={`Quantity for ${offering.displayName}`}",
      'keyboardType="decimal-pad"',
    ],
    reason: "sale-line quantity entry must use the decimal keypad",
  },
  {
    file: "components/mobile/appearances/classic/create-sale-checkout.tsx",
    markers: [
      "KeyboardAwareScrollView",
      "bottomOffset={actionsHeight + 12}",
      'keyboardDismissMode="interactive"',
      'keyboardShouldPersistTaps="handled"',
      "<MoneyField",
      'label="Amount received"',
      "BottomSearchFooter",
    ],
    reason:
      "the part-payment amount must stay above the keyboard and the Confirm sale bar",
  },
  {
    file: "components/mobile/create-sale/create-sale-customer.tsx",
    markers: [
      'keyboardDismissMode="interactive"',
      'keyboardShouldPersistTaps="handled"',
      'label="Search all customers"',
      "BottomSearchFooter",
    ],
    reason:
      "buyer search results must stay tappable with the keyboard open above the sticky Continue footer",
  },
  {
    file: "components/mobile/money-field.tsx",
    markers: ['keyboardType="decimal-pad"'],
    reason: "money amounts must open the decimal keypad",
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
    file: "components/mobile/catalog-setup/catalog-helper-picker.tsx",
    markers: [
      "NativeModal",
      'contentContainerClassName="pb-[var(--helper-bottom)]"',
      'keyboardDismissMode="interactive"',
      'keyboardShouldPersistTaps="handled"',
      '<View className="border-b border-border px-4 py-3">',
      'variant="search"',
      'accessibilityLabel={"Search " + kindLabel + " setups"}',
      'label="Search setups"',
      'placeholder={"Search " + kindLabel.toLowerCase() + " setups"}',
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
      ": { backgroundColor: colors.background }",
      ': "gap-3 px-4 pb-2 pt-2"',
    ],
    reason:
      "all no-tab searches must share one compact keyboard-safe bottom footer",
  },
  {
    file: "components/mobile/workflow-modal-screen.tsx",
    markers: [
      'contentClassName="px-0 pt-2 pb-0"',
      "contentContainerStyle={{ paddingBottom: 0 }}",
    ],
    reason:
      "full-screen workflows must not reserve a second bottom gutter beneath their footer",
  },
  {
    file: "components/mobile/service-jobs/service-jobs-screen.tsx",
    markers: [
      "KeyboardAwareScrollView",
      'keyboardDismissMode="interactive"',
      'keyboardShouldPersistTaps="handled"',
      "<ServiceIntakeForm",
    ],
    reason:
      "service intake and the job workspace must scroll fields above the software keyboard",
  },
  {
    file: "components/mobile/service-jobs/service-intake-form.tsx",
    markers: [
      "<ServiceOfferingChoices",
      'label="Promised delivery"',
      'label="Instructions"',
    ],
    reason:
      "service intake, due commitment, and work-note fields must remain reachable",
  },
  {
    file: "components/mobile/service-jobs/service-offering-choices.tsx",
    markers: ['label="Quantity"', 'keyboardType="decimal-pad"'],
    reason: "service line quantities must use an exact numeric keyboard",
  },
  {
    file: "components/mobile/stock-intake/exact-quantity-stepper.tsx",
    markers: ["<FormField", 'keyboardType="decimal-pad"'],
    reason:
      "the shared exact-quantity stepper (stock intake, unit conversion, closeout) must open the numeric keypad",
  },
  {
    file: "components/mobile/stock-intake/stock-intake-screen.tsx",
    markers: [
      "renderScrollComponent",
      "KeyboardAwareScrollView",
      'keyboardDismissMode="interactive"',
      'keyboardShouldPersistTaps="handled"',
      "<StockIntakeFields",
    ],
    reason: "inventory quantities and reasons must remain keyboard-safe",
  },
  {
    file: "components/mobile/stock-intake/stock-intake-fields.tsx",
    markers: ["<ExactQuantityStepper", 'label="Reason"'],
    reason: "inventory quantities and reasons must remain keyboard-safe",
  },
  {
    file: "components/mobile/unit-conversion/unit-conversion-screen.tsx",
    markers: [
      "KeyboardAwareScrollView",
      'keyboardDismissMode="interactive"',
      'keyboardShouldPersistTaps="handled"',
      "<ExactQuantityStepper",
      "value={draft.sourceQuantity}",
      'keyboardType="decimal-pad"',
      "value={draft.targetQuantity}",
    ],
    reason: "packaged-stock transformation must accept both exact quantities",
  },
  {
    file: "components/mobile/closeout/closeout-screen.tsx",
    markers: [
      "renderScrollComponent",
      "KeyboardAwareScrollView",
      'keyboardDismissMode="interactive"',
      'keyboardShouldPersistTaps="handled"',
      "<ClassicCloseoutRow",
    ],
    reason: "closeout count rows must scroll above the software keyboard",
  },
  {
    file: "components/mobile/appearances/classic/closeout-screen.tsx",
    markers: [
      "<ExactQuantityStepper",
      "label={`Counted · ${row.inventoryUnitName}`}",
    ],
    reason: "custody closeout declarations must use an exact numeric keyboard",
  },
]

const unitPrecisionMarkers = [
  "Quantity decimal places",
  "[0, 1, 2, 3, 4, 5, 6].map((scale)",
]
const itemTypeBadgeMarkers = [
  'accessibilityLabel="Change item type"',
  '"Replace current setup?"',
]
const forbiddenContracts = [
  ...[
    "components/mobile/catalog-setup/selling-unit-editor.tsx",
    "components/mobile/appearances/classic/selling-unit-editor.tsx",
  ].map((file) => ({
    file,
    markers: unitPrecisionMarkers,
    reason:
      "new unit setup should use the hidden two-decimal default instead of exposing precision controls",
  })),
  // The quick-setup confirmation in use-catalog-setup.ts may say "Replace
  // current setup?"; the forms themselves must not offer a type badge.
  ...[
    "components/mobile/catalog-setup/catalog-setup-view.tsx",
    "components/mobile/appearances/classic/catalog-setup.tsx",
  ].map((file) => ({
    file,
    markers: itemTypeBadgeMarkers,
    reason: "Product and Service forms must not repeat their type as a badge",
  })),
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
  // The lookbehind skips type arguments such as RefObject<BottomSheetModal>.
  if (/(?<![\w$.])<BottomSheetModal(?:\s|>)/.test(source)) {
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
