import { readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname)
const MOBILE_DIR = join(REPO_ROOT, "apps/mobile")
const FILES = {
  composer: join(
    MOBILE_DIR,
    "src/components/mobile/keyboard-inline-composer.tsx",
  ),
  dashboard: join(MOBILE_DIR, "src/app/dashboard.tsx"),
  firstProduct: join(
    MOBILE_DIR,
    "src/components/mobile/first-product-setup-sheet.tsx",
  ),
  setupFlow: join(MOBILE_DIR, "src/components/mobile/setup-flow.tsx"),
  store: join(MOBILE_DIR, "src/store/retailOpsStore.ts"),
}

const CONTRACTS = [
  {
    file: FILES.dashboard,
    markers: [
      "shouldPromptFirstProduct",
      "openFirstProductSetup",
      'router.push("/first-product-setup-modal")',
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
      "StatusBanner",
      'const FIRST_PRODUCT_STEPS = ["Item"]',
      "shouldUsePrimaryUnitFields",
      "usesMultiplePricing",
      "setMultiplePricingEnabled",
      "SetupCheckboxRow",
      "variants: shouldUsePrimaryUnitFields",
      "arePrimaryUnitFieldsValid",
      "areActiveVariantRowsValid",
      "getHiddenVariantParentUnitName",
      "Add item",
      "Item name",
      "Add Description",
      "Description",
      "Enter item description",
      "description.trim().length <= 1000",
      "anywhere the item is shared",
      "ImagePicker.launchCameraAsync",
      "ImagePicker.launchImageLibraryAsync",
      "Add image link",
      "Add more",
      "removeImageLink",
      "Primary unit",
      "KeyboardStickyView",
      "UnitSuggestionKeyboardBar",
      "getFilteredUnitSuggestions",
      "matches.length > 0 ? matches : UNIT_SUGGESTIONS",
      "isUnitNameFocused",
      "onFocus={showUnitSuggestionBar}",
      "onBlur={hideUnitSuggestionBar}",
      "Primary unit, price, and stock",
      "Price per unit",
      "Item image link",
      "Enter item image link",
      "areProductImageLinksValid",
      "Enter a valid image link.",
      "Current stock",
      "normalizeWholeNumberInput",
      "isWholeNumberInput(startingStock)",
    ],
    reason:
      "first-product setup must stay keyboard-safe and keep stock inline for the primary-unit path",
  },
  {
    file: FILES.firstProduct,
    markers: [
      "Multiple pricing",
      'description="Does this item have more than one price, different variants, or different types with different prices?"',
      "{usesMultiplePricing ? variantSetupContent : null}",
      "Add variant",
      "USE_INLINE_VARIANT_COMPOSER",
      "KeyboardInlineComposer",
      "variantComposerMode",
      "openVariantComposer",
      "hideInlineVariantComposer",
      "keyboardDidHide",
      "onTouchStart={hideInlineVariantComposer}",
      "Variant name or choose a suggestion",
      "${selectedVariantLabel} values, separated by commas",
      'hideSubmitButton={variantComposerMode === "variant-value"}',
      'dismissKeyboardOnSubmit={variantComposerMode === "variant-value"}',
      "VARIANT_COMPOSER_DEFAULT_SUGGESTION_COUNT",
      "inlineVariantTypeSuggestions",
      "inlineVariantValueSuggestions",
      "variantComposerPills",
      "variantTypeModalRef",
      "variantValuesModalRef",
      "KNOWN_VARIANT_TYPES",
      "VARIANT_VALUE_SUGGESTIONS_BY_LABEL",
      "selectedVariantValueSuggestions",
      "availableVariantValueSuggestions",
      'snapPoints={["72%"]}',
      "Common values",
      "addVariantValueByName",
      "Remove ${variant.name} variant value",
      'Add "',
      "Variant value name",
      'type VariantSetupTab = "stocks" | "variants"',
      "shouldShowVariantTabs",
      "variantManagementTabs",
      "variantGroupsView",
      "stockRowsView",
      "sortedVisibleVariantRows",
      "disabledVariantDimensionKeys",
      "Modal as NativeModal",
      "visible={!!variantActionTarget}",
      "Close variant options",
      "openVariantActionSheet",
      "editVariantActionTarget",
      "toggleVariantActionTarget",
      "removeVariantActionTarget",
      'shouldShowVariantTabs && variantSetupTab === "variants"',
      'label="Price"',
      'label="Stock"',
      'variantComposerMode === "edit-variant-value"',
      'value.replace(/,/g, "")',
      'submitIconName={isVariantComposerEditMode ? "Check" : "Plus"}',
      "enabled",
      "expanded",
      "createVariantDraft",
      "conversionMultiplier",
      "variantLabel",
      "generatedVariantCombinationSeeds",
      "Multiple variant labels generate sellable combination rows.",
      "Variant image link",
      "No variants yet",
      "Add at least one variant, then enter its price and current stock.",
    ],
    reason:
      "first-product setup must explicitly switch between single and multiple pricing while keeping manual variants, prices, and conversion multipliers",
  },
  {
    file: FILES.setupFlow,
    markers: [
      "SetupCheckboxRow",
      'accessibilityRole="checkbox"',
      "accessibilityState={{ checked }}",
    ],
    reason:
      "setup flows must keep the reusable multiple-pricing checkbox accessible",
  },
  {
    file: FILES.composer,
    markers: [
      "KeyboardStickyView",
      "KeyboardInlineComposerPill",
      "horizontal",
      'keyboardShouldPersistTaps="always"',
      "hideSubmitButton",
      "onPillPress",
      "onRemovePill",
      "submitAccessibilityLabel",
      "submitIconName",
      "autoFocus",
      "showSoftInputOnFocus",
      "disabled={!canSubmit}",
      "placeholderTextColor={colors.mutedForeground}",
      "selectionColor={colors.primary}",
      'name="X"',
    ],
    reason:
      "inline variant composer must stay keyboard-sticky with pills, removable selections, and a single right submit action",
  },
  {
    file: FILES.firstProduct,
    markers: [
      "trpc.retailOps.createCatalogItem",
      "shouldUseLocalQueue",
      "isLocalSessionToken",
      "addFirstProduct",
      "description: input.description",
      "imageUrl: input.imageUrl",
      "remoteId: productionProduct.item.id",
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
