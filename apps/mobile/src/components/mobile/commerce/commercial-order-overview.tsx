import { ActionButton } from "@/components/mobile/action-button"
import { StatusBadge } from "@/components/mobile/status-badge"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import { formatMinorMoney } from "@ewatrade/utils"
import { type ReactNode, useEffect, useState } from "react"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import {
  type CommercialOrder,
  type CommercialOrderLine,
  commerceLineOption,
  commerceLineTitle,
  commerceOrderTone,
  commercePaymentTone,
  commerceStatusLabel,
  formatCommerceDate,
  formatCommerceDateTime,
  formatCommerceQuantity,
} from "./commerce-model"
import {
  type CommercialOrderActivity,
  canFulfillCommercialOrderLine,
  getCommercialOrderOverviewSummary,
} from "./commercial-order-overview-model"

type CommercialOrderOverviewContentProps = {
  activity: CommercialOrderActivity[]
  error: string | null
  isFulfillingAll: boolean
  fulfillingOrderLineId?: string
  isOffline: boolean
  notice: string | null
  onBack: () => void
  onFulfillAll: () => void
  onFulfillLine: (orderLineId: string) => void
  onOpenCustomer: () => void
  order: CommercialOrder
}

export function CommercialOrderOverviewContent({
  activity,
  error,
  fulfillingOrderLineId,
  isFulfillingAll,
  isOffline,
  notice,
  onBack,
  onFulfillAll,
  onFulfillLine,
  onOpenCustomer,
  order,
}: CommercialOrderOverviewContentProps) {
  const summary = getCommercialOrderOverviewSummary(order)
  const [fulfillmentClock, setFulfillmentClock] = useState(Date.now())
  const deliveryDueTime = order.deliveryDueAt
    ? new Date(order.deliveryDueAt).getTime()
    : null
  const fulfillmentScheduledForFuture =
    deliveryDueTime !== null && deliveryDueTime > fulfillmentClock

  useEffect(() => {
    const currentTime = Math.max(fulfillmentClock, Date.now())
    if (deliveryDueTime === null || deliveryDueTime <= currentTime) return
    const timer = setTimeout(
      () => setFulfillmentClock(Date.now()),
      Math.min(deliveryDueTime - currentTime + 50, 60_000),
    )
    return () => clearTimeout(timer)
  }, [deliveryDueTime, fulfillmentClock])

  return (
    <View className="gap-7" testID="commercial-order-overview-screen">
      <CommercialOrderOverviewHeader
        onBack={onBack}
        subtitle={formatCommerceDate(order.createdAt)}
        title={order.orderNumber}
      />

      <OrderOverviewSummary order={order} summary={summary} />

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
      {fulfillmentScheduledForFuture ? (
        <StatusBanner
          icon="Calendar"
          message={`Product fulfillment becomes available at ${formatCommerceDateTime(
            order.deliveryDueAt ?? new Date(),
          )}.`}
          title="Delivery is scheduled"
          tone="warning"
        />
      ) : null}

      <OrderCustomerRow onPress={onOpenCustomer} order={order} />

      <OrderOverviewSection
        accessory={`${summary.lineCount} ${summary.lineCount === 1 ? "line" : "lines"}`}
        title="Items"
      >
        {order.lines.map((line) => (
          <OrderLineRow
            disabled={
              isOffline || fulfillmentScheduledForFuture || isFulfillingAll
            }
            isFulfilling={fulfillingOrderLineId === line.id}
            key={line.id}
            line={line}
            onFulfill={() => onFulfillLine(line.id)}
            order={order}
          />
        ))}
      </OrderOverviewSection>

      <OrderOverviewSection title="Order total">
        <OrderTotalRow
          label="Subtotal"
          value={formatMinorMoney(order.subtotalMinor, order.currencyCode)}
        />
        {order.serviceChargeMinor > 0 ? (
          <OrderTotalRow
            label="Service charge"
            value={formatMinorMoney(
              order.serviceChargeMinor,
              order.currencyCode,
            )}
          />
        ) : null}
        {order.discountMinor > 0 ? (
          <OrderTotalRow
            label="Discount"
            value={`−${formatMinorMoney(order.discountMinor, order.currencyCode)}`}
          />
        ) : null}
        {order.taxMinor > 0 ? (
          <OrderTotalRow
            label="Tax"
            value={formatMinorMoney(order.taxMinor, order.currencyCode)}
          />
        ) : null}
        <OrderTotalRow
          emphasized
          label="Total"
          value={formatMinorMoney(order.totalMinor, order.currencyCode)}
        />
      </OrderOverviewSection>

      <OrderOverviewSection title="Payment and fulfilment">
        <OrderInfoRow
          detail={
            order.deliveryDueAt
              ? formatCommerceDateTime(order.deliveryDueAt)
              : "No delivery time recorded"
          }
          icon="Calendar"
          title="Scheduled delivery"
        />
        <OrderInfoRow
          detail={
            order.createdBy?.role
              ? commerceStatusLabel(order.createdBy.role)
              : "Workspace team member"
          }
          icon="User"
          title={`Order taken by ${order.createdBy?.name ?? "Unknown team member"}`}
        />
        <OrderInfoRow
          detail={`${formatMinorMoney(
            order.amountPaidMinor,
            order.currencyCode,
          )} paid · ${formatMinorMoney(
            order.balanceDueMinor,
            order.currencyCode,
          )} due`}
          icon="CreditCard"
          title={commerceStatusLabel(order.paymentStatus)}
        />
        <OrderInfoRow
          detail={fulfilmentDetail(summary)}
          icon="Warehouse"
          title={commerceStatusLabel(order.status)}
        />
        {summary.fulfillableProductLineCount > 0 ? (
          <View className="gap-2 py-4">
            <ActionButton
              disabled={
                isOffline ||
                fulfillmentScheduledForFuture ||
                Boolean(fulfillingOrderLineId)
              }
              icon="Warehouse"
              isLoading={isFulfillingAll}
              loadingLabel="Fulfilling products"
              onPress={onFulfillAll}
            >
              Fulfill all products
            </ActionButton>
            <Text className="text-center text-xs text-muted-foreground">
              Commits all {summary.fulfillableProductLineCount} reserved Product{" "}
              {summary.fulfillableProductLineCount === 1 ? "line" : "lines"}.
            </Text>
          </View>
        ) : null}
      </OrderOverviewSection>

      {order.notes ? (
        <OrderOverviewSection title="Order note">
          <OrderInfoRow detail={order.notes} icon="StickyNote" title="Note" />
        </OrderOverviewSection>
      ) : null}

      <OrderActivityTimeline activity={activity} />
    </View>
  )
}

