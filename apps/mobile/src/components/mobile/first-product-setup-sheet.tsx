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
import { forwardRef, useMemo, useState } from "react"
import { View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"

type FirstProductSetupSheetProps = {
  onComplete?: () => void
}

type FirstProductSetupContentProps = {
  onComplete?: () => void
  presentation?: "screen" | "sheet"
}

type VariantDraft = {
  conversionMultiplier: string
  id: string
  name: string
  price: string
  templateConversionMultiplier?: number
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
  imageUrl?: string
  name: string
  openingStockQuantity: number
  priceMinor: number
  primaryUnitName: string
  unitTemplateKey?: string
  variants: Array<{
    conversionMultiplier?: number
    name: string
    openingStockQuantity: number
    priceMinor: number
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

function createVariantDraft(): VariantDraft {
  return {
    conversionMultiplier: "",
    id: `variant-${Date.now()}-${Math.round(Math.random() * 10000)}`,
    name: "",
    price: "",
  }
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
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [unitName, setUnitName] = useState("")
  const [price, setPrice] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [startingStock, setStartingStock] = useState("")
  const [variants, setVariants] = useState<VariantDraft[]>([])
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
              name: variant.name,
              price: variant.priceMinor,
              remoteId: unit?.id,
              startingStock: variant.openingStockQuantity,
            }
          }),
        })
        setName("")
        setDescription("")
        setUnitName("")
        setPrice("")
        setImageUrl("")
        setStartingStock("")
        setVariants([])
        setUnitTemplateKey(null)
        setSetupStep("details")
        setSubmitError(null)
        onComplete?.()
      },
    }),
  )

  const canContinueToStock =
    !isAtProductLimit &&
    !createProductMutation.isPending &&
    !!name.trim() &&
    description.trim().length <= 1000 &&
    !!unitName.trim() &&
    isProductImageUrlInput(imageUrl) &&
    isNumberInput(price) &&
    parseAmount(price) > 0
  const canSubmit =
    canContinueToStock &&
    isWholeNumberInput(startingStock) &&
    parseWholeQuantity(startingStock) >= 0

  const updateVariant = (
    id: string,
    field: "conversionMultiplier" | "name" | "price",
    value: string,
  ) => {
    setVariants((current) =>
      current.map((variant) =>
        variant.id === id ? { ...variant, [field]: value } : variant,
      ),
    )
  }

  const removeVariant = (id: string) => {
    setVariants((current) => current.filter((variant) => variant.id !== id))
  }

  const buildCreateProductInput = (): CreateProductInput => {
    const selectedTemplate =
      unitTemplates.find((template) => template.key === unitTemplateKey) ?? null

    return {
      description: description.trim() || undefined,
      name: name.trim(),
      imageUrl: imageUrl.trim() || undefined,
      openingStockQuantity: parseWholeQuantity(startingStock),
      priceMinor: parseAmount(price),
      primaryUnitName: unitName.trim(),
      unitTemplateKey: selectedTemplate?.key,
      variants: variants
        .filter((variant) => variant.name.trim() && parseAmount(variant.price))
        .map((variant) => ({
          conversionMultiplier:
            variant.templateConversionMultiplier ??
            (parseAmount(variant.conversionMultiplier) ||
              inferConversionMultiplier(variant.name)),
          name: variant.name.trim(),
          openingStockQuantity: 0,
          priceMinor: parseAmount(variant.price),
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
          id: `variant-${template.key}-${unit.name}`,
          name: unit.name,
          price: "",
          templateConversionMultiplier: unit.conversionMultiplier,
        })),
    )
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
      imageUrl: input.imageUrl,
      name: input.name,
      price: input.priceMinor,
      startingStock: input.openingStockQuantity,
      unitName: input.primaryUnitName,
      variants: input.variants.map((variant) => ({
        conversionMultiplier: variant.conversionMultiplier,
        name: variant.name,
        price: variant.priceMinor,
      })),
    })
    setName("")
    setDescription("")
    setUnitName("")
    setPrice("")
    setImageUrl("")
    setStartingStock("")
    setVariants([])
    setUnitTemplateKey(null)
    setSetupStep("details")
    onComplete?.()
  }

  const continueToStock = () => {
    if (!canContinueToStock) return
    setSetupStep("stock")
  }

  const content = (
    <View className="gap-7 px-5 pb-6 pt-1">
          <SetupFlowHeader
            badgeIcon={setupStep === "details" ? "FilePenLine" : "Warehouse"}
            badgeLabel={
              setupStep === "details" ? "Item details" : "Starting stock"
            }
            currentStep={setupStep === "details" ? 1 : 2}
            description={
              setupStep === "details"
                ? "Add one real item, define how you sell it, then capture starting stock."
                : "Confirm the item setup and enter the stock already on hand."
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
                description="Keep setup light: name the item, choose how it is sold, and add optional product media."
                title="Item and selling unit"
              >
                <FormField
                  label="Item name"
                  leadingIcon="FileText"
                  onChangeText={setName}
                  placeholder="Enter item name"
                  value={name}
                />
                <FormField
                  error={
                    description.trim().length <= 1000
                      ? undefined
                      : "Keep the product description under 1000 characters."
                  }
                  helper="Optional. This appears in the shared product page and link preview."
                  label="Product description"
                  leadingIcon="StickyNote"
                  multiline
                  onChangeText={setDescription}
                  placeholder="Enter product description"
                  value={description}
                />
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
                <FormField
                  label="Primary unit"
                  leadingIcon="Hash"
                  onChangeText={setUnitName}
                  placeholder="Enter unit name"
                  value={unitName}
                />
                <FormField
                  inputMode="decimal"
                  keyboardType="numeric"
                  label="Price per unit"
                  leadingIcon="CircleDollarSign"
                  onChangeText={setPrice}
                  placeholder="Enter unit price"
                  value={price}
                />
                <FormField
                  autoCapitalize="none"
                  autoCorrect={false}
                  error={
                    isProductImageUrlInput(imageUrl)
                      ? undefined
                      : "Enter a valid image link."
                  }
                  helper="Optional. A public image link helps shared product links preview with the real item."
                  inputMode="url"
                  keyboardType="url"
                  label="Product image link"
                  leadingIcon="Globe"
                  onChangeText={setImageUrl}
                  placeholder="Enter product image link"
                  value={imageUrl}
                />
              </SetupSection>

              <SetupSection
                description="Skip this for a simple item, or add sellable sub-units with their own prices."
                title="Sub-units or variants"
              >
                <View className="flex-row items-center justify-between gap-3">
                  <Text className="text-sm font-semibold text-muted-foreground">
                    {variants.length > 0
                      ? `${variants.length} added`
                      : "No variants yet"}
                  </Text>
                  <Pressable
                    accessibilityLabel="Add more sub-units or variants"
                    className="h-10 w-10 items-center justify-center rounded-full bg-primary/10"
                    haptic
                    onPress={() =>
                      setVariants((current) => [
                        ...current,
                        createVariantDraft(),
                      ])
                    }
                    transition
                  >
                    <Icon className="size-base text-primary" name="Plus" />
                  </Pressable>
                </View>

                {variants.length === 0 ? (
                  <View className="gap-3 border-y border-border py-4">
                    <View className="flex-row items-center gap-3">
                      <View className="h-9 w-9 items-center justify-center rounded-full bg-muted">
                        <Icon
                          className="size-base text-muted-foreground"
                          name="PlusCircle"
                        />
                      </View>
                      <View className="min-w-0 flex-1">
                        <Text className="font-semibold text-foreground">
                          No variants yet
                        </Text>
                        <Text className="text-sm leading-5 text-muted-foreground">
                          You can skip this and continue with only the primary
                          unit.
                        </Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View className="gap-3">
                    {variants.map((variant, index) => (
                      <View
                        className="gap-4 border-t border-border pt-4"
                        key={variant.id}
                      >
                        <View className="flex-row items-center justify-between">
                          <Text className="text-sm font-extrabold uppercase tracking-[1px] text-muted-foreground">
                            Variant {index + 1}
                          </Text>
                          <Pressable
                            className="h-8 w-8 items-center justify-center rounded-full bg-destructive/10"
                            haptic
                            onPress={() => removeVariant(variant.id)}
                            transition
                          >
                            <Icon
                              className="size-sm text-destructive"
                              name="X"
                            />
                          </Pressable>
                        </View>
                        <FormField
                          label="Variant name"
                          leadingIcon="FileText"
                          onChangeText={(value) =>
                            updateVariant(variant.id, "name", value)
                          }
                          placeholder="Enter variant name"
                          value={variant.name}
                        />
                        <FormField
                          helper={
                            variant.templateConversionMultiplier
                              ? "Template ratio is applied when the item is saved."
                              : "Use a decimal to describe how much of the primary unit this variant contains."
                          }
                          inputMode="decimal"
                          keyboardType="numeric"
                          label={`Portion of 1 ${unitName.trim() || "primary unit"}`}
                          leadingIcon="Hash"
                          onChangeText={(value) =>
                            updateVariant(
                              variant.id,
                              "conversionMultiplier",
                              value,
                            )
                          }
                          placeholder="Enter portion"
                          value={variant.conversionMultiplier}
                        />
                        <FormField
                          inputMode="decimal"
                          keyboardType="numeric"
                          label="Variant price"
                          leadingIcon="CircleDollarSign"
                          onChangeText={(value) =>
                            updateVariant(variant.id, "price", value)
                          }
                          placeholder="Enter variant price"
                          value={variant.price}
                        />
                      </View>
                    ))}
                  </View>
                )}
              </SetupSection>
            </>
          ) : (
            <>
              <SetupSection
                description="Review the item, then enter the count already available for sale."
                title="Stock starting point"
              >
                <View className="border-t border-border">
                  <SetupSummaryRow label="Item" value={name.trim()} />
                  <SetupSummaryRow
                    label="Unit"
                    value={`${unitName.trim()} at ${price.trim()}`}
                  />
                  <SetupSummaryRow
                    label="Variants"
                    value={
                      variants.length > 0
                        ? `${variants.length} variant${variants.length === 1 ? "" : "s"}`
                        : "None"
                    }
                  />
                </View>
                <QuantityStepper
                  helper={unitName.trim() || "units"}
                  label="Current stock"
                  onChangeText={(value) =>
                    setStartingStock(normalizeWholeNumberInput(value))
                  }
                  min={0}
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
            disabled={
              setupStep === "details" ? !canContinueToStock : !canSubmit
            }
            isLoading={setupStep === "stock" && createProductMutation.isPending}
            loadingLabel="Adding item"
            onPress={setupStep === "details" ? continueToStock : submit}
          >
            {setupStep === "details" ? "Continue to stock" : "Add item and stock"}
          </ActionButton>
    </View>
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
  BottomSheetModal,
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
