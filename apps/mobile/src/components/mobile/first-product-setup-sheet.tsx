import { ActionButton } from "@/components/mobile/action-button";
import { FormField } from "@/components/mobile/form-field";
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import {
  isWholeNumberInput,
  normalizeWholeNumberInput,
  parseWholeQuantity,
} from "@/lib/quantity";
import { useBusinessStore } from "@/store/businessStore";
import { useRetailOpsStore } from "@/store/retailOpsStore";
import {
  getBusinessSubscription,
  getPlan,
  useSubscriptionStore,
} from "@/store/subscriptionStore";
import { useTRPC } from "@/trpc/client";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useMutation } from "@tanstack/react-query";
import { forwardRef, useState } from "react";
import { View } from "react-native";

type FirstProductSetupSheetProps = {
  onComplete?: () => void;
};

type VariantDraft = {
  conversionMultiplier: string;
  id: string;
  name: string;
  price: string;
};

type ProductionProduct = {
  product: {
    id: string;
    name: string;
  };
  units: Array<{
    id: string;
    isDefault: boolean;
    name: string;
    openingStockQuantity: number;
    priceMinor: number;
  }>;
};

type CreateProductInput = {
  name: string;
  openingStockQuantity: number;
  priceMinor: number;
  primaryUnitName: string;
  variants: Array<{
    conversionMultiplier?: number;
    name: string;
    openingStockQuantity: number;
    priceMinor: number;
  }>;
};

