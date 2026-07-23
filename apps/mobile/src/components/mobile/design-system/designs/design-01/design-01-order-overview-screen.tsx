import { ActionButton } from "@/components/mobile/action-button";
import { EmptyState } from "@/components/mobile/empty-state";
import { Icon } from "@/components/ui/icon";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { View } from "@/components/ui/view";
import { formatMinorMoney } from "@ewatrade/utils";
import { useState } from "react";
import { ReferenceScreenShell } from "../../references/reference-screen-shell";
import {
  type Design01FulfilmentStatus,
  getDesign01Customer,
  getDesign01Order,
  getDesign01OrderSubtotal,
  getDesign01OrderTotal,
} from "./design-01-commerce.data";
import {
  Design01InfoRow,
  Design01PageHeader,
  Design01Section,
  Design01StatusPill,
  formatOrderDate,
} from "./design-01-commerce-primitives";
import {
  DESIGN_01_COMMERCE_REFERENCE,
  DESIGN_01_ROUTES,
  design01CustomerHref,
} from "./design-01.data";

const nextFulfilmentStatus: Partial<
  Record<Design01FulfilmentStatus, Design01FulfilmentStatus>
> = {
  Preparing: "Ready for pickup",
  "Ready for pickup": "Fulfilled",
  Unfulfilled: "Preparing",
};

export function Design01OrderOverviewScreen({ orderId }: { orderId: string }) {
  const order = getDesign01Order(orderId);

  if (!order) {
    return (
      <ReferenceScreenShell
        hideFabsOnScroll
        secondaryAccessibilityLabel={`Open ${DESIGN_01_COMMERCE_REFERENCE.title}`}
        secondaryHref={DESIGN_01_COMMERCE_REFERENCE.route}
        secondaryIcon="Camera"
      >
        <Design01PageHeader
          backHref={DESIGN_01_ROUTES.orders}
          title="Order overview"
        />
        <EmptyState
          icon="ReceiptText"
          message="This sample order is not part of the Design 01 preview data."
          title="Order not found"
        />
        <ActionButton href={DESIGN_01_ROUTES.orders} variant="outline">
          Back to orders
        </ActionButton>
      </ReferenceScreenShell>
    );
  }

  return <Design01OrderOverviewContent key={order.id} order={order} />;
}

