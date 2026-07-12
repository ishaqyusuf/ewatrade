import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { QuantityStepper } from "@/components/mobile/quantity-stepper"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Icon } from "@/components/ui/icon"
import { Modal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
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

type StockIntakeSheetProps = {
  onComplete?: () => void
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
    <Pressable
      className={cn(
        "gap-2 rounded-2xl border border-border bg-card p-4 active:bg-accent",
        selected && "border-primary bg-primary/10",
      )}
      haptic
      onPress={onPress}
      transition
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text className="font-semibold text-foreground">{product.name}</Text>
          <Text className="text-sm text-muted-foreground">
            {currentStock} {product.unitName}
            {currentStock === 1 ? "" : "s"} available
          </Text>
        </View>
        <Icon
          className={cn(
            "size-base text-muted-foreground",
            selected && "text-primary",
          )}
          name={selected ? "CircleCheck" : "Warehouse"}
        />
      </View>
    </Pressable>
  )
}

function SegmentOption({
  disabled = false,
  label,
  onPress,
  selected,
}: {
  disabled?: boolean
  label: string
  onPress: () => void
  selected: boolean
}) {
  return (
    <Pressable
      className={cn(
        "h-11 flex-1 items-center justify-center rounded-xl border border-border bg-card px-3 active:bg-accent",
        selected && "border-primary bg-primary/10",
        disabled && "opacity-50",
      )}
      disabled={disabled}
      haptic
      onPress={onPress}
      transition
    >
      <Text
        className={cn(
          "text-sm font-bold text-muted-foreground",
          selected && "text-primary",
        )}
      >
        {label}
      </Text>
    </Pressable>
  )
}

function UnitOption({
  onPress,
  selected,
  unit,
}: {
  onPress: () => void
  selected: boolean
  unit: StockUnitOption
}) {
  return (
    <Pressable
      className={cn(
        "min-w-[45%] flex-1 gap-1 rounded-2xl border border-border bg-card p-3 active:bg-accent",
        selected && "border-primary bg-primary/10",
      )}
      haptic
      onPress={onPress}
      transition
    >
      <Text
        className={cn(
          "text-sm font-bold text-foreground",
          selected && "text-primary",
        )}
      >
        {unit.label}
      </Text>
      <Text className="text-xs text-muted-foreground">
        {unit.stock} available
      </Text>
    </Pressable>
  )
}

function MovementRow({ movement }: { movement: RetailOpsStockMovement }) {
  const isIncrease = movement.quantity >= 0

  return (
    <View className="flex-row items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
      <View className="flex-1 gap-1">
        <Text className="font-semibold text-foreground">
          {movement.productName}
        </Text>
        <Text className="text-xs font-semibold uppercase text-muted-foreground">
          {movementLabel(movement.type)}
        </Text>
      </View>
      <View className="items-end gap-1">
        <Text
          className={cn(
            "font-bold",
            isIncrease ? "text-emerald-700" : "text-destructive",
          )}
        >
          {isIncrease ? "+" : ""}
          {movement.quantity} {movement.unitName}
        </Text>
        {movement.syncStatus === "pending" ? (
          <Text className="text-xs font-bold text-amber-700">Pending sync</Text>
        ) : null}
      </View>
    </View>
  )
}

export const StockIntakeSheet = forwardRef<
  BottomSheetModal,
  StockIntakeSheetProps
