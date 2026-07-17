import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import {
  KeyboardInlineComposer,
  type KeyboardInlineComposerPill,
} from "@/components/mobile/keyboard-inline-composer"
import {
  SetupChoicePill,
  SetupFlowHeader,
  SetupInlineNotice,
  SetupSection,
} from "@/components/mobile/setup-flow"
import { StatusBanner } from "@/components/mobile/status-banner"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Icon } from "@/components/ui/icon"
import { Modal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useAuthContext } from "@/hooks/use-auth"
import {
  isWholeNumberInput,
  normalizeWholeNumberInput,
  parseWholeQuantity,
} from "@/lib/quantity"
import { isLocalSessionToken } from "@/lib/session-store"
import { cn } from "@/lib/utils"
import { useBusinessStore } from "@/store/businessStore"
import { useRetailOpsStore } from "@/store/retailOpsStore"
import {
  getBusinessSubscription,
  getPlan,
  useSubscriptionStore,
} from "@/store/subscriptionStore"
import { useTRPC } from "@/trpc/client"
import type { BottomSheetModal } from "@gorhom/bottom-sheet"
import { useMutation } from "@tanstack/react-query"
import { Image } from "expo-image"
import * as ImagePicker from "expo-image-picker"
import { forwardRef, useEffect, useMemo, useRef, useState } from "react"
import {
  Alert,
  Keyboard,
  Modal as NativeModal,
  ScrollView,
  type TextInput,
  View,
} from "react-native"
import {
  KeyboardAwareScrollView,
  KeyboardStickyView,
} from "react-native-keyboard-controller"

type FirstProductSetupSheetProps = {
  onComplete?: () => void
}

type FirstProductSetupContentProps = {
  onComplete?: () => void
  presentation?: "screen" | "sheet"
}

type BottomSheetModalRef = BottomSheetModal

type VariantDraft = {
  conversionMultiplier: string
  enabled: boolean
  expanded: boolean
  id: string
  imageLinks: string[]
  imageUrl: string
  name: string
  price: string
  stock: string
  variantLabel: string
}

type VariantCombinationDraft = {
  enabled: boolean
  expanded: boolean
  id: string
  imageLinks: string[]
  imageUrl: string
  key: string
  name: string
  price: string
  stock: string
  variantLabel: string
}

type VariantComposerMode =
  | "edit-variant-label"
  | "edit-variant-value"
  | "variant-type"
  | "variant-value"

type VariantSetupTab = "stocks" | "variants"

type VariantComposerEditTarget =
  | {
      label: string
      type: "label"
    }
  | {
      id: string
      type: "value"
    }

type VariantActionTarget =
  | {
      label: string
      type: "group"
    }
  | {
      id: string
      type: "stock"
    }
  | {
      id: string
      type: "value"
    }

type ProductionProduct = {
  product: {
    id: string
    name: string
  }
  units: Array<{
    id: string
    isDefault: boolean
    name: string
    openingStockQuantity: number
    priceMinor: number
  }>
}

type CreateProductInput = {
  description?: string
  imageLinks?: string[]
  imageUrl?: string
  name: string
  openingStockQuantity: number
  priceMinor: number
  primaryUnitName: string
  variants: Array<{
    conversionMultiplier?: number
    enabled?: boolean
    imageLinks?: string[]
    imageUrl?: string
    name: string
    openingStockQuantity: number
    priceMinor: number
    variantLabel?: string
  }>
}

const FIRST_PRODUCT_STEPS = ["Item"]
const HIDDEN_VARIANT_PARENT_UNIT_NAME = "Parent unit"
const USE_INLINE_VARIANT_COMPOSER = true
const VARIANT_COMPOSER_DEFAULT_SUGGESTION_COUNT = 5

const KNOWN_VARIANT_TYPES = [
  "Size",
  "Color",
  "Unit",
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
  Unit: ["Piece", "Pair", "Pack", "Box", "Carton", "Kg", "Gram", "Meter"],
  Weight: ["Light", "Medium", "Heavy", "1 kg", "5 kg", "10 kg"],
}

const UNIT_SUGGESTIONS = [
  "Unit",
  "Bag",
  "Kg",
  "Piece",
  "Carton",
  "Gram",
  "Crate",
  "Bottle",
  "Pack",
  "Dozen",
  "Box",
  "Meter",
  "Pair",
  "Roll",
]

function getVariantValueSuggestions(label: string) {
  const normalizedLabel = label.trim().toLowerCase()
  const suggestionLabel = Object.keys(VARIANT_VALUE_SUGGESTIONS_BY_LABEL).find(
    (knownLabel) => knownLabel.toLowerCase() === normalizedLabel,
  )

  return suggestionLabel
    ? VARIANT_VALUE_SUGGESTIONS_BY_LABEL[suggestionLabel]
    : []
}

function parseAmount(value: string) {
  const amount = Number(value.replace(/[^\d.]/g, ""))
  return Number.isFinite(amount) ? amount : 0
}

function isNumberInput(value: string) {
  const normalized = value.replace(/[^\d.]/g, "")
  const amount = Number(normalized)
  return normalized.length > 0 && Number.isFinite(amount)
}

function isProductImageUrlInput(value: string) {
  const trimmedValue = value.trim()

  if (!trimmedValue) return true

  try {
    const url = new URL(trimmedValue)

    return ["http:", "https:"].includes(url.protocol)
  } catch {
    return false
  }
}

function cleanImageLinks(values: string[]) {
  const seen = new Set<string>()
  const links: string[] = []

  for (const value of values) {
    const trimmedValue = value.trim()

    if (!trimmedValue || seen.has(trimmedValue)) continue

    seen.add(trimmedValue)
    links.push(trimmedValue)
  }

  return links
}

function areProductImageLinksValid(values: string[]) {
  return values.every(isProductImageUrlInput)
}

function inferConversionMultiplier(name: string) {
  const normalizedName = name.trim().toLowerCase()

  if (normalizedName.includes("quarter")) return 0.25
  if (normalizedName.includes("half")) return 0.5

  return 1
}

function getMatchingUnit(
  product: ProductionProduct,
  input: {
    isDefault?: boolean
    name: string
  },
) {
  return product.units.find((unit) =>
    typeof input.isDefault === "boolean"
      ? unit.isDefault === input.isDefault
      : unit.name.trim().toLowerCase() === input.name.trim().toLowerCase(),
  )
}

function createVariantDraft(variantLabel = "Size", name = ""): VariantDraft {
  return {
    conversionMultiplier: "",
    enabled: true,
    expanded: false,
    id: `variant-${Date.now()}-${Math.round(Math.random() * 10000)}`,
    imageLinks: [],
    imageUrl: "",
    name,
    price: "",
    stock: "0",
    variantLabel,
  }
}

function createVariantCombinationDraft(input: {
  key: string
  name: string
  variantLabel: string
}): VariantCombinationDraft {
  return {
    enabled: true,
    expanded: false,
    id: `variant-combination-${input.key}`,
    imageLinks: [],
    imageUrl: "",
    key: input.key,
    name: input.name,
    price: "",
    stock: "0",
    variantLabel: input.variantLabel,
  }
}

function normalizeVariantDimension(value: string) {
  return value.trim().toLowerCase()
}

function buildVariantGroups(values: VariantDraft[]) {
  const groupsByLabel = new Map<
    string,
    {
      label: string
      values: VariantDraft[]
    }
  >()

  for (const value of values) {
    const label = value.variantLabel.trim()
    const name = value.name.trim()

    if (!label || !name) continue

    const normalizedLabel = normalizeVariantDimension(label)
    const existingGroup = groupsByLabel.get(normalizedLabel)

    if (existingGroup) {
      existingGroup.values.push(value)
      continue
    }

    groupsByLabel.set(normalizedLabel, {
      label,
      values: [value],
    })
  }

  return Array.from(groupsByLabel.values())
}

function buildVariantCombinationSeeds(
  groups: ReturnType<typeof buildVariantGroups>,
) {
  if (groups.length < 2) return []

  const combinations: Array<{
    key: string
    name: string
    variantLabel: string
  }> = []

  const walk = (
    groupIndex: number,
    selectedValues: Array<{ label: string; name: string }>,
  ) => {
    const group = groups[groupIndex]

    if (!group) {
      const key = selectedValues
        .map(
          (value) =>
            `${normalizeVariantDimension(value.label)}:${normalizeVariantDimension(
              value.name,
            )}`,
        )
        .join("|")
      const variantLabel = selectedValues.map((value) => value.label).join(", ")
      const name = selectedValues
        .map((value) => `${value.label} ${value.name}`)
        .join(", ")

      combinations.push({
        key,
        name,
        variantLabel,
      })
      return
    }

    for (const value of group.values) {
      walk(groupIndex + 1, [
        ...selectedValues,
        {
          label: group.label,
          name: value.name.trim(),
        },
      ])
    }
  }

  walk(0, [])

  return combinations
}