function Design01OrderOverviewContent({
  order,
}: {
  order: NonNullable<ReturnType<typeof getDesign01Order>>;
}) {
  const customer = getDesign01Customer(order.customerId);
  const [fulfilmentStatus, setFulfilmentStatus] =
    useState<Design01FulfilmentStatus>(order.fulfilmentStatus);
  const [paymentStatus, setPaymentStatus] = useState(order.paymentStatus);
  const [activity, setActivity] = useState(order.timeline);
  const subtotal = getDesign01OrderSubtotal(order);
  const total = getDesign01OrderTotal(order);
  const canRecordPayment = paymentStatus === "Payment due";
  const upcomingFulfilmentStatus = nextFulfilmentStatus[fulfilmentStatus];

  function recordPayment() {
    if (!canRecordPayment) return;
    setPaymentStatus("Paid");
    setActivity((current) => [
      ...current,
      {
        detail: "Payment marked as received in this local design preview.",
        label: "Payment recorded",
        time: "Just now",
      },
    ]);
  }

  function advanceFulfilment() {
    if (!upcomingFulfilmentStatus) return;
    setFulfilmentStatus(upcomingFulfilmentStatus);
    setActivity((current) => [
      ...current,
      {
        detail: `Fulfilment advanced to ${upcomingFulfilmentStatus.toLowerCase()} in this local design preview.`,
        label: upcomingFulfilmentStatus,
        time: "Just now",
      },
    ]);
  }

  return (
    <ReferenceScreenShell
      hideFabsOnScroll
      secondaryAccessibilityLabel={`Open ${DESIGN_01_COMMERCE_REFERENCE.title}`}
      secondaryHref={DESIGN_01_COMMERCE_REFERENCE.route}
      secondaryIcon="Camera"
    >
      <View className="gap-6" testID="design-01-order-overview-screen">
        <Design01PageHeader
          backHref={DESIGN_01_ROUTES.orders}
          subtitle={formatOrderDate(order.createdAt)}
          title={order.number}
        />

        <View className="flex-row flex-wrap gap-2">
          <Design01StatusPill
            label={paymentStatus}
            tone={paymentStatus === "Paid" ? "success" : "warning"}
          />
          <Design01StatusPill
            label={fulfilmentStatus}
            tone={
              fulfilmentStatus === "Fulfilled"
                ? "success"
                : fulfilmentStatus === "Cancelled"
                  ? "destructive"
                  : fulfilmentStatus === "Unfulfilled"
                    ? "muted"
                    : "primary"
            }
          />
        </View>

        {customer ? (
          <Pressable
            accessibilityLabel={`Open ${customer.name}`}
            accessibilityRole="button"
            className="flex-row items-center gap-3 rounded-2xl bg-card p-4 active:bg-accent"
            haptic
            href={design01CustomerHref(customer.id)}
          >
            <View className="size-11 items-center justify-center rounded-full bg-primary">
              <Text className="text-sm font-extrabold text-primary-foreground">
                {customer.initials}
              </Text>
            </View>
            <View className="min-w-0 flex-1 gap-1">
              <Text className="font-extrabold text-foreground">
                {customer.name}
              </Text>
              <Text className="text-sm text-muted-foreground">
                {customer.phone} · {customer.location}
              </Text>
            </View>
            <Icon
              className="size-sm text-muted-foreground"
              name="ChevronRight"
            />
          </Pressable>
        ) : null}

        <Design01Section title="Items">
          {order.lines.map((line) => (
            <View
              className="flex-row items-start justify-between gap-4 border-b border-border py-4 last:border-b-0"
              key={line.id}
            >
              <View className="min-w-0 flex-1 gap-1">
                <Text className="font-bold text-foreground">{line.name}</Text>
                <Text className="text-sm text-muted-foreground">
                  {line.option} · {line.quantity} ×{" "}
                  {formatMinorMoney(line.unitPriceMinor, order.currencyCode)}
                </Text>
              </View>
              <Text className="font-extrabold text-foreground">
                {formatMinorMoney(
                  line.quantity * line.unitPriceMinor,
                  order.currencyCode,
                )}
              </Text>
            </View>
          ))}
        </Design01Section>

        <Design01Section title="Order total">
          <Design01TotalRow
            label="Subtotal"
            value={formatMinorMoney(subtotal, order.currencyCode)}
          />
          <Design01TotalRow
            label="Discount"
            value={`−${formatMinorMoney(order.discountMinor, order.currencyCode)}`}
          />
          <Design01TotalRow
            label="Tax"
            value={formatMinorMoney(order.taxMinor, order.currencyCode)}
          />
          <Design01TotalRow
            emphasized
            label={paymentStatus === "Paid" ? "Total paid" : "Balance due"}
            value={formatMinorMoney(total, order.currencyCode)}
          />
        </Design01Section>

        <Design01Section title="Payment and fulfilment">
          <Design01InfoRow
            detail={
              paymentStatus === "Paid"
                ? "Payment has been confirmed for this order."
                : "Payment is still required before closeout."
            }
            icon="CreditCard"
            title={paymentStatus}
          />
          <Design01InfoRow
            detail="Pickup from the Victoria Island store."
            icon="Warehouse"
            title={fulfilmentStatus}
          />
        </Design01Section>

        <View className="gap-3">
          <ActionButton
            disabled={!canRecordPayment}
            icon="CreditCard"
            onPress={recordPayment}
          >
            {canRecordPayment ? "Record payment" : "Payment recorded"}
          </ActionButton>
          <ActionButton
            disabled={!upcomingFulfilmentStatus}
            icon="Truck"
            onPress={advanceFulfilment}
            variant="outline"
          >
            {upcomingFulfilmentStatus
              ? `Move to ${upcomingFulfilmentStatus}`
              : "Fulfilment complete"}
          </ActionButton>
        </View>

        <View className="gap-2">
          <Text className="text-lg font-extrabold text-foreground">
            Activity
          </Text>
          <View className="rounded-2xl bg-card px-4">
            {activity.map((event, index) => (
              <View
                className="flex-row gap-3 border-b border-border py-4 last:border-b-0"
                key={`${event.label}-${event.time}-${index}`}
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
                <Text className="text-xs text-muted-foreground">
                  {event.time}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </ReferenceScreenShell>
  );
}

function Design01TotalRow({
  emphasized = false,
  label,
  value,
}: {
  emphasized?: boolean;
  label: string;
  value: string;
}) {
  return (
    <View className="flex-row items-center justify-between gap-4 border-b border-border py-4 last:border-b-0">
      <Text
        className={
          emphasized
            ? "font-extrabold text-foreground"
            : "text-sm text-muted-foreground"
        }
      >
        {label}
      </Text>
      <Text
        className={
          emphasized
            ? "text-lg font-extrabold text-foreground"
            : "text-sm font-bold text-foreground"
        }
      >
        {value}
      </Text>
    </View>
  );
}
