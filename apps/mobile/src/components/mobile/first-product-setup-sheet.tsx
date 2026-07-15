import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { QuantityStepper } from "@/components/mobile/quantity-stepper"
import {
  SetupChoicePill,
  SetupFlowHeader,
  SetupInlineNotice,
  SetupSection,
  SetupSummaryRow,
} from "@/components/mobile/setup-flow"
import { StatusBanner } from "@/components/mobile/status-banner"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Icon } from "@/components/ui/icon"
import { Modal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Switch } from "@/components/ui/switch"
import { Text } from "@/components/ui/text"
import { useAuthContext } from "@/hooks/use-auth"
import {
  isWholeNumberInput,
  normalizeWholeNumberInput,
  parseWholeQuantity,
} from "@/lib/quantity"
import { isLocalSessionToken } from "@/lib/session-store"
import { useBusinessStore } from "@/store/businessStore"
import { useRetailOpsStore } from "@/store/retailOpsStore"
import {
  getBusinessSubscription,
  getPlan,
  useSubscriptionStore,
} from "@/store/subscriptionStore"
import { useTRPC } from "@/trpc/client"
import type { BottomSheetModal } from "@gorhom/bottom-sheet"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Image } from "expo-image"
import * as ImagePicker from "expo-image-picker"
import { forwardRef, useEffect, useMemo, useRef, useState } from "react"
import { Alert, View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"

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
  templateConversionMultiplier?: number
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
  unitTemplateKey?: string
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

type FirstProductSetupStep = "details" | "stock"
const FIRST_PRODUCT_STEPS = ["Item", "Stock"]

type UnitTemplate = {
  baseUnitName: string
  id: string
  key: string
  name: string
  source: "durable" | "fallback"
  units: Array<{
    conversionMultiplier: number
    isBase: boolean
    name: string
  }>
}

const LOCAL_UNIT_TEMPLATES: UnitTemplate[] = [
  {
    baseUnitName: "Bag",
    id: "local:bag-fractions",
    key: "bag_fractions",
    name: "Bag fractions",
    source: "fallback",
    units: [
      { conversionMultiplier: 1, isBase: true, name: "Bag" },
      { conversionMultiplier: 0.5, isBase: false, name: "Half bag" },
      { conversionMultiplier: 0.25, isBase: false, name: "Quarter bag" },
    ],
  },
  {
    baseUnitName: "Kilogram",
    id: "local:kilogram-fractions",
    key: "kilogram_fractions",
    name: "Kilogram fractions",
    source: "fallback",
    units: [
      { conversionMultiplier: 1, isBase: true, name: "Kilogram" },
      { conversionMultiplier: 0.5, isBase: false, name: "Half kilogram" },
      { conversionMultiplier: 0.25, isBase: false, name: "Quarter kilogram" },
    ],
  },
]

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

const UNIT_SUGGESTIONS = [
  "Unit",
  "Bag",
  "Kg",
  "Gram",
  "Piece",
  "Crate",
  "Carton",
  "Bottle",
  "Meter",
  "SM",
]

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

function formatMultiplier(value: number) {
  return Number.isInteger(value) ? String(value) : String(value)
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

    if (!value.enabled || !label || !name) continue

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

function buildVariantCombinationSeeds(groups: ReturnType<typeof buildVariantGroups>) {
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
  const unitSheetModalRef = useRef<BottomSheetModalRef>(null)
  const variantTypeModalRef = useRef<BottomSheetModalRef>(null)
  const variantValuesModalRef = useRef<BottomSheetModalRef>(null)
  const [name, setName] = useState("")
  const [showDescription, setShowDescription] = useState(false)
  const [description, setDescription] = useState("")
  const [unitName, setUnitName] = useState("")
  const [unitDraft, setUnitDraft] = useState("")
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
  const [unitTemplateKey, setUnitTemplateKey] = useState<string | null>(null)
  const [setupStep, setSetupStep] = useState<FirstProductSetupStep>("details")
  const [submitError, setSubmitError] = useState<string | null>(null)
  const shouldUseLocalQueue = isOfflineMode || isLocalSessionToken(auth.token)
  const subscription = getBusinessSubscription(subscriptions, activeBusinessId)
  const plan = getPlan(subscription.planId)
  const isAtProductLimit = products.length >= plan.limits.products
  const unitTemplatesQuery = useQuery(
    trpc.retailOps.unitTemplates.queryOptions(undefined, {
      enabled: !shouldUseLocalQueue,
      retry: 1,
    }),
  )
  const unitTemplates =
    !shouldUseLocalQueue && unitTemplatesQuery.data?.length
      ? (unitTemplatesQuery.data as UnitTemplate[])
      : LOCAL_UNIT_TEMPLATES
  const selectedUnitTemplate =
    unitTemplates.find((template) => template.key === unitTemplateKey) ?? null
  const variantGroups = useMemo(() => buildVariantGroups(variants), [variants])
  const hasMultipleVariantDimensions = variantGroups.length > 1
  const generatedVariantCombinationSeeds = useMemo(
    () => buildVariantCombinationSeeds(variantGroups),
    [variantGroups],
  )
  const generatedVariantCombinationSignature =
    generatedVariantCombinationSeeds.map((seed) => seed.key).join("|")
  const activeVariantRows = hasMultipleVariantDimensions
    ? variantCombinations.filter((variant) => variant.enabled)
    : variants.filter((variant) => variant.enabled)
  const visibleVariantRows = hasMultipleVariantDimensions
    ? variantCombinations
    : variants
  const hasVariantPricing = activeVariantRows.length > 0
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
        setUnitDraft("")
        setPrice("")
        setLocalImageUri("")
        setImageLinks([])
        setStartingStock("")
        setVariants([])
        setVariantSearch("")
        setSelectedVariantLabel("Size")
        setVariantValueName("")
        setUnitTemplateKey(null)
        setSetupStep("details")
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
  }, [
    generatedVariantCombinationSeeds,
    generatedVariantCombinationSignature,
    hasMultipleVariantDimensions,
  ])

  const canContinueToStock =
    !isAtProductLimit &&
    !createProductMutation.isPending &&
    !!name.trim() &&
    description.trim().length <= 1000 &&
    !!unitName.trim() &&
    areProductImageLinksValid(imageLinks) &&
    (hasVariantPricing ||
      (isNumberInput(price) && parseAmount(price) > 0)) &&
    activeVariantRows.every(
      (variant) =>
        !!variant.name.trim() &&
        areProductImageLinksValid([
          variant.imageUrl,
          ...variant.imageLinks,
        ]) &&
        isNumberInput(variant.price) &&
        parseAmount(variant.price) > 0 &&
        isWholeNumberInput(variant.stock) &&
        parseWholeQuantity(variant.stock) >= 0,
    )
  const canSubmit =
    canContinueToStock &&
    isWholeNumberInput(startingStock) &&
    parseWholeQuantity(startingStock) >= 0

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

  const removeVariantCombination = (id: string) => {
    setVariantCombinations((current) =>
      current.map((variant) =>
        variant.id === id ? { ...variant, enabled: false } : variant,
      ),
    )
  }

  const buildCreateProductInput = (): CreateProductInput => {
    const selectedTemplate =
      unitTemplates.find((template) => template.key === unitTemplateKey) ?? null
    const normalizedImageLinks = cleanImageLinks(imageLinks)
    const primaryPriceMinor = hasVariantPricing
      ? parseAmount(activeVariantRows[0]?.price ?? price)
      : parseAmount(price)

    return {
      description: description.trim() || undefined,
      name: name.trim(),
      imageLinks: normalizedImageLinks,
      imageUrl: normalizedImageLinks[0],
      openingStockQuantity: parseWholeQuantity(startingStock),
      priceMinor: primaryPriceMinor,
      primaryUnitName: unitName.trim(),
      unitTemplateKey: selectedTemplate?.key,
      variants: activeVariantRows
        .filter(
          (variant) =>
            variant.enabled && variant.name.trim() && parseAmount(variant.price),
        )
        .map((variant) => ({
          conversionMultiplier: hasMultipleVariantDimensions
            ? 1
            : (variant as VariantDraft).templateConversionMultiplier ??
              (parseAmount((variant as VariantDraft).conversionMultiplier) ||
                inferConversionMultiplier(variant.name)),
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

  const applyUnitTemplate = (template: UnitTemplate | null) => {
    setUnitTemplateKey(template?.key ?? null)

    if (!template) {
      setVariants((current) =>
        current.map(({ templateConversionMultiplier, ...variant }) => variant),
      )
      return
    }

    const baseUnit =
      template.units.find((unit) => unit.isBase) ?? template.units[0]
    setUnitName(baseUnit?.name ?? template.baseUnitName)
    setVariants(
      template.units
        .filter((unit) => !unit.isBase)
        .map((unit) => ({
          conversionMultiplier: formatMultiplier(unit.conversionMultiplier),
          enabled: true,
          expanded: false,
          id: `variant-${template.key}-${unit.name}`,
          imageLinks: [],
          imageUrl: "",
          name: unit.name,
          price: "",
          stock: "0",
          templateConversionMultiplier: unit.conversionMultiplier,
          variantLabel: "Unit",
        })),
    )
    setVariantCombinations([])
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

  const addVariantValue = () => {
    const value = variantValueName.trim()
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

    setVariantValueName("")
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

  const removeVariantRow = (id: string) => {
    if (hasMultipleVariantDimensions) {
      removeVariantCombination(id)
      return
    }

    removeVariant(id)
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
    setUnitDraft("")
    setPrice("")
    setLocalImageUri("")
    setImageLinks([])
    setStartingStock("")
    setVariants([])
    setVariantCombinations([])
    setVariantSearch("")
    setSelectedVariantLabel("Size")
    setVariantValueName("")
    setUnitTemplateKey(null)
    setSetupStep("details")
    onComplete?.()
  }

  const continueToStock = () => {
    if (!canContinueToStock) return
    setSetupStep("stock")
  }

  const content = (
    <>
      <View className="gap-7 px-5 pb-6 pt-1">
        <SetupFlowHeader
          badgeIcon={setupStep === "details" ? "FilePenLine" : "Warehouse"}
          badgeLabel={setupStep === "details" ? "Item details" : "Starting stock"}
          currentStep={setupStep === "details" ? 1 : 2}
          description={
            setupStep === "details"
              ? "Add the item, default unit, media, and any variant prices."
              : "Confirm the parent item and starting stock before saving."
          }
          steps={FIRST_PRODUCT_STEPS}
          title={setupStep === "details" ? "Set up item" : "Add stock"}
        />

        <SetupInlineNotice
          icon={shouldUseLocalQueue ? "Wind" : "CircleCheck"}
          text={
            shouldUseLocalQueue
              ? "This item will be queued locally and synced later."
              : "This item will be created in production immediately."
          }
          tone={shouldUseLocalQueue ? "warning" : "success"}
        />

        {setupStep === "details" ? (
          <>
            <SetupSection
              description="Only the item name, default unit, and a price path are required."
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
                          onChangeText={(value) =>
                            updateImageLink(index, value)
                          }
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

            <SetupSection
              description="Default unit describes the base way this item is counted."
              title="Default unit and price"
            >
              <View className="gap-2">
                <Text className="text-sm font-semibold text-foreground">
                  Unit template
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {unitTemplates.map((template) => {
                    const isSelected = template.key === unitTemplateKey

                    return (
                      <SetupChoicePill
                        key={template.key}
                        onPress={() => applyUnitTemplate(template)}
                        selected={isSelected}
                      >
                        {template.name}
                      </SetupChoicePill>
                    )
                  })}
                  {selectedUnitTemplate ? (
                    <SetupChoicePill onPress={() => applyUnitTemplate(null)}>
                      Manual
                    </SetupChoicePill>
                  ) : null}
                </View>
                <Text className="text-xs leading-5 text-muted-foreground">
                  {shouldUseLocalQueue || unitTemplatesQuery.isError
                    ? "Using local unit suggestions until production templates are available."
                    : "Templates come from production and still let you set your own prices."}
                </Text>
              </View>

              <View className="flex-row items-end gap-2">
                <View className="min-w-0 flex-1">
                  <FormField
                    label="Primary unit"
                    leadingIcon="Hash"
                    onChangeText={setUnitName}
                    placeholder="Enter unit name"
                    value={unitName}
                  />
                </View>
                <Pressable
                  accessibilityLabel="Add unit"
                  className="mb-1 h-12 w-12 items-center justify-center rounded-xl bg-muted"
                  haptic
                  onPress={() => unitSheetModalRef.current?.present()}
                  transition
                >
                  <Icon className="size-sm text-foreground" name="Plus" />
                </Pressable>
              </View>

              <FormField
                editable={!hasVariantPricing}
                helper={
                  hasVariantPricing
                    ? "Single price is disabled when variants set their own prices."
                    : "Use this when the item has one selling price."
                }
                inputMode="decimal"
                keyboardType="numeric"
                label="Price per unit"
                leadingIcon="CircleDollarSign"
                onChangeText={setPrice}
                placeholder="Enter unit price"
                value={hasVariantPricing ? "" : price}
              />
            </SetupSection>

            <SetupSection
              description="Does this item have multiple prices based on different variants?"
              title="Variants"
            >
              <ActionButton
                icon="Plus"
                onPress={() => variantTypeModalRef.current?.present()}
                variant="outline"
              >
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
                <View className="gap-4">
                  {hasMultipleVariantDimensions ? (
                    <SetupInlineNotice
                      icon="ListChecks"
                      text="Multiple variant labels generate sellable combination rows."
                      tone="primary"
                    />
                  ) : null}
                  {visibleVariantRows.map((variant) => (
                    <View
                      className="gap-3 border-t border-border pt-4"
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
                        <Switch
                          checked={variant.enabled}
                          onCheckedChange={(checked) =>
                            toggleVariantRowEnabled(variant.id, checked)
                          }
                        />
                        <Pressable
                          accessibilityLabel="Expand variant"
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
                          accessibilityLabel="Delete variant"
                          className="h-10 w-10 items-center justify-center rounded-full bg-destructive/10"
                          haptic
                          onPress={() => removeVariantRow(variant.id)}
                          transition
                        >
                          <Icon className="size-sm text-destructive" name="Trash" />
                        </Pressable>
                      </View>

                      {!hasMultipleVariantDimensions ? (
                        <FormField
                          label="Variant value name"
                          leadingIcon="FileText"
                          onChangeText={(value) =>
                            updateVariant(variant.id, "name", value)
                          }
                          placeholder="Enter variant name"
                          value={variant.name}
                        />
                      ) : null}
                      <View className="flex-row gap-3">
                        <View className="min-w-0 flex-1">
                          <FormField
                            inputMode="decimal"
                            keyboardType="numeric"
                            label="Variant row price"
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
                            label="Variant row stock"
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
                                    updateVariantRowImageLink(
                                      variant.id,
                                      index,
                                      value,
                                    )
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
                                <Icon
                                  className="size-sm text-destructive"
                                  name="Trash"
                                />
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
                  ))}
                </View>
              )}
            </SetupSection>
          </>
        ) : (
          <>
            <SetupSection
              description="Review the item, then enter parent-unit stock if this item still has stock outside variant rows."
              title="Stock starting point"
            >
              <View className="border-t border-border">
                <SetupSummaryRow label="Item" value={name.trim()} />
                <SetupSummaryRow
                  label="Unit"
                  value={`${unitName.trim()} at ${
                    hasVariantPricing ? "variant prices" : price.trim()
                  }`}
                />
                <SetupSummaryRow
                  label="Variants"
                  value={
                    activeVariantRows.length > 0
                      ? `${activeVariantRows.length} enabled variant${
                          activeVariantRows.length === 1 ? "" : "s"
                        }`
                      : "None"
                  }
                />
              </View>
              <QuantityStepper
                helper={unitName.trim() || "units"}
                label="Current stock"
                min={0}
                onChangeText={(value) =>
                  setStartingStock(normalizeWholeNumberInput(value))
                }
                value={startingStock}
              />
            </SetupSection>
            <ActionButton
              icon="ArrowLeft"
              onPress={() => setSetupStep("details")}
              variant="outline"
            >
              Back to item details
            </ActionButton>
          </>
        )}

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

        <ActionButton
          disabled={setupStep === "details" ? !canContinueToStock : !canSubmit}
          isLoading={setupStep === "stock" && createProductMutation.isPending}
          loadingLabel="Adding item"
          onPress={setupStep === "details" ? continueToStock : submit}
        >
          {setupStep === "details" ? "Continue to stock" : "Add item and stock"}
        </ActionButton>
      </View>

      <Modal ref={unitSheetModalRef} snapPoints={["72%"]} title="Add unit">
        <BottomSheetKeyboardAwareScrollView
          bottomOffset={320}
          contentContainerStyle={{ paddingBottom: 160 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-5 px-5 pb-6">
            <View className="flex-row flex-wrap gap-2">
              {UNIT_SUGGESTIONS.map((unit) => (
                <SetupChoicePill
                  key={unit}
                  onPress={() => {
                    setUnitName(unit)
                    unitSheetModalRef.current?.dismiss()
                  }}
                  selected={unitName.trim().toLowerCase() === unit.toLowerCase()}
                >
                  {unit}
                </SetupChoicePill>
              ))}
            </View>
            <View className="flex-row items-end gap-2">
              <View className="min-w-0 flex-1">
                <FormField
                  label="Unit name"
                  leadingIcon="Hash"
                  onChangeText={setUnitDraft}
                  placeholder="Enter unit name"
                  value={unitDraft}
                />
              </View>
              <Pressable
                accessibilityLabel="Save unit"
                className="mb-1 h-12 w-12 items-center justify-center rounded-full bg-primary"
                haptic
                onPress={() => {
                  const nextUnit = unitDraft.trim()

                  if (nextUnit) {
                    setUnitName(nextUnit)
                    setUnitDraft("")
                    unitSheetModalRef.current?.dismiss()
                  }
                }}
                transition
              >
                <Icon className="size-sm text-primary-foreground" name="Plus" />
              </Pressable>
            </View>
          </View>
        </BottomSheetKeyboardAwareScrollView>
      </Modal>

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
                  <Icon className="size-sm text-muted-foreground" name="ChevronRight" />
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
        ref={variantValuesModalRef}
        snapPoints={["100%"]}
        title={`${selectedVariantLabel} Variants (${selectedVariantValues.length})`}
      >
        <BottomSheetKeyboardAwareScrollView
          bottomOffset={320}
          contentContainerStyle={{ paddingBottom: 160 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-5 px-5 pb-6">
            <View className="flex-row items-center justify-between gap-3">
              <View className="min-w-0 flex-1">
                <Text className="text-xl font-extrabold text-foreground">
                  {selectedVariantLabel} Variants ({selectedVariantValues.length})
                </Text>
                <Text className="text-sm text-muted-foreground">
                  Add values, then save to return to the item form.
                </Text>
              </View>
              <ActionButton
                className="w-auto px-4"
                onPress={() => variantValuesModalRef.current?.dismiss()}
                variant="ghost"
              >
                save
              </ActionButton>
            </View>

            {selectedVariantValues.length === 0 ? (
              <View className="items-center justify-center py-12">
                <Text className="text-center font-semibold text-foreground">
                  Variant list is empty, start adding.
                </Text>
              </View>
            ) : (
              <View className="gap-4">
                <View className="flex-row flex-wrap gap-2">
                  {selectedVariantValues
                    .map((variant) => (
                      <SetupChoicePill key={variant.id} selected>
                        {variant.name}
                      </SetupChoicePill>
                    ))}
                </View>
                {selectedVariantValues
                  .map((variant) => (
                    <View
                      className="flex-row items-center justify-between gap-3 border-b border-border py-3"
                      key={variant.id}
                    >
                      <Text className="font-semibold text-foreground">
                        {variant.name}
                      </Text>
                      <Switch
                        checked={variant.enabled}
                        onCheckedChange={(checked) =>
                          toggleVariantEnabled(variant.id, checked)
                        }
                      />
                    </View>
                  ))}
              </View>
            )}

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
        >
          {content}
        </KeyboardAwareScrollView>
      </View>
    )
  }

  return (
    <BottomSheetKeyboardAwareScrollView
      bottomOffset={280}
      contentContainerStyle={{ paddingBottom: 220 }}
      keyboardShouldPersistTaps="handled"
    >
      {content}
    </BottomSheetKeyboardAwareScrollView>
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