export function CommercialOrderOverviewHeader({
  onBack,
  subtitle,
  title,
}: {
  onBack: () => void
  subtitle?: string
  title: string
}) {
  return (
    <View className="gap-3">
      <View className="min-h-11 flex-row items-center gap-3">
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          className="size-11 items-center justify-center rounded-full bg-card active:bg-accent"
          haptic
          onPress={onBack}
        >
          <Icon className="size-base text-foreground" name="ArrowLeft" />
        </Pressable>
        <View className="min-w-0 flex-1">
          <Text
            className="text-sm font-semibold text-muted-foreground"
            selectable
          >
            Order overview
          </Text>
          <Text
            className="text-3xl font-extrabold tracking-tight text-foreground"
            numberOfLines={1}
            selectable
          >
            {title}
          </Text>
        </View>
      </View>
      {subtitle ? (
        <Text className="text-sm text-muted-foreground" selectable>
          Created {subtitle}
        </Text>
      ) : null}
    </View>
  )
}

export function CommercialOrderOverviewPrimaryAction({
  disabled,
  onPress,
}: {
  disabled: boolean
  onPress: () => void
}) {
  const colors = useColors()
  const insets = useSafeAreaInsets()

  return (
    <View
      style={{
        backgroundColor: colors.background,
        borderTopColor: colors.border,
        borderTopWidth: 1,
        bottom: 0,
        elevation: 20,
        left: 0,
        paddingBottom: Math.max(insets.bottom, 16),
        paddingHorizontal: 24,
        paddingTop: 12,
        position: "absolute",
        right: 0,
        zIndex: 20,
      }}
    >
      <ActionButton
        disabled={disabled}
        icon="CreditCard"
        onPress={onPress}
        testID="order-record-payment-action"
      >
        Record payment
      </ActionButton>
    </View>
  )
}