function getFilteredUnitSuggestions(value: string) {
  const query = value.trim().toLowerCase()

  if (!query) return UNIT_SUGGESTIONS

  const matches = UNIT_SUGGESTIONS.filter((unit) =>
    unit.toLowerCase().includes(query),
  )

  return matches.length > 0 ? matches : UNIT_SUGGESTIONS
}

function getHiddenVariantParentUnitName(variantNames: string[]) {
  const usedNames = new Set(
    variantNames.map((name) => name.trim().toLowerCase()),
  )
  let parentUnitName = HIDDEN_VARIANT_PARENT_UNIT_NAME
  let index = 2

  while (usedNames.has(parentUnitName.toLowerCase())) {
    parentUnitName = `${HIDDEN_VARIANT_PARENT_UNIT_NAME} ${index}`
    index += 1
  }

  return parentUnitName
}

function UnitSuggestionKeyboardBar({
  onSelect,
  suggestions,
  value,
  visible,
}: {
  onSelect: (unit: string) => void
  suggestions: string[]
  value: string
  visible: boolean
}) {
  if (!visible) return null

  const selectedUnit = value.trim().toLowerCase()

  return (
    <KeyboardStickyView
      className="absolute bottom-0 left-0 right-0 z-50"
      offset={{ closed: 88, opened: 0 }}
      pointerEvents="box-none"
    >
      <View className="border-t border-border bg-background px-4 py-2">
        <ScrollView
          horizontal
          keyboardShouldPersistTaps="always"
          showsHorizontalScrollIndicator={false}
        >
          <View className="flex-row gap-2 pr-4">
            {suggestions.map((unit) => {
              const isSelected = unit.toLowerCase() === selectedUnit

              return (
                <Pressable
                  accessibilityLabel={`Use ${unit} as primary unit`}
                  className={cn(
                    "min-h-9 items-center justify-center rounded-full border px-4",
                    isSelected
                      ? "border-primary bg-primary"
                      : "border-border bg-card",
                  )}
                  haptic
                  key={unit}
                  onPress={() => onSelect(unit)}
                  onPressIn={() => onSelect(unit)}
                  transition
                >
                  <Text
                    className={cn(
                      "text-xs font-bold",
                      isSelected
                        ? "text-primary-foreground"
                        : "text-foreground",
                    )}
                  >
                    {unit}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </ScrollView>
      </View>
    </KeyboardStickyView>
  )
}

export function FirstProductSetupContent({
  onComplete,
  presentation = "sheet",
}: FirstProductSetupContentProps) {
  const trpc = useTRPC()
  const auth = useAuthContext()
  const activeBusinessId = useBusinessStore((state) => state.activeBusinessId)
  const addFirstProduct = useRetailOpsStore((state) => state.addFirstProduct)
  const isOfflineMode = useRetailOpsStore((state) => state.isOfflineMode)
  const allProducts = useRetailOpsStore((state) => state.products)
  const products = useMemo(
    () =>
      allProducts.filter(
        (product) =>
          !activeBusinessId ||
          (product.businessId ?? activeBusinessId) === activeBusinessId,
      ),
    [activeBusinessId, allProducts],
  )
  const subscriptions = useSubscriptionStore((state) => state.subscriptions)
  const variantTypeModalRef = useRef<BottomSheetModalRef>(null)
  const variantValuesModalRef = useRef<BottomSheetModalRef>(null)
  const variantComposerInputRef = useRef<TextInput>(null)
  const unitSuggestionBlurTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null)
  const [name, setName] = useState("")
  const [showDescription, setShowDescription] = useState(false)
  const [description, setDescription] = useState("")
  const [unitName, setUnitName] = useState("")
  const [isUnitNameFocused, setIsUnitNameFocused] = useState(false)
  const [price, setPrice] = useState("")
  const [localImageUri, setLocalImageUri] = useState("")
  const [imageLinks, setImageLinks] = useState<string[]>([])
  const [startingStock, setStartingStock] = useState("")
  const [variants, setVariants] = useState<VariantDraft[]>([])
  const [variantCombinations, setVariantCombinations] = useState<
    VariantCombinationDraft[]
  >([])
  const [variantSearch, setVariantSearch] = useState("")
  const [selectedVariantLabel, setSelectedVariantLabel] = useState("Size")
  const [variantValueName, setVariantValueName] = useState("")
  const [variantComposerMode, setVariantComposerMode] =
    useState<VariantComposerMode | null>(null)
  const [variantComposerText, setVariantComposerText] = useState("")
  const [variantComposerEditTarget, setVariantComposerEditTarget] =
    useState<VariantComposerEditTarget | null>(null)
  const [variantActionTarget, setVariantActionTarget] =
    useState<VariantActionTarget | null>(null)
  const [variantSetupTab, setVariantSetupTab] =
    useState<VariantSetupTab>("variants")
  const [submitError, setSubmitError] = useState<string | null>(null)
  const shouldUseLocalQueue = isOfflineMode || isLocalSessionToken(auth.token)
  const subscription = getBusinessSubscription(subscriptions, activeBusinessId)
  const plan = getPlan(subscription.planId)
  const isAtProductLimit = products.length >= plan.limits.products
  const variantGroups = useMemo(() => buildVariantGroups(variants), [variants])
  const hasMultipleVariantDimensions = variantGroups.length > 1
  const generatedVariantCombinationSeeds = useMemo(
    () => buildVariantCombinationSeeds(variantGroups),
    [variantGroups],
  )
  const disabledVariantDimensionKeys = useMemo(
    () =>
      new Set(
        variants
          .filter((variant) => !variant.enabled)
          .map(
            (variant) =>
              `${normalizeVariantDimension(variant.variantLabel)}:${normalizeVariantDimension(
                variant.name,
              )}`,
          ),
      ),
    [variants],
  )
  const isVariantRowEnabled = (
    variant: VariantCombinationDraft | VariantDraft,
  ) => {
    if (!variant.enabled) return false

    if (!hasMultipleVariantDimensions || !("key" in variant)) {
      return true
    }

    return variant.key
      .split("|")
      .every((keyPart) => !disabledVariantDimensionKeys.has(keyPart))
  }
  const activeVariantRows = hasMultipleVariantDimensions
    ? variantCombinations.filter(isVariantRowEnabled)
    : variants.filter(isVariantRowEnabled)
  const visibleVariantRows = hasMultipleVariantDimensions
    ? variantCombinations
    : variants
  const sortedVisibleVariantRows = [...visibleVariantRows].sort(
    (left, right) =>
      Number(isVariantRowEnabled(right)) - Number(isVariantRowEnabled(left)),
  )
  const hasVariantRows = variants.length > 0
  const shouldShowVariantTabs = variants.length > 1
  const shouldUsePrimaryUnitFields = !hasVariantRows
  const isInlineVariantComposerVisible =
    USE_INLINE_VARIANT_COMPOSER && !!variantComposerMode
  const isVariantComposerEditMode =
    variantComposerMode === "edit-variant-label" ||
    variantComposerMode === "edit-variant-value"
  const filteredVariantTypes = useMemo(() => {
    const normalizedSearch = variantSearch.trim().toLowerCase()

    if (!normalizedSearch) return KNOWN_VARIANT_TYPES

    return KNOWN_VARIANT_TYPES.filter((variantType) =>
      variantType.toLowerCase().includes(normalizedSearch),
    )
  }, [variantSearch])
  const canAddTypedVariant =
    !!variantSearch.trim() &&
    !KNOWN_VARIANT_TYPES.some(
      (variantType) =>
        variantType.toLowerCase() === variantSearch.trim().toLowerCase(),
    )
  const selectedVariantValues = variants.filter(
    (variant) => variant.variantLabel === selectedVariantLabel,
  )
  const selectedVariantValueSuggestions =
    getVariantValueSuggestions(selectedVariantLabel)
  const availableVariantValueSuggestions =
    selectedVariantValueSuggestions.filter(
      (value) =>
        !selectedVariantValues.some(
          (variant) =>
            variant.name.trim().toLowerCase() === value.trim().toLowerCase(),
        ),
    )
  const inlineVariantTypeSuggestions = useMemo(() => {
    const defaultSuggestions = KNOWN_VARIANT_TYPES.slice(
      0,
      VARIANT_COMPOSER_DEFAULT_SUGGESTION_COUNT,
    )
    const normalizedSearch = variantComposerText.trim().toLowerCase()

    if (!normalizedSearch) return defaultSuggestions

    const matches = KNOWN_VARIANT_TYPES.filter((variantType) =>
      variantType.toLowerCase().includes(normalizedSearch),
    ).slice(0, VARIANT_COMPOSER_DEFAULT_SUGGESTION_COUNT)

    return matches.length > 0 ? matches : defaultSuggestions
  }, [variantComposerText])
  const inlineVariantValueSuggestions = useMemo(() => {
    const defaultSuggestions = availableVariantValueSuggestions.slice(
      0,
      VARIANT_COMPOSER_DEFAULT_SUGGESTION_COUNT,
    )
    const normalizedSearch = variantComposerText.trim().toLowerCase()

    if (!normalizedSearch) return defaultSuggestions

    const matches = availableVariantValueSuggestions
      .filter((value) => value.toLowerCase().includes(normalizedSearch))
      .slice(0, VARIANT_COMPOSER_DEFAULT_SUGGESTION_COUNT)

    return matches.length > 0 ? matches : defaultSuggestions
  }, [availableVariantValueSuggestions, variantComposerText])
  const variantComposerPills = useMemo<KeyboardInlineComposerPill[]>(() => {
    if (isVariantComposerEditMode || variantComposerMode === "variant-type") {
      return inlineVariantTypeSuggestions.map((variantType) => ({
        id: `type-${variantType}`,
        label: variantType,
      }))
    }

    if (variantComposerMode === "variant-value") {
      return [
        ...selectedVariantValues.map((variant) => ({
          id: variant.id,
          label: variant.name,
          removable: true,
          selected: true,
        })),
        ...inlineVariantValueSuggestions.map((value) => ({
          id: `value-${selectedVariantLabel}-${value}`,
          label: value,
        })),
      ]
    }

    return []
  }, [
    inlineVariantTypeSuggestions,
    inlineVariantValueSuggestions,
    isVariantComposerEditMode,
    selectedVariantLabel,
    selectedVariantValues,
    variantComposerMode,
  ])
  const variantComposerPlaceholder =
    variantComposerMode === "edit-variant-label"
      ? "Update variant name"
      : variantComposerMode === "edit-variant-value"
        ? "Update variant value"
        : variantComposerMode === "variant-value"
          ? `Enter ${selectedVariantLabel} values. Separate with comma or Enter`
          : "Enter a variant name or click a suggestion above."
  const filteredUnitSuggestions = useMemo(
    () => getFilteredUnitSuggestions(unitName),
    [unitName],
  )
  const shouldShowUnitSuggestions =
    shouldUsePrimaryUnitFields &&
    isUnitNameFocused &&
    filteredUnitSuggestions.length > 0 &&
    !isInlineVariantComposerVisible
  const createProductMutation = useMutation(
    trpc.retailOps.createProduct.mutationOptions({
      onError: (error) => {
        setSubmitError(error.message)
      },
      onSuccess: (createdProduct, input) => {
        const productionProduct = createdProduct as ProductionProduct
        const productInput = input as CreateProductInput
        const defaultUnit = getMatchingUnit(productionProduct, {
          isDefault: true,
          name: productInput.primaryUnitName,
        })

        addFirstProduct({
          businessId: activeBusinessId ?? undefined,
          description: productInput.description,
          imageLinks: productInput.imageLinks,
          imageUrl: productInput.imageUrl,
          name: productInput.name,
          price: productInput.priceMinor,
          remoteId: productionProduct.product.id,
          remoteVariantId: defaultUnit?.id,
          startingStock: productInput.openingStockQuantity,
          syncStatus: "synced",
          unitName: productInput.primaryUnitName,
          variants: productInput.variants.map((variant) => {
            const unit = getMatchingUnit(productionProduct, {
              name: variant.name,
            })

            return {
              conversionMultiplier: variant.conversionMultiplier,
              currentStock: variant.openingStockQuantity,
              enabled: variant.enabled,
              imageLinks: variant.imageLinks,
              imageUrl: variant.imageUrl,
              name: variant.name,
              price: variant.priceMinor,
              remoteId: unit?.id,
              startingStock: variant.openingStockQuantity,
              variantLabel: variant.variantLabel,
            }
          }),
        })
        setName("")
        setShowDescription(false)
        setDescription("")
        setUnitName("")
        setPrice("")
        setLocalImageUri("")
        setImageLinks([])
        setStartingStock("")
        setVariants([])
        setVariantSearch("")
        setSelectedVariantLabel("Size")
        setVariantValueName("")
        setVariantComposerMode(null)
        setVariantComposerText("")
        setVariantComposerEditTarget(null)
        setVariantActionTarget(null)
        setVariantSetupTab("variants")
        setIsUnitNameFocused(false)
        setSubmitError(null)
        onComplete?.()
      },
    }),
  )

  useEffect(() => {
    if (!hasMultipleVariantDimensions) {
      setVariantCombinations([])
      return
    }

    setVariantCombinations((current) => {
      const currentByKey = new Map(
        current.map((combination) => [combination.key, combination]),
      )

      return generatedVariantCombinationSeeds.map((seed) => {
        const existingCombination = currentByKey.get(seed.key)

        return existingCombination
          ? {
              ...existingCombination,
              name: seed.name,
              variantLabel: seed.variantLabel,
            }
          : createVariantCombinationDraft(seed)
      })
    })
  }, [generatedVariantCombinationSeeds, hasMultipleVariantDimensions])

  useEffect(() => {
    return () => {
      if (unitSuggestionBlurTimerRef.current) {
        clearTimeout(unitSuggestionBlurTimerRef.current)
      }
    }
  }, [])

  const areActiveVariantRowsValid =
    activeVariantRows.length > 0 &&
    activeVariantRows.every(
      (variant) =>
        !!variant.name.trim() &&
        areProductImageLinksValid([variant.imageUrl, ...variant.imageLinks]) &&
        isNumberInput(variant.price) &&
        parseAmount(variant.price) > 0 &&
        isWholeNumberInput(variant.stock) &&
        parseWholeQuantity(variant.stock) >= 0,
    )
  const arePrimaryUnitFieldsValid =
    !!unitName.trim() &&
    isNumberInput(price) &&
    parseAmount(price) > 0 &&
    isWholeNumberInput(startingStock) &&
    parseWholeQuantity(startingStock) >= 0
  const canSubmit =
    !isAtProductLimit &&
    !createProductMutation.isPending &&
    !!name.trim() &&
    description.trim().length <= 1000 &&
    areProductImageLinksValid(imageLinks) &&
    (shouldUsePrimaryUnitFields
      ? arePrimaryUnitFieldsValid
      : areActiveVariantRowsValid)

  const showUnitSuggestionBar = () => {
    if (unitSuggestionBlurTimerRef.current) {
      clearTimeout(unitSuggestionBlurTimerRef.current)
      unitSuggestionBlurTimerRef.current = null
    }

    setIsUnitNameFocused(true)
  }

  const hideUnitSuggestionBar = () => {
    if (unitSuggestionBlurTimerRef.current) {
      clearTimeout(unitSuggestionBlurTimerRef.current)
    }

    unitSuggestionBlurTimerRef.current = setTimeout(() => {
      setIsUnitNameFocused(false)
      unitSuggestionBlurTimerRef.current = null
    }, 120)
  }

  const focusVariantComposerInput = () => {
    setTimeout(() => {
      variantComposerInputRef.current?.focus()
    }, 80)
  }

  const openInlineVariantComposer = () => {
    setIsUnitNameFocused(false)
    setVariantComposerMode("variant-type")
    setVariantComposerText("")
    setVariantComposerEditTarget(null)
    focusVariantComposerInput()
  }

  const hideInlineVariantComposer = () => {
    if (!isInlineVariantComposerVisible) return

    setVariantComposerMode(null)
    setVariantComposerText("")
    setVariantComposerEditTarget(null)
  }

  useEffect(() => {
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      setVariantComposerMode(null)
      setVariantComposerText("")
      setVariantComposerEditTarget(null)
    })

    return () => {
      hideSubscription.remove()
    }
  }, [])

  const openVariantComposer = () => {
    if (USE_INLINE_VARIANT_COMPOSER) {
      openInlineVariantComposer()
      return
    }

    variantTypeModalRef.current?.present()
  }

  const selectInlineVariantLabel = (label: string) => {
    setSelectedVariantLabel(label.trim() || "Variant")
    setVariantComposerMode("variant-value")
    setVariantComposerEditTarget(null)
    setVariantComposerText("")
    focusVariantComposerInput()
  }

  const closeVariantActionSheet = () => {
    setVariantActionTarget(null)
  }

  const openVariantActionSheet = (target: VariantActionTarget) => {
    Keyboard.dismiss()
    setVariantActionTarget(target)
  }

  const openVariantLabelEditor = (label: string) => {
    closeVariantActionSheet()
    setTimeout(() => {
      setVariantComposerEditTarget({ label, type: "label" })
      setVariantComposerMode("edit-variant-label")
      setVariantComposerText(label)
      focusVariantComposerInput()
    }, 320)
  }

  const openVariantValueEditor = (id: string) => {
    const variant = variants.find((item) => item.id === id)
    if (!variant) return

    closeVariantActionSheet()
    setTimeout(() => {
      setSelectedVariantLabel(variant.variantLabel)
      setVariantComposerEditTarget({ id, type: "value" })
      setVariantComposerMode("edit-variant-value")
      setVariantComposerText(variant.name)
      focusVariantComposerInput()
    }, 320)
  }

  const closeVariantComposer = () => {
    setVariantComposerMode(null)
    setVariantComposerText("")
    setVariantComposerEditTarget(null)
    Keyboard.dismiss()
  }

  const updateVariant = (
    id: string,
    field: "conversionMultiplier" | "imageUrl" | "name" | "price" | "stock",
    value: string,
  ) => {
    setVariants((current) =>
      current.map((variant) =>
        variant.id === id ? { ...variant, [field]: value } : variant,
      ),
    )
  }

  const updateVariantCombination = (
    id: string,
    field: "imageUrl" | "price" | "stock",
    value: string,
  ) => {
    setVariantCombinations((current) =>
      current.map((variant) =>
        variant.id === id ? { ...variant, [field]: value } : variant,
      ),
    )
  }

  const removeVariant = (id: string) => {
    setVariants((current) => current.filter((variant) => variant.id !== id))
  }

  const removeVariantGroup = (label: string) => {
    const normalizedLabel = normalizeVariantDimension(label)

    setVariants((current) =>
      current.filter(
        (variant) =>
          normalizeVariantDimension(variant.variantLabel) !== normalizedLabel,
      ),
    )
  }

  const renameVariantGroup = (label: string, nextLabel: string) => {
    const trimmedLabel = nextLabel.trim()
    if (!trimmedLabel) return

    const normalizedLabel = normalizeVariantDimension(label)

    setVariants((current) =>
      current.map((variant) =>
        normalizeVariantDimension(variant.variantLabel) === normalizedLabel
          ? { ...variant, variantLabel: trimmedLabel }
          : variant,
      ),
    )
    setSelectedVariantLabel((current) =>
      normalizeVariantDimension(current) === normalizedLabel
        ? trimmedLabel
        : current,
    )
  }

  const renameVariantValue = (id: string, nextName: string) => {
    const trimmedName = nextName.trim()
    if (!trimmedName) return

    setVariants((current) =>
      current.map((variant) =>
        variant.id === id ? { ...variant, name: trimmedName } : variant,
      ),
    )
  }

  const buildCreateProductInput = (): CreateProductInput => {
    const normalizedImageLinks = cleanImageLinks(imageLinks)
    const primaryPriceMinor = shouldUsePrimaryUnitFields
      ? parseAmount(price)
      : parseAmount(activeVariantRows[0]?.price ?? price)
    const primaryUnitName = shouldUsePrimaryUnitFields
      ? unitName.trim()
      : getHiddenVariantParentUnitName(
          activeVariantRows.map((variant) => variant.name),
        )

    return {
      description: description.trim() || undefined,
      name: name.trim(),
      imageLinks: normalizedImageLinks,
      imageUrl: normalizedImageLinks[0],
      openingStockQuantity: shouldUsePrimaryUnitFields
        ? parseWholeQuantity(startingStock)
        : 0,
      priceMinor: primaryPriceMinor,
      primaryUnitName,
      variants: activeVariantRows
        .filter(
          (variant) =>
            variant.enabled &&
            variant.name.trim() &&
            parseAmount(variant.price),
        )
        .map((variant) => ({
          conversionMultiplier: hasMultipleVariantDimensions
            ? 1
            : parseAmount((variant as VariantDraft).conversionMultiplier) ||
              inferConversionMultiplier(variant.name),
          enabled: variant.enabled,
          imageLinks: cleanImageLinks(variant.imageLinks),
          imageUrl: variant.imageUrl.trim() || undefined,
          name: variant.name.trim(),
          openingStockQuantity: parseWholeQuantity(variant.stock),
          priceMinor: parseAmount(variant.price),
          variantLabel: variant.variantLabel.trim() || undefined,
        })),
    }
  }

  const addImageLink = () => {
    setImageLinks((current) => [...current, ""])
  }

  const updateImageLink = (index: number, value: string) => {
    setImageLinks((current) =>
      current.map((link, linkIndex) => (linkIndex === index ? value : link)),
    )
  }

  const removeImageLink = (index: number) => {
    setImageLinks((current) =>
      current.filter((_, linkIndex) => linkIndex !== index),
    )
  }

  const updateVariantImageLink = (
    variantId: string,
    index: number,
    value: string,
  ) => {
    setVariants((current) =>
      current.map((variant) =>
        variant.id === variantId
          ? {
              ...variant,
              imageLinks: variant.imageLinks.map((link, linkIndex) =>
                linkIndex === index ? value : link,
              ),
            }
          : variant,
      ),
    )
  }

  const updateVariantCombinationImageLink = (
    variantId: string,
    index: number,
    value: string,
  ) => {
    setVariantCombinations((current) =>
      current.map((variant) =>
        variant.id === variantId
          ? {
              ...variant,
              imageLinks: variant.imageLinks.map((link, linkIndex) =>
                linkIndex === index ? value : link,
              ),
            }
          : variant,
      ),
    )
  }

  const addVariantImageLink = (variantId: string) => {
    setVariants((current) =>
      current.map((variant) =>
        variant.id === variantId
          ? { ...variant, imageLinks: [...variant.imageLinks, ""] }
          : variant,
      ),
    )
  }

  const addVariantCombinationImageLink = (variantId: string) => {
    setVariantCombinations((current) =>
      current.map((variant) =>
        variant.id === variantId
          ? { ...variant, imageLinks: [...variant.imageLinks, ""] }
          : variant,
      ),
    )
  }

  const removeVariantImageLink = (variantId: string, index: number) => {
    setVariants((current) =>
      current.map((variant) =>
        variant.id === variantId
          ? {
              ...variant,
              imageLinks: variant.imageLinks.filter(
                (_, linkIndex) => linkIndex !== index,
              ),
            }
          : variant,
      ),
    )
  }

  const removeVariantCombinationImageLink = (
    variantId: string,
    index: number,
  ) => {
    setVariantCombinations((current) =>
      current.map((variant) =>
        variant.id === variantId
          ? {
              ...variant,
              imageLinks: variant.imageLinks.filter(
                (_, linkIndex) => linkIndex !== index,
              ),
            }
          : variant,
      ),
    )
  }

  const pickProductImage = async (source: "camera" | "library") => {
    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            quality: 0.8,
          })
        : await ImagePicker.launchImageLibraryAsync({
            allowsEditing: true,
            mediaTypes: ["images"],
            quality: 0.8,
          })

    if (!result.canceled && result.assets[0]?.uri) {
      setLocalImageUri(result.assets[0].uri)
    }
  }

  const openImagePicker = () => {
    Alert.alert("Add item image", "Choose an image source.", [
      { text: "Take picture", onPress: () => void pickProductImage("camera") },
      { text: "Pick image", onPress: () => void pickProductImage("library") },
      { style: "cancel", text: "Cancel" },
    ])
  }

  const selectVariantLabel = (label: string) => {
    setSelectedVariantLabel(label.trim() || "Variant")
    setVariantSearch("")
    variantTypeModalRef.current?.dismiss()
    variantValuesModalRef.current?.present()
  }

  const addVariantValueByName = (name: string) => {
    const value = name.trim()
    if (!value) return

    const exists = variants.some(
      (variant) =>
        variant.variantLabel.trim().toLowerCase() ===
          selectedVariantLabel.trim().toLowerCase() &&
        variant.name.trim().toLowerCase() === value.toLowerCase(),
    )

    if (!exists) {
      setVariants((current) => [
        ...current,
        createVariantDraft(selectedVariantLabel, value),
      ])
    }
  }

  const addVariantValue = () => {
    addVariantValueByName(variantValueName)
    setVariantValueName("")
  }

  const addInlineVariantValueByName = (name: string) => {
    addVariantValueByName(name)
    setVariantComposerText("")
    focusVariantComposerInput()
  }

  const addInlineVariantValuesFromText = (text: string) => {
    for (const part of text.split(",")) {
      addVariantValueByName(part)
    }
    setVariantComposerText("")
    focusVariantComposerInput()
  }

  const submitInlineVariantComposer = () => {
    const value = variantComposerText.trim()
    if (!value) return

    if (
      variantComposerMode === "edit-variant-label" &&
      variantComposerEditTarget?.type === "label"
    ) {
      renameVariantGroup(variantComposerEditTarget.label, value)
      closeVariantComposer()
      return
    }

    if (
      variantComposerMode === "edit-variant-value" &&
      variantComposerEditTarget?.type === "value"
    ) {
      renameVariantValue(variantComposerEditTarget.id, value)
      closeVariantComposer()
      return
    }

    if (variantComposerMode === "variant-type") {
      selectInlineVariantLabel(value)
      return
    }

    if (variantComposerMode === "variant-value") {
      addInlineVariantValuesFromText(value)
    }
  }

  const changeVariantComposerText = (value: string) => {
    if (variantComposerMode === "edit-variant-value") {
      setVariantComposerText(value.replace(/,/g, ""))
      return
    }

    if (variantComposerMode !== "variant-value" || !value.includes(",")) {
      setVariantComposerText(value)
      return
    }

    for (const part of value.split(",")) {
      addVariantValueByName(part)
    }
    setVariantComposerText("")
    focusVariantComposerInput()
  }

  const pressVariantComposerPill = (pill: KeyboardInlineComposerPill) => {
    if (variantComposerMode === "edit-variant-label") {
      setVariantComposerText(pill.label)
      return
    }

    if (variantComposerMode === "variant-type") {
      selectInlineVariantLabel(pill.label)
      return
    }

    if (variantComposerMode === "variant-value") {
      addInlineVariantValueByName(pill.label)
    }
  }

  const removeVariantComposerPill = (pill: KeyboardInlineComposerPill) => {
    if (!pill.removable) return

    removeVariant(pill.id)
    focusVariantComposerInput()
  }

  const openVariantValueComposer = (label: string) => {
    closeVariantActionSheet()
    setSelectedVariantLabel(label.trim() || "Variant")
    setVariantComposerMode("variant-value")
    setVariantComposerText("")
    setVariantComposerEditTarget(null)
    focusVariantComposerInput()
  }

  const toggleVariantValueEnabled = (id: string) => {
    setVariants((current) =>
      current.map((variant) =>
        variant.id === id ? { ...variant, enabled: !variant.enabled } : variant,
      ),
    )
  }

  const removeVariantActionTarget = () => {
    if (variantActionTarget?.type === "group") {
      removeVariantGroup(variantActionTarget.label)
    }

    if (variantActionTarget?.type === "value") {
      removeVariant(variantActionTarget.id)
    }

    closeVariantActionSheet()
  }

  const editVariantActionTarget = () => {
    if (variantActionTarget?.type === "group") {
      openVariantLabelEditor(variantActionTarget.label)
      return
    }

    if (variantActionTarget?.type === "value") {
      openVariantValueEditor(variantActionTarget.id)
    }
  }

  const toggleVariantActionTarget = () => {
    if (variantActionTarget?.type === "stock") {
      const stockRow = visibleVariantRows.find(
        (variant) => variant.id === variantActionTarget.id,
      )

      if (stockRow) {
        toggleVariantRowEnabled(stockRow.id, !isVariantRowEnabled(stockRow))
      }
    }

    if (variantActionTarget?.type === "value") {
      toggleVariantValueEnabled(variantActionTarget.id)
    }

    closeVariantActionSheet()
  }

  const toggleVariantEnabled = (id: string, enabled: boolean) => {
    setVariants((current) =>
      current.map((variant) =>
        variant.id === id ? { ...variant, enabled } : variant,
      ),
    )
  }

  const toggleVariantCombinationEnabled = (id: string, enabled: boolean) => {
    setVariantCombinations((current) =>
      current.map((variant) =>
        variant.id === id ? { ...variant, enabled } : variant,
      ),
    )
  }

  const toggleVariantExpanded = (id: string) => {
    setVariants((current) =>
      current.map((variant) =>
        variant.id === id
          ? { ...variant, expanded: !variant.expanded }
          : variant,
      ),
    )
  }

  const toggleVariantCombinationExpanded = (id: string) => {
    setVariantCombinations((current) =>
      current.map((variant) =>
        variant.id === id
          ? { ...variant, expanded: !variant.expanded }
          : variant,
      ),
    )
  }

  const updateVariantRow = (
    id: string,
    field: "imageUrl" | "price" | "stock",
    value: string,
  ) => {
    if (hasMultipleVariantDimensions) {
      updateVariantCombination(id, field, value)
      return
    }

    updateVariant(id, field, value)
  }

  const toggleVariantRowEnabled = (id: string, enabled: boolean) => {
    if (hasMultipleVariantDimensions) {
      toggleVariantCombinationEnabled(id, enabled)
      return
    }

    toggleVariantEnabled(id, enabled)
  }

  const toggleVariantRowExpanded = (id: string) => {
    if (hasMultipleVariantDimensions) {
      toggleVariantCombinationExpanded(id)
      return
    }

    toggleVariantExpanded(id)
  }

  const updateVariantRowImageLink = (
    variantId: string,
    index: number,
    value: string,
  ) => {
    if (hasMultipleVariantDimensions) {
      updateVariantCombinationImageLink(variantId, index, value)
      return
    }

    updateVariantImageLink(variantId, index, value)
  }

  const addVariantRowImageLink = (variantId: string) => {
    if (hasMultipleVariantDimensions) {
      addVariantCombinationImageLink(variantId)
      return
    }

    addVariantImageLink(variantId)
  }

  const removeVariantRowImageLink = (variantId: string, index: number) => {
    if (hasMultipleVariantDimensions) {
      removeVariantCombinationImageLink(variantId, index)
      return
    }

    removeVariantImageLink(variantId, index)
  }

  const submit = () => {
    if (!canSubmit) return

    const input = buildCreateProductInput()

    setSubmitError(null)

    if (!shouldUseLocalQueue) {
      createProductMutation.mutate(input)
      return
    }

    addFirstProduct({
      businessId: activeBusinessId ?? undefined,
      description: input.description,
      imageLinks: input.imageLinks,
      imageUrl: input.imageUrl,
      name: input.name,
      price: input.priceMinor,
      startingStock: input.openingStockQuantity,
      unitName: input.primaryUnitName,
      variants: input.variants.map((variant) => ({
        conversionMultiplier: variant.conversionMultiplier,
        enabled: variant.enabled,
        imageLinks: variant.imageLinks,
        imageUrl: variant.imageUrl,
        name: variant.name,
        price: variant.priceMinor,
        startingStock: variant.openingStockQuantity,
        variantLabel: variant.variantLabel,
      })),
    })
    setName("")
    setShowDescription(false)
    setDescription("")
    setUnitName("")
    setPrice("")
    setLocalImageUri("")
    setImageLinks([])
    setStartingStock("")
    setVariants([])
    setVariantCombinations([])
    setVariantSearch("")
    setSelectedVariantLabel("Size")
    setVariantValueName("")
    setVariantComposerMode(null)
    setVariantComposerText("")
    setVariantComposerEditTarget(null)
    setVariantActionTarget(null)
    setVariantSetupTab("variants")
    setIsUnitNameFocused(false)
    onComplete?.()
  }
  const contentClassName =
    presentation === "screen" ? "gap-7 px-4 pb-6 pt-1" : "gap-7 px-5 pb-6 pt-1"
  const selectedActionGroup =
    variantActionTarget?.type === "group"
      ? variantGroups.find(
          (group) =>
            normalizeVariantDimension(group.label) ===
            normalizeVariantDimension(variantActionTarget.label),
        )
      : undefined
  const selectedActionValue =
    variantActionTarget?.type === "value"
      ? variants.find((variant) => variant.id === variantActionTarget.id)
      : undefined
  const selectedActionStock =
    variantActionTarget?.type === "stock"
      ? visibleVariantRows.find(
          (variant) => variant.id === variantActionTarget.id,
        )
      : undefined
  const selectedActionIsEnabled =
    variantActionTarget?.type === "group"
      ? !!selectedActionGroup?.values.some((value) => value.enabled)
      : variantActionTarget?.type === "value"
        ? !!selectedActionValue?.enabled
        : variantActionTarget?.type === "stock" && selectedActionStock
          ? isVariantRowEnabled(selectedActionStock)
          : false
  const variantActionTitle =
    selectedActionGroup?.label ??
    selectedActionValue?.name ??
    selectedActionStock?.name ??
    "Variant"
  const variantActionSubtitle = selectedActionIsEnabled ? "Active" : "Inactive"
  const variantManagementTabs = (
    <View className="flex-row rounded-full bg-muted p-1">
      {(["variants", "stocks"] as VariantSetupTab[]).map((tab) => {
        const isSelected = tab === variantSetupTab

        return (
          <Pressable
            accessibilityLabel={`Show ${tab}`}
            className={cn(
              "min-h-10 flex-1 items-center justify-center rounded-full px-4",
              isSelected ? "bg-background" : "bg-transparent",
            )}
            haptic
            key={tab}
            onPress={() => setVariantSetupTab(tab)}
            transition
          >
            <Text
              className={cn(
                "text-sm font-extrabold capitalize",
                isSelected ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {tab}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
  const variantGroupsView = (
    <View className="gap-5">
      {variantGroups.map((group) => {
        const sortedValues = [...group.values].sort(
          (left, right) => Number(right.enabled) - Number(left.enabled),
        )

        return (
          <View className="gap-3 border-b border-border pb-4" key={group.label}>
            <View className="flex-row items-center justify-between gap-3">
              <View className="min-w-0 flex-1">
                <Text className="text-base font-extrabold text-foreground">
                  {group.label}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {group.values.some((value) => value.enabled)
                    ? "Active"
                    : "Inactive"}
                </Text>
              </View>
              <Pressable
                accessibilityLabel={`Open ${group.label} variant options`}
                className="h-10 w-10 items-center justify-center rounded-full bg-muted"
                haptic
                onPress={() =>
                  openVariantActionSheet({
                    label: group.label,
                    type: "group",
                  })
                }
                transition
              >
                <Icon className="size-sm text-foreground" name="Pencil" />
              </Pressable>
            </View>

            <View className="flex-row flex-wrap gap-2">
              {sortedValues.map((variant) => (
                <Pressable
                  accessibilityLabel={`Open ${variant.name} variant value options`}
                  className={cn(
                    "min-h-10 flex-row items-center gap-2 rounded-full border px-3",
                    variant.enabled
                      ? "border-primary bg-primary"
                      : "border-border bg-muted",
                  )}
                  haptic
                  key={variant.id}
                  onPress={() =>
                    openVariantActionSheet({
                      id: variant.id,
                      type: "value",
                    })
                  }
                  transition
                >
                  <Text
                    className={cn(
                      "text-xs font-bold",
                      variant.enabled
                        ? "text-primary-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {variant.name}
                  </Text>
                  <Icon
                    className={cn(
                      "size-xs",
                      variant.enabled
                        ? "text-primary-foreground"
                        : "text-muted-foreground",
                    )}
                    name="X"
                  />
                </Pressable>
              ))}
              <Pressable
                accessibilityLabel={`Add ${group.label} variant value`}
                className="min-h-10 flex-row items-center gap-2 rounded-full border border-border bg-card px-3"
                haptic
                onPress={() => openVariantValueComposer(group.label)}
                transition
              >
                <Icon className="size-xs text-foreground" name="Plus" />
                <Text className="text-xs font-bold text-foreground">add</Text>
              </Pressable>
            </View>
          </View>
        )
      })}
    </View>
  )
  const stockRowsView = (
    <View className="gap-4">
      {hasMultipleVariantDimensions ? (
        <SetupInlineNotice
          icon="ListChecks"
          text="Multiple variant labels generate sellable combination rows."
          tone="primary"
        />
      ) : null}
      {sortedVisibleVariantRows.map((variant) => {
        const rowIsEnabled = isVariantRowEnabled(variant)

        return (
          <View
            className={cn(
              "gap-3 border-t border-border pt-4",
              rowIsEnabled ? "opacity-100" : "opacity-60",
            )}
            key={variant.id}
          >
            <View className="flex-row items-center gap-3">
              <View className="min-w-0 flex-1">
                <Text className="text-xs font-bold uppercase tracking-[1px] text-muted-foreground">
                  {variant.variantLabel}
                </Text>
                <Text className="font-semibold text-foreground">
                  {variant.name || "New variant"}
                </Text>
              </View>
              {!rowIsEnabled ? (
                <Text className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
                  Inactive
                </Text>
              ) : null}
              <Pressable
                accessibilityLabel="Expand stock row"
                className="h-10 w-10 items-center justify-center rounded-full bg-muted"
                haptic
                onPress={() => toggleVariantRowExpanded(variant.id)}
                transition
              >
                <Icon
                  className="size-sm text-foreground"
                  name={variant.expanded ? "ChevronDown" : "ChevronRight"}
                />
              </Pressable>
              <Pressable
                accessibilityLabel="Open stock row options"
                className="h-10 w-10 items-center justify-center rounded-full bg-muted"
                haptic
                onPress={() =>
                  openVariantActionSheet({
                    id: variant.id,
                    type: "stock",
                  })
                }
                transition
              >
                <Icon className="size-sm text-foreground" name="Pencil" />
              </Pressable>
            </View>

            <View className="flex-row gap-3">
              <View className="min-w-0 flex-1">
                <FormField
                  inputMode="decimal"
                  keyboardType="numeric"
                  label="Price"
                  leadingIcon="CircleDollarSign"
                  onChangeText={(value) =>
                    updateVariantRow(variant.id, "price", value)
                  }
                  placeholder="Enter price"
                  value={variant.price}
                />
              </View>
              <View className="min-w-0 flex-1">
                <FormField
                  inputMode="numeric"
                  keyboardType="numeric"
                  label="Stock"
                  leadingIcon="Warehouse"
                  onChangeText={(value) =>
                    updateVariantRow(
                      variant.id,
                      "stock",
                      normalizeWholeNumberInput(value),
                    )
                  }
                  placeholder="Enter stock"
                  value={variant.stock}
                />
              </View>
            </View>

            {variant.expanded ? (
              <View className="gap-3 rounded-2xl bg-muted/40 p-3">
                <FormField
                  autoCapitalize="none"
                  autoCorrect={false}
                  error={
                    isProductImageUrlInput(variant.imageUrl)
                      ? undefined
                      : "Enter a valid image link."
                  }
                  inputMode="url"
                  keyboardType="url"
                  label="Variant image link"
                  leadingIcon="Globe"
                  onChangeText={(value) =>
                    updateVariantRow(variant.id, "imageUrl", value)
                  }
                  placeholder="Enter variant image link"
                  value={variant.imageUrl}
                />
                {variant.imageLinks.map((link, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: editable link rows do not have persisted ids yet
                  <View className="flex-row items-end gap-2" key={index}>
                    <View className="min-w-0 flex-1">
                      <FormField
                        autoCapitalize="none"
                        autoCorrect={false}
                        error={
                          isProductImageUrlInput(link)
                            ? undefined
                            : "Enter a valid image link."
                        }
                        inputMode="url"
                        keyboardType="url"
                        label="Variant image link"
                        leadingIcon="Globe"
                        onChangeText={(value) =>
                          updateVariantRowImageLink(variant.id, index, value)
                        }
                        placeholder="Enter variant image link"
                        value={link}
                      />
                    </View>
                    <Pressable
                      accessibilityLabel="Remove variant image link"
                      className="mb-1 h-12 w-12 items-center justify-center rounded-xl bg-destructive/10"
                      haptic
                      onPress={() =>
                        removeVariantRowImageLink(variant.id, index)
                      }
                      transition
                    >
                      <Icon className="size-sm text-destructive" name="Trash" />
                    </Pressable>
                  </View>
                ))}
                <ActionButton
                  icon="Plus"
                  onPress={() => addVariantRowImageLink(variant.id)}
                  variant="ghost"
                >
                  Add image link
                </ActionButton>
              </View>
            ) : null}
          </View>
        )
      })}
    </View>
  )
  const variantSetupContent = shouldShowVariantTabs ? (
    <View className="gap-4">
      {variantManagementTabs}
      {variantSetupTab === "variants" ? variantGroupsView : stockRowsView}
    </View>
  ) : (
    <SetupSection
      description="Does this item have multiple prices based on different variants?"
      title="Variants"
    >
      <ActionButton icon="Plus" onPress={openVariantComposer} variant="outline">
        Add variant
      </ActionButton>

      {variants.length === 0 ? (
        <View className="gap-3 border-y border-border py-5">
          <Text className="text-center font-semibold text-foreground">
            No variants yet
          </Text>
          <Text className="text-center text-sm leading-5 text-muted-foreground">
            You can skip this and continue with only the primary unit.
          </Text>
        </View>
      ) : (
        stockRowsView
      )}
    </SetupSection>
  )

  const content = (
    <>
      <View className={contentClassName}>
        <SetupFlowHeader
          badgeIcon="FilePenLine"
          badgeLabel="Item details"
          currentStep={1}
          description="Add the item, media, and either a primary unit or variant prices."
          steps={FIRST_PRODUCT_STEPS}
          title="Set up item"
        />

        {shouldUseLocalQueue ? (
          <SetupInlineNotice
            icon="Wind"
            text="This item will sync when connection is ready."
            tone="warning"
          />
        ) : null}

        <SetupSection
          description="Only the item name and one price path are required."
          title="Item"
        >
          <FormField
            label="Item name"
            leadingIcon="FileText"
            onChangeText={setName}
            placeholder="Enter item name"
            value={name}
          />

          {showDescription ? (
            <FormField
              error={
                description.trim().length <= 1000
                  ? undefined
                  : "Keep the product description under 1000 characters."
              }
              helper="Optional. This appears in the shared product page and link preview."
              label="Description"
              leadingIcon="StickyNote"
              multiline
              onChangeText={setDescription}
              placeholder="Enter product description"
              value={description}
            />
          ) : (
            <ActionButton
              icon="Plus"
              onPress={() => setShowDescription(true)}
              variant="ghost"
            >
              Add Description
            </ActionButton>
          )}
        </SetupSection>

        <SetupSection
          description="Use the camera, gallery, or public links. Public links are used for shared product previews."
          title="Product image links"
        >
          <Pressable
            accessibilityLabel="Pick or take item image"
            className="min-h-32 items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/40 p-4"
            haptic
            onPress={openImagePicker}
            transition
          >
            {localImageUri ? (
              <Image
                className="h-24 w-24 rounded-xl"
                contentFit="cover"
                source={{ uri: localImageUri }}
              />
            ) : (
              <View className="h-14 w-14 items-center justify-center rounded-full bg-card">
                <Icon className="size-lg text-muted-foreground" name="Camera" />
              </View>
            )}
            <Text className="text-center text-sm font-semibold text-foreground">
              Pick image or take picture
            </Text>
            {localImageUri ? (
              <Text className="text-center text-xs leading-5 text-muted-foreground">
                Captured images stay on this device until upload support is
                connected.
              </Text>
            ) : null}
          </Pressable>

          {imageLinks.length === 0 ? (
            <ActionButton icon="Plus" onPress={addImageLink} variant="ghost">
              Add image link
            </ActionButton>
          ) : (
            <View className="gap-3">
              {imageLinks.map((link, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: editable link rows do not have persisted ids yet
                <View className="flex-row items-end gap-2" key={index}>
                  <View className="min-w-0 flex-1">
                    <FormField
                      autoCapitalize="none"
                      autoCorrect={false}
                      error={
                        isProductImageUrlInput(link)
                          ? undefined
                          : "Enter a valid image link."
                      }
                      inputMode="url"
                      keyboardType="url"
                      label="Product image link"
                      leadingIcon="Globe"
                      onChangeText={(value) => updateImageLink(index, value)}
                      placeholder="Enter product image link"
                      value={link}
                    />
                  </View>
                  <Pressable
                    accessibilityLabel="Remove image link"
                    className="mb-1 h-12 w-12 items-center justify-center rounded-xl bg-destructive/10"
                    haptic
                    onPress={() => removeImageLink(index)}
                    transition
                  >
                    <Icon className="size-sm text-destructive" name="Trash" />
                  </Pressable>
                </View>
              ))}
              <View className="items-end">
                <ActionButton
                  className="w-auto px-4"
                  icon="Plus"
                  onPress={addImageLink}
                  variant="ghost"
                >
                  Add more
                </ActionButton>
              </View>
            </View>
          )}
        </SetupSection>

        {shouldUsePrimaryUnitFields ? (
          <SetupSection
            description="Use this path when the item has one selling unit."
            title="Primary unit, price, and stock"
          >
            <FormField
              autoCapitalize="words"
              label="Primary unit"
              leadingIcon="Hash"
              onBlur={hideUnitSuggestionBar}
              onChangeText={setUnitName}
              onFocus={showUnitSuggestionBar}
              placeholder="Enter unit name"
              value={unitName}
            />

            <View className="flex-row gap-3">
              <View className="min-w-0 flex-1">
                <FormField
                  inputMode="decimal"
                  keyboardType="numeric"
                  label="Price per unit"
                  leadingIcon="CircleDollarSign"
                  onChangeText={setPrice}
                  placeholder="Enter price"
                  value={price}
                />
              </View>
              <View className="min-w-0 flex-1">
                <FormField
                  inputMode="numeric"
                  keyboardType="numeric"
                  label="Current stock"
                  leadingIcon="Warehouse"
                  onChangeText={(value) =>
                    setStartingStock(normalizeWholeNumberInput(value))
                  }
                  placeholder="Enter stock"
                  value={startingStock}
                />
              </View>
            </View>
          </SetupSection>
        ) : null}

        {variantSetupContent}

        {isAtProductLimit ? (
          <StatusBanner
            icon="TriangleAlert"
            message={`${plan.name} allows ${plan.limits.products} products. Open Subscription to move to a higher tier.`}
            title="Product limit reached"
            tone="destructive"
          />
        ) : null}

        {submitError ? (
          <StatusBanner
            icon="TriangleAlert"
            message={submitError}
            title="Item was not added"
            tone="destructive"
          />
        ) : null}

        {shouldShowVariantTabs && variantSetupTab === "variants" ? (
          <ActionButton
            icon="Plus"
            key="add-variant"
            onPress={openVariantComposer}
          >
            Add variant
          </ActionButton>
        ) : (
          <ActionButton
            disabled={!canSubmit}
            isLoading={createProductMutation.isPending}
            key="add-item"
            loadingLabel="Adding item"
            onPress={submit}
          >
            Add item
          </ActionButton>
        )}
      </View>

      <Modal
        ref={variantTypeModalRef}
        snapPoints={["100%"]}
        title="Add variant"
      >
        <BottomSheetKeyboardAwareScrollView
          bottomOffset={320}
          contentContainerStyle={{ paddingBottom: 160 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-5 px-5 pb-6">
            <FormField
              autoCapitalize="words"
              label="Find variant"
              leadingIcon="Search"
              onChangeText={setVariantSearch}
              placeholder="Search size, color, unit"
              value={variantSearch}
            />
            <View className="gap-2">
              {filteredVariantTypes.map((variantType) => (
                <Pressable
                  accessibilityLabel={`Select ${variantType} variant`}
                  className="flex-row items-center justify-between border-b border-border py-4"
                  haptic
                  key={variantType}
                  onPress={() => selectVariantLabel(variantType)}
                  transition
                >
                  <View className="min-w-0 flex-1">
                    <Text className="font-semibold text-foreground">
                      {variantType}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      Known variant type
                    </Text>
                  </View>
                  <Icon
                    className="size-sm text-muted-foreground"
                    name="ChevronRight"
                  />
                </Pressable>
              ))}
              {canAddTypedVariant ? (
                <Pressable
                  accessibilityLabel="Add typed variant"
                  className="flex-row items-center justify-between rounded-2xl bg-muted p-4"
                  haptic
                  onPress={() => selectVariantLabel(variantSearch)}
                  transition
                >
                  <Text className="font-semibold text-foreground">
                    Add "{variantSearch.trim()}"
                  </Text>
                  <Icon className="size-sm text-primary" name="Plus" />
                </Pressable>
              ) : null}
              {filteredVariantTypes.length === 0 && !canAddTypedVariant ? (
                <Text className="py-8 text-center text-sm text-muted-foreground">
                  No matching variants.
                </Text>
              ) : null}
            </View>
          </View>
        </BottomSheetKeyboardAwareScrollView>
      </Modal>

      <Modal
        hideHeader
        ref={variantValuesModalRef}
        snapPoints={["72%"]}
        title={`${selectedVariantLabel} Variants (${selectedVariantValues.length})`}
      >
        <BottomSheetKeyboardAwareScrollView
          bottomOffset={120}
          contentContainerStyle={{ paddingBottom: 24 }}
          extraKeyboardSpace={96}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-4 px-5 pb-5">
            <View className="flex-row items-center justify-between gap-3">
              <View className="min-w-0 flex-1">
                <Text className="text-xl font-extrabold text-foreground">
                  {selectedVariantLabel} values
                </Text>
                <Text className="text-sm text-muted-foreground">
                  Add the values customers can choose from.
                </Text>
              </View>
              <ActionButton
                className="w-auto px-4"
                onPress={() => variantValuesModalRef.current?.dismiss()}
                variant="ghost"
              >
                Done
              </ActionButton>
            </View>

            {selectedVariantValues.length > 0 ? (
              <View className="flex-row flex-wrap gap-2">
                {selectedVariantValues.map((variant) => (
                  <Pressable
                    accessibilityLabel={`Remove ${variant.name} variant value`}
                    className="min-h-10 flex-row items-center gap-2 rounded-full bg-primary px-3"
                    haptic
                    key={variant.id}
                    onPress={() => removeVariant(variant.id)}
                    transition
                  >
                    <Text className="text-xs font-bold text-primary-foreground">
                      {variant.name}
                    </Text>
                    <Icon
                      className="size-xs text-primary-foreground"
                      name="X"
                    />
                  </Pressable>
                ))}
              </View>
            ) : null}

            {availableVariantValueSuggestions.length > 0 ? (
              <View className="gap-3">
                <Text className="text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground">
                  Common values
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {availableVariantValueSuggestions.map((value) => (
                    <SetupChoicePill
                      key={value}
                      onPress={() => addVariantValueByName(value)}
                    >
                      {value}
                    </SetupChoicePill>
                  ))}
                </View>
              </View>
            ) : null}

            <View className="flex-row items-end gap-2">
              <View className="min-w-0 flex-1">
                <FormField
                  label="Variant value name"
                  leadingIcon="FileText"
                  onChangeText={setVariantValueName}
                  placeholder="Enter variant value"
                  value={variantValueName}
                />
              </View>
              <Pressable
                accessibilityLabel="Add variant value"
                className="mb-1 h-12 w-12 items-center justify-center rounded-full bg-primary"
                haptic
                onPress={addVariantValue}
                transition
              >
                <Icon className="size-sm text-primary-foreground" name="Plus" />
              </Pressable>
            </View>
          </View>
        </BottomSheetKeyboardAwareScrollView>
      </Modal>
    </>
  )
  const variantActionModal = (
    <NativeModal
      animationType="fade"
      navigationBarTranslucent
      onRequestClose={closeVariantActionSheet}
      statusBarTranslucent
      transparent
      visible={!!variantActionTarget}
    >
      <View className="flex-1 justify-end bg-foreground/40 px-2 pb-5">
        <Pressable
          accessibilityLabel="Close variant options"
          className="absolute inset-0"
          onPress={closeVariantActionSheet}
        />
        <View className="gap-5 rounded-[28px] border border-border bg-card px-5 pb-6 pt-3">
          <View className="h-1.5 w-12 self-center rounded-full bg-muted-foreground/25" />
          <View className="gap-1">
            <Text className="text-xl font-extrabold text-foreground">
              {variantActionTitle}
            </Text>
            <Text className="text-sm text-muted-foreground">
              {variantActionSubtitle}
            </Text>
          </View>

          <View className="gap-1">
            {variantActionTarget?.type === "group" ||
            variantActionTarget?.type === "value" ? (
              <Pressable
                accessibilityLabel={`Edit ${variantActionTitle}`}
                className="flex-row items-center gap-3 border-b border-border py-4"
                haptic
                onPress={editVariantActionTarget}
                transition
              >
                <View className="h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <Icon className="size-sm text-foreground" name="Pencil" />
                </View>
                <Text className="font-semibold text-foreground">Edit</Text>
              </Pressable>
            ) : null}

            {variantActionTarget?.type === "stock" ||
            variantActionTarget?.type === "value" ? (
              <Pressable
                accessibilityLabel={
                  selectedActionIsEnabled
                    ? `Disable ${variantActionTitle}`
                    : `Enable ${variantActionTitle}`
                }
                className="flex-row items-center gap-3 border-b border-border py-4"
                haptic
                onPress={toggleVariantActionTarget}
                transition
              >
                <View className="h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <Icon
                    className="size-sm text-foreground"
                    name={selectedActionIsEnabled ? "EyeOff" : "Check"}
                  />
                </View>
                <Text className="font-semibold text-foreground">
                  {selectedActionIsEnabled ? "Disable" : "Enable"}
                </Text>
              </Pressable>
            ) : null}

            {variantActionTarget?.type === "group" ||
            variantActionTarget?.type === "value" ? (
              <Pressable
                accessibilityLabel={`Remove ${variantActionTitle}`}
                className="flex-row items-center gap-3 py-4"
                haptic
                onPress={removeVariantActionTarget}
                transition
              >
                <View className="h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                  <Icon className="size-sm text-destructive" name="Trash" />
                </View>
                <Text className="font-semibold text-destructive">Remove</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </NativeModal>
  )
  const unitSuggestionKeyboardBar = (
    <UnitSuggestionKeyboardBar
      onSelect={setUnitName}
      suggestions={filteredUnitSuggestions}
      value={unitName}
      visible={shouldShowUnitSuggestions}
    />
  )
  const variantKeyboardComposer = (
    <KeyboardInlineComposer
      hideSubmitButton={variantComposerMode === "variant-value"}
      onChangeText={changeVariantComposerText}
      onPillPress={pressVariantComposerPill}
      onRemovePill={removeVariantComposerPill}
      onSubmit={submitInlineVariantComposer}
      pills={variantComposerPills}
      placeholder={variantComposerPlaceholder}
      ref={variantComposerInputRef}
      submitAccessibilityLabel={
        isVariantComposerEditMode
          ? "Save variant edit"
          : variantComposerMode === "variant-value"
            ? "Add variant value"
            : "Add variant"
      }
      submitIconName={isVariantComposerEditMode ? "Check" : "Plus"}
      value={variantComposerText}
      visible={isInlineVariantComposerVisible}
    />
  )

  if (presentation === "screen") {
    return (
      <View className="flex-1">
        <KeyboardAwareScrollView
          bottomOffset={160}
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 144 }}
          disableScrollOnKeyboardHide
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onTouchStart={hideInlineVariantComposer}
        >
          {content}
        </KeyboardAwareScrollView>
        {variantActionModal}
        {unitSuggestionKeyboardBar}
        {variantKeyboardComposer}
      </View>
    )
  }

  return (
    <>
      <BottomSheetKeyboardAwareScrollView
        bottomOffset={280}
        contentContainerStyle={{ paddingBottom: 220 }}
        keyboardShouldPersistTaps="handled"
        onTouchStart={hideInlineVariantComposer}
      >
        {content}
      </BottomSheetKeyboardAwareScrollView>
      {variantActionModal}
      {unitSuggestionKeyboardBar}
      {variantKeyboardComposer}
    </>
  )
}

export const FirstProductSetupSheet = forwardRef<
  BottomSheetModalRef,
  FirstProductSetupSheetProps
>(({ onComplete }, ref) => {
  return (
    <Modal
      enableDynamicSizing
      hideHeader
      ref={ref}
      snapPoints={["90%"]}
      title="Add first item"
    >
      <FirstProductSetupContent onComplete={onComplete} />
    </Modal>
  )
})

FirstProductSetupSheet.displayName = "FirstProductSetupSheet"
