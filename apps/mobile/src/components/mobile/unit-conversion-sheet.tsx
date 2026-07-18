import { ActionButton } from "@/components/mobile/action-button"
import { EmptyState } from "@/components/mobile/empty-state"
import { FormField } from "@/components/mobile/form-field"
import { InventoryProductCard } from "@/components/mobile/inventory-product-card"
import { QuantityStepper } from "@/components/mobile/quantity-stepper"
import { StatusBanner } from "@/components/mobile/status-banner"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Modal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import type { MobileDesignStatusTone } from "@/lib/design-foundation"
import { parseWholeQuantity } from "@/lib/quantity"
import { useBusinessStore } from "@/store/businessStore"
import {
  type RetailOpsProduct,
  type RetailOpsVariant,
  useRetailOpsStore,
} from "@/store/retailOpsStore"
import { useTRPC } from "@/trpc/client"
import { calculateWholeUnitConversion } from "@ewatrade/utils/inventory-unit-conversion"
import type { BottomSheetModal } from "@gorhom/bottom-sheet"
import { useMutation } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { forwardRef, useEffect, useMemo, useState } from "react"
import { View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"

type UnitConversionSheetProps = {
  onComplete?: () => void
}

type UnitConversionContentProps = UnitConversionSheetProps & {
  presentation?: "screen" | "sheet"
}

const CONVERSION_VARIANT_PREVIEW_LIMIT = 8

function getProductStock(product: RetailOpsProduct) {
  return product.currentStock ?? product.startingStock ?? 0
}

function getVariantStock(variant: RetailOpsVariant) {
  return variant.currentStock ?? variant.startingStock ?? 0
}

function getInventoryStockTone(stock: number): MobileDesignStatusTone {
  if (stock <= 0) return "destructive"
  if (stock <= 5) return "warning"
  return "success"
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
  const currentStock = getProductStock(product)

  return (
    <InventoryProductCard
      icon="Warehouse"
      onPress={onPress}
      selected={selected}
      stockLabel={`${currentStock} ${product.unitName}${currentStock === 1 ? "" : "s"} available`}
      stockTone={getInventoryStockTone(currentStock)}
      subtitle={`${product.variants.length} conversion target${product.variants.length === 1 ? "" : "s"}`}
      title={product.name}
    />
  )
}

function VariantOption({
  onPress,
  selected,
  variant,
}: {
  onPress: () => void
  selected: boolean
  variant: RetailOpsVariant
}) {
  const currentStock = getVariantStock(variant)

  return (
    <InventoryProductCard
      icon="Wrench"
      onPress={onPress}
      priceLabel={
        variant.conversionMultiplier
          ? `x${variant.conversionMultiplier}`
          : undefined
      }
      selected={selected}
      stockLabel={`${currentStock} in stock`}
      stockTone={getInventoryStockTone(currentStock)}
      subtitle="Variant or sub-unit"
      title={variant.name}
    />
  )
}

export function UnitConversionContent({
  onComplete,
  presentation = "sheet",
}: UnitConversionContentProps) {
  const trpc = useTRPC()
  const activeBusinessId = useBusinessStore((state) => state.activeBusinessId)
  const allProducts = useRetailOpsStore((state) => state.products)
  const products = useMemo(
    () =>
      allProducts.filter(
        (product) =>
          (product.kind ?? "product") === "product" &&
          (!activeBusinessId ||
            (product.businessId ?? activeBusinessId) === activeBusinessId),
      ),
    [activeBusinessId, allProducts],
  )
  const recordUnitConversion = useRetailOpsStore(
    (state) => state.recordUnitConversion,
  )
  const isOfflineMode = useRetailOpsStore((state) => state.isOfflineMode)
  const convertibleProducts = useMemo(
    () => products.filter((product) => product.variants.length > 0),
    [products],
  )
  const [note, setNote] = useState("")
  const [productQuery, setProductQuery] = useState("")
  const [variantQuery, setVariantQuery] = useState("")
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    convertibleProducts[0]?.id ?? null,
  )
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    convertibleProducts[0]?.variants[0]?.id ?? null,
  )
  const [sourceQuantity, setSourceQuantity] = useState("1")
  const [submitError, setSubmitError] = useState<string | null>(null)
  const unitConversionMutation = useMutation(
    trpc.retailOps.recordUnitConversion.mutationOptions({
      onError: (error) => {
        setSubmitError(error.message)
      },
    }),
  )
  const filteredConvertibleProducts = useMemo(() => {
    const normalizedQuery = productQuery.trim().toLowerCase()

    if (!normalizedQuery) return convertibleProducts

    return convertibleProducts.filter((product) =>
      [
        product.name,
        product.unitName,
        ...product.variants.map((variant) => variant.name),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    )
  }, [convertibleProducts, productQuery])
  const visibleConvertibleProducts = useMemo(
    () => filteredConvertibleProducts.slice(0, 12),
    [filteredConvertibleProducts],
  )
  const selectedProduct = convertibleProducts.find(
    (product) => product.id === selectedProductId,
  )
  const filteredSelectedVariants = useMemo(() => {
    const variants = selectedProduct?.variants ?? []
    const normalizedQuery = variantQuery.trim().toLowerCase()

    if (!normalizedQuery) return variants

    return variants.filter((variant) =>
      variant.name.toLowerCase().includes(normalizedQuery),
    )
  }, [selectedProduct?.variants, variantQuery])
  const visibleSelectedVariants = useMemo(
    () => filteredSelectedVariants.slice(0, CONVERSION_VARIANT_PREVIEW_LIMIT),
    [filteredSelectedVariants],
  )
  const selectedVariant = selectedProduct?.variants.find(
    (variant) => variant.id === selectedVariantId,
  )
  const sourceQuantityValue = parseWholeQuantity(sourceQuantity)
  const conversionPreview = calculateWholeUnitConversion({
    sourceMultiplier: 1,
    sourceQuantity: sourceQuantityValue,
    targetMultiplier: selectedVariant?.conversionMultiplier,
  })
  const outputQuantityValue = conversionPreview?.targetQuantity ?? 0
  const availableSourceStock = selectedProduct
    ? getProductStock(selectedProduct)
    : 0
  const hasEnoughSourceStock = sourceQuantityValue <= availableSourceStock
  const canRecordProductionConversion =
    !isOfflineMode &&
    !!selectedProduct?.remoteVariantId &&
    !!selectedVariant?.remoteId
  const canSubmit =
    !!selectedProduct &&
    !!selectedVariant &&
    sourceQuantityValue > 0 &&
    !!conversionPreview &&
    hasEnoughSourceStock &&
    !unitConversionMutation.isPending
  const sourceDetail = isOfflineMode
    ? "This conversion will sync when connection is ready."
    : "Waiting for the source and target units to sync before direct production conversion."

  useEffect(() => {
    if (convertibleProducts.length === 0) {
      setSelectedProductId(null)
      setSelectedVariantId(null)
      return
    }

    const selectedProductExists = convertibleProducts.some(
      (product) => product.id === selectedProductId,
    )

    if (!selectedProductExists) {
      const nextProduct = convertibleProducts[0]
      const nextVariant = nextProduct?.variants[0]

      setSelectedProductId(nextProduct?.id ?? null)
      setSelectedVariantId(nextVariant?.id ?? null)
    }
  }, [convertibleProducts, selectedProductId])

  const selectProduct = (product: RetailOpsProduct) => {
    setSelectedProductId(product.id)
    setSelectedVariantId(product.variants[0]?.id ?? null)
    setVariantQuery("")
  }

  const selectVariant = (variant: RetailOpsVariant) => {
    setSelectedVariantId(variant.id)
  }

  const updateSourceQuantity = (value: string) => {
    setSourceQuantity(value)
  }

  const submit = () => {
    if (!selectedProduct || !selectedVariant || !canSubmit) return

    const completeLocalConversion = (
      syncStatus: "pending" | "synced",
      stockSnapshot?: {
        convertedAt?: string
        sourceStockAfter?: number
        targetQuantity?: number
        targetStockAfter?: number
      },
    ) => {
      recordUnitConversion({
        businessId: activeBusinessId ?? undefined,
        convertedAt: stockSnapshot?.convertedAt,
        note,
        outputQuantity: stockSnapshot?.targetQuantity ?? outputQuantityValue,
        productId: selectedProduct.id,
        sourceQuantity: sourceQuantityValue,
        sourceStockAfter: stockSnapshot?.sourceStockAfter,
        syncStatus,
        targetStockAfter: stockSnapshot?.targetStockAfter,
        targetVariantId: selectedVariant.id,
      })
      setNote("")
      setSourceQuantity("1")
      onComplete?.()
    }

    setSubmitError(null)

    if (
      canRecordProductionConversion &&
      selectedProduct.remoteVariantId &&
      selectedVariant.remoteId
    ) {
      unitConversionMutation.mutate(
        {
          externalId: `mobile:unit_conversion:${Crypto.randomUUID()}`,
          note: note.trim() || undefined,
          sourceProductVariantId: selectedProduct.remoteVariantId,
          sourceQuantity: sourceQuantityValue,
          targetProductVariantId: selectedVariant.remoteId,
        },
        {
          onSuccess: (conversion) => {
            const convertedAt =
              conversion.conversion.convertedAt instanceof Date
                ? conversion.conversion.convertedAt.toISOString()
                : String(conversion.conversion.convertedAt)

            completeLocalConversion("synced", {
              convertedAt,
              sourceStockAfter: conversion.source.onHandQuantity,
              targetQuantity: conversion.conversion.targetQuantity,
              targetStockAfter: conversion.target.onHandQuantity,
            })
          },
        },
      )
      return
    }

    completeLocalConversion("pending")
  }

  const contentClassName =
    presentation === "screen" ? "gap-5 px-4 pb-6" : "gap-5 px-5 pb-6"

  const content = (
    <View className={contentClassName}>
      <View className="gap-2">
        <Text className="text-xl font-bold text-foreground">Convert stock</Text>
        <Text className="text-sm leading-5 text-muted-foreground">
          Rebag primary units into sellable variants while keeping both stock
          changes in the movement ledger.
        </Text>
      </View>

      {!canRecordProductionConversion ? (
        <StatusBanner
          icon="Clock"
          message={sourceDetail}
          title={isOfflineMode ? "Offline conversion" : "Sync required"}
          tone="warning"
        />
      ) : null}

      {convertibleProducts.length > 0 ? (
        <View className="gap-3">
          {convertibleProducts.length > 8 ? (
            <FormField
              label="Find product"
              leadingIcon="Search"
              onChangeText={setProductQuery}
              placeholder="Search products or variants"
              value={productQuery}
            />
          ) : null}
          {visibleConvertibleProducts.length > 0 ? (
            visibleConvertibleProducts.map((product) => (
              <ProductOption
                key={product.id}
                onPress={() => selectProduct(product)}
                product={product}
                selected={selectedProductId === product.id}
              />
            ))
          ) : (
            <EmptyState
              icon="Search"
              message="Try another product or variant name."
              title="No matching products"
            />
          )}
          {filteredConvertibleProducts.length >
          visibleConvertibleProducts.length ? (
            <Text className="text-xs font-semibold text-muted-foreground">
              Showing first {visibleConvertibleProducts.length} of{" "}
              {filteredConvertibleProducts.length} matching products.
            </Text>
          ) : null}
        </View>
      ) : (
        <EmptyState
          icon="Warehouse"
          message="Create half bag, quarter bag, or another variant before recording conversions."
          title="Add variants first"
        />
      )}

      {selectedProduct ? (
        <View className="gap-3">
          <Text className="text-sm font-semibold text-foreground">
            Convert into
          </Text>
          {selectedProduct.variants.length >
          CONVERSION_VARIANT_PREVIEW_LIMIT ? (
            <FormField
              label="Find variant"
              leadingIcon="Search"
              onChangeText={setVariantQuery}
              placeholder="Search variants"
              value={variantQuery}
            />
          ) : null}
          {visibleSelectedVariants.length > 0 ? (
            visibleSelectedVariants.map((variant) => (
              <VariantOption
                key={variant.id}
                onPress={() => selectVariant(variant)}
                selected={selectedVariantId === variant.id}
                variant={variant}
              />
            ))
          ) : (
            <EmptyState
              icon="Search"
              message="Try another sub-unit or variant name."
              title="No matching variants"
            />
          )}
          {filteredSelectedVariants.length > visibleSelectedVariants.length ? (
            <Text className="text-xs font-semibold text-muted-foreground">
              Showing first {visibleSelectedVariants.length} of{" "}
              {filteredSelectedVariants.length} matching variants.
            </Text>
          ) : null}
        </View>
      ) : null}

      <QuantityStepper
        helper={selectedProduct?.unitName}
        label="Primary units used"
        onChangeText={updateSourceQuantity}
        value={sourceQuantity}
      />
      {!hasEnoughSourceStock ? (
        <StatusBanner
          icon="TriangleAlert"
          message={`Only ${availableSourceStock} ${selectedProduct?.unitName} in primary stock.`}
          title="Insufficient source stock"
          tone="destructive"
        />
      ) : null}

      <FormField
        editable={false}
        helper={
          conversionPreview
            ? `Calculated from the configured unit ratio for ${selectedVariant?.name ?? "the target unit"}.`
            : "Choose a target with a valid ratio and a source quantity that produces whole units."
        }
        label="Variant units produced"
        value={
          conversionPreview ? String(conversionPreview.targetQuantity) : ""
        }
      />

      <FormField
        label="Conversion note"
        leadingIcon="StickyNote"
        onChangeText={setNote}
        placeholder="Enter conversion note"
        value={note}
      />

      {submitError ? (
        <StatusBanner
          icon="TriangleAlert"
          message={submitError}
          title="Conversion was not recorded"
          tone="destructive"
        />
      ) : null}

      <ActionButton
        disabled={!canSubmit}
        isLoading={unitConversionMutation.isPending}
        loadingLabel="Recording conversion"
        onPress={submit}
      >
        Record conversion
      </ActionButton>

      <ActionButton onPress={onComplete} variant="outline">
        Done
      </ActionButton>
    </View>
  )

  if (presentation === "screen") {
    return (
      <KeyboardAwareScrollView
        className="flex-1"
        bottomOffset={320}
        contentContainerStyle={{ paddingBottom: 240 }}
        disableScrollOnKeyboardHide
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        {content}
      </KeyboardAwareScrollView>
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

export const UnitConversionSheet = forwardRef<
  BottomSheetModal,
  UnitConversionSheetProps
>((props, ref) => {
  return (
    <Modal
      enableDynamicSizing
      ref={ref}
      snapPoints={["90%"]}
      title="Convert units"
    >
      <UnitConversionContent {...props} presentation="sheet" />
    </Modal>
  )
})

UnitConversionSheet.displayName = "UnitConversionSheet"