function OrderOverviewSummary({
  order,
  summary,
}: {
  order: CommercialOrder
  summary: ReturnType<typeof getCommercialOrderOverviewSummary>
}) {
  const itemCount = formatCommerceQuantity(summary.itemCount)

  return (
    <View className="gap-5 rounded-3xl bg-secondary p-5">
      <View className="gap-2">
        <Text className="text-sm font-bold text-muted-foreground" selectable>
          Total order value
        </Text>
        <Text
          className="text-3xl font-extrabold tabular-nums tracking-tight text-foreground"
          selectable
        >
          {formatMinorMoney(order.totalMinor, order.currencyCode)}
        </Text>
        <View className="flex-row flex-wrap gap-2 pt-1">
          <StatusBadge
            label={commerceStatusLabel(order.paymentStatus)}
            tone={commercePaymentTone(order.paymentStatus)}
          />
          <StatusBadge
            label={commerceStatusLabel(order.status)}
            tone={commerceOrderTone(order.status)}
          />
        </View>
      </View>
      <View className="h-px bg-border" />
      <View className="flex-row gap-4">
        <SummaryMetric
          label={summary.itemCount === 1 ? "Item" : "Items"}
          value={itemCount}
        />
        <View className="w-px bg-border" />
        <SummaryMetric
          label="Balance due"
          value={formatMinorMoney(order.balanceDueMinor, order.currencyCode)}
        />
      </View>
    </View>
  )
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-0 flex-1 gap-1">
      <Text
        className="text-xl font-extrabold tabular-nums text-foreground"
        numberOfLines={1}
        selectable
      >
        {value}
      </Text>
      <Text className="text-xs font-semibold text-muted-foreground" selectable>
        {label}
      </Text>
    </View>
  )
}

function OrderCustomerRow({
  onPress,
  order,
}: {
  onPress: () => void
  order: CommercialOrder
}) {
  const hasCustomer = Boolean(
    order.customerName || order.customerPhone || order.customerEmail,
  )

  const content = (
    <>
      <View className="size-11 items-center justify-center rounded-full bg-primary">
        <Icon className="size-sm text-primary-foreground" name="User" />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-extrabold text-foreground" selectable>
          {order.customerName ||
            order.customerPhone ||
            order.customerEmail ||
            "Walk-in customer"}
        </Text>
        <Text
          className="text-sm text-muted-foreground"
          numberOfLines={1}
          selectable
        >
          {[order.customerPhone, order.customerEmail]
            .filter(Boolean)
            .join(" · ") || "No customer contact captured"}
        </Text>
      </View>
      {hasCustomer ? (
        <Icon className="size-sm text-muted-foreground" name="ChevronRight" />
      ) : null}
    </>
  )

  return (
    <View className="gap-2">
      <Text className="text-lg font-extrabold text-foreground">Customer</Text>
      {hasCustomer ? (
        <Pressable
          accessibilityLabel="Open customer overview"
          accessibilityRole="button"
          className="flex-row items-center gap-3 border-y border-border py-4 active:bg-accent"
          haptic
          onPress={onPress}
        >
          {content}
        </Pressable>
      ) : (
        <View className="flex-row items-center gap-3 border-y border-border py-4">
          {content}
        </View>
      )}
    </View>
  )
}

function OrderOverviewSection({
  accessory,
  children,
  title,
}: {
  accessory?: string
  children: ReactNode
  title: string
}) {
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-lg font-extrabold text-foreground">{title}</Text>
        {accessory ? (
          <Text className="text-xs font-semibold text-muted-foreground">
            {accessory}
          </Text>
        ) : null}
      </View>
      <View className="border-y border-border">{children}</View>
    </View>
  )
}