function parseAmount(value: string) {
  const amount = Number(value.replace(/[^\d.]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function isNumberInput(value: string) {
  const normalized = value.replace(/[^\d.]/g, "");
  const amount = Number(normalized);
  return normalized.length > 0 && Number.isFinite(amount);
}

function inferConversionMultiplier(name: string) {
  const normalizedName = name.trim().toLowerCase();

  if (normalizedName.includes("quarter")) return 4;
  if (normalizedName.includes("half")) return 2;

  return 1;
}

function getMatchingUnit(
  product: ProductionProduct,
  input: {
    isDefault?: boolean;
    name: string;
  },
) {
  return product.units.find((unit) =>
    typeof input.isDefault === "boolean"
      ? unit.isDefault === input.isDefault
      : unit.name.trim().toLowerCase() === input.name.trim().toLowerCase(),
  );
}

function createVariantDraft(): VariantDraft {
  return {
    conversionMultiplier: "",
    id: `variant-${Date.now()}-${Math.round(Math.random() * 10000)}`,
    name: "",
    price: "",
  };
}

export const FirstProductSetupSheet = forwardRef<
  BottomSheetModal,
  FirstProductSetupSheetProps
>(({ onComplete }, ref) => {
  const trpc = useTRPC();
  const activeBusinessId = useBusinessStore((state) => state.activeBusinessId);
  const addFirstProduct = useRetailOpsStore((state) => state.addFirstProduct);
  const isOfflineMode = useRetailOpsStore((state) => state.isOfflineMode);
  const products = useRetailOpsStore((state) =>
    state.products.filter(
      (product) =>
        !activeBusinessId ||
        (product.businessId ?? activeBusinessId) === activeBusinessId,
    ),
  );
  const subscriptions = useSubscriptionStore((state) => state.subscriptions);
  const [name, setName] = useState("");
  const [unitName, setUnitName] = useState("");
  const [price, setPrice] = useState("");
  const [startingStock, setStartingStock] = useState("");
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const subscription = getBusinessSubscription(
    subscriptions,
    activeBusinessId,
  );
  const plan = getPlan(subscription.planId);
  const isAtProductLimit = products.length >= plan.limits.products;
  const createProductMutation = useMutation(
    trpc.retailOps.createProduct.mutationOptions({
      onError: (error) => {
        setSubmitError(error.message);
      },
      onSuccess: (createdProduct, input) => {
        const productionProduct = createdProduct as ProductionProduct;
        const defaultUnit = getMatchingUnit(productionProduct, {
          isDefault: true,
          name: input.primaryUnitName,
        });

        addFirstProduct({
          businessId: activeBusinessId ?? undefined,
          name: input.name,
          price: input.priceMinor,
          remoteId: productionProduct.product.id,
          remoteVariantId: defaultUnit?.id,
          startingStock: input.openingStockQuantity,
          syncStatus: "synced",
          unitName: input.primaryUnitName,
          variants: input.variants.map((variant) => {
            const unit = getMatchingUnit(productionProduct, {
              name: variant.name,
            });

            return {
              conversionMultiplier: variant.conversionMultiplier,
              currentStock: variant.openingStockQuantity,
              name: variant.name,
              price: variant.priceMinor,
              remoteId: unit?.id,
              startingStock: variant.openingStockQuantity,
            };
          }),
        });
        setName("");
        setUnitName("");
        setPrice("");
        setStartingStock("");
        setVariants([]);
        setSubmitError(null);
        onComplete?.();
      },
    }),
  );

  const canSubmit =
    !isAtProductLimit &&
    !createProductMutation.isPending &&
    !!name.trim() &&
    !!unitName.trim() &&
    isNumberInput(price) &&
    parseAmount(price) > 0 &&
    isWholeNumberInput(startingStock) &&
    parseWholeQuantity(startingStock) >= 0;

  const updateVariant = (
    id: string,
    field: "conversionMultiplier" | "name" | "price",
    value: string,
  ) => {
    setVariants((current) =>
      current.map((variant) =>
        variant.id === id ? { ...variant, [field]: value } : variant,
      ),
    );
  };

  const removeVariant = (id: string) => {
    setVariants((current) => current.filter((variant) => variant.id !== id));
  };

  const buildCreateProductInput = (): CreateProductInput => ({
    name: name.trim(),
    openingStockQuantity: parseWholeQuantity(startingStock),
    priceMinor: parseAmount(price),
    primaryUnitName: unitName.trim(),
    variants: variants
      .filter((variant) => variant.name.trim() && parseAmount(variant.price))
      .map((variant) => ({
        conversionMultiplier:
          parseAmount(variant.conversionMultiplier) ||
          inferConversionMultiplier(variant.name),
        name: variant.name.trim(),
        openingStockQuantity: 0,
        priceMinor: parseAmount(variant.price),
      })),
  });

  const submit = () => {
    if (!canSubmit) return;

    const input = buildCreateProductInput();

    setSubmitError(null);

    if (!isOfflineMode) {
      createProductMutation.mutate(input);
      return;
    }

    addFirstProduct({
      businessId: activeBusinessId ?? undefined,
      name: input.name,
      price: input.priceMinor,
      startingStock: input.openingStockQuantity,
      unitName: input.primaryUnitName,
      variants: input.variants.map((variant) => ({
        conversionMultiplier: variant.conversionMultiplier,
        name: variant.name,
        price: variant.priceMinor,
      })),
    });
    setName("");
    setUnitName("");
    setPrice("");
    setStartingStock("");
    setVariants([]);
    onComplete?.();
  };

  return (
    <Modal
      enableDynamicSizing
      ref={ref}
      snapPoints={["88%"]}
      title="Add first item"
    >
      <BottomSheetKeyboardAwareScrollView
        bottomOffset={96}
        contentContainerStyle={{ paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-5 px-5 pb-6">
          <View className="gap-2">
            <Text className="text-xl font-bold text-foreground">
              Set up inventory
            </Text>
            <Text className="text-sm leading-5 text-muted-foreground">
              Add the item, its selling unit, optional variants, and the stock
              you have right now.
            </Text>
          </View>

          <View className="rounded-2xl border border-border bg-card p-4">
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1 gap-1">
                <Text className="font-semibold text-foreground">
                  Setup source
                </Text>
                <Text className="text-sm leading-5 text-muted-foreground">
                  {isOfflineMode
                    ? "This item will be queued locally and synced later."
                    : "This item will be created in production immediately."}
                </Text>
              </View>
              <View className="rounded-full bg-muted px-3 py-1">
                <Text className="text-xs font-bold text-muted-foreground">
                  {isOfflineMode ? "Local" : "Online"}
                </Text>
              </View>
            </View>
          </View>

          <View className="gap-4">
            <FormField
              label="Item name"
              onChangeText={setName}
              placeholder="Starter Poultry Feed"
              value={name}
            />
            <FormField
              label="Primary unit"
              onChangeText={setUnitName}
              placeholder="Bag"
              value={unitName}
            />
            <FormField
              inputMode="decimal"
              keyboardType="numeric"
              label="Price per unit"
              onChangeText={setPrice}
              placeholder="18500"
              value={price}
            />
          </View>

          <View className="gap-3">
            <View className="flex-row items-center justify-between">
              <View className="gap-1">
                <Text className="font-bold text-foreground">
                  Sub-units or variants
                </Text>
                <Text className="text-xs text-muted-foreground">
                  Add half bag, quarter bag, or other sellable options.
                </Text>
              </View>
              <Pressable
                className="h-10 w-10 items-center justify-center rounded-full bg-primary/10"
                haptic
                onPress={() =>
                  setVariants((current) => [...current, createVariantDraft()])
                }
                transition
              >
                <Icon className="size-base text-primary" name="Plus" />
              </Pressable>
            </View>

            {variants.length === 0 ? (
              <View className="rounded-2xl border border-dashed border-border p-4">
                <Text className="text-sm text-muted-foreground">
                  No variants yet. You can continue with only the primary unit.
                </Text>
              </View>
            ) : (
              <View className="gap-3">
                {variants.map((variant, index) => (
                  <View
                    className="gap-3 rounded-2xl border border-border bg-card p-3"
                    key={variant.id}
                  >
                    <View className="flex-row items-center justify-between">
                      <Text className="font-semibold text-foreground">
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
                      onChangeText={(value) =>
                        updateVariant(variant.id, "name", value)
                      }
                      placeholder="Half bag"
                      value={variant.name}
                    />
                    <FormField
                      helper="Example: Half bag = 2, Quarter bag = 4."
                      inputMode="decimal"
                      keyboardType="numeric"
                      label={`Units from 1 ${unitName.trim() || "primary unit"}`}
                      onChangeText={(value) =>
                        updateVariant(variant.id, "conversionMultiplier", value)
                      }
                      placeholder={
                        variant.name.trim().toLowerCase().includes("quarter")
                          ? "4"
                          : variant.name.trim().toLowerCase().includes("half")
                            ? "2"
                            : "1"
                      }
                      value={variant.conversionMultiplier}
                    />
                    <FormField
                      inputMode="decimal"
                      keyboardType="numeric"
                      label="Variant price"
                      onChangeText={(value) =>
                        updateVariant(variant.id, "price", value)
                      }
                      placeholder="9500"
                      value={variant.price}
                    />
                  </View>
                ))}
              </View>
            )}
          </View>

          <FormField
            inputMode="numeric"
            keyboardType="numeric"
            label="Starting stock"
            onChangeText={(value) =>
              setStartingStock(normalizeWholeNumberInput(value))
            }
            placeholder="42"
            value={startingStock}
          />

          {isAtProductLimit ? (
            <View className="rounded-2xl bg-destructive/10 p-3">
              <Text className="text-sm font-semibold text-destructive">
                {plan.name} allows {plan.limits.products} products. Open
                Subscription to move to a higher tier.
              </Text>
            </View>
          ) : null}

          {submitError ? (
            <View className="rounded-2xl bg-destructive/10 p-3">
              <Text className="text-sm font-semibold text-destructive">
                {submitError}
              </Text>
            </View>
          ) : null}

          <ActionButton disabled={!canSubmit} onPress={submit}>
            {createProductMutation.isPending
              ? "Adding item..."
              : "Add item and stock"}
          </ActionButton>
        </View>
      </BottomSheetKeyboardAwareScrollView>
    </Modal>
  );
});

FirstProductSetupSheet.displayName = "FirstProductSetupSheet";
