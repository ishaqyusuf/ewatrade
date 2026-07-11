import { ActionButton } from "@/components/mobile/action-button";
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view";
import { Icon, type IconKeys } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { useBusinessStore } from "@/store/businessStore";
import {
  type RetailOpsProduct,
  type RetailOpsShareLink,
  useRetailOpsStore,
} from "@/store/retailOpsStore";
import { useTRPC } from "@/trpc/client";
import { formatMoney } from "@ewatrade/utils";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useMutation, useQuery } from "@tanstack/react-query";
import { forwardRef, useEffect, useState } from "react";
import { Share, View } from "react-native";

type ProductShareSheetProps = {
  onComplete?: () => void;
}

type ShareLinkMetric = {
  icon: "Eye" | "Globe" | "ReceiptText";
  label: string;
  value: string;
}

type SharedLinkPaymentMethod = "cash" | "transfer" | "card"
type SharedLinkFulfillmentStatus =
  | "ready_for_pickup"
  | "picked_up"
  | "delivered"
type SharedLinkFulfillmentMethod = "pickup" | "delivery"

type SharedLinkFollowUpSelection = {
  fulfillmentMethod: SharedLinkFulfillmentMethod;
  fulfillmentStatus: SharedLinkFulfillmentStatus;
  paymentMethod: SharedLinkPaymentMethod;
}

type FollowUpOption<Value extends string> = {
  icon: IconKeys;
  label: string;
  value: Value;
}

const defaultSharedLinkFollowUpSelection: SharedLinkFollowUpSelection = {
  fulfillmentMethod: "pickup",
  fulfillmentStatus: "picked_up",
  paymentMethod: "cash",
}

const paymentMethodOptions = [
  { icon: "Wallet", label: "Cash", value: "cash" },
  { icon: "CreditCard", label: "Transfer", value: "transfer" },
  { icon: "CreditCard", label: "Card", value: "card" },
] satisfies FollowUpOption<SharedLinkPaymentMethod>[]

const fulfillmentStatusOptions = [
  {
    icon: "Clock",
    label: "Ready",
    value: "ready_for_pickup",
  },
  {
    icon: "CircleCheck",
    label: "Picked up",
    value: "picked_up",
  },
  {
    icon: "Truck",
    label: "Delivered",
    value: "delivered",
  },
] satisfies FollowUpOption<SharedLinkFulfillmentStatus>[]

const fulfillmentMethodOptions = [
  { icon: "Warehouse", label: "Pickup", value: "pickup" },
  { icon: "Truck", label: "Delivery", value: "delivery" },
] satisfies FollowUpOption<SharedLinkFulfillmentMethod>[]

type SharedLinkOrderRequest = {
  createdAt: Date | string;
  currencyCode: string;
  customer: {
    email: string | null;
    name: string | null;
    phone: string | null;
  };
  id: string;
  line: {
    productName: string;
    quantity: number;
    unitName: string | null;
  } | null;
  notification?: {
    attemptCount?: number;
    failedAt?: string | null;
    failureReason?: string | null;
    lastAttemptAt?: string | null;
    sentAt?: string | null;
    status?: string | null;
  } | null;
  orderNumber: string;
  reservation?: {
    inventoryItemId?: string | null;
    productVariantId?: string | null;
    quantity?: number | null;
    status?: string | null;
  } | null;
  totalMinor: number;
}

type ProductionShareLink = {
  active: boolean;
  createdAt: string;
  id: string;
  label: string | null;
  lastActivityAt: string | null;
  orderCount: number;
  product: {
    id: string;
    name: string;
  };
  url: string;
  viewCount: number;
}

function formatOrderTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return "New request";

  return date.toLocaleString(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  });
}

function formatLinkTime(value: string | null) {
  if (!value) return "No activity yet";

  return formatOrderTime(value);
}

function formatMinorMoney(value: number, currencyCode: string) {
  return formatMoney(value / 100, currencyCode || "NGN");
}

function getReservationStatusLabel(status: string | null | undefined) {
  if (status === "reserved") return "Stock reserved";
  if (status === "consumed") return "Stock consumed";
  if (status === "released") return "Stock released";

  return "Reservation pending";
}