function OrderLineRow({
  disabled,
  isFulfilling,
  line,
  onFulfill,
  order,
}: {
  disabled: boolean
  isFulfilling: boolean
  line: CommercialOrderLine
  onFulfill: () => void
  order: CommercialOrder
}) {
  const canFulfill = canFulfillCommercialOrderLine(line)

  return (
    <View className="gap-3 border-b border-border py-4 last:border-b-0">
      <View className="flex-row items-start justify-between gap-4">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="font-bold text-foreground" selectable>
            {commerceLineTitle(line)}
          </Text>
          <Text className="text-sm leading-5 text-muted-foreground" selectable>
            {commerceLineOption(line)}
          </Text>
          <Text className="text-sm text-muted-foreground" selectable>
            {formatCommerceQuantity(line.quantity)} ×{" "}
            {formatMinorMoney(line.unitPriceMinor, order.currencyCode)}
          </Text>
        </View>
        <Text
          className="font-extrabold tabular-nums text-foreground"
          selectable
        >
          {formatMinorMoney(line.totalMinor, order.currencyCode)}
        </Text>
      </View>
      <View className="flex-row flex-wrap gap-2">
        <StatusBadge
          label={line.kind === "service" ? "Service" : "Product"}
          tone="muted"
        />
        {line.kind === "service" ? (
          <StatusBadge label="Managed in Service jobs" tone="primary" />
        ) : line.productFulfillments.length > 0 ? (
          <StatusBadge label="Fulfilled" tone="success" />
        ) : line.reservation ? (
          <StatusBadge
            label={commerceStatusLabel(line.reservation.status)}
            tone={line.reservation.status === "ACTIVE" ? "primary" : "muted"}
          />
        ) : (
          <StatusBadge label="Not reserved" tone="muted" />
        )}
      </View>
      {canFulfill ? (
        <ActionButton
          disabled={disabled}
          isLoading={isFulfilling}
          loadingLabel="Recording fulfilment"
          onPress={onFulfill}
          variant="outline"
        >
          Fulfil product line
        </ActionButton>
      ) : null}
    </View>
  )
}

function OrderTotalRow({
  emphasized = false,
  label,
  value,
}: {
  emphasized?: boolean
  label: string
  value: string
}) {
  return (
    <View className="flex-row items-center justify-between gap-4 border-b border-border py-4 last:border-b-0">
      <Text
        className={
          emphasized
            ? "font-extrabold text-foreground"
            : "text-sm text-muted-foreground"
        }
        selectable
      >
        {label}
      </Text>
      <Text
        className={
          emphasized
            ? "text-lg font-extrabold tabular-nums text-foreground"
            : "text-sm font-bold tabular-nums text-foreground"
        }
        selectable
      >
        {value}
      </Text>
    </View>
  )
}

function OrderInfoRow({
  detail,
  icon,
  title,
}: {
  detail: string
  icon: "Calendar" | "CreditCard" | "StickyNote" | "User" | "Warehouse"
  title: string
}) {
  return (
    <View className="flex-row items-start gap-3 border-b border-border py-4 last:border-b-0">
      <View className="size-10 items-center justify-center rounded-full bg-muted">
        <Icon className="size-sm text-primary" name={icon} />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-bold text-foreground" selectable>
          {title}
        </Text>
        <Text className="text-sm leading-5 text-muted-foreground" selectable>
          {detail}
        </Text>
      </View>
    </View>
  )
}

function OrderActivityTimeline({
  activity,
}: {
  activity: CommercialOrderActivity[]
}) {
  return (
    <OrderOverviewSection title="Activity">
      {activity.map((event) => (
        <View
          className="flex-row gap-3 border-b border-border py-4 last:border-b-0"
          key={event.key}
        >
          <View className="mt-1.5 size-2 rounded-full bg-primary" />
          <View className="min-w-0 flex-1 gap-1">
            <Text className="font-bold text-foreground" selectable>
              {event.label}
            </Text>
            <Text
              className="text-sm leading-5 text-muted-foreground"
              selectable
            >
              {event.detail}
            </Text>
          </View>
          <Text
            className="max-w-24 text-right text-xs text-muted-foreground"
            selectable
          >
            {event.time}
          </Text>
        </View>
      ))}
    </OrderOverviewSection>
  )
}

function fulfilmentDetail(
  summary: ReturnType<typeof getCommercialOrderOverviewSummary>,
) {
  const parts: string[] = []
  if (summary.productLineCount > 0) {
    parts.push(
      summary.fulfilledProductLineCount === summary.productLineCount
        ? "All Product lines fulfilled"
        : `${summary.fulfilledProductLineCount} of ${summary.productLineCount} Product lines fulfilled`,
    )
  }
  if (summary.fulfillableProductLineCount > 0) {
    parts.push(
      `${summary.fulfillableProductLineCount} ready for stock fulfilment`,
    )
  }
  if (summary.serviceLineCount > 0) {
    parts.push(
      `${summary.serviceLineCount} ${summary.serviceLineCount === 1 ? "Service line continues" : "Service lines continue"} in Service jobs`,
    )
  }
  return parts.join(" · ") || "No fulfilment work is attached to this Order."
}
