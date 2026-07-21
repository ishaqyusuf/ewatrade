import { ActionButton as BaseActionButton } from "@/components/mobile/action-button"
import { CatalogFormText as Text } from "@/components/mobile/catalog-form-text"
import { CatalogSetupHelperPicker } from "@/components/mobile/catalog-setup-helper-picker"
import {
  type CatalogVariantDraft,
  CatalogVariantManager,
} from "@/components/mobile/catalog-variant-manager"
import { FormField as BaseFormField } from "@/components/mobile/form-field"
import {
  KeyboardInlineComposer,
  type KeyboardInlineComposerPill,
} from "@/components/mobile/keyboard-inline-composer"
import { MoneyField as BaseMoneyField } from "@/components/mobile/money-field"
import { SetupCheckboxRow } from "@/components/mobile/setup-flow"
import { StatusBanner } from "@/components/mobile/status-banner"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { useAuthContext } from "@/hooks/use-auth"
import { resolveCatalogOptionUnitPriceMinor } from "@/lib/catalog-option-pricing"
import { useTRPC } from "@/trpc/client"
import {
  type CatalogSetupHelper,
  type CatalogUnitRelationDirection,
  buildCatalogSetupHelperApplication,
  buildCatalogVariantCombinations,
  catalogUnitFactorToRelation,
  catalogUnitRelationToFactor,
  findBusinessProfile,
  findCatalogSetupHelper,
  getCatalogSetupReplacementAction,
  isCatalogFixedPriceMissing,
  majorToMinor,
  transposeCatalogUnitRelation,
} from "@ewatrade/utils"
import {
  EXACT_CANONICAL_MAX_SCALE,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import {
  type ComponentProps,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { Alert, Keyboard, type TextInput, View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"

type CatalogItemKind = "product" | "service"

type SimpleCatalogItemScreenProps = {
  initialKind?: CatalogItemKind
  onComplete?: () => void
}

type MobileOptionGroup = {
  id: string
  name: string
  values: Array<{ id: string; label: string }>
}

type MobileUnitDraft = {
  id: string
  name: string
  price: string
  relationCount: string
  relationDirection: CatalogUnitRelationDirection
  stockBehavior: "alternate_transaction" | "packaged_stock"
  transactionScale: number
}

type VariantComposerMode = "variant-type" | "variant-value"

const VARIANT_COMPOSER_DEFAULT_SUGGESTION_COUNT = 5
const DEFAULT_UNIT_TRANSACTION_SCALE = 2

function ActionButton(props: ComponentProps<typeof BaseActionButton>) {
  return <BaseActionButton textScale={1.5} {...props} />
}

function FormField(props: ComponentProps<typeof BaseFormField>) {
  return <BaseFormField textScale={1.5} {...props} />
}

function MoneyField(props: ComponentProps<typeof BaseMoneyField>) {
  return <BaseMoneyField textScale={1.5} {...props} />
}

const KNOWN_VARIANT_TYPES = [
  "Size",
  "Color",
  "Material",
  "Length",
  "Weight",
  "Package",
  "Quality",
  "Service level",
  "Turnaround",
]

const VARIANT_VALUE_SUGGESTIONS_BY_LABEL: Record<string, string[]> = {
  Color: ["Black", "White", "Blue", "Red", "Green", "Yellow", "Brown", "Grey"],
  Length: ["Short", "Regular", "Long", "Extra long"],
  Material: ["Cotton", "Leather", "Denim", "Polyester", "Wool", "Silk"],
  Package: ["Single", "Pack", "Carton", "Bundle", "Dozen", "Half pack"],
  Quality: ["Standard", "Premium", "Grade A", "Grade B", "Economy"],
  "Service level": ["Standard", "Express", "Same day", "Next day"],
  Size: ["XS", "S", "M", "L", "XL", "XXL"],
  Turnaround: ["Same day", "24 hours", "48 hours", "3 days", "1 week"],
  Weight: ["Light", "Medium", "Heavy", "1 kg", "5 kg", "10 kg"],
}

function getVariantValueSuggestions(label: string) {
  const normalizedLabel = label.trim().toLowerCase()
  const suggestionLabel = Object.keys(VARIANT_VALUE_SUGGESTIONS_BY_LABEL).find(
    (knownLabel) => knownLabel.toLowerCase() === normalizedLabel,
  )

  return suggestionLabel
    ? VARIANT_VALUE_SUGGESTIONS_BY_LABEL[suggestionLabel]
    : []
}

function newOptionGroup(): MobileOptionGroup {
  return { id: Crypto.randomUUID(), name: "", values: [] }
}

function newUnit(): MobileUnitDraft {
  return {
    id: Crypto.randomUUID(),
    name: "",
    price: "",
    relationCount: "",
    relationDirection: "units_per_canonical",
    stockBehavior: "alternate_transaction",
    transactionScale: DEFAULT_UNIT_TRANSACTION_SCALE,
  }
}

function unitKey(index: number) {
  return `unit-${index + 2}`
}

function catalogCreateErrorMessage(message: string) {
  if (message.includes("unrecognized_keys") && message.includes("variants")) {
    return "Catalog option details are not available on the connected server yet. Please try again after it updates."
  }

  return message
}

function requirePriceMinor(
  priceMinor: number | undefined,
  offeringName: string,
) {
  if (priceMinor === undefined) {
    throw new Error(`Enter a price for ${offeringName}.`)
  }

  return priceMinor
}

function KindChoice({
  description,
  icon,
  label,
  onPress,
  recommendation,
}: {
  description: string
  icon: IconKeys
  label: string
  onPress: () => void
  recommendation?: string
}) {
  return (
    <Pressable
      accessibilityHint={description}
      accessibilityLabel={`Create ${label}`}
      accessibilityRole="button"
      className="flex-1 gap-4 rounded-3xl border border-border bg-card p-5 active:bg-accent"
      haptic
      onPress={onPress}
      transition
    >
      <View className="h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <Icon className="size-base text-primary" name={icon} />
      </View>
      <View className="gap-1.5">
        <Text className="text-lg font-extrabold text-foreground">{label}</Text>
        <Text className="text-sm leading-5 text-muted-foreground">
          {description}
        </Text>
        {recommendation ? (
          <Text className="text-xs font-bold leading-5 text-primary">
            {recommendation}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}

function OptionalFieldButton({
  label,
  onPress,
}: {
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      className="min-h-11 flex-row items-center gap-2 self-start rounded-full bg-muted px-4 active:bg-accent"
      haptic
      onPress={onPress}
      transition
    >
      <Icon className="size-xs text-foreground" name="Plus" />
      <Text className="text-sm font-bold text-foreground">{label}</Text>
    </Pressable>
  )
}

function SectionHeaderActions({
  addLabel,
  canRemove = true,
  onAdd,
  onRemove,
  removeLabel,
}: {
  addLabel: string
  canRemove?: boolean
  onAdd: () => void
  onRemove: () => void
  removeLabel: string
}) {
  return (
    <View className="flex-row items-center">
      <Pressable
        accessibilityLabel={removeLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canRemove }}
        className={
          canRemove
            ? "min-h-11 justify-center px-2"
            : "min-h-11 justify-center px-2 opacity-40"
        }
        disabled={!canRemove}
        haptic
        onPress={onRemove}
      >
        <Text className="text-sm font-bold text-destructive">Remove</Text>
      </Pressable>
      <Text className="text-sm text-muted-foreground">|</Text>
      <Pressable
        accessibilityLabel={addLabel}
        accessibilityRole="button"
        className="min-h-11 justify-center px-2"
        haptic
        onPress={onAdd}
      >
        <Text className="text-sm font-bold text-primary">Add</Text>
      </Pressable>
    </View>
  )
}

function ToggleRow({
  enabled,
  label,
  onPress,
}: {
  enabled: boolean
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked: enabled }}
      className="min-h-11 flex-row items-center justify-between gap-3"
      haptic
      onPress={onPress}
    >
      <Text className="min-w-0 flex-1 font-bold text-foreground">{label}</Text>
      <View
        className={
          enabled
            ? "h-7 w-12 items-end justify-center rounded-full bg-primary px-1"
            : "h-7 w-12 items-start justify-center rounded-full bg-muted px-1"
        }
      >
        <View className="h-5 w-5 rounded-full bg-background" />
      </View>
    </Pressable>
  )
}

function getExactOpeningStock(
  value: string,
  maxScale = DEFAULT_UNIT_TRANSACTION_SCALE,
) {
  const normalized = value.trim()
  if (!normalized) return undefined

  return parseExactDecimal(normalized, {
    maxScale,
  })
}

export function SimpleCatalogItemScreen({
  initialKind,
  onComplete,
}: SimpleCatalogItemScreenProps) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { profile } = useAuthContext()
  const unitModal = useModal()
  const clientOperationIdRef = useRef(Crypto.randomUUID())
  const variantComposerInputRef = useRef<TextInput>(null)
  const [kind, setKind] = useState<CatalogItemKind | null>(initialKind ?? null)
  const [helperPickerOpen, setHelperPickerOpen] = useState(false)
  const [selectedHelperKey, setSelectedHelperKey] = useState<string | null>(
    null,
  )
  const [name, setName] = useState("")
  const [price, setPrice] = useState("")
  const [multiplePriceOptions, setMultiplePriceOptions] = useState(false)
  const [unitName, setUnitName] = useState("")
  const [openingStock, setOpeningStock] = useState("")
  const [description, setDescription] = useState("")
  const [showOpeningStock, setShowOpeningStock] = useState(false)
  const [showDescription, setShowDescription] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [canonicalTransactionScale, setCanonicalTransactionScale] = useState(
    DEFAULT_UNIT_TRANSACTION_SCALE,
  )
  const [trackServiceWork, setTrackServiceWork] = useState(false)
  const [defaultQuoteRequired, setDefaultQuoteRequired] = useState(false)
  const [serviceAuthorization, setServiceAuthorization] = useState<
    "after_required_payment" | "manual_release" | "on_order_confirmation"
  >("on_order_confirmation")
  const [serviceQuantityScale, setServiceQuantityScale] = useState(0)
  const [serviceGuidance, setServiceGuidance] = useState("")
  const [optionGroups, setOptionGroups] = useState<MobileOptionGroup[]>([
    newOptionGroup(),
  ])
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [variantComposerMode, setVariantComposerMode] =
    useState<VariantComposerMode | null>(null)
  const [composerText, setComposerText] = useState("")
  const [variantDrafts, setVariantDrafts] = useState<
    Record<string, CatalogVariantDraft>
  >({})
  const [additionalUnits, setAdditionalUnits] = useState<MobileUnitDraft[]>([])
  const [unitEditorDraft, setUnitEditorDraft] =
    useState<MobileUnitDraft | null>(null)
  const [unitEditorError, setUnitEditorError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const currencyCode = profile?.currencyCode ?? "NGN"
  const storesQuery = useQuery(trpc.tenant.stores.queryOptions())
  const stores = storesQuery.data ?? []
  const businessProfileKey = stores[0]?.businessProfileKey ?? null
  const businessProfile = findBusinessProfile(businessProfileKey)
  const selectedHelper = selectedHelperKey
    ? findCatalogSetupHelper(selectedHelperKey)
    : undefined
  const normalizedOptionGroups = useMemo(
    () =>
      optionGroups.map((group, groupIndex) => ({
        key: `group-${groupIndex + 1}`,
        name: group.name.trim(),
        values: group.values.map((value, valueIndex) => ({
          key: `value-${valueIndex + 1}`,
          label: value.label,
        })),
      })),
    [optionGroups],
  )
  const combinations = useMemo(
    () => buildCatalogVariantCombinations(normalizedOptionGroups),
    [normalizedOptionGroups],
  )
  const activeGroup = optionGroups.find((group) => group.id === activeGroupId)
  const inlineVariantTypeSuggestions = useMemo(() => {
    const defaultSuggestions = KNOWN_VARIANT_TYPES.slice(
      0,
      VARIANT_COMPOSER_DEFAULT_SUGGESTION_COUNT,
    )
    const normalizedSearch = composerText.trim().toLowerCase()

    if (!normalizedSearch) return defaultSuggestions

    const matches = KNOWN_VARIANT_TYPES.filter((variantType) =>
      variantType.toLowerCase().includes(normalizedSearch),
    ).slice(0, VARIANT_COMPOSER_DEFAULT_SUGGESTION_COUNT)

    return matches.length > 0 ? matches : defaultSuggestions
  }, [composerText])
  const availableVariantValueSuggestions = useMemo(() => {
    if (!activeGroup) return []

    const selectedValues = new Set(
      activeGroup.values.map((value) => value.label.trim().toLowerCase()),
    )
    const suggestions = getVariantValueSuggestions(activeGroup.name).filter(
      (value) => !selectedValues.has(value.trim().toLowerCase()),
    )
    const defaultSuggestions = suggestions.slice(
      0,
      VARIANT_COMPOSER_DEFAULT_SUGGESTION_COUNT,
    )
    const normalizedSearch = composerText.trim().toLowerCase()

    if (!normalizedSearch) return defaultSuggestions

    const matches = suggestions
      .filter((value) => value.toLowerCase().includes(normalizedSearch))
      .slice(0, VARIANT_COMPOSER_DEFAULT_SUGGESTION_COUNT)

    return matches.length > 0 ? matches : defaultSuggestions
  }, [activeGroup, composerText])
  const composerPills = useMemo<KeyboardInlineComposerPill[]>(() => {
    if (variantComposerMode === "variant-type") {
      return inlineVariantTypeSuggestions.map((variantType) => ({
        id: `type-${variantType}`,
        label: variantType,
      }))
    }

    if (variantComposerMode === "variant-value" && activeGroup) {
      return [
        ...activeGroup.values.map((value) => ({
          id: value.id,
          label: value.label,
          removable: true,
          selected: true,
        })),
        ...availableVariantValueSuggestions.map((value) => ({
          id: `value-${activeGroup.id}-${value}`,
          label: value,
        })),
      ]
    }

    return []
  }, [
    activeGroup,
    availableVariantValueSuggestions,
    inlineVariantTypeSuggestions,
    variantComposerMode,
  ])
  const onCreated = async () => {
    setSubmitError(null)
    await Promise.all([
      queryClient.invalidateQueries(trpc.catalog.listItems.queryFilter()),
      queryClient.invalidateQueries(
        trpc.tenant.featureAvailability.queryFilter(),
      ),
    ])
    onComplete?.()
  }
  const createItemMutation = useMutation(
    trpc.catalog.createSimpleItem.mutationOptions({
      onError: (error) => setSubmitError(error.message),
      onSuccess: onCreated,
    }),
  )
  const createAdvancedMutation = useMutation(
    trpc.catalog.createItem.mutationOptions({
      onError: (error) =>
        setSubmitError(catalogCreateErrorMessage(error.message)),
      onSuccess: onCreated,
    }),
  )

  const defaultStoreId = stores[0]?.id

  const makeDefaultVariantDraft = (): CatalogVariantDraft => ({
    barcode: "",
    description: "",
    enabled: true,
    imageUrl: "",
    price: "",
    quantity: "",
    quoteRequired: defaultQuoteRequired,
    sku: "",
    storeIds: defaultStoreId ? [defaultStoreId] : [],
    unitPrices: {},
  })

  const variantDraft = (key: string): CatalogVariantDraft =>
    variantDrafts[key] ?? {
      ...makeDefaultVariantDraft(),
    }

  const hasStructuralDraft = () =>
    selectedHelperKey !== null ||
    showAdvanced ||
    showOpeningStock ||
    trackServiceWork ||
    additionalUnits.length > 0 ||
    Object.keys(variantDrafts).length > 0 ||
    openingStock.trim().length > 0 ||
    (kind === "product" && unitName.trim().length > 0) ||
    serviceGuidance.trim().length > 0 ||
    optionGroups.some(
      (group) =>
        group.name.trim() || group.values.some((value) => value.label.trim()),
    )

  const commitHelper = (helper: CatalogSetupHelper | null) => {
    if (helper && helper.kind !== kind) return

    setSubmitError(null)
    setSelectedHelperKey(helper?.key ?? null)
    setVariantDrafts({})
    setActiveGroupId(null)
    setVariantComposerMode(null)
    setComposerText("")
    setServiceGuidance("")
    setDefaultQuoteRequired(false)
    setOpeningStock("")
    setShowOpeningStock(false)

    if (!helper) {
      setMultiplePriceOptions(false)
      setShowAdvanced(false)
      setOptionGroups([newOptionGroup()])
      setAdditionalUnits([])
      setCanonicalTransactionScale(DEFAULT_UNIT_TRANSACTION_SCALE)
      setTrackServiceWork(false)
      setServiceAuthorization("on_order_confirmation")
      setServiceQuantityScale(0)
      if (kind === "product") setUnitName("")
      setHelperPickerOpen(false)
      return
    }

    const application = buildCatalogSetupHelperApplication(helper)
    const groups = application.optionGroups.map((group) => ({
      id: Crypto.randomUUID(),
      name: group.name,
      values: group.values.map((label) => ({
        id: Crypto.randomUUID(),
        label,
      })),
    }))
    setOptionGroups(groups.length > 0 ? groups : [newOptionGroup()])
    setShowAdvanced(groups.length > 0)
    if (!name.trim() && application.suggestedName)
      setName(application.suggestedName)

    if (application.kind === "product") {
      setUnitName(application.canonicalUnit.name)
      setCanonicalTransactionScale(application.canonicalUnit.transactionScale)
      setAdditionalUnits(
        application.additionalUnits.map((unit) => {
          const relation = catalogUnitFactorToRelation(unit.factor)

          return {
            id: Crypto.randomUUID(),
            name: unit.name,
            price: "",
            relationCount: relation.count,
            relationDirection: relation.direction,
            stockBehavior:
              unit.stockBehavior === "packaged_stock"
                ? "packaged_stock"
                : "alternate_transaction",
            transactionScale: unit.transactionScale,
          }
        }),
      )
      setTrackServiceWork(false)
    } else {
      setUnitName("")
      setAdditionalUnits([])
      setCanonicalTransactionScale(DEFAULT_UNIT_TRANSACTION_SCALE)
      setTrackServiceWork(application.workPolicy === "tracked")
      setServiceAuthorization(application.authorizationPolicy)
      setServiceQuantityScale(application.quantityScale)
      setDefaultQuoteRequired(application.pricingPolicy === "quote_required")
    }

    setHelperPickerOpen(false)
  }

  const applyHelper = (helper: CatalogSetupHelper | null) => {
    const replacementAction = getCatalogSetupReplacementAction({
      currentKey: selectedHelperKey,
      hasStructuralDraft: hasStructuralDraft(),
      nextKey: helper?.key ?? null,
    })
    if (replacementAction === "close") {
      setHelperPickerOpen(false)
      return
    }

    if (replacementAction === "apply") {
      commitHelper(helper)
      return
    }

    Alert.alert(
      "Replace current setup?",
      "This replaces the current units, options, prices, and stock setup. Your item name, description, and base price stay unchanged.",
      [
        { style: "cancel", text: "Keep editing" },
        {
          style: "destructive",
          text: "Replace setup",
          onPress: () => commitHelper(helper),
        },
      ],
    )
  }

  const submitAdvanced = (
    itemKind: CatalogItemKind,
    trimmedName: string,
    priceMinor: number | undefined,
  ) => {
    const activeCombinations = showAdvanced
      ? combinations
      : [{ key: "default", name: trimmedName, selections: [] }]
    if (
      showAdvanced &&
      (normalizedOptionGroups.some(
        (group) => !group.name || group.values.length === 0,
      ) ||
        activeCombinations.length === 0)
    ) {
      setSubmitError("Add a name and at least one value for every option.")
      return
    }

    const firstEnabledIndex = activeCombinations.findIndex(
      (combination) => variantDraft(combination.key).enabled,
    )
    if (firstEnabledIndex < 0) {
      setSubmitError("Keep at least one option combination enabled.")
      return
    }

    const invalidPrice = activeCombinations.find((combination) => {
      const draft = variantDraft(combination.key)
      if (!draft.enabled) return false

      const override = draft.price.trim()
      return override ? majorToMinor(override) === null : false
    })
    if (invalidPrice) {
      setSubmitError(`Enter a valid price for ${invalidPrice.name}.`)
      return
    }

    const missingFixedServicePrice =
      itemKind === "service" && majorToMinor(price) === null
        ? activeCombinations.find((combination) => {
            const draft = variantDraft(combination.key)
            return isCatalogFixedPriceMissing({
              enabled: draft.enabled,
              hasBasePrice: false,
              hasOverridePrice: Boolean(draft.price.trim()),
              quoteRequired: draft.quoteRequired,
            })
          })
        : undefined
    if (missingFixedServicePrice) {
      setSubmitError(`Enter a price for ${missingFixedServicePrice.name}.`)
      return
    }

    const invalidVariantUnitPrice =
      itemKind === "product"
        ? activeCombinations
            .filter((combination) => variantDraft(combination.key).enabled)
            .flatMap((combination) =>
              additionalUnits.map((unit) => ({
                combination,
                unit,
                value:
                  variantDraft(combination.key).unitPrices[unit.id]?.trim() ??
                  "",
              })),
            )
            .find(({ value }) => value && majorToMinor(value) === null)
        : undefined
    if (invalidVariantUnitPrice) {
      setSubmitError(
        `Enter a valid ${invalidVariantUnitPrice.unit.name} price for ${invalidVariantUnitPrice.combination.name}.`,
      )
      return
    }

    const invalidProductQuantity =
      itemKind === "product" && showAdvanced
        ? activeCombinations.find((combination) => {
            const draft = variantDraft(combination.key)
            if (!draft.enabled || !draft.quantity.trim()) return false

            try {
              return (
                getExactOpeningStock(
                  draft.quantity,
                  canonicalTransactionScale,
                ) === undefined
              )
            } catch {
              return true
            }
          })
        : undefined
    if (invalidProductQuantity) {
      setSubmitError(
        `Enter a valid quantity for ${invalidProductQuantity.name}.`,
      )
      return
    }

    try {
      for (const unit of additionalUnits) {
        if (!unit.name.trim())
          throw new Error("Enter a name for every selling unit.")
        catalogUnitRelationToFactor({
          count: unit.relationCount,
          direction: unit.relationDirection,
        })
        if (unit.price.trim() && majorToMinor(unit.price) === null) {
          throw new Error(`Enter a valid price for ${unit.name}.`)
        }
      }
    } catch (unitError) {
      setSubmitError(
        unitError instanceof Error
          ? unitError.message
          : "Review the selling units.",
      )
      return
    }

    const rows = activeCombinations.map((combination, index) => {
      const draft = variantDraft(combination.key)
      const storeAvailability = stores.map((store) => ({
        isAvailable: draft.storeIds.includes(store.id),
        storeId: store.id,
      }))
      return {
        commonOffering: {
          enabled: draft.enabled,
          key: `offering-${index + 1}`,
          name: combination.name,
          storeAvailability:
            storeAvailability.length > 0 ? storeAvailability : undefined,
        },
        draft,
        enabled: draft.enabled,
        ...(draft.description.trim()
          ? { description: draft.description.trim() }
          : {}),
        ...(draft.imageUrl.trim() ? { imageUrl: draft.imageUrl.trim() } : {}),
        isDefault: index === firstEnabledIndex,
        key: combination.key,
        name: combination.name,
        priceMinor: draft.price.trim()
          ? (majorToMinor(draft.price) ?? undefined)
          : multiplePriceOptions
            ? undefined
            : priceMinor,
        selections: combination.selections,
      }
    })

    if (itemKind === "product") {
      const canonicalUnitName = unitName.trim()
      if (!canonicalUnitName) {
        setSubmitError("Enter the Product's main unit.")
        return
      }

      createAdvancedMutation.mutate({
        clientOperationId: clientOperationIdRef.current,
        description: description.trim() || undefined,
        kind: "product",
        name: trimmedName,
        openingStockQuantity: showOpeningStock
          ? showAdvanced
            ? undefined
            : getExactOpeningStock(openingStock, canonicalTransactionScale)
          : undefined,
        optionGroups: showAdvanced ? normalizedOptionGroups : undefined,
        unitConfiguration: {
          canonicalBalanceScale: EXACT_CANONICAL_MAX_SCALE,
          units: [
            {
              factor: "1",
              key: "canonical",
              name: canonicalUnitName,
              stockBehavior: "canonical_shared",
              transactionScale: canonicalTransactionScale,
            },
            ...additionalUnits.map((unit, unitIndex) => ({
              factor: catalogUnitRelationToFactor({
                count: unit.relationCount,
                direction: unit.relationDirection,
              }),
              key: unitKey(unitIndex),
              name: unit.name.trim(),
              stockBehavior: unit.stockBehavior,
              transactionScale: unit.transactionScale,
            })),
          ],
        },
        variants: rows.map(
          (
            { commonOffering, draft, priceMinor: rowPrice, ...variant },
            variantIndex,
          ) => {
            const openingStockQuantity =
              showAdvanced && draft.quantity.trim()
                ? getExactOpeningStock(
                    draft.quantity,
                    canonicalTransactionScale,
                  )
                : undefined

            return {
              ...variant,
              ...(openingStockQuantity !== undefined
                ? { openingStockQuantity }
                : {}),
              offerings: [
                {
                  ...commonOffering,
                  barcode: draft.barcode.trim() || undefined,
                  ...(rowPrice !== undefined
                    ? { fixedPriceMinor: rowPrice }
                    : {}),
                  inventoryUnitKey: "canonical",
                  pricingPolicy: "fixed" as const,
                  sku: draft.sku.trim() || undefined,
                },
                ...additionalUnits.map((unit, unitIndex) => {
                  const fixedPriceMinor = resolveCatalogOptionUnitPriceMinor({
                    basePriceMinor: rowPrice,
                    optionPrice: draft.price,
                    optionPricingOnly: multiplePriceOptions,
                    unitDefaultPrice: unit.price,
                    unitOverridePrice: draft.unitPrices[unit.id] ?? "",
                  })

                  return {
                    ...commonOffering,
                    barcode: undefined,
                    ...(fixedPriceMinor !== undefined
                      ? { fixedPriceMinor }
                      : {}),
                    inventoryUnitKey: unitKey(unitIndex),
                    key: `offering-${variantIndex + 1}-${unitIndex + 2}`,
                    name: `${variant.name} · ${unit.name.trim()}`,
                    pricingPolicy: "fixed" as const,
                    sku: undefined,
                  }
                }),
              ],
            }
          },
        ),
      })
      return
    }

    createAdvancedMutation.mutate({
      clientOperationId: clientOperationIdRef.current,
      description: description.trim() || undefined,
      kind: "service",
      name: trimmedName,
      optionGroups: showAdvanced ? normalizedOptionGroups : undefined,
      variants: rows.map(
        ({ commonOffering, draft, priceMinor: rowPrice, ...variant }) => ({
          ...variant,
          offerings: [
            draft.quoteRequired
              ? {
                  ...commonOffering,
                  authorizationPolicy: serviceAuthorization,
                  guidance: serviceGuidance.trim() || undefined,
                  pricingPolicy: "quote_required" as const,
                  quantityScale: serviceQuantityScale,
                  workPolicy: trackServiceWork
                    ? ("tracked" as const)
                    : ("charge_only" as const),
                }
              : {
                  ...commonOffering,
                  authorizationPolicy: serviceAuthorization,
                  fixedPriceMinor: requirePriceMinor(rowPrice, variant.name),
                  guidance: serviceGuidance.trim() || undefined,
                  pricingPolicy: "fixed" as const,
                  quantityScale: serviceQuantityScale,
                  workPolicy: trackServiceWork
                    ? ("tracked" as const)
                    : ("charge_only" as const),
                },
          ],
        }),
      ),
    })
  }

  const submit = () => {
    if (!kind) return

    const trimmedName = name.trim()
    const quoteOnlyService = kind === "service" && defaultQuoteRequired
    const parsedPriceMinor = majorToMinor(price)

    if (!trimmedName) {
      setSubmitError("Enter an item name.")
      return
    }
    const invalidEnteredPrice =
      Boolean(price.trim()) && parsedPriceMinor === null
    const missingServicePrice =
      kind === "service" && !quoteOnlyService && parsedPriceMinor === null
    if (invalidEnteredPrice || missingServicePrice) {
      setSubmitError("Enter a valid price.")
      return
    }
    const priceMinor = parsedPriceMinor ?? undefined

    try {
      if (
        showAdvanced ||
        (kind === "product" &&
          (additionalUnits.length > 0 || selectedHelperKey !== null)) ||
        quoteOnlyService
      ) {
        submitAdvanced(kind, trimmedName, priceMinor)
        return
      }

      if (kind === "product") {
        const canonicalUnitName = unitName.trim()
        if (!canonicalUnitName) {
          setSubmitError("Enter the Product's main unit.")
          return
        }

        createItemMutation.mutate({
          canonicalUnitName,
          clientOperationId: clientOperationIdRef.current,
          description: description.trim() || undefined,
          kind,
          name: trimmedName,
          openingStockQuantity: showOpeningStock
            ? getExactOpeningStock(openingStock, canonicalTransactionScale)
            : undefined,
          priceMinor,
        })
        return
      }

      createItemMutation.mutate({
        authorizationPolicy: serviceAuthorization,
        clientOperationId: clientOperationIdRef.current,
        description: description.trim() || undefined,
        guidance: serviceGuidance.trim() || undefined,
        kind,
        name: trimmedName,
        priceMinor: requirePriceMinor(priceMinor, trimmedName),
        quantityScale: serviceQuantityScale,
        workPolicy: trackServiceWork ? "tracked" : "charge_only",
      })
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Review the item details.",
      )
    }
  }

  const openUnitEditor = (unit?: MobileUnitDraft) => {
    Keyboard.dismiss()
    setUnitEditorDraft(unit ? { ...unit } : newUnit())
    setUnitEditorError(null)
    setTimeout(() => {
      unitModal.present()
    }, 80)
  }

  const updateUnitEditorDraft = (update: Partial<MobileUnitDraft>) => {
    setUnitEditorDraft((current) =>
      current ? { ...current, ...update } : current,
    )
    setUnitEditorError(null)
  }

  const saveUnitEditorDraft = () => {
    if (!unitEditorDraft) return

    const trimmedName = unitEditorDraft.name.trim()
    if (!trimmedName) {
      setUnitEditorError("Enter a unit name, such as Bag, Carton, or Piece.")
      return
    }

    if (
      additionalUnits.some(
        (unit) =>
          unit.id !== unitEditorDraft.id &&
          unit.name.trim().toLowerCase() === trimmedName.toLowerCase(),
      )
    ) {
      setUnitEditorError(`${trimmedName} is already in the unit list.`)
      return
    }

    try {
      catalogUnitRelationToFactor({
        count: unitEditorDraft.relationCount,
        direction: unitEditorDraft.relationDirection,
      })
    } catch {
      setUnitEditorError(
        "Enter a positive count that can be converted exactly without rounding.",
      )
      return
    }

    if (
      unitEditorDraft.price.trim() &&
      majorToMinor(unitEditorDraft.price) === null
    ) {
      setUnitEditorError(`Enter a valid selling price for ${trimmedName}.`)
      return
    }

    const nextUnit = { ...unitEditorDraft, name: trimmedName }
    setAdditionalUnits((current) =>
      current.some((unit) => unit.id === nextUnit.id)
        ? current.map((unit) => (unit.id === nextUnit.id ? nextUnit : unit))
        : [...current, nextUnit],
    )
    Keyboard.dismiss()
    unitModal.dismiss()
  }

  const removeUnit = (unitId: string) => {
    setAdditionalUnits((current) =>
      current.filter((unit) => unit.id !== unitId),
    )
    setVariantDrafts((current) =>
      Object.fromEntries(
        Object.entries(current).map(([key, draft]) => {
          const { [unitId]: _removedPrice, ...unitPrices } = draft.unitPrices
          return [key, { ...draft, unitPrices }]
        }),
      ),
    )
  }

  const removeAllAdditionalUnits = () => {
    setAdditionalUnits([])
    setVariantDrafts((current) =>
      Object.fromEntries(
        Object.entries(current).map(([key, draft]) => [
          key,
          { ...draft, unitPrices: {} },
        ]),
      ),
    )
  }

  const changeUnitEditorDirection = (
    nextDirection: CatalogUnitRelationDirection,
  ) => {
    if (!unitEditorDraft) return
    if (!unitEditorDraft.relationCount.trim()) {
      updateUnitEditorDraft({ relationDirection: nextDirection })
      return
    }

    try {
      const relation = transposeCatalogUnitRelation(
        {
          count: unitEditorDraft.relationCount,
          direction: unitEditorDraft.relationDirection,
        },
        nextDirection,
      )
      updateUnitEditorDraft({
        relationCount: relation.count,
        relationDirection: relation.direction,
      })
    } catch {
      setUnitEditorError(
        "This relationship cannot be transposed exactly. Keep the current direction.",
      )
    }
  }

  const focusVariantComposerInput = () => {
    setTimeout(() => {
      variantComposerInputRef.current?.focus()
    }, 80)
  }

  const hideVariantComposer = () => {
    if (!variantComposerMode) return

    setVariantComposerMode(null)
    setComposerText("")
    setEditingGroupId(null)
  }

  useEffect(() => {
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      setVariantComposerMode(null)
      setComposerText("")
      setEditingGroupId(null)
    })

    return () => {
      hideSubscription.remove()
    }
  }, [])

  const beginVariantComposer = () => {
    setShowOpeningStock(false)
    setOpeningStock("")
    setVariantComposerMode("variant-type")
    setEditingGroupId(null)
    setComposerText("")
    focusVariantComposerInput()
  }

  const openVariantComposer = () => {
    if (!showAdvanced && openingStock.trim()) {
      Alert.alert(
        "Add stock for each option?",
        "Adding options replaces the single opening stock with current stock for each combination.",
        [
          { style: "cancel", text: "Keep single stock" },
          {
            text: "Continue",
            onPress: beginVariantComposer,
          },
        ],
      )
      return
    }

    beginVariantComposer()
  }

  const selectVariantLabel = (rawLabel: string) => {
    const label = rawLabel.trim() || "Option"
    const normalizedLabel = label.toLowerCase()
    if (editingGroupId) {
      const duplicateGroup = optionGroups.find(
        (group) =>
          group.id !== editingGroupId &&
          group.name.trim().toLowerCase() === normalizedLabel,
      )
      if (duplicateGroup) {
        setSubmitError(`An option named ${label} already exists.`)
        return
      }

      setOptionGroups((current) =>
        current.map((group) =>
          group.id === editingGroupId ? { ...group, name: label } : group,
        ),
      )
      setEditingGroupId(null)
      setVariantComposerMode(null)
      setComposerText("")
      Keyboard.dismiss()
      return
    }

    const existingGroup = optionGroups.find(
      (group) => group.name.trim().toLowerCase() === normalizedLabel,
    )
    const reusableGroup = optionGroups.find(
      (group) => !group.name.trim() && group.values.length === 0,
    )
    const groupId =
      existingGroup?.id ?? reusableGroup?.id ?? Crypto.randomUUID()

    setOptionGroups((current) => {
      if (
        current.some(
          (group) => group.name.trim().toLowerCase() === normalizedLabel,
        )
      ) {
        return current
      }

      if (reusableGroup) {
        return current.map((group) =>
          group.id === reusableGroup.id ? { ...group, name: label } : group,
        )
      }

      return [...current, { id: groupId, name: label, values: [] }]
    })
    setShowAdvanced(true)
    setActiveGroupId(groupId)
    setVariantComposerMode("variant-value")
    setComposerText("")
    focusVariantComposerInput()
  }

  const openVariantValueComposer = (groupId: string) => {
    setEditingGroupId(null)
    setActiveGroupId(groupId)
    setVariantComposerMode("variant-value")
    setComposerText("")
    focusVariantComposerInput()
  }

  const openOptionNameEditor = (group: MobileOptionGroup) => {
    setActiveGroupId(group.id)
    setEditingGroupId(group.id)
    setVariantComposerMode("variant-type")
    setComposerText(group.name)
    focusVariantComposerInput()
  }

  const removeOptionValue = (groupId: string, valueId: string) => {
    setOptionGroups((current) =>
      current.map((group) =>
        group.id === groupId
          ? {
              ...group,
              values: group.values.filter((value) => value.id !== valueId),
            }
          : group,
      ),
    )
  }

  const addComposerValueByName = (rawLabel: string) => {
    const label = rawLabel.trim()
    if (!label || !activeGroupId) return

    setOptionGroups((current) =>
      current.map((group) =>
        group.id === activeGroupId &&
        !group.values.some(
          (value) => value.label.toLowerCase() === label.toLowerCase(),
        )
          ? {
              ...group,
              values: [...group.values, { id: Crypto.randomUUID(), label }],
            }
          : group,
      ),
    )
  }

  const submitVariantComposer = () => {
    const value = composerText.trim()

    if (variantComposerMode === "variant-type") {
      if (!value) return
      selectVariantLabel(value)
      return
    }

    if (value) {
      for (const part of value.split(",")) {
        addComposerValueByName(part)
      }
    }
    setVariantComposerMode(null)
    setComposerText("")
  }

  const changeVariantComposerText = (value: string) => {
    if (variantComposerMode !== "variant-value" || !value.includes(",")) {
      setComposerText(value)
      return
    }

    const parts = value.split(",")
    const unfinishedValue = parts.pop() ?? ""

    for (const part of parts) {
      addComposerValueByName(part)
    }
    setComposerText(unfinishedValue)
  }

  const pressVariantComposerPill = (pill: KeyboardInlineComposerPill) => {
    if (variantComposerMode === "variant-type") {
      selectVariantLabel(pill.label)
      return
    }

    addComposerValueByName(pill.label)
    setComposerText("")
    focusVariantComposerInput()
  }

  const removeComposerValue = (pill: KeyboardInlineComposerPill) => {
    if (!activeGroupId) return
    setOptionGroups((current) =>
      current.map((group) =>
        group.id === activeGroupId
          ? {
              ...group,
              values: group.values.filter((value) => value.id !== pill.id),
            }
          : group,
      ),
    )
    focusVariantComposerInput()
  }

  if (!kind) {
    return (
      <View className="flex-1 px-4 pt-2">
        <View className="gap-2 pb-6">
          <Text className="text-xl font-extrabold text-foreground">
            What are you adding?
          </Text>
          <Text className="text-sm leading-5 text-muted-foreground">
            Products can track stock. Services do not affect inventory.
          </Text>
        </View>
        <View className="flex-row gap-3">
          <KindChoice
            description="An item you keep and sell."
            icon="Warehouse"
            label="Product"
            onPress={() => setKind("product")}
            recommendation={
              businessProfile?.recommendedItemKinds.includes("product")
                ? `Recommended for ${businessProfile.title}`
                : undefined
            }
          />
          <KindChoice
            description="Work you price and deliver."
            icon="Wrench"
            label="Service"
            onPress={() => setKind("service")}
            recommendation={
              businessProfile?.recommendedItemKinds.includes("service")
                ? `Recommended for ${businessProfile.title}`
                : undefined
            }
          />
        </View>
      </View>
    )
  }

  const isSaving =
    createItemMutation.isPending || createAdvancedMutation.isPending

  return (
    <View className="flex-1">
      <CatalogSetupHelperPicker
        businessProfileKey={businessProfileKey}
        kind={kind}
        onClose={() => setHelperPickerOpen(false)}
        onSelect={applyHelper}
        selectedKey={selectedHelperKey}
        visible={helperPickerOpen}
      />
      <KeyboardAwareScrollView
        bottomOffset={160}
        className="flex-1"
        contentContainerStyle={{
          paddingBottom: variantComposerMode ? 240 : 144,
        }}
        disableScrollOnKeyboardHide
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        onTouchStart={hideVariantComposer}
      >
        <View className="gap-5 px-4 pt-2">
          <Pressable
            accessibilityLabel="Change item type"
            accessibilityRole="button"
            className="min-h-11 flex-row items-center gap-2 self-start rounded-full bg-primary/10 px-4 active:bg-primary/20"
            haptic
            onPress={() => {
              commitHelper(null)
              setKind(null)
              setSubmitError(null)
              setActiveGroupId(null)
            }}
            transition
          >
            <Icon
              className="size-xs text-primary"
              name={kind === "product" ? "Warehouse" : "Wrench"}
            />
            <Text className="text-sm font-bold text-primary">
              {kind === "product" ? "Product" : "Service"}
            </Text>
          </Pressable>

          <ActionButton
            icon="LayoutGrid"
            onPress={() => setHelperPickerOpen(true)}
            variant="outline"
          >
            {selectedHelper
              ? `Quick setup: ${selectedHelper.title}`
              : "Choose a quick setup"}
          </ActionButton>

          {submitError ? (
            <StatusBanner
              icon="AlertCircle"
              message={submitError}
              tone="destructive"
            />
          ) : null}

          <FormField
            autoCapitalize="words"
            autoFocus
            label="Name"
            onChangeText={setName}
            placeholder={
              kind === "product" ? "Enter product name" : "Enter service name"
            }
            returnKeyType="next"
            value={name}
          />
          {kind === "product" ? (
            <SetupCheckboxRow
              checked={multiplePriceOptions}
              description="Mark this if this product does not have one price. Every option and unit combination will need its own price."
              label="Multiple Price Options"
              onPress={() => {
                const nextValue = !multiplePriceOptions
                setMultiplePriceOptions(nextValue)
                setSubmitError(null)
                if (nextValue) {
                  setShowAdvanced(true)
                }
              }}
              textScale={1.5}
            />
          ) : null}
          {kind === "product" ? (
            <View className="flex-row gap-3">
              <FormField
                autoCapitalize="words"
                containerClassName="min-w-0 flex-1"
                label="Counted in"
                onChangeText={setUnitName}
                placeholder="e.g. Bag, Piece"
                value={unitName}
              />
              <MoneyField
                containerClassName="min-w-0 flex-1"
                currencyCode={currencyCode}
                editable={!multiplePriceOptions}
                helper={
                  multiplePriceOptions
                    ? "Set prices in Product stock & pricing below."
                    : undefined
                }
                label="Price"
                onChangeValue={setPrice}
                placeholder="0.00"
                value={price}
              />
            </View>
          ) : (
            <MoneyField
              currencyCode={currencyCode}
              label={
                defaultQuoteRequired ? "Starting price (optional)" : "Price"
              }
              onChangeValue={setPrice}
              placeholder="0.00"
              value={price}
            />
          )}

          {kind === "product" && !showAdvanced && showOpeningStock ? (
            <FormField
              actionLabel="Remove"
              keyboardType="decimal-pad"
              label="Opening stock"
              onActionPress={() => {
                setOpeningStock("")
                setShowOpeningStock(false)
              }}
              onChangeText={setOpeningStock}
              placeholder="0"
              value={openingStock}
            />
          ) : null}

          {showDescription ? (
            <FormField
              actionLabel="Remove"
              label="Description"
              multiline
              onActionPress={() => {
                setDescription("")
                setShowDescription(false)
              }}
              onChangeText={setDescription}
              placeholder="Optional notes"
              textAlignVertical="top"
              value={description}
            />
          ) : null}

          <View className="flex-row flex-wrap gap-2">
            {kind === "product" && !showAdvanced && !showOpeningStock ? (
              <OptionalFieldButton
                label="Add opening stock"
                onPress={() => setShowOpeningStock(true)}
              />
            ) : null}
            {!showDescription ? (
              <OptionalFieldButton
                label="Add description"
                onPress={() => setShowDescription(true)}
              />
            ) : null}
            {!showAdvanced ? (
              <OptionalFieldButton
                label="Add options"
                onPress={openVariantComposer}
              />
            ) : null}
            {kind === "service" && !trackServiceWork ? (
              <OptionalFieldButton
                label="Track work after order"
                onPress={() => setTrackServiceWork(true)}
              />
            ) : null}
          </View>

          {kind === "service" && trackServiceWork ? (
            <View className="gap-4 rounded-3xl border border-border bg-muted/30 p-4">
              <ToggleRow
                enabled
                label="Create tracked work"
                onPress={() => setTrackServiceWork(false)}
              />
              <View className="gap-2">
                <Text className="text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground">
                  Work can start
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {(
                    [
                      ["on_order_confirmation", "On confirmation"],
                      ["after_required_payment", "After payment"],
                      ["manual_release", "Manager release"],
                    ] as const
                  ).map(([value, text]) => (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{
                        selected: serviceAuthorization === value,
                      }}
                      className={
                        serviceAuthorization === value
                          ? "min-h-10 justify-center rounded-full bg-primary px-4"
                          : "min-h-10 justify-center rounded-full bg-muted px-4"
                      }
                      key={value}
                      onPress={() => setServiceAuthorization(value)}
                    >
                      <Text
                        className={
                          serviceAuthorization === value
                            ? "text-xs font-bold text-primary-foreground"
                            : "text-xs font-bold text-foreground"
                        }
                      >
                        {text}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <FormField
                label="Customer guidance"
                multiline
                onChangeText={setServiceGuidance}
                placeholder="Optional information shown with this service"
                value={serviceGuidance}
              />
            </View>
          ) : null}

          {showAdvanced ? (
            <View className="mt-3 gap-5 border-t border-border pt-7">
              <View className="flex-row items-center justify-between gap-3">
                <View className="min-w-0 flex-1 gap-1">
                  <Text className="text-lg font-extrabold text-foreground">
                    Options
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    Add option names and values such as Size and Large.
                  </Text>
                </View>
                <SectionHeaderActions
                  addLabel="Add option"
                  onAdd={openVariantComposer}
                  onRemove={() => {
                    setMultiplePriceOptions(false)
                    setShowAdvanced(false)
                    setActiveGroupId(null)
                    setEditingGroupId(null)
                    setVariantComposerMode(null)
                    setComposerText("")
                    setVariantDrafts({})
                  }}
                  removeLabel="Remove options"
                />
              </View>

              <View className="border-t border-border">
                {optionGroups.map((group, index) => (
                  <View
                    className="gap-3 border-b border-border py-4"
                    key={group.id}
                  >
                    <View className="flex-row items-center gap-3">
                      <View className="min-w-0 flex-1 gap-0.5">
                        <Text className="text-base font-extrabold text-foreground">
                          {group.name || `Option ${index + 1}`}
                        </Text>
                        <Text className="text-xs text-muted-foreground">
                          {group.values.length}{" "}
                          {group.values.length === 1 ? "value" : "values"}
                        </Text>
                      </View>
                      {optionGroups.length > 1 ? (
                        <Pressable
                          accessibilityLabel={`Remove ${group.name || `option ${index + 1}`}`}
                          className="min-h-10 justify-center px-2"
                          haptic
                          onPress={() =>
                            setOptionGroups((current) =>
                              current.filter(
                                (candidate) => candidate.id !== group.id,
                              ),
                            )
                          }
                        >
                          <Text className="text-xs font-bold text-destructive">
                            Remove
                          </Text>
                        </Pressable>
                      ) : null}
                      <Pressable
                        accessibilityLabel={`Edit ${group.name || `option ${index + 1}`} name`}
                        className="h-10 w-10 items-center justify-center rounded-full bg-muted"
                        haptic
                        onPress={() => openOptionNameEditor(group)}
                        transition
                      >
                        <Icon
                          className="size-sm text-foreground"
                          name="Pencil"
                        />
                      </Pressable>
                    </View>

                    <View className="flex-row flex-wrap gap-2">
                      {group.values.map((value) => (
                        <View
                          className="min-h-10 flex-row items-center gap-2 rounded-full bg-primary px-3"
                          key={value.id}
                        >
                          <Text className="text-xs font-bold text-primary-foreground">
                            {value.label}
                          </Text>
                          <Pressable
                            accessibilityLabel={`Remove ${value.label}`}
                            className="h-7 w-7 items-center justify-center rounded-full"
                            haptic
                            onPress={() =>
                              removeOptionValue(group.id, value.id)
                            }
                          >
                            <Icon
                              className="size-xs text-primary-foreground"
                              name="X"
                            />
                          </Pressable>
                        </View>
                      ))}
                      <Pressable
                        accessibilityLabel={`Add values to ${group.name || `option ${index + 1}`}`}
                        className="min-h-10 flex-row items-center gap-2 rounded-full bg-muted px-3"
                        haptic
                        onPress={() => openVariantValueComposer(group.id)}
                        transition
                      >
                        <Icon className="size-xs text-foreground" name="Plus" />
                        <Text className="text-xs font-bold text-foreground">
                          Add value
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {kind === "product" ? (
            <View className="mt-3 gap-5 border-t border-border pt-7">
              <View className="flex-row items-center justify-between gap-3">
                <View className="min-w-0 flex-1 gap-1">
                  <Text className="text-lg font-extrabold text-foreground">
                    Unit
                  </Text>
                  <Text className="text-xs leading-5 text-muted-foreground">
                    Add the units customers can buy this product in, such as
                    Bag, Carton, Piece, or Kilogram.
                  </Text>
                </View>
                <SectionHeaderActions
                  addLabel="Add unit"
                  canRemove={additionalUnits.length > 0}
                  onAdd={() => openUnitEditor()}
                  onRemove={removeAllAdditionalUnits}
                  removeLabel="Remove all additional units"
                />
              </View>

              {additionalUnits.length > 0 ? (
                <View className="border-t border-border">
                  {additionalUnits.map((unit) => (
                    <View
                      className="flex-row items-center gap-3 border-b border-border py-4"
                      key={unit.id}
                    >
                      <View className="min-w-0 flex-1 gap-1">
                        <Text className="font-bold text-foreground">
                          {unit.name}
                        </Text>
                        <Text className="text-xs leading-5 text-muted-foreground">
                          {unit.relationDirection === "units_per_canonical"
                            ? `${unit.relationCount} ${unit.name} in 1 ${unitName.trim() || "main unit"}`
                            : `1 ${unit.name} contains ${unit.relationCount} ${unitName.trim() || "main units"}`}{" "}
                          ·{" "}
                          {multiplePriceOptions
                            ? "Priced by option"
                            : unit.price.trim()
                              ? `Default price ${currencyCode} ${unit.price}`
                              : "Uses product price"}
                        </Text>
                      </View>
                      <Pressable
                        accessibilityLabel={`Edit ${unit.name} unit`}
                        className="h-11 w-11 items-center justify-center rounded-full bg-muted"
                        haptic
                        onPress={() => openUnitEditor(unit)}
                      >
                        <Icon
                          className="size-sm text-foreground"
                          name="Pencil"
                        />
                      </Pressable>
                      <Pressable
                        accessibilityLabel={`Delete ${unit.name} unit`}
                        className="h-11 w-11 items-center justify-center rounded-full bg-destructive/10"
                        haptic
                        onPress={() => removeUnit(unit.id)}
                      >
                        <Icon
                          className="size-sm text-destructive"
                          name="Trash"
                        />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : (
                <Text className="text-center text-xs leading-5 text-muted-foreground">
                  No additional selling units yet.
                </Text>
              )}
            </View>
          ) : null}

          {showAdvanced ? (
            <View className="mt-3 gap-5 border-t border-border pt-7">
              <View className="gap-1">
                <Text className="text-lg font-extrabold text-foreground">
                  {kind === "product"
                    ? "Product stock & pricing"
                    : "Service pricing"}
                </Text>
                <Text className="text-xs leading-5 text-muted-foreground">
                  {kind === "product"
                    ? "Open any option and unit combination to set its price, stock, and details."
                    : "Open any option combination to set its price and details."}
                </Text>
              </View>
              <CatalogVariantManager
                basePrice={price}
                combinations={combinations}
                currencyCode={currencyCode}
                drafts={variantDrafts}
                kind={kind}
                makeDefaultDraft={makeDefaultVariantDraft}
                onChangeDraft={(key, draft) =>
                  setVariantDrafts((current) => ({ ...current, [key]: draft }))
                }
                optionPricingOnly={kind === "product" && multiplePriceOptions}
                stores={stores}
                unitName={unitName}
                units={additionalUnits}
              />
            </View>
          ) : null}

          <ActionButton
            isLoading={isSaving}
            loadingLabel="Saving"
            onPress={submit}
          >
            Save item
          </ActionButton>
        </View>
      </KeyboardAwareScrollView>

      <Modal
        onDismiss={() => {
          setUnitEditorDraft(null)
          setUnitEditorError(null)
        }}
        ref={unitModal.ref}
        snapPoints={["88%"]}
        title={
          unitEditorDraft &&
          additionalUnits.some((unit) => unit.id === unitEditorDraft.id)
            ? "Edit unit"
            : "Add unit"
        }
      >
        {unitEditorDraft ? (
          <BottomSheetKeyboardAwareScrollView
            bottomOffset={120}
            contentContainerStyle={{ paddingBottom: 120 }}
            extraKeyboardSpace={180}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
          >
            <View className="gap-5 px-5 pb-6">
              <Text className="text-sm leading-5 text-muted-foreground">
                Describe one way customers buy this product and how it relates
                to the unit you count in stock.
              </Text>

              {unitEditorError ? (
                <StatusBanner
                  icon="AlertCircle"
                  message={unitEditorError}
                  tone="destructive"
                />
              ) : null}

              <FormField
                autoCapitalize="words"
                label="Unit name"
                onChangeText={(value) => updateUnitEditorDraft({ name: value })}
                placeholder="e.g. Half bag, Quarter bag"
                value={unitEditorDraft.name}
              />
              <View className="gap-2">
                <Text className="text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground">
                  Relationship
                </Text>
                <View className="flex-row gap-2">
                  {(
                    [
                      ["units_per_canonical", "Inside main unit"],
                      ["canonical_per_unit", "Contains main units"],
                    ] as const
                  ).map(([value, label]) => (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{
                        selected: unitEditorDraft.relationDirection === value,
                      }}
                      className={
                        unitEditorDraft.relationDirection === value
                          ? "min-h-11 flex-1 items-center justify-center rounded-full bg-primary px-3"
                          : "min-h-11 flex-1 items-center justify-center rounded-full bg-muted px-3"
                      }
                      key={value}
                      onPress={() => changeUnitEditorDirection(value)}
                    >
                      <Text
                        className={
                          unitEditorDraft.relationDirection === value
                            ? "text-center text-xs font-bold text-primary-foreground"
                            : "text-center text-xs font-bold text-foreground"
                        }
                      >
                        {label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <FormField
                helper={
                  unitEditorDraft.relationDirection === "units_per_canonical"
                    ? `For example, enter 50 when 1 ${unitName.trim() || "main unit"} contains 50 ${unitEditorDraft.name.trim() || "of this unit"}.`
                    : `For example, enter 12 when 1 ${unitEditorDraft.name.trim() || "unit"} contains 12 ${unitName.trim() || "main units"}.`
                }
                keyboardType="decimal-pad"
                label={
                  unitEditorDraft.relationDirection === "units_per_canonical"
                    ? `How many ${unitEditorDraft.name.trim() || "of this unit"} are in 1 ${unitName.trim() || "main unit"}?`
                    : `How many ${unitName.trim() || "main units"} are in 1 ${unitEditorDraft.name.trim() || "of this unit"}?`
                }
                onChangeText={(value) =>
                  updateUnitEditorDraft({ relationCount: value })
                }
                placeholder="Example: 50"
                value={unitEditorDraft.relationCount}
              />
              <MoneyField
                currencyCode={currencyCode}
                editable={!multiplePriceOptions}
                helper={
                  multiplePriceOptions
                    ? "Set this unit's prices for each option in Product stock & pricing."
                    : "Options can override this default after the unit is saved."
                }
                label="Default selling price"
                onChangeValue={(value) =>
                  updateUnitEditorDraft({ price: value })
                }
                placeholder="Example: 25000"
                value={unitEditorDraft.price}
              />

              <View className="gap-2">
                <Text className="text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground">
                  Stock source
                </Text>
                <Text className="text-xs leading-5 text-muted-foreground">
                  Shared stock deducts the main-unit stock. Prepared stock keeps
                  a separate balance for units already packed.
                </Text>
                <View className="flex-row gap-2">
                  {(
                    [
                      ["alternate_transaction", "Shared stock"],
                      ["packaged_stock", "Prepared stock"],
                    ] as const
                  ).map(([value, label]) => (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{
                        selected: unitEditorDraft.stockBehavior === value,
                      }}
                      className={
                        unitEditorDraft.stockBehavior === value
                          ? "min-h-11 flex-1 items-center justify-center rounded-full bg-primary px-3"
                          : "min-h-11 flex-1 items-center justify-center rounded-full bg-muted px-3"
                      }
                      key={value}
                      onPress={() =>
                        updateUnitEditorDraft({ stockBehavior: value })
                      }
                    >
                      <Text
                        className={
                          unitEditorDraft.stockBehavior === value
                            ? "text-xs font-bold text-primary-foreground"
                            : "text-xs font-bold text-foreground"
                        }
                      >
                        {label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <ActionButton onPress={saveUnitEditorDraft}>
                Save unit
              </ActionButton>
            </View>
          </BottomSheetKeyboardAwareScrollView>
        ) : null}
      </Modal>

      <KeyboardInlineComposer
        canSubmit={
          variantComposerMode === "variant-value"
            ? composerText.trim().length > 0 ||
              (activeGroup?.values.length ?? 0) > 0
            : undefined
        }
        dismissKeyboardOnSubmit={variantComposerMode === "variant-value"}
        onChangeText={changeVariantComposerText}
        onPillPress={pressVariantComposerPill}
        onRemovePill={removeComposerValue}
        onSubmit={submitVariantComposer}
        pills={composerPills}
        placeholder={
          variantComposerMode === "variant-value"
            ? `${activeGroup?.name || "Option"} values, separated by commas`
            : editingGroupId
              ? "Update option name"
              : "Option name or choose a suggestion"
        }
        ref={variantComposerInputRef}
        submitAccessibilityLabel={
          variantComposerMode === "variant-value"
            ? "Complete option values"
            : editingGroupId
              ? "Save option name"
              : "Add option"
        }
        submitIconName={
          variantComposerMode === "variant-value" ? "Check" : "Plus"
        }
        value={composerText}
        visible={!!variantComposerMode}
      />
    </View>
  )
}
