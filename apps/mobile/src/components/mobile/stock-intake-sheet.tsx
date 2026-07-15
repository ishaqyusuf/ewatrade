import { ActionButton } from "@/components/mobile/action-button"
import { EmptyState } from "@/components/mobile/empty-state"
import { FormField } from "@/components/mobile/form-field"
import {
  InventoryMovementRow,
  InventoryProductCard,
  InventorySegmentOption,
  InventoryUnitOption,
} from "@/components/mobile/inventory-product-card"
import { QuantityStepper } from "@/components/mobile/quantity-stepper"
import { StatusBanner } from "@/components/mobile/status-banner"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Modal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import type { MobileDesignStatusTone } from "@/lib/design-foundation"
import { parseWholeQuantity } from "@/lib/quantity"
import { cn } from "@/lib/utils"
import { useBusinessStore } from "@/store/businessStore"
import {
  type RetailOpsProduct,
  type RetailOpsStockAdjustmentDirection,
  type RetailOpsStockAdjustmentReason,
  type RetailOpsStockMovement,
  normalizeStockAdjustmentDirection,
  useRetailOpsStore,
} from "@/store/retailOpsStore"
import { useTRPC } from "@/trpc/client"
import type { BottomSheetModal } from "@gorhom/bottom-sheet"
import { useMutation } from "@tanstack/react-query"
import { forwardRef, useEffect, useMemo, useState } from "react"
import { View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"

type StockIntakeSheetProps = {
  onComplete?: () => void
}

type StockIntakeContentProps = {
  onComplete?: () => void
  presentation?: "screen" | "sheet"
}

type StockMode = "adjust" | "intake"

type StockUnitOption = {
  id: string
  label: string
  remoteVariantId?: string
  stock: number
  variantId?: string
}

const STOCK_UNIT_PREVIEW_LIMIT = 8
const STOCK_MOVEMENT_PREVIEW_LIMIT = 8

const stockAdjustmentReasons: Array<{
  label: string
  value: RetailOpsStockAdjustmentReason
}> = [
  { label: "Correction", value: "correction" },
  { label: "Damage", value: "damage" },
  { label: "Loss", value: "loss" },
  { label: "Found", value: "found_stock" },
]

function getProductStock(product: RetailOpsProduct) {
  return product.currentStock ?? product.startingStock ?? 0
}

function getVariantStock(variant: RetailOpsProduct["variants"][number]) {
  return variant.currentStock ?? variant.startingStock ?? 0
}

function getInventoryStockTone(stock: number): MobileDesignStatusTone {
  if (stock <= 0) return "destructive"
  if (stock <= 5) return "warning"
  return "success"
}

function getStockUnitOptions(product?: RetailOpsProduct): StockUnitOption[] {
  if (!product) return []

  return [
    {
      id: "primary",
      label: product.unitName,
      remoteVariantId: product.remoteVariantId,
      stock: getProductStock(product),
    },
    ...product.variants.map((variant) => ({
      id: variant.id,
      label: variant.name,
      remoteVariantId: variant.remoteId,
      stock: getVariantStock(variant),
      variantId: variant.id,
    })),
  ]
}

function movementLabel(type: RetailOpsStockMovement["type"]) {
  if (type === "conversion_in") return "Conversion in"
  if (type === "conversion_out") return "Conversion out"
  if (type === "opening_stock") return "Opening stock"
  if (type === "stock_adjustment") return "Stock adjustment"
  if (type === "stock_intake") return "Stock intake"
  return "Sale"
}

function ProductOption({
  onPress,
  product,
  selected,
}: {
  onPress: () => void
  product: RetailOpsProduct
  selected: boolean
}) {
  const currentStock = product.currentStock ?? product.startingStock

  return (
    <InventoryProductCard
      icon="Warehouse"
      onPress={onPress}
      selected={selected}
      stockLabel={`${currentStock} ${product.unitName}${currentStock === 1 ? "" : "s"} available`}
      stockTone={getInventoryStockTone(currentStock)}
      subtitle={
        product.variants.length > 0
          ? `${product.variants.length} variant${product.variants.length === 1 ? "" : "s"}`
          : "Primary unit only"
      }
      title={product.name}
    />
  )
}

function MovementRow({ movement }: { movement: RetailOpsStockMovement }) {
  const isIncrease = movement.quantity >= 0

  return (
    <InventoryMovementRow
      detail={movementLabel(movement.type)}
      quantityLabel={`${isIncrease ? "+" : ""}${movement.quantity} ${movement.unitName}`}
      quantityTone={isIncrease ? "success" : "destructive"}
      statusLabel={
        movement.syncStatus === "pending" ? "Pending sync" : "Synced"
      }
      statusTone={movement.syncStatus === "pending" ? "warning" : "success"}
      title={movement.productName}
    />
  )
}

export function StockIntakeContent({
  onComplete,
  presentation = "sheet",
}: StockIntakeContentProps) {
  const trpc = useTRPC()
  const activeBusinessId = useBusinessStore((state) => state.activeBusinessId)
  const isOfflineMode = useRetailOpsStore((state) => state.isOfflineMode)
  const allProducts = useRetailOpsStore((state) => state.products)
  const allStockMovements = useRetailOpsStore((state) => state.stockMovements)
  const products = useMemo(
    () =>
      allProducts.filter(
        (product) =>
          !activeBusinessId ||
          (product.businessId ?? activeBusinessId) === activeBusinessId,
      ),
    [activeBusinessId, allProducts],
  )
  const recordStockIntake = useRetailOpsStore(
    (state) => state.recordStockIntake,
  )
  const recordStockAdjustment = useRetailOpsStore(
    (state) => state.recordStockAdjustment,
  )
  const stockMovements = useMemo(
    () =>
      allStockMovements.filter(
        (movement) =>
          !activeBusinessId ||
          (movement.businessId ?? activeBusinessId) === activeBusinessId,
      ),
    [activeBusinessId, allStockMovements],
  )
  const [direction, setDirection] =
    useState<RetailOpsStockAdjustmentDirection>("decrease")
  const [mode, setMode] = useState<StockMode>("intake")
  const [note, setNote] = useState("")
  const [quantity, setQuantity] = useState("1")
  const [productQuery, setProductQuery] = useState("")
  const [unitQuery, setUnitQuery] = useState("")
  const [reason, setReason] =
    useState<RetailOpsStockAdjustmentReason>("correction")
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    products[0]?.id ?? null,
  )
  const [selectedUnitId, setSelectedUnitId] = useState("primary")
  const stockIntakeMutation = useMutation(
    trpc.retailOps.recordStockIntake.mutationOptions({
      onError: (error) => {
        setSubmitError(error.message)
      },
    }),
  )
  const stockAdjustmentMutation = useMutation(
    trpc.retailOps.recordStockAdjustment.mutationOptions({
      onError: (error) => {
        setSubmitError(error.message)
      },
    }),
  )
  const filteredProducts = useMemo(() => {
    const normalizedQuery = productQuery.trim().toLowerCase()

    if (!normalizedQuery) return products

    return products.filter((product) =>
      [
        product.name,
        product.unitName,
        ...product.variants.map((variant) => variant.name),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    )
  }, [productQuery, products])
  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, 12),
    [filteredProducts],
  )
  const selectedProduct = products.find(
    (product) => product.id === selectedProductId,
  )
  const unitOptions = useMemo(
    () => getStockUnitOptions(selectedProduct),
    [selectedProduct],
  )
  const filteredUnitOptions = useMemo(() => {
    const normalizedQuery = unitQuery.trim().toLowerCase()

    if (!normalizedQuery) return unitOptions

    return unitOptions.filter((unit) =>
      unit.label.toLowerCase().includes(normalizedQuery),
    )
  }, [unitOptions, unitQuery])
  const visibleUnitOptions = useMemo(
    () => filteredUnitOptions.slice(0, STOCK_UNIT_PREVIEW_LIMIT),
    [filteredUnitOptions],
  )
  const visibleStockMovements = useMemo(
    () => stockMovements.slice(0, STOCK_MOVEMENT_PREVIEW_LIMIT),
    [stockMovements],
  )
  const selectedUnit =
    unitOptions.find((unit) => unit.id === selectedUnitId) ?? unitOptions[0]
  const quantityValue = parseWholeQuantity(quantity)
  const resolvedAdjustmentDirection = normalizeStockAdjustmentDirection({
    direction,
    reason,
  })
  const directionWasAdjusted =
    mode === "adjust" && direction !== resolvedAdjustmentDirection
  const canDecreaseAdjustment =
    normalizeStockAdjustmentDirection({
      direction: "decrease",
      reason,
    }) === "decrease"
  const canIncreaseAdjustment =
    normalizeStockAdjustmentDirection({
      direction: "increase",
      reason,
    }) === "increase"
  const adjustmentDirectionHelper =
    reason === "damage" || reason === "loss"
      ? "Damage and loss always decrease stock."
      : reason === "found_stock"
        ? "Found stock always increases stock."
        : "Corrections can increase or decrease stock."
  const hasEnoughStock =
    mode !== "adjust" ||
    resolvedAdjustmentDirection !== "decrease" ||
    quantityValue <= (selectedUnit?.stock ?? 0)
  const canRecordProductionStock =
    !isOfflineMode && !!selectedUnit?.remoteVariantId
  const isSubmitting =
    stockIntakeMutation.isPending || stockAdjustmentMutation.isPending
  const canSubmit =
    !!selectedProduct &&
    !!selectedUnit &&
    quantityValue > 0 &&
    !directionWasAdjusted &&
    hasEnoughStock &&
    !isSubmitting
  const sourceLabel = canRecordProductionStock
    ? "Online"
    : isOfflineMode
      ? "Local"
      : "Local queue"
  const sourceDetail = canRecordProductionStock
    ? "This stock change will be recorded in production immediately."
    : isOfflineMode
      ? "This stock change will be queued locally and synced later."
      : "Waiting for the selected product unit to sync before direct production stock updates."

  useEffect(() => {
    if (products.length === 0) {
      setSelectedProductId(null)
      return
    }

    const selectedProductExists = products.some(
      (product) => product.id === selectedProductId,
    )

    if (!selectedProductExists) {
      setSelectedProductId(products[0]?.id ?? null)
    }
  }, [products, selectedProductId])

  useEffect(() => {
    if (!selectedUnit) {
      setSelectedUnitId("primary")
      return
    }

    const selectedUnitExists = unitOptions.some(
      (unit) => unit.id === selectedUnitId,
    )

    if (!selectedUnitExists) {
      setSelectedUnitId(unitOptions[0]?.id ?? "primary")
    }
  }, [selectedUnit, selectedUnitId, unitOptions])

  useEffect(() => {
    const nextDirection = normalizeStockAdjustmentDirection({
      direction,
      reason,
    })

    if (nextDirection !== direction) {
      setDirection(nextDirection)
    }
  }, [direction, reason])

  const submit = () => {
    if (!selectedProduct || !selectedUnit || !canSubmit) return

    const completeLocalIntake = (syncStatus: "pending" | "synced") => {
      recordStockIntake({
        businessId: activeBusinessId ?? undefined,
        note,
        productId: selectedProduct.id,
        quantity: quantityValue,
        syncStatus,
        variantId: selectedUnit.variantId,
      })
    }
    const completeLocalAdjustment = (syncStatus: "pending" | "synced") => {
      recordStockAdjustment({
        businessId: activeBusinessId ?? undefined,
        direction: resolvedAdjustmentDirection,
        note,
        productId: selectedProduct.id,
        quantity: quantityValue,
        reason,
        syncStatus,
        variantId: selectedUnit.variantId,
      })
    }
    const resetForm = () => {
      setNote("")
      setQuantity("1")
      setSubmitError(null)
    }

    setSubmitError(null)

    if (canRecordProductionStock && selectedUnit.remoteVariantId) {
      if (mode === "adjust") {
        stockAdjustmentMutation.mutate(
          {
            direction: resolvedAdjustmentDirection,
            note: note.trim() || undefined,
            productVariantId: selectedUnit.remoteVariantId,
            quantity: quantityValue,
            reason,
            sourceName: "Mobile stock adjustment",
          },
          {
            onSuccess: () => {
              completeLocalAdjustment("synced")
              resetForm()
              onComplete?.()
            },
          },
        )
        return
      }

      stockIntakeMutation.mutate(
        {
          note: note.trim() || undefined,
          productVariantId: selectedUnit.remoteVariantId,
          quantity: quantityValue,
          sourceName: note.trim() || "Mobile stock intake",
        },
        {
          onSuccess: () => {
            completeLocalIntake("synced")
            resetForm()
            onComplete?.()
          },
        },
      )
      return
    }

    if (mode === "adjust") {
      completeLocalAdjustment("pending")
    } else {
      completeLocalIntake("pending")
    }

    resetForm()
    onComplete?.()
  }

  const content = (
    <View className="gap-5 px-5 pb-6">
          <View className="gap-2">
            <Text className="text-xl font-bold text-foreground">
              {mode === "adjust" ? "Adjust stock" : "Stock intake"}
            </Text>
            <Text className="text-sm leading-5 text-muted-foreground">
              {mode === "adjust"
                ? "Correct counts, record loss, or add found stock without a bulky form."
                : "Add delivered stock and keep an audit trail for inventory changes."}
            </Text>
          </View>

          <StatusBanner
            icon={canRecordProductionStock ? "CircleCheck" : "Clock"}
            message={sourceDetail}
            title={`Stock source: ${sourceLabel}`}
            tone={canRecordProductionStock ? "success" : "warning"}
          />

          <View className="flex-row gap-2">
            <InventorySegmentOption
              label="Restock"
              onPress={() => setMode("intake")}
              selected={mode === "intake"}
            />
            <InventorySegmentOption
              label="Adjust"
              onPress={() => setMode("adjust")}
              selected={mode === "adjust"}
            />
          </View>

          {products.length > 0 ? (
            <View className="gap-3">
              {products.length > 8 ? (
                <FormField
                  label="Find product"
                  leadingIcon="Search"
                  onChangeText={setProductQuery}
                  placeholder="Search products or units"
                  value={productQuery}
                />
              ) : null}
              {visibleProducts.length > 0 ? (
                visibleProducts.map((product) => (
                  <ProductOption
                    key={product.id}
                    onPress={() => {
                      setSelectedProductId(product.id)
                      setSelectedUnitId("primary")
                      setUnitQuery("")
                    }}
                    product={product}
                    selected={selectedProductId === product.id}
                  />
                ))
              ) : (
                <EmptyState
                  icon="Search"
                  message="Try another product, unit, or variant name."
                  title="No matching products"
                />
              )}
              {filteredProducts.length > visibleProducts.length ? (
                <Text className="text-xs font-semibold text-muted-foreground">
                  Showing first {visibleProducts.length} of{" "}
                  {filteredProducts.length} matching products.
                </Text>
              ) : null}
            </View>
          ) : (
            <EmptyState
              icon="Warehouse"
              message="Create an item before recording delivered stock."
              title="Add inventory first"
            />
          )}

          {selectedProduct && unitOptions.length > 0 ? (
            <View className="gap-2">
              <Text className="text-sm font-semibold text-foreground">
                Unit
              </Text>
              {unitOptions.length > STOCK_UNIT_PREVIEW_LIMIT ? (
                <FormField
                  label="Find unit"
                  leadingIcon="Search"
                  onChangeText={setUnitQuery}
                  placeholder="Search units or variants"
                  value={unitQuery}
                />
              ) : null}
              <View className="flex-row flex-wrap gap-2">
                {visibleUnitOptions.length > 0 ? (
                  visibleUnitOptions.map((unit) => (
                    <InventoryUnitOption
                      key={unit.id}
                      label={unit.label}
                      onPress={() => setSelectedUnitId(unit.id)}
                      selected={selectedUnit?.id === unit.id}
                      stockLabel={`${unit.stock} available`}
                      stockTone={getInventoryStockTone(unit.stock)}
                    />
                  ))
                ) : (
                  <EmptyState
                    className="flex-1"
                    icon="Search"
                    message="Try another unit or variant name."
                    title="No matching units"
                  />
                )}
              </View>
              {filteredUnitOptions.length > visibleUnitOptions.length ? (
                <Text className="text-xs font-semibold text-muted-foreground">
                  Showing first {visibleUnitOptions.length} of{" "}
                  {filteredUnitOptions.length} matching units.
                </Text>
              ) : null}
            </View>
          ) : null}

          <QuantityStepper
            helper={selectedUnit?.label}
            label={
              mode === "adjust" ? "Quantity to adjust" : "Quantity received"
            }
            onChangeText={setQuantity}
            value={quantity}
          />

          {mode === "adjust" ? (
            <View className="gap-3">
              <View className="gap-2">
                <Text className="text-sm font-semibold text-foreground">
                  Direction
                </Text>
                <View className="flex-row gap-2">
                  <InventorySegmentOption
                    disabled={!canDecreaseAdjustment}
                    label="Decrease"
                    onPress={() => setDirection("decrease")}
                    selected={direction === "decrease"}
                  />
                  <InventorySegmentOption
                    disabled={!canIncreaseAdjustment}
                    label="Increase"
                    onPress={() => setDirection("increase")}
                    selected={direction === "increase"}
                  />
                </View>
                <Text className="text-xs leading-4 text-muted-foreground">
                  {adjustmentDirectionHelper}
                </Text>
              </View>

              <View className="gap-2">
                <Text className="text-sm font-semibold text-foreground">
                  Reason
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {stockAdjustmentReasons.map((option) => (
                    <Pressable
                      key={option.value}
                      className={cn(
                        "rounded-full border px-4 py-2",
                        reason === option.value
                          ? "border-primary bg-primary"
                          : "border-border bg-background active:bg-accent",
                      )}
                      haptic
                      onPress={() => {
                        setReason(option.value)
                        setDirection(
                          normalizeStockAdjustmentDirection({
                            direction,
                            reason: option.value,
                          }),
                        )
                      }}
                      transition
                    >
                      <Text
                        className={cn(
                          "text-sm font-extrabold",
                          reason === option.value
                            ? "text-primary-foreground"
                            : "text-foreground",
                        )}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {!hasEnoughStock ? (
                <StatusBanner
                  icon="TriangleAlert"
                  message={`This unit only has ${selectedUnit?.stock ?? 0} available.`}
                  title="Insufficient stock"
                  tone="destructive"
                />
              ) : null}
            </View>
          ) : null}

          <FormField
            label={mode === "adjust" ? "Note" : "Source or note"}
            leadingIcon="StickyNote"
            onChangeText={setNote}
            placeholder={
              mode === "adjust"
                ? "Enter adjustment reason"
                : "Enter source note"
            }
            value={note}
          />

          {submitError ? (
            <StatusBanner
              icon="TriangleAlert"
              message={submitError}
              title="Stock was not recorded"
              tone="destructive"
            />
          ) : null}

          <ActionButton
            disabled={!canSubmit}
            isLoading={isSubmitting}
            loadingLabel="Recording stock"
            onPress={submit}
          >
            {mode === "adjust" ? "Record adjustment" : "Add stock"}
          </ActionButton>

          <View className="gap-3">
            <Text className="text-base font-bold text-foreground">
              Recent movements
            </Text>
            {stockMovements.length > 0 ? (
              <>
                {visibleStockMovements.map((movement) => (
                  <MovementRow key={movement.id} movement={movement} />
                ))}
                {stockMovements.length > visibleStockMovements.length ? (
                  <Text className="text-xs font-semibold text-muted-foreground">
                    Showing first {visibleStockMovements.length} of{" "}
                    {stockMovements.length} stock movements.
                  </Text>
                ) : null}
              </>
            ) : (
              <EmptyState
                icon="ListChecks"
                message="No stock movements recorded yet."
                title="No stock movement yet"
              />
            )}
          </View>

          <ActionButton onPress={onComplete} variant="outline">
            Done
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
      bottomOffset={320}
      contentContainerStyle={{ paddingBottom: 240 }}
      keyboardShouldPersistTaps="handled"
    >
      {content}
    </BottomSheetKeyboardAwareScrollView>
  )
}

export const StockIntakeSheet = forwardRef<
  BottomSheetModal,
  StockIntakeSheetProps
>(({ onComplete }, ref) => {
  return (
    <Modal
      enableDynamicSizing
      ref={ref}
      snapPoints={["88%"]}
      title="Record stock"
    >
      <StockIntakeContent onComplete={onComplete} />
    </Modal>
  )
})

StockIntakeSheet.displayName = "StockIntakeSheet"