function getNotificationStatusLabel(status: string | null | undefined) {
  if (status === "sent") return "Notification sent";
  if (status === "failed") return "Notify manually";

  return "Notification pending";
}

function getStatusPillClassName(status: string | null | undefined) {
  if (status === "sent" || status === "reserved") {
    return "bg-emerald-500/10";
  }

  if (status === "failed") {
    return "bg-destructive/10";
  }

  if (status === "released" || status === "consumed") {
    return "bg-primary/10";
  }

  return "bg-muted";
}

function getStatusPillTextClassName(status: string | null | undefined) {
  if (status === "sent" || status === "reserved") {
    return "text-emerald-700";
  }

  if (status === "failed") {
    return "text-destructive";
  }

  if (status === "released" || status === "consumed") {
    return "text-primary";
  }

  return "text-muted-foreground";
}

function StatusPill({
  label,
  status,
}: {
  label: string;
  status?: string | null;
}) {
  return (
    <View className={cn("rounded-full px-3 py-1", getStatusPillClassName(status))}>
      <Text
        className={cn(
          "text-xs font-bold",
          getStatusPillTextClassName(status),
        )}
      >
        {label}
      </Text>
    </View>
  );
}

function shareGeneratedLink({
  title,
  url,
}: {
  title: string;
  url: string;
}) {
  void Share.share({
    message: `${title}\n${url}`,
    title,
    url,
  });
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
            {product.variants.length > 0
              ? `${product.variants.length} variants`
              : product.unitName}
          </Text>
        </View>
        <Icon
          className={cn(
            "size-base text-muted-foreground",
            selected && "text-primary",
          )}
          name={selected ? "CircleCheck" : "Share"}
        />
      </View>
    </Pressable>
  );
}

function ShareLinkMetricCard({ icon, label, value }: ShareLinkMetric) {
  return (
    <View className="flex-1 rounded-2xl border border-border bg-card p-4">
      <View className="flex-row items-center gap-2">
        <Icon className="size-sm text-muted-foreground" name={icon} />
        <Text className="text-xs font-semibold uppercase text-muted-foreground">
          {label}
        </Text>
      </View>
      <Text className="mt-2 text-xl font-bold text-foreground">{value}</Text>
    </View>
  );
}

