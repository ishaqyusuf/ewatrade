import { ActionButton } from "@/components/mobile/action-button";
import {
  CommerceInfoRow,
  CommercePageHeader,
  CommerceSection,
  CommerceTotalRow,
  commerceLineOption,
  commerceLineTitle,
  commerceOrderTone,
  commercePaymentTone,
  commerceStatusLabel,
  formatCommerceDate,
  formatCommerceDateTime,
  formatCommerceQuantity,
} from "@/components/mobile/commerce";
import { EmptyState } from "@/components/mobile/empty-state";
import { FormField } from "@/components/mobile/form-field";
import { MoneyField } from "@/components/mobile/money-field";
import { QueryRefreshControl } from "@/components/mobile/query-refresh-control";
import { MobileScreen } from "@/components/mobile/screen";
import { StatusBadge } from "@/components/mobile/status-badge";
import { StatusBanner } from "@/components/mobile/status-banner";
import { Icon } from "@/components/ui/icon";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { View } from "@/components/ui/view";
import { useOperationalModeStore } from "@/store/operationalModeStore";
import { useTRPC } from "@/trpc/client";
import type { RouterInputs } from "@ewatrade/api/trpc/routers/_app";
import {
  formatMinorMoney,
  majorToMinor,
  minorToMajorInput,
} from "@ewatrade/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";

type PaymentMethod = RouterInputs["orders"]["recordPayment"]["method"];

const PAYMENT_METHODS: Array<[PaymentMethod, string]> = [
  ["cash", "Cash"],
  ["bank_transfer", "Transfer"],
  ["pos", "POS"],
  ["card", "Card"],
  ["other", "Other"],
];

