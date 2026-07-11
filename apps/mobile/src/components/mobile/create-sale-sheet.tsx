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
  type RetailOpsPaymentMethod,
  type RetailOpsProduct,
  useRetailOpsStore,
} from "@/store/retailOpsStore";
import { useTRPC } from "@/trpc/client";
import { formatMoney } from "@ewatrade/utils";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useMutation } from "@tanstack/react-query";
import { forwardRef, useMemo, useState } from "react";
import { View } from "react-native";

type CreateSaleSheetProps = {
  attendantName?: string;
  onComplete?: () => void;
};

type SellableItem = {
  id: string;
  productId: string;
  productName: string;
  remoteVariantId?: string;
  stock: number;
  unitName: string;
  unitPrice: number;
  variantId?: string;
};

function getProductStock(product: RetailOpsProduct) {
  return product.currentStock ?? product.startingStock ?? 0;
}

function getSellableItems(product: RetailOpsProduct): SellableItem[] {
  const stock = getProductStock(product);
  const primaryItem = {
    id: `${product.id}-primary`,
    productId: product.id,
    productName: product.name,
    remoteVariantId: product.remoteVariantId,
    stock,
    unitName: product.unitName,
    unitPrice: product.price,
  };

  if (product.variants.length > 0) {
    return [
      primaryItem,
      ...product.variants.map((variant) => ({
        id: `${product.id}-${variant.id}`,
        productId: product.id,
        productName: product.name,
        remoteVariantId: variant.remoteId,
        stock: variant.currentStock ?? variant.startingStock ?? 0,
        unitName: variant.name,
        unitPrice: variant.price,
        variantId: variant.id,
      })),
    ];
  }

  return [primaryItem];
}

