import { ActionButton } from "@/components/mobile/action-button";
import { FormField } from "@/components/mobile/form-field";
import { QuantityStepper } from "@/components/mobile/quantity-stepper";
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { parseWholeQuantity } from "@/lib/quantity";
import { cn } from "@/lib/utils";
import { useBusinessStore } from "@/store/businessStore";
import {
  type RetailOpsProduct,
  type RetailOpsVariant,
  useRetailOpsStore,
} from "@/store/retailOpsStore";
import { useTRPC } from "@/trpc/client";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useMutation } from "@tanstack/react-query";
import { forwardRef, useEffect, useMemo, useState } from "react";
import { View } from "react-native";

type UnitConversionSheetProps = {
  onComplete?: () => void;
};

function formatQuantity(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(2)));
}

function getProductStock(product: RetailOpsProduct) {
  return product.currentStock ?? product.startingStock ?? 0;
}

function getVariantStock(variant: RetailOpsVariant) {
  return variant.currentStock ?? variant.startingStock ?? 0;
}

function ProductOption({
  onPress,
  product,
  selected,
}: {
  onPress: () => void;
  product: RetailOpsProduct;
  selected: boolean;
}) {
  const currentStock = getProductStock(product);

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
  );
}

function VariantOption({
  onPress,
  selected,
  variant,
}: {
  onPress: () => void;
  selected: boolean;
  variant: RetailOpsVariant;
}) {
  const currentStock = getVariantStock(variant);

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
          <Text className="font-semibold text-foreground">{variant.name}</Text>
          <Text className="text-sm text-muted-foreground">
            {currentStock} in stock
          </Text>
        </View>
        <View className="items-end gap-1">
          <Icon
            className={cn(
              "size-base text-muted-foreground",
              selected && "text-primary",
            )}
            name={selected ? "CircleCheck" : "Wrench"}
          />
          {variant.conversionMultiplier ? (
            <Text className="text-xs font-bold text-muted-foreground">
              x{variant.conversionMultiplier}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export const UnitConversionSheet = forwardRef<
  BottomSheetModal,
  UnitConversionSheetProps
>(({ onComplete }, ref) => {
  const trpc = useTRPC();
  const activeBusinessId = useBusinessStore((state) => state.activeBusinessId);
  const products = useRetailOpsStore((state) =>
    state.products.filter(
      (product) =>
        !activeBusinessId ||
        (product.businessId ?? activeBusinessId) === activeBusinessId,
    ),
  );
  const recordUnitConversion = useRetailOpsStore(
    (state) => state.recordUnitConversion,
  );
  const isOfflineMode = useRetailOpsStore((state) => state.isOfflineMode);
  const convertibleProducts = useMemo(
    () => products.filter((product) => product.variants.length > 0),
    [products],
  );
  const [note, setNote] = useState("");
  const [outputQuantity, setOutputQuantity] = useState("2");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    convertibleProducts[0]?.id ?? null,
  );
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    convertibleProducts[0]?.variants[0]?.id ?? null,
  );
  const [sourceQuantity, setSourceQuantity] = useState("1");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const unitConversionMutation = useMutation(
    trpc.retailOps.recordUnitConversion.mutationOptions({
      onError: (error) => {
        setSubmitError(error.message);
      },
    }),
  );
  const selectedProduct = convertibleProducts.find(
    (product) => product.id === selectedProductId,
  );
  const selectedVariant = selectedProduct?.variants.find(
    (variant) => variant.id === selectedVariantId,
  );
  const sourceQuantityValue = parseWholeQuantity(sourceQuantity);
  const outputQuantityValue = parseWholeQuantity(outputQuantity);
  const availableSourceStock = selectedProduct
    ? getProductStock(selectedProduct)
    : 0;
  const hasEnoughSourceStock = sourceQuantityValue <= availableSourceStock;
  const canRecordProductionConversion =
    !isOfflineMode &&
    !!selectedProduct?.remoteVariantId &&
    !!selectedVariant?.remoteId;
  const canSubmit =
    !!selectedProduct &&
    !!selectedVariant &&
    sourceQuantityValue > 0 &&
    outputQuantityValue > 0 &&
    hasEnoughSourceStock &&
    !unitConversionMutation.isPending;
  const sourceLabel = canRecordProductionConversion
    ? "Online"
    : isOfflineMode
      ? "Local"
      : "Local queue";
  const sourceDetail = canRecordProductionConversion
    ? "This conversion will be recorded in production immediately."
    : isOfflineMode
      ? "This conversion will be queued locally and synced later."
      : "Waiting for the source and target units to sync before direct production conversion.";

  useEffect(() => {
    if (convertibleProducts.length === 0) {
      setSelectedProductId(null);
      setSelectedVariantId(null);
      return;
    }

    const selectedProductExists = convertibleProducts.some(
      (product) => product.id === selectedProductId,
    );

    if (!selectedProductExists) {
      const nextProduct = convertibleProducts[0];
      const nextVariant = nextProduct?.variants[0];

      setSelectedProductId(nextProduct?.id ?? null);
      setSelectedVariantId(nextVariant?.id ?? null);
      setOutputQuantity(
        formatQuantity(
          parseWholeQuantity(sourceQuantity) *
            (nextVariant?.conversionMultiplier ?? 1),
        ),
      );
    }
  }, [convertibleProducts, selectedProductId, sourceQuantity]);

  const selectProduct = (product: RetailOpsProduct) => {
    setSelectedProductId(product.id);
    setSelectedVariantId(product.variants[0]?.id ?? null);
    setOutputQuantity(
      formatQuantity(
        parseWholeQuantity(sourceQuantity) *
          (product.variants[0]?.conversionMultiplier ?? 1),
      ),
    );
  };

  const selectVariant = (variant: RetailOpsVariant) => {
    setSelectedVariantId(variant.id);
    setOutputQuantity(
      formatQuantity(
        parseWholeQuantity(sourceQuantity) * (variant.conversionMultiplier ?? 1),
      ),
    );
  };

  const updateSourceQuantity = (value: string) => {
    setSourceQuantity(value);

    if (selectedVariant?.conversionMultiplier) {
      setOutputQuantity(
        formatQuantity(
          parseWholeQuantity(value) * selectedVariant.conversionMultiplier,
        ),
      );
    }
  };

  const submit = () => {
    if (!selectedProduct || !selectedVariant || !canSubmit) return;

    const completeLocalConversion = (
      syncStatus: "pending" | "synced",
      stockSnapshot?: {
        convertedAt?: string;
        sourceStockAfter?: number;
        targetStockAfter?: number;
      },
    ) => {
      recordUnitConversion({
        businessId: activeBusinessId ?? undefined,
        convertedAt: stockSnapshot?.convertedAt,
        note,
        outputQuantity: outputQuantityValue,
        productId: selectedProduct.id,
        sourceQuantity: sourceQuantityValue,
        sourceStockAfter: stockSnapshot?.sourceStockAfter,
        syncStatus,
        targetStockAfter: stockSnapshot?.targetStockAfter,
        targetVariantId: selectedVariant.id,
      });
      setNote("");
      setOutputQuantity(
        formatQuantity(selectedVariant.conversionMultiplier ?? 1),
      );
      setSourceQuantity("1");
      onComplete?.();
    };

    setSubmitError(null);

    if (
      canRecordProductionConversion &&
      selectedProduct.remoteVariantId &&
      selectedVariant.remoteId
    ) {
      unitConversionMutation.mutate(
        {
          note: note.trim() || undefined,
          sourceProductVariantId: selectedProduct.remoteVariantId,
          sourceQuantity: sourceQuantityValue,
          targetProductVariantId: selectedVariant.remoteId,
          targetQuantity: outputQuantityValue,
        },
        {
          onSuccess: (conversion) => {
            const convertedAt =
              conversion.conversion.convertedAt instanceof Date
                ? conversion.conversion.convertedAt.toISOString()
                : String(conversion.conversion.convertedAt);

            completeLocalConversion("synced", {
              convertedAt,
              sourceStockAfter: conversion.source.onHandQuantity,
              targetStockAfter: conversion.target.onHandQuantity,
            });
          },
        },
      );
      return;
    }

    completeLocalConversion("pending");
  };

  return (
    <Modal
      enableDynamicSizing
      ref={ref}
      snapPoints={["90%"]}
      title="Convert units"
    >
      <BottomSheetKeyboardAwareScrollView
        bottomOffset={112}
        contentContainerStyle={{ paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-5 px-5 pb-6">
          <View className="gap-2">
            <Text className="text-xl font-bold text-foreground">
              Convert stock
            </Text>
            <Text className="text-sm leading-5 text-muted-foreground">
              Rebag primary units into sellable variants while keeping both
              stock changes in the movement ledger.
            </Text>
          </View>

          <View className="rounded-2xl border border-border bg-card p-4">
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1 gap-1">
                <Text className="font-semibold text-foreground">
                  Conversion source
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

          {convertibleProducts.length > 0 ? (
            <View className="gap-3">
              {convertibleProducts.map((product) => (
                <ProductOption
                  key={product.id}
                  onPress={() => selectProduct(product)}
                  product={product}
                  selected={selectedProductId === product.id}
                />
              ))}
            </View>
          ) : (
            <View className="gap-2 rounded-2xl border border-dashed border-border p-4">
              <Text className="font-semibold text-foreground">
                Add variants first
              </Text>
              <Text className="text-sm leading-5 text-muted-foreground">
                Create half bag, quarter bag, or another variant before
                recording conversions.
              </Text>
            </View>
          )}

          {selectedProduct ? (
            <View className="gap-3">
              <Text className="text-sm font-semibold text-foreground">
                Convert into
              </Text>
              {selectedProduct.variants.map((variant) => (
                <VariantOption
                  key={variant.id}
                  onPress={() => selectVariant(variant)}
                  selected={selectedVariantId === variant.id}
                  variant={variant}
                />
              ))}
            </View>
          ) : null}

          <QuantityStepper
            helper={selectedProduct?.unitName}
            label="Primary units used"
            onChangeText={updateSourceQuantity}
            value={sourceQuantity}
          />
          {!hasEnoughSourceStock ? (
            <View className="rounded-2xl bg-destructive/10 p-3">
              <Text className="text-sm font-semibold text-destructive">
                Only {availableSourceStock} {selectedProduct?.unitName} in
                primary stock.
              </Text>
            </View>
          ) : null}

          <QuantityStepper
            helper={selectedVariant?.name}
            label="Variant units produced"
            onChangeText={setOutputQuantity}
            value={outputQuantity}
          />

          <FormField
            label="Conversion note"
            onChangeText={setNote}
            placeholder="Rebagged for afternoon sales"
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
            {unitConversionMutation.isPending
              ? "Recording conversion..."
              : "Record conversion"}
          </ActionButton>

          <ActionButton onPress={onComplete} variant="outline">
            Done
          </ActionButton>
        </View>
      </BottomSheetKeyboardAwareScrollView>
    </Modal>
  );
});

UnitConversionSheet.displayName = "UnitConversionSheet";