export function CommercialOrderScreen({ orderId }: { orderId: string }) {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const isOffline = useOperationalModeStore((state) => state.isOfflineMode);
  const [amountPaid, setAmountPaid] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const orderQuery = useQuery(
    trpc.orders.get.queryOptions(
      { orderId },
      { enabled: !isOffline, retry: false },
    ),
  );
  const cachedOrders = useQuery(
    trpc.orders.list.queryOptions(
      { limit: 100 },
      { enabled: false, retry: false },
    ),
  );
  const order =
    orderQuery.data ??
    cachedOrders.data?.find((candidate) => candidate.id === orderId) ??
    null;

  async function refreshOrderQueries() {
    await Promise.all([
      queryClient.invalidateQueries(trpc.orders.get.queryFilter()),
      queryClient.invalidateQueries(trpc.orders.list.queryFilter()),
      queryClient.invalidateQueries(trpc.orders.listPage.queryFilter()),
      queryClient.invalidateQueries(trpc.orders.customerCount.queryFilter()),
    ]);
  }

  const paymentMutation = useMutation(
    trpc.orders.recordPayment.mutationOptions({
      onError: (failure) => {
        setNotice(null);
        setError(failure.message);
      },
      onSuccess: async () => {
        setAmountPaid("");
        setError(null);
        setNotice("Payment recorded.");
        setPaymentReference("");
        setShowPaymentForm(false);
        await refreshOrderQueries();
      },
    }),
  );
  const fulfilmentMutation = useMutation(
    trpc.orders.fulfillProductLine.mutationOptions({
      onError: (failure) => {
        setNotice(null);
        setError(failure.message);
      },
      onSuccess: async () => {
        setError(null);
        setNotice("Product fulfilment recorded.");
        await refreshOrderQueries();
      },
    }),
  );

  const activity = useMemo(() => {
    if (!order) return [];
    const rows: Array<{
      detail: string;
      key: string;
      label: string;
      time: string;
    }> = [
      {
        detail: "Commercial Order created.",
        key: `created:${order.id}`,
        label: "Order received",
        time: formatCommerceDateTime(order.createdAt),
      },
    ];
    for (const payment of order.payments) {
      const amount = formatMinorMoney(payment.amountMinor, order.currencyCode);
      rows.push({
        detail: `${payment.type === "REFUND" ? "Refund" : "Payment"} of ${amount} by ${commerceStatusLabel(payment.method)}${payment.reference ? ` · ${payment.reference}` : ""}.`,
        key: `payment:${payment.id}`,
        label:
          payment.type === "REFUND" ? "Refund recorded" : "Payment recorded",
        time: formatCommerceDateTime(payment.recordedAt),
      });
    }
    for (const line of order.lines) {
      for (const fulfilment of line.productFulfillments) {
        rows.push({
          detail: `${formatCommerceQuantity(fulfilment.quantity)} × ${commerceLineTitle(line)} fulfilled from reserved stock.`,
          key: `fulfilment:${fulfilment.id}`,
          label: "Product fulfilled",
          time: "Recorded",
        });
      }
      for (const productReturn of line.productReturns) {
        rows.push({
          detail: `${formatCommerceQuantity(productReturn.quantity)} × ${commerceLineTitle(line)} returned · ${commerceStatusLabel(productReturn.disposition)}.`,
          key: `return:${productReturn.id}`,
          label: "Product returned",
          time: "Recorded",
        });
      }
    }
    return rows;
  }, [order]);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace("/dashboard");
  }

  function openCustomer() {
    if (!order) return;
    router.push({
      params: { customerOrderId: order.id },
      pathname: "/customer-book-modal",
    } as never);
  }

  function openPaymentForm() {
    if (!order || order.balanceDueMinor <= 0) return;
    setAmountPaid(minorToMajorInput(order.balanceDueMinor));
    setError(null);
    setShowPaymentForm(true);
  }

  function recordPayment() {
    if (!order || isOffline) return;
    const amountMinor = majorToMinor(amountPaid);
    if (amountMinor === null || amountMinor <= 0) {
      setError("Enter a valid payment amount.");
      return;
    }
    if (amountMinor > order.balanceDueMinor) {
      setError("Payment cannot exceed the balance due.");
      return;
    }
    paymentMutation.mutate({
      amountMinor,
      clientPaymentId: `payment-${Crypto.randomUUID()}`,
      method: paymentMethod,
      orderId: order.id,
      reference: paymentReference.trim() || undefined,
    });
  }

  function fulfilProductLine(orderLineId: string) {
    if (isOffline) return;
    fulfilmentMutation.mutate({
      clientOperationId: `fulfilment-${Crypto.randomUUID()}`,
      orderLineId,
      schemaVersion: 1,
    });
  }

  if (!order) {
    return (
      <MobileScreen
        contentClassName="gap-6 pb-12"
        refreshControl={<QueryRefreshControl />}
        scroll
      >
        <CommercePageHeader onBack={goBack} title="Order overview" />
        {orderQuery.isPending && !isOffline ? (
          <EmptyState
            icon="ReceiptText"
            message="Loading the latest Commercial Order state."
            title="Loading order"
          />
        ) : (
          <EmptyState
            icon="ReceiptText"
            message={
              isOffline
                ? "This Order is not available in the current device cache. Reconnect to load it."
                : (orderQuery.error?.message ?? "Commercial Order not found.")
            }
            title={isOffline ? "Order unavailable offline" : "Order not found"}
          />
        )}
        <ActionButton onPress={goBack} variant="outline">
          Back to orders
        </ActionButton>
      </MobileScreen>
    );
  }

  const hasCustomer = Boolean(
    order.customerName || order.customerPhone || order.customerEmail,
  );

  return (
    <MobileScreen
      contentClassName="gap-6 pb-12"
      keyboardBottomOffset={140}
      refreshControl={
        showPaymentForm ? undefined : <QueryRefreshControl />
      }
      scroll
    >
      <View className="gap-6" testID="commercial-order-overview-screen">
        <CommercePageHeader
          onBack={goBack}
          subtitle={formatCommerceDate(order.createdAt)}
          title={order.orderNumber}
        />

        <View className="flex-row flex-wrap gap-2">
          <StatusBadge
            label={commerceStatusLabel(order.paymentStatus)}
            tone={commercePaymentTone(order.paymentStatus)}
          />
          <StatusBadge
            label={commerceStatusLabel(order.status)}
            tone={commerceOrderTone(order.status)}
          />
        </View>

        {isOffline ? (
          <StatusBanner
            icon="Wind"
            message="Showing cached Order details. Payment and fulfilment actions require a connection."
            title="Offline mode"
            tone="warning"
          />
        ) : null}
        {error ? (
          <StatusBanner icon="AlertCircle" message={error} tone="destructive" />
        ) : null}
        {notice ? (
          <StatusBanner icon="CircleCheck" message={notice} tone="success" />
        ) : null}

        {hasCustomer ? (
          <Pressable
            accessibilityLabel="Open customer overview"
            accessibilityRole="button"
            className="flex-row items-center gap-3 rounded-2xl bg-card p-4 active:bg-accent"
            haptic
            onPress={openCustomer}
          >
            <View className="size-11 items-center justify-center rounded-full bg-primary">
              <Icon className="size-sm text-primary-foreground" name="User" />
            </View>
            <View className="min-w-0 flex-1 gap-1">
              <Text className="font-extrabold text-foreground">
                {order.customerName ||
                  order.customerPhone ||
                  order.customerEmail}
              </Text>
              <Text className="text-sm text-muted-foreground" numberOfLines={1}>
                {[order.customerPhone, order.customerEmail]
                  .filter(Boolean)
                  .join(" · ") || "No contact details"}
              </Text>
            </View>
            <Icon
              className="size-sm text-muted-foreground"
              name="ChevronRight"
            />
          </Pressable>
        ) : null}

        <CommerceSection title="Items">
          {order.lines.map((line) => {
            const canFulfil =
              line.kind === "product" &&
              line.productFulfillments.length === 0 &&
              line.reservation?.status === "ACTIVE";
            const isFulfillingThisLine =
              fulfilmentMutation.isPending &&
              fulfilmentMutation.variables?.orderLineId === line.id;

            return (
              <View
                className="gap-3 border-b border-border py-4 last:border-b-0"
                key={line.id}
              >
                <View className="flex-row items-start justify-between gap-4">
                  <View className="min-w-0 flex-1 gap-1">
                    <Text className="font-bold text-foreground">
                      {commerceLineTitle(line)}
                    </Text>
                    <Text className="text-sm text-muted-foreground">
                      {commerceLineOption(line)} ·{" "}
                      {formatCommerceQuantity(line.quantity)} ×{" "}
                      {formatMinorMoney(
                        line.unitPriceMinor,
                        order.currencyCode,
                      )}
                    </Text>
                  </View>
                  <Text className="font-extrabold text-foreground">
                    {formatMinorMoney(line.totalMinor, order.currencyCode)}
                  </Text>
                </View>
                <View className="flex-row flex-wrap gap-2">
                  <StatusBadge
                    label={line.kind === "service" ? "Service" : "Product"}
                    tone="muted"
                  />
                  {line.kind === "service" ? (
                    <StatusBadge
                      label="Managed in Service jobs"
                      tone="primary"
                    />
                  ) : line.productFulfillments.length > 0 ? (
                    <StatusBadge label="Fulfilled" tone="success" />
                  ) : line.reservation ? (
                    <StatusBadge
                      label={commerceStatusLabel(line.reservation.status)}
                      tone={
                        line.reservation.status === "ACTIVE"
                          ? "primary"
                          : "muted"
                      }
                    />
                  ) : null}
                </View>
                {canFulfil ? (
                  <ActionButton
                    disabled={isOffline}
                    isLoading={isFulfillingThisLine}
                    onPress={() => fulfilProductLine(line.id)}
                    variant="outline"
                  >
                    Fulfil product line
                  </ActionButton>
                ) : null}
              </View>
            );
          })}
        </CommerceSection>

        <CommerceSection title="Order total">
          <CommerceTotalRow
            label="Subtotal"
            value={formatMinorMoney(order.subtotalMinor, order.currencyCode)}
          />
          {order.serviceChargeMinor > 0 ? (
            <CommerceTotalRow
              label="Service charge"
              value={formatMinorMoney(
                order.serviceChargeMinor,
                order.currencyCode,
              )}
            />
          ) : null}
          {order.discountMinor > 0 ? (
            <CommerceTotalRow
              label="Discount"
              value={`−${formatMinorMoney(order.discountMinor, order.currencyCode)}`}
            />
          ) : null}
          {order.taxMinor > 0 ? (
            <CommerceTotalRow
              label="Tax"
              value={formatMinorMoney(order.taxMinor, order.currencyCode)}
            />
          ) : null}
          <CommerceTotalRow
            emphasized
            label="Total"
            value={formatMinorMoney(order.totalMinor, order.currencyCode)}
          />
        </CommerceSection>

        <CommerceSection title="Payment and fulfilment">
          <CommerceInfoRow
            detail={`${formatMinorMoney(order.amountPaidMinor, order.currencyCode)} paid · ${formatMinorMoney(order.balanceDueMinor, order.currencyCode)} due`}
            icon="CreditCard"
            title={commerceStatusLabel(order.paymentStatus)}
          />
          <CommerceInfoRow
            detail="Product lines use reserved-stock fulfilment. Tracked Services continue in Service jobs."
            icon="Warehouse"
            title={commerceStatusLabel(order.status)}
          />
        </CommerceSection>

        {order.balanceDueMinor > 0 && !showPaymentForm ? (
          <ActionButton
            disabled={isOffline}
            icon="CreditCard"
            onPress={openPaymentForm}
          >
            Record payment
          </ActionButton>
        ) : null}

        {showPaymentForm ? (
          <View className="gap-4 rounded-2xl bg-card p-4">
            <Text className="text-lg font-extrabold text-foreground">
              Record payment
            </Text>
            <MoneyField
              currencyCode={order.currencyCode}
              label="Amount received"
              onChangeValue={setAmountPaid}
              value={amountPaid}
            />
            <View className="flex-row flex-wrap gap-2">
              {PAYMENT_METHODS.map(([value, label]) => (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected: paymentMethod === value }}
                  className={
                    paymentMethod === value
                      ? "min-h-11 items-center justify-center rounded-xl bg-foreground px-4"
                      : "min-h-11 items-center justify-center rounded-xl border border-border bg-card px-4"
                  }
                  haptic
                  key={value}
                  onPress={() => setPaymentMethod(value)}
                >
                  <Text
                    className={
                      paymentMethod === value
                        ? "text-sm font-bold text-background"
                        : "text-sm font-bold text-foreground"
                    }
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <FormField
              label="Payment reference"
              onChangeText={setPaymentReference}
              placeholder="Optional"
              value={paymentReference}
            />
            <View className="flex-row gap-3">
              <ActionButton
                className="flex-1"
                onPress={() => setShowPaymentForm(false)}
                variant="outline"
              >
                Cancel
              </ActionButton>
              <ActionButton
                className="flex-1"
                isLoading={paymentMutation.isPending}
                onPress={recordPayment}
              >
                Save payment
              </ActionButton>
            </View>
          </View>
        ) : null}

        {order.notes ? (
          <CommerceSection title="Order note">
            <CommerceInfoRow
              detail={order.notes}
              icon="StickyNote"
              title="Note"
            />
          </CommerceSection>
        ) : null}

        <View className="gap-2">
          <Text className="text-lg font-extrabold text-foreground">
            Activity
          </Text>
          <View className="rounded-2xl bg-card px-4">
            {activity.map((event) => (
              <View
                className="flex-row gap-3 border-b border-border py-4 last:border-b-0"
                key={event.key}
              >
                <View className="mt-1.5 size-2 rounded-full bg-primary" />
                <View className="min-w-0 flex-1 gap-1">
                  <Text className="font-bold text-foreground">
                    {event.label}
                  </Text>
                  <Text className="text-sm leading-5 text-muted-foreground">
                    {event.detail}
                  </Text>
                </View>
                <Text className="max-w-24 text-right text-xs text-muted-foreground">
                  {event.time}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </MobileScreen>
  );
}