>(({ onComplete }, ref) => {
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

  return (
    <Modal
      enableDynamicSizing
      ref={ref}
      snapPoints={["88%"]}
      title="Record stock"
    >
      <BottomSheetKeyboardAwareScrollView
        bottomOffset={320}
        contentContainerStyle={{ paddingBottom: 240 }}
        keyboardShouldPersistTaps="handled"
      >
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

          <View className="rounded-2xl border border-border bg-card p-4">
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1 gap-1">
                <Text className="font-semibold text-foreground">
                  Stock source
                </Text>
                <Text className="text-sm leading-5 text-muted-foreground">
                  {sourceDetail}
                </Text>
              </View>
              <View className="rounded-full bg-muted px-3 py-1">
                <Text className="text-xs font-bold text-muted-foreground">
                  {sourceLabel}
                </Text>
              </View>
            </View>
          </View>

          <View className="flex-row gap-2">
            <SegmentOption
              label="Restock"
              onPress={() => setMode("intake")}
              selected={mode === "intake"}
            />
            <SegmentOption
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
                <View className="gap-2 rounded-2xl border border-dashed border-border p-4">
                  <Text className="font-semibold text-foreground">
                    No matching products
                  </Text>
                  <Text className="text-sm leading-5 text-muted-foreground">
                    Try another product, unit, or variant name.
                  </Text>
                </View>
              )}
              {filteredProducts.length > visibleProducts.length ? (
                <Text className="text-xs font-semibold text-muted-foreground">
                  Showing first {visibleProducts.length} of{" "}
                  {filteredProducts.length} matching products.
                </Text>
              ) : null}
            </View>
          ) : (
            <View className="gap-2 rounded-2xl border border-dashed border-border p-4">
              <Text className="font-semibold text-foreground">
                Add inventory first
              </Text>
              <Text className="text-sm leading-5 text-muted-foreground">
                Create an item before recording delivered stock.
              </Text>
            </View>
          )}

          {selectedProduct && unitOptions.length > 0 ? (
            <View className="gap-2">
              <Text className="text-sm font-semibold text-foreground">
                Unit
              </Text>
              {unitOptions.length > STOCK_UNIT_PREVIEW_LIMIT ? (
                <FormField
                  label="Find unit"
                  onChangeText={setUnitQuery}
                  placeholder="Search units or variants"
                  value={unitQuery}
                />
              ) : null}
              <View className="flex-row flex-wrap gap-2">
                {visibleUnitOptions.length > 0 ? (
                  visibleUnitOptions.map((unit) => (
                    <UnitOption
                      key={unit.id}
                      onPress={() => setSelectedUnitId(unit.id)}
                      selected={selectedUnit?.id === unit.id}
                      unit={unit}
                    />
                  ))
                ) : (
                  <View className="flex-1 rounded-2xl border border-dashed border-border p-4">
                    <Text className="font-semibold text-foreground">
                      No matching units
                    </Text>
                    <Text className="text-sm leading-5 text-muted-foreground">
                      Try another unit or variant name.
                    </Text>
                  </View>
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
                  <SegmentOption
                    disabled={!canDecreaseAdjustment}
                    label="Decrease"
                    onPress={() => setDirection("decrease")}
                    selected={direction === "decrease"}
                  />
                  <SegmentOption
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
                        "rounded-xl border border-border bg-card px-3 py-2 active:bg-accent",
                        reason === option.value &&
                          "border-primary bg-primary/10",
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
                          "text-sm font-bold text-muted-foreground",
                          reason === option.value && "text-primary",
                        )}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {!hasEnoughStock ? (
                <Text className="text-xs font-medium text-destructive">
                  This unit only has {selectedUnit?.stock ?? 0} available.
                </Text>
              ) : null}
            </View>
          ) : null}

          <FormField
            label={mode === "adjust" ? "Note" : "Source or note"}
            onChangeText={setNote}
            placeholder={
              mode === "adjust"
                ? "Enter adjustment reason"
                : "Enter source note"
            }
            value={note}
          />

          {submitError ? (
            <View className="rounded-2xl bg-destructive/10 p-3">
              <Text className="text-sm font-semibold text-destructive">
                {submitError}
              </Text>
            </View>
          ) : null}

          <ActionButton disabled={!canSubmit} onPress={submit}>
            {isSubmitting
              ? "Recording stock..."
              : mode === "adjust"
                ? "Record adjustment"
                : "Add stock"}
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
              <View className="rounded-2xl border border-dashed border-border p-4">
                <Text className="text-sm leading-5 text-muted-foreground">
                  No stock movements recorded yet.
                </Text>
              </View>
            )}
          </View>

          <ActionButton onPress={onComplete} variant="outline">
            Done
          </ActionButton>
        </View>
      </BottomSheetKeyboardAwareScrollView>
    </Modal>
  )
})

StockIntakeSheet.displayName = "StockIntakeSheet"