function PaymentOption({
  label,
  onPress,
  selected,
}: {
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  return (
    <Pressable
      className={cn(
        "flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-border bg-card p-3 active:bg-accent",
        selected && "border-primary bg-primary/10",
      )}
      haptic
      onPress={onPress}
      transition
    >
      <Icon
        className={cn(
          "size-sm text-muted-foreground",
          selected && "text-primary",
        )}
        name={selected ? "CircleCheck" : "Circle"}
      />
      <Text
        className={cn(
          "text-sm font-bold text-muted-foreground",
          selected && "text-primary",
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SellableOption({
  item,
  onPress,
  selected,
}: {
  item: SellableItem;
  onPress: () => void;
  selected: boolean;
}) {
  const isOutOfStock = item.stock <= 0;

  return (
    <Pressable
      className={cn(
        "gap-2 rounded-xl border border-border bg-card p-3 active:bg-accent",
        selected && "border-primary bg-primary/10",
        isOutOfStock && "opacity-50",
      )}
      disabled={isOutOfStock}
      haptic
      onPress={onPress}
      transition
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text className="font-semibold text-foreground">{item.unitName}</Text>
          <Text className="text-xs text-muted-foreground">
            {item.stock} available
          </Text>
        </View>
        <Text className="font-bold text-foreground">
          {formatMoney(item.unitPrice, "NGN")}
        </Text>
      </View>
      {selected ? (
        <View className="self-start rounded-full bg-primary/10 px-3 py-1">
          <Text className="text-xs font-bold text-primary">Selected</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export const CreateSaleSheet = forwardRef<
  BottomSheetModal,
  CreateSaleSheetProps
>(({ attendantName = "Store Owner", onComplete }, ref) => {
  const trpc = useTRPC();
  const activeBusinessId = useBusinessStore((state) => state.activeBusinessId);
  const createSale = useRetailOpsStore((state) => state.createSale);
  const isOfflineMode = useRetailOpsStore((state) => state.isOfflineMode);
  const customers = useRetailOpsStore((state) =>
    state.customers.filter(
      (customer) =>
        !activeBusinessId ||
        (customer.businessId ?? activeBusinessId) === activeBusinessId,
    ),
  );
  const products = useRetailOpsStore((state) =>
    state.products.filter(
      (product) =>
        !activeBusinessId ||
        (product.businessId ?? activeBusinessId) === activeBusinessId,
    ),
  );
  const currentOpenSession = useRetailOpsStore(
    (state) =>
      state.repSessions.find(
        (session) =>
          session.status === "open" &&
          session.attendantName === attendantName &&
          (!activeBusinessId ||
            (session.businessId ?? activeBusinessId) === activeBusinessId),
      ) ?? null,
  );
  const [customerName, setCustomerName] = useState("");
  const [paymentMethod, setPaymentMethod] =
    useState<RetailOpsPaymentMethod>("cash");
  const [quantity, setQuantity] = useState("1");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const createProductionSaleMutation = useMutation(
    trpc.retailOps.createSale.mutationOptions({
      onError: (error) => {
        setSubmitError(error.message);
      },
    }),
  );

  const sellableItems = useMemo(
    () => products.flatMap((product) => getSellableItems(product)),
    [products],
  );
  const selectedItem = sellableItems.find((item) => item.id === selectedItemId);
  const quantityValue = parseWholeQuantity(quantity);
  const total = selectedItem ? selectedItem.unitPrice * quantityValue : 0;
  const hasEnoughStock = selectedItem
    ? quantityValue <= selectedItem.stock
    : true;
  const hasOpenSession = !!currentOpenSession;
  const canCreateProductionSale =
    !isOfflineMode &&
    !!selectedItem?.remoteVariantId &&
    !!currentOpenSession?.remoteId;
  const canSubmit =
    hasOpenSession &&
    !!selectedItem &&
    quantityValue > 0 &&
    hasEnoughStock &&
    !createProductionSaleMutation.isPending;
  const sourceLabel = canCreateProductionSale
    ? "Online"
    : isOfflineMode
      ? "Local"
      : "Local queue";
  const sourceDetail = canCreateProductionSale
    ? "This sale will be recorded in production immediately."
    : isOfflineMode
      ? "This sale will be queued locally and synced later."
      : "Waiting for the product unit or rep session to sync before direct production sale.";

  const selectItem = (item: SellableItem) => {
    setSelectedItemId(item.id);
    setQuantity("1");
  };

  const resetForm = () => {
    setCustomerName("");
    setPaymentMethod("cash");
    setQuantity("1");
    setSelectedItemId(null);
    setSubmitError(null);
  };

  const submit = () => {
    if (!selectedItem || !canSubmit) return;

    const localSaleInput = {
      attendantName,
      businessId: activeBusinessId ?? undefined,
      customerName,
      paymentMethod,
      productId: selectedItem.productId,
      productName: selectedItem.productName,
      quantity: quantityValue,
      unitName: selectedItem.unitName,
      unitPrice: selectedItem.unitPrice,
      variantId: selectedItem.variantId,
    };

    setSubmitError(null);

    if (canCreateProductionSale && selectedItem.remoteVariantId) {
      createProductionSaleMutation.mutate(
        {
          cashierSessionId: currentOpenSession?.remoteId,
          customerName: customerName.trim() || undefined,
          paymentMethod,
          productVariantId: selectedItem.remoteVariantId,
          quantity: quantityValue,
        },
        {
          onSuccess: (sale) => {
            createSale({
              ...localSaleInput,
              remoteId: sale.order.id,
              syncStatus: "synced",
            });
            resetForm();
            onComplete?.();
          },
        },
      );
      return;
    }

    createSale(localSaleInput);
    resetForm();
    onComplete?.();
  };

  return (
    <Modal
      enableDynamicSizing
      ref={ref}
      snapPoints={["90%"]}
      title="Create sale"
    >
      <BottomSheetKeyboardAwareScrollView
        bottomOffset={112}
        contentContainerStyle={{ paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-5 px-5 pb-6">
          <View className="gap-2">
            <Text className="text-xl font-bold text-foreground">
              Select item
            </Text>
            <Text className="text-sm leading-5 text-muted-foreground">
              Choose a product unit or variant, set quantity, then confirm
              payment and customer.
            </Text>
          </View>

          <View className="rounded-2xl border border-border bg-card p-4">
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1 gap-1">
                <Text className="font-semibold text-foreground">
                  Sale source
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

          {products.length === 0 ? (
            <View className="gap-2 rounded-2xl border border-dashed border-border p-4">
              <Text className="font-semibold text-foreground">
                Add inventory first
              </Text>
              <Text className="text-sm leading-5 text-muted-foreground">
                Create at least one item before recording a sale.
              </Text>
            </View>
          ) : (
            <View className="gap-4">
              {products.map((product) => {
                const items = getSellableItems(product);

                return (
                  <View className="gap-3" key={product.id}>
                    <View className="flex-row items-start justify-between gap-3">
                      <View className="flex-1 gap-1">
                        <Text className="font-bold text-foreground">
                          {product.name}
                        </Text>
                        <Text className="text-xs text-muted-foreground">
                          {product.variants.length > 0
                            ? "Choose a unit or variant"
                            : "Primary unit"}
                        </Text>
                      </View>
                      <View className="rounded-full bg-muted px-3 py-1">
                        <Text className="text-xs font-bold text-muted-foreground">
                          {getProductStock(product)} {product.unitName}
                        </Text>
                      </View>
                    </View>
                    <View className="gap-3">
                      {items.map((item) => (
                        <SellableOption
                          item={item}
                          key={item.id}
                          onPress={() => selectItem(item)}
                          selected={selectedItemId === item.id}
                        />
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <QuantityStepper
            helper={selectedItem ? selectedItem.unitName : undefined}
            onChangeText={setQuantity}
            value={quantity}
          />
          {!hasEnoughStock && selectedItem ? (
            <View className="rounded-2xl bg-destructive/10 p-3">
              <Text className="text-sm font-semibold text-destructive">
                Only {selectedItem.stock} {selectedItem.unitName} available.
              </Text>
            </View>
          ) : null}
          {!hasOpenSession ? (
            <View className="rounded-2xl bg-amber-500/10 p-3">
              <Text className="text-sm font-semibold text-amber-700">
                Clock in and confirm opening stock before completing a sale.
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

          <View className="gap-3 rounded-2xl border border-border bg-card p-4">
            <Text className="text-sm font-semibold text-muted-foreground">
              Total
            </Text>
            <Text className="text-3xl font-bold text-foreground">
              {formatMoney(total, "NGN")}
            </Text>
          </View>

          <View className="gap-3">
            <Text className="text-sm font-semibold text-foreground">
              Payment method
            </Text>
            <View className="flex-row gap-3">
              <PaymentOption
                label="Cash"
                onPress={() => setPaymentMethod("cash")}
                selected={paymentMethod === "cash"}
              />
              <PaymentOption
                label="Transfer"
                onPress={() => setPaymentMethod("transfer")}
                selected={paymentMethod === "transfer"}
              />
            </View>
          </View>

          <View className="gap-3">
            <FormField
              label="Customer name"
              onChangeText={setCustomerName}
              placeholder="Walk-in customer"
              value={customerName}
            />
            {customers.length > 0 ? (
              <View className="flex-row flex-wrap gap-2">
                {customers.slice(0, 6).map((customer) => (
                  <Pressable
                    className="rounded-full border border-border bg-card px-3 py-2 active:bg-accent"
                    haptic
                    key={customer.id}
                    onPress={() => setCustomerName(customer.name)}
                    transition
                  >
                    <Text className="text-xs font-semibold text-foreground">
                      {customer.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          <ActionButton disabled={!canSubmit} onPress={submit}>
            {createProductionSaleMutation.isPending
              ? "Recording sale..."
              : "Complete transaction"}
          </ActionButton>
        </View>
      </BottomSheetKeyboardAwareScrollView>
    </Modal>
  );
});

CreateSaleSheet.displayName = "CreateSaleSheet";