function FollowUpOptionGroup<Value extends string>({
  disabled,
  label,
  onSelect,
  options,
  selectedValue,
}: {
  disabled?: boolean;
  label: string;
  onSelect: (value: Value) => void;
  options: FollowUpOption<Value>[];
  selectedValue: Value;
}) {
  return (
    <View className="gap-2">
      <Text className="text-xs font-semibold text-muted-foreground">
        {label}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => {
          const selected = selectedValue === option.value;

          return (
            <Pressable
              className={cn(
                "flex-row items-center gap-2 rounded-full border border-border bg-card px-3 py-2 active:bg-accent",
                selected && "border-primary bg-primary/10",
                disabled && "opacity-60",
              )}
              disabled={disabled}
              haptic
              key={option.value}
              onPress={() => onSelect(option.value)}
              transition
            >
              <Icon
                className={cn(
                  "size-xs text-muted-foreground",
                  selected && "text-primary",
                )}
                name={option.icon}
              />
              <Text
                className={cn(
                  "text-xs font-bold text-muted-foreground",
                  selected && "text-primary",
                )}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SharedLinkOrderRequestRow({
  followUp,
  isUpdating,
  onCancel,
  onFollowUpChange,
  onComplete,
  order,
}: {
  followUp: SharedLinkFollowUpSelection;
  isUpdating?: boolean;
  onCancel: () => void;
  onFollowUpChange: (patch: Partial<SharedLinkFollowUpSelection>) => void;
  onComplete: () => void;
  order: SharedLinkOrderRequest;
}) {
  const customerName =
    order.customer.name ??
    order.customer.email ??
    order.customer.phone ??
    "Customer";
  const lineName = order.line
    ? `${order.line.productName} - ${order.line.unitName ?? "Unit"}`
    : "Shared-link order";
  const quantity = order.line?.quantity ?? 0;
  const notificationStatus = order.notification?.status ?? null;
  const reservationStatus = order.reservation?.status ?? null;

  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text className="font-semibold text-foreground">{customerName}</Text>
          <Text className="text-xs leading-5 text-muted-foreground">
            {order.orderNumber} - {formatOrderTime(order.createdAt)}
          </Text>
        </View>
        <Text className="text-sm font-bold text-primary">
          {formatMinorMoney(order.totalMinor, order.currencyCode)}
        </Text>
      </View>
      <View className="rounded-xl bg-muted p-3">
        <Text className="text-sm font-semibold text-foreground">
          {lineName}
        </Text>
        <Text className="mt-1 text-xs text-muted-foreground">
          {quantity > 0 ? `${quantity} requested` : "Quantity pending review"}
        </Text>
      </View>
      <View className="flex-row flex-wrap gap-2">
        <StatusPill
          label={getReservationStatusLabel(reservationStatus)}
          status={reservationStatus}
        />
        <StatusPill
          label={getNotificationStatusLabel(notificationStatus)}
          status={notificationStatus}
        />
      </View>
      {notificationStatus === "failed" ? (
        <Text className="text-xs leading-4 text-destructive">
          The customer request is saved. Contact them directly if email is not
          confirmed.
        </Text>
      ) : null}
      <View className="gap-3 rounded-xl bg-muted p-3">
        <Text className="text-xs font-bold uppercase text-muted-foreground">
          Follow-up details
        </Text>
        <FollowUpOptionGroup
          disabled={isUpdating}
          label="Payment"
          onSelect={(paymentMethod) => onFollowUpChange({ paymentMethod })}
          options={paymentMethodOptions}
          selectedValue={followUp.paymentMethod}
        />
        <FollowUpOptionGroup
          disabled={isUpdating}
          label="Outcome"
          onSelect={(fulfillmentStatus) =>
            onFollowUpChange({ fulfillmentStatus })
          }
          options={fulfillmentStatusOptions}
          selectedValue={followUp.fulfillmentStatus}
        />
        <FollowUpOptionGroup
          disabled={isUpdating}
          label="Method"
          onSelect={(fulfillmentMethod) =>
            onFollowUpChange({ fulfillmentMethod })
          }
          options={fulfillmentMethodOptions}
          selectedValue={followUp.fulfillmentMethod}
        />
      </View>
      <View className="flex-row gap-3">
        <Pressable
          className={cn(
            "flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-primary/10 px-3 py-3 active:bg-primary/20",
            isUpdating && "opacity-60",
          )}
          disabled={isUpdating}
          haptic
          onPress={onComplete}
          transition
        >
          <Icon className="size-sm text-primary" name="CheckCircle2" />
          <Text className="text-sm font-bold text-primary">Complete</Text>
        </Pressable>
        <Pressable
          className={cn(
            "flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-destructive/10 px-3 py-3 active:bg-destructive/20",
            isUpdating && "opacity-60",
          )}
          disabled={isUpdating}
          haptic
          onPress={onCancel}
          transition
        >
          <Icon className="size-sm text-destructive" name="XCircle" />
          <Text className="text-sm font-bold text-destructive">Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ProductionShareLinkRow({
  isUpdating,
  link,
  onDeactivate,
  onShare,
}: {
  isUpdating?: boolean;
  link: ProductionShareLink;
  onDeactivate: () => void;
  onShare: () => void;
}) {
  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text className="font-semibold text-foreground">
            {link.product.name}
          </Text>
          <Text
            className="text-xs leading-5 text-muted-foreground"
            numberOfLines={2}
          >
            {link.url}
          </Text>
        </View>
        <View
          className={cn(
            "rounded-full px-3 py-1",
            link.active ? "bg-emerald-500/10" : "bg-muted",
          )}
        >
          <Text
            className={cn(
              "text-xs font-bold",
              link.active ? "text-emerald-700" : "text-muted-foreground",
            )}
          >
            {link.active ? "Active" : "Inactive"}
          </Text>
        </View>
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1 rounded-xl bg-muted p-3">
          <Text className="text-xs font-semibold text-muted-foreground">
            Views
          </Text>
          <Text className="mt-1 text-lg font-bold text-foreground">
            {link.viewCount}
          </Text>
        </View>
        <View className="flex-1 rounded-xl bg-muted p-3">
          <Text className="text-xs font-semibold text-muted-foreground">
            Orders
          </Text>
          <Text className="mt-1 text-lg font-bold text-foreground">
            {link.orderCount}
          </Text>
        </View>
      </View>

      <Text className="text-xs leading-4 text-muted-foreground">
        Last activity: {formatLinkTime(link.lastActivityAt)}
      </Text>

      <View className="flex-row gap-3">
        <Pressable
          className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-primary/10 px-3 py-3 active:bg-primary/20"
          haptic
          onPress={onShare}
          transition
        >
          <Icon className="size-sm text-primary" name="Share" />
          <Text className="text-sm font-bold text-primary">Share</Text>
        </Pressable>
        {link.active ? (
          <Pressable
            className={cn(
              "flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-destructive/10 px-3 py-3 active:bg-destructive/20",
              isUpdating && "opacity-60",
            )}
            disabled={isUpdating}
            haptic
            onPress={onDeactivate}
            transition
          >
            <Icon className="size-sm text-destructive" name="Ban" />
            <Text className="text-sm font-bold text-destructive">
              Deactivate
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function ShareLinkRow({
  link,
  onDeactivate,
  onShare,
}: {
  link: RetailOpsShareLink;
  onDeactivate: () => void;
  onShare: () => void;
}) {
  const isActive = link.status === "active";

  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text className="font-semibold text-foreground">
            {link.productName}
          </Text>
          <Text
            className="text-xs leading-5 text-muted-foreground"
            numberOfLines={2}
          >
            {link.url}
          </Text>
        </View>
        <View
          className={cn(
            "rounded-full px-3 py-1",
            isActive ? "bg-emerald-500/10" : "bg-muted",
          )}
        >
          <Text
            className={cn(
              "text-xs font-bold",
              isActive ? "text-emerald-700" : "text-muted-foreground",
            )}
          >
            {isActive ? "Active" : "Inactive"}
          </Text>
        </View>
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1 rounded-xl bg-muted p-3">
          <View className="flex-row items-center gap-2">
            <Icon className="size-sm text-muted-foreground" name="Eye" />
            <Text className="text-xs font-semibold text-muted-foreground">
              Views
            </Text>
          </View>
          <Text className="mt-1 text-lg font-bold text-foreground">
            {link.views}
          </Text>
        </View>
        <View className="flex-1 rounded-xl bg-muted p-3">
          <View className="flex-row items-center gap-2">
            <Icon
              className="size-sm text-muted-foreground"
              name="ReceiptText"
            />
            <Text className="text-xs font-semibold text-muted-foreground">
              Orders
            </Text>
          </View>
          <Text className="mt-1 text-lg font-bold text-foreground">
            {link.orders}
          </Text>
        </View>
      </View>

      <View className="flex-row gap-3">
        <Pressable
          className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-primary/10 px-3 py-3 active:bg-primary/20"
          haptic
          onPress={onShare}
          transition
        >
          <Icon className="size-sm text-primary" name="Share" />
          <Text className="text-sm font-bold text-primary">Share link</Text>
        </Pressable>
        {isActive ? (
          <Pressable
            className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-destructive/10 px-3 py-3 active:bg-destructive/20"
            haptic
            onPress={onDeactivate}
            transition
          >
            <Icon className="size-sm text-destructive" name="Ban" />
            <Text className="text-sm font-bold text-destructive">
              Deactivate
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export const ProductShareSheet = forwardRef<
  BottomSheetModal,
  ProductShareSheetProps
>(({ onComplete }, ref) => {
  const trpc = useTRPC();
  const activeBusinessId = useBusinessStore((state) => state.activeBusinessId);
  const createShareLink = useRetailOpsStore((state) => state.createShareLink);
  const deactivateShareLink = useRetailOpsStore(
    (state) => state.deactivateShareLink,
  );
  const isOfflineMode = useRetailOpsStore((state) => state.isOfflineMode);
  const products = useRetailOpsStore((state) =>
    state.products.filter(
      (product) =>
        !activeBusinessId ||
        (product.businessId ?? activeBusinessId) === activeBusinessId,
    ),
  );
  const shareLinks = useRetailOpsStore((state) =>
    state.shareLinks.filter(
      (link) =>
        !activeBusinessId ||
        (link.businessId ?? activeBusinessId) === activeBusinessId,
    ),
  );
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    products[0]?.id ?? null,
  );
  const [orderFollowUps, setOrderFollowUps] = useState<
    Record<string, SharedLinkFollowUpSelection>
  >({});

  useEffect(() => {
    if (products.length === 0) {
      setSelectedProductId(null);
      return;
    }

    const selectedProductExists = products.some(
      (product) => product.id === selectedProductId,
    );

    if (!selectedProductExists) {
      setSelectedProductId(products[0]?.id ?? null);
    }
  }, [products, selectedProductId]);

  const selectedProduct = products.find(
    (product) => product.id === selectedProductId,
  );
  const activeLinkCount = shareLinks.filter(
    (link) => link.status === "active",
  ).length;
  const totalViews = shareLinks.reduce((total, link) => total + link.views, 0);
  const totalOrders = shareLinks.reduce(
    (total, link) => total + link.orders,
    0,
  );
  const productionLinksQuery = useQuery(
    trpc.retailOps.productShareLinks.queryOptions(
      {},
      {
        enabled: !isOfflineMode,
        retry: false,
      },
    ),
  );
  const orderRequestsQuery = useQuery(
    trpc.retailOps.sharedLinkOrderRequests.queryOptions(
      {
        limit: 5,
        status: "pending",
      },
      {
        enabled: !isOfflineMode,
        retry: false,
      },
    ),
  );
  const createProductionShareLinkMutation = useMutation(
    trpc.retailOps.createProductShareLink.mutationOptions({
      onSuccess: (link) => {
        shareGeneratedLink({
          title: link.product.name,
          url: link.url,
        });
        void productionLinksQuery.refetch();
      },
    }),
  );
  const deactivateProductionShareLinkMutation = useMutation(
    trpc.retailOps.deactivateProductShareLink.mutationOptions({
      onSuccess: () => {
        void productionLinksQuery.refetch();
      },
    }),
  );
  const updateOrderRequestStatusMutation = useMutation(
    trpc.retailOps.updateSharedLinkOrderRequestStatus.mutationOptions({
      onSuccess: () => {
        setOrderFollowUps({});
        void orderRequestsQuery.refetch();
      },
    }),
  );
  const productionLinks = productionLinksQuery.data ?? [];
  const productionActiveLinkCount = productionLinks.filter(
    (link) => link.active,
  ).length;
  const productionTotalViews = productionLinks.reduce(
    (total, link) => total + link.viewCount,
    0,
  );
  const productionTotalOrders = productionLinks.reduce(
    (total, link) => total + link.orderCount,
    0,
  );
  const orderRequests = orderRequestsQuery.data ?? [];

  const generateLink = () => {
    if (!selectedProduct) return;

    if (!isOfflineMode && selectedProduct.remoteId) {
      createProductionShareLinkMutation.mutate({
        productId: selectedProduct.remoteId,
      });
      return;
    }

    const link = createShareLink({
      businessId: activeBusinessId ?? undefined,
      productId: selectedProduct.id,
      productName: selectedProduct.name,
    });
    shareGeneratedLink({
      title: link.productName,
      url: link.url,
    });
  };
  const updateOrderRequestStatus = (
    orderId: string,
    status: "cancelled" | "completed",
  ) => {
    const followUp =
      orderFollowUps[orderId] ?? defaultSharedLinkFollowUpSelection;

    updateOrderRequestStatusMutation.mutate({
      ...(status === "completed"
        ? {
            fulfillmentMethod: followUp.fulfillmentMethod,
            fulfillmentStatus: followUp.fulfillmentStatus,
            paymentMethod: followUp.paymentMethod,
          }
        : {}),
      orderId,
      status,
    });
  };
  const updateOrderFollowUp = (
    orderId: string,
    patch: Partial<SharedLinkFollowUpSelection>,
  ) => {
    setOrderFollowUps((current) => ({
      ...current,
      [orderId]: {
        ...defaultSharedLinkFollowUpSelection,
        ...current[orderId],
        ...patch,
      },
    }));
  };
  const deactivateProductionShareLink = (link: ProductionShareLink) => {
    deactivateProductionShareLinkMutation.mutate({
      productId: link.product.id,
      shareLinkId: link.id,
    });
  };

  return (
    <Modal
      enableDynamicSizing
      ref={ref}
      snapPoints={["88%"]}
      title="Share product"
    >
      <BottomSheetKeyboardAwareScrollView
        bottomOffset={96}
        contentContainerStyle={{ paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-5 px-5 pb-6">
          <View className="gap-2">
            <Text className="text-xl font-bold text-foreground">
              Product links
            </Text>
            <Text className="text-sm leading-5 text-muted-foreground">
              Create customer-facing links and review link performance.
            </Text>
          </View>

          <View className="flex-row gap-3">
            <ShareLinkMetricCard
              icon="Globe"
              label="Active"
              value={`${activeLinkCount}/${shareLinks.length}`}
            />
            <ShareLinkMetricCard
              icon="Eye"
              label="Views"
              value={String(totalViews)}
            />
          </View>

          <View className="flex-row gap-3">
            <ShareLinkMetricCard
              icon="ReceiptText"
              label="Orders"
              value={String(totalOrders)}
            />
            <ShareLinkMetricCard
              icon="Globe"
              label="Products"
              value={String(products.length)}
            />
          </View>

          {products.length === 0 ? (
            <View className="gap-2 rounded-2xl border border-dashed border-border p-4">
              <Text className="font-semibold text-foreground">
                Add inventory first
              </Text>
              <Text className="text-sm leading-5 text-muted-foreground">
                Create at least one item before generating a product link.
              </Text>
            </View>
          ) : (
            <View className="gap-3">
              {products.map((product) => (
                <ProductOption
                  key={product.id}
                  onPress={() => setSelectedProductId(product.id)}
                  product={product}
                  selected={selectedProductId === product.id}
                />
              ))}
            </View>
          )}

          <ActionButton
            disabled={
              !selectedProduct || createProductionShareLinkMutation.isPending
            }
            onPress={generateLink}
          >
            {createProductionShareLinkMutation.isPending
              ? "Generating production link"
              : !isOfflineMode && selectedProduct?.remoteId
                ? "Generate production link"
                : "Generate and share link"}
          </ActionButton>
          {!isOfflineMode && selectedProduct && !selectedProduct.remoteId ? (
            <Text className="text-xs leading-4 text-muted-foreground">
              This product will use the local link flow until product setup has
              synced to production.
            </Text>
          ) : null}
          {createProductionShareLinkMutation.isError ? (
            <Text className="text-sm leading-5 text-destructive">
              {createProductionShareLinkMutation.error.message}
            </Text>
          ) : null}

          <View className="gap-3">
            <Text className="text-base font-bold text-foreground">
              All generated links
            </Text>
            {shareLinks.length > 0 ? (
              shareLinks.map((link) => (
                <ShareLinkRow
                  key={link.id}
                  link={link}
                  onDeactivate={() => deactivateShareLink(link.id)}
                  onShare={() =>
                    shareGeneratedLink({
                      title: link.productName,
                      url: link.url,
                    })
                  }
                />
              ))
            ) : (
              <View className="rounded-2xl border border-dashed border-border p-4">
                <Text className="text-sm leading-5 text-muted-foreground">
                  Generated product links will appear here with views, orders,
                  and deactivation controls.
                </Text>
              </View>
            )}
          </View>

          <View className="gap-3">
            <View className="flex-row items-center justify-between gap-3">
              <Text className="text-base font-bold text-foreground">
                Production link performance
              </Text>
              {!isOfflineMode ? (
                <Pressable
                  className="rounded-full bg-primary/10 px-3 py-2 active:bg-primary/20"
                  haptic
                  onPress={() => {
                    void productionLinksQuery.refetch();
                  }}
                  transition
                >
                  <Text className="text-xs font-bold text-primary">
                    Refresh
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {isOfflineMode ? (
              <View className="rounded-2xl border border-dashed border-border p-4">
                <Text className="text-sm leading-5 text-muted-foreground">
                  Production link analytics will refresh when this device is
                  back online.
                </Text>
              </View>
            ) : productionLinks.length > 0 ? (
              <View className="gap-3">
                <View className="flex-row gap-3">
                  <ShareLinkMetricCard
                    icon="Globe"
                    label="Active"
                    value={`${productionActiveLinkCount}/${productionLinks.length}`}
                  />
                  <ShareLinkMetricCard
                    icon="Eye"
                    label="Views"
                    value={String(productionTotalViews)}
                  />
                </View>
                <View className="flex-row gap-3">
                  <ShareLinkMetricCard
                    icon="ReceiptText"
                    label="Orders"
                    value={String(productionTotalOrders)}
                  />
                  <ShareLinkMetricCard
                    icon="Globe"
                    label="Synced"
                    value={String(productionLinks.length)}
                  />
                </View>
                {productionLinks.map((link) => (
                  <ProductionShareLinkRow
                    isUpdating={deactivateProductionShareLinkMutation.isPending}
                    key={link.id}
                    link={link}
                    onDeactivate={() => deactivateProductionShareLink(link)}
                    onShare={() =>
                      shareGeneratedLink({
                        title: link.product.name,
                        url: link.url,
                      })
                    }
                  />
                ))}
              </View>
            ) : productionLinksQuery.isFetching ? (
              <View className="rounded-2xl border border-dashed border-border p-4">
                <Text className="text-sm leading-5 text-muted-foreground">
                  Checking production for generated product links.
                </Text>
              </View>
            ) : productionLinksQuery.isError ? (
              <View className="rounded-2xl border border-dashed border-border p-4">
                <Text className="text-sm leading-5 text-muted-foreground">
                  Production link analytics are unavailable for this session.
                </Text>
              </View>
            ) : (
              <View className="rounded-2xl border border-dashed border-border p-4">
                <Text className="text-sm leading-5 text-muted-foreground">
                  Synced generated links will appear here with production views
                  and order counts.
                </Text>
              </View>
            )}
            {deactivateProductionShareLinkMutation.isError ? (
              <Text className="text-sm leading-5 text-destructive">
                {deactivateProductionShareLinkMutation.error.message}
              </Text>
            ) : null}
          </View>

          <View className="gap-3">
            <View className="flex-row items-center justify-between gap-3">
              <Text className="text-base font-bold text-foreground">
                Pending link orders
              </Text>
              {!isOfflineMode ? (
                <Pressable
                  className="rounded-full bg-primary/10 px-3 py-2 active:bg-primary/20"
                  haptic
                  onPress={() => {
                    void orderRequestsQuery.refetch();
                  }}
                  transition
                >
                  <Text className="text-xs font-bold text-primary">
                    Refresh
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {isOfflineMode ? (
              <View className="rounded-2xl border border-dashed border-border p-4">
                <Text className="text-sm leading-5 text-muted-foreground">
                  Link orders will refresh when this device is back online.
                </Text>
              </View>
            ) : orderRequests.length > 0 ? (
              orderRequests.map((order) => (
                <SharedLinkOrderRequestRow
                  followUp={
                    orderFollowUps[order.id] ??
                    defaultSharedLinkFollowUpSelection
                  }
                  isUpdating={updateOrderRequestStatusMutation.isPending}
                  key={order.id}
                  onCancel={() =>
                    updateOrderRequestStatus(order.id, "cancelled")
                  }
                  onFollowUpChange={(patch) =>
                    updateOrderFollowUp(order.id, patch)
                  }
                  onComplete={() =>
                    updateOrderRequestStatus(order.id, "completed")
                  }
                  order={order}
                />
              ))
            ) : orderRequestsQuery.isFetching ? (
              <View className="rounded-2xl border border-dashed border-border p-4">
                <Text className="text-sm leading-5 text-muted-foreground">
                  Checking production for new link orders.
                </Text>
              </View>
            ) : orderRequestsQuery.isError ? (
              <View className="rounded-2xl border border-dashed border-border p-4">
                <Text className="text-sm leading-5 text-muted-foreground">
                  Production link orders are unavailable for this session.
                </Text>
              </View>
            ) : (
              <View className="rounded-2xl border border-dashed border-border p-4">
                <Text className="text-sm leading-5 text-muted-foreground">
                  No pending customer requests from shared links yet.
                </Text>
              </View>
            )}
            {updateOrderRequestStatusMutation.isError ? (
              <Text className="text-sm leading-5 text-destructive">
                {updateOrderRequestStatusMutation.error.message}
              </Text>
            ) : null}
          </View>

          <ActionButton onPress={onComplete} variant="outline">
            Done
          </ActionButton>
        </View>
      </BottomSheetKeyboardAwareScrollView>
    </Modal>
  );
});

ProductShareSheet.displayName = "ProductShareSheet";
