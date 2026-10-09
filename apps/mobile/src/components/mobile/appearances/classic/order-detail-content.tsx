import { ActionButton } from "@/components/mobile/action-button"
import {
  type CommercialOrder,
  type CommercialOrderLine,
  commerceLineOption,
  commerceLineTitle,
  commerceStatusLabel,
  formatCommerceDate,
  formatCommerceDateTime,
  formatCommerceQuantity,
} from "@/components/mobile/commerce/commerce-model"
import {
  type CommercialOrderActivity,
  canFulfillCommercialOrderLine,
  getCommercialOrderOverviewSummary,
} from "@/components/mobile/commerce/commercial-order-overview-model"
import { HeroCard } from "@/components/mobile/green-till/hero-card"
import { QuickActionRow, StatusPill } from "@/components/mobile/green-till/kit"
import type {
  OrderDetailContentProps,
  OrderDetailPrimaryActionProps,
} from "@/components/mobile/order-detail/order-detail-presentation"
import { useOrderDetailPresentation } from "@/components/mobile/order-detail/use-order-detail-presentation"
import { ledgerPayment } from "@/components/mobile/orders/orders-ledger-model"
import { StatusBadge } from "@/components/mobile/status-badge"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColors } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { isClosedOrder } from "@/lib/order-action-eligibility"
import { formatOrderDetailMoney as formatMinorMoney } from "@/lib/order-detail-dispatch-docket"
import { cn } from "@/lib/utils"
import { isReceiptOrderEligible } from "@ewatrade/order-receipts"
import { VariableContextProvider } from "nativewind"
import type { ReactNode } from "react"
import { View as NativeView } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

export function ClassicOrderDetailContent({
  activity,
  cachedAt,
  onReceipt,
  onCall,
  onMessage,
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
}: OrderDetailContentProps) {
  const summary = getCommercialOrderOverviewSummary(order)
  const closed = isClosedOrder(order.status)
  const { fulfillmentScheduledForFuture } = useOrderDetailPresentation(order)

  return (
    <View className="gap-4" testID="commercial-order-overview-screen">
      <CommercialOrderOverviewHeader
        onBack={onBack}
        subtitle={formatCommerceDate(order.createdAt)}
        title={order.orderNumber}
      />

      <OrderOverviewSummary order={order} summary={summary} />
      <QuickActionRow
        actions={[
          {
            label: "Fulfil",
            icon: "Package",
            onPress: onFulfillAll,
            disabled:
              closed ||
              isOffline ||
              fulfillmentScheduledForFuture ||
              isFulfillingAll ||
              !!fulfillingOrderLineId ||
              summary.fulfillableProductLineCount === 0,
          },
          {
            label: "Receipt",
            icon: "ReceiptText",
            onPress: onReceipt ?? (() => undefined),
            disabled:
              isOffline || !onReceipt || !isReceiptOrderEligible(order.status),
          },
          {
            label: "Call",
            icon: "Phone",
            onPress: onCall ?? (() => undefined),
            disabled: !order.customerPhone || !onCall,
          },
          {
            label: "Message",
            icon: "MessageCircle",
            onPress: onMessage ?? (() => undefined),
            disabled: !order.customerPhone || !onMessage,
          },
        ]}
      />

      {isOffline ? (
        <StatusBanner
          icon="Wind"
          message={`Showing cached order details${cachedAt ? ` · saved ${cachedAt}` : ""}. Payment, fulfilment and receipt actions require a connection.`}
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
              closed ||
              isOffline ||
              fulfillmentScheduledForFuture ||
              isFulfillingAll ||
              Boolean(fulfillingOrderLineId)
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

      <OrderOverviewSection title="Payments">
        <OrderTotalRow
          label="Paid"
          value={formatMinorMoney(order.amountPaidMinor, order.currencyCode)}
        />
        <OrderTotalRow
          label="Balance due"
          emphasized
          value={formatMinorMoney(order.balanceDueMinor, order.currencyCode)}
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
          title={ledgerPayment(order.paymentStatus).label}
        />
        <OrderInfoRow
          detail={fulfilmentDetail(summary)}
          icon="Warehouse"
          title={commerceStatusLabel(order.status)}
        />
        {!closed && summary.fulfillableProductLineCount > 0 ? (
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
              Confirm when all {summary.fulfillableProductLineCount} product
              lines are ready to hand over.
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
          <Icon className="size-[20px] text-foreground" name="ArrowLeft" />
        </Pressable>
        <View className="min-w-0 flex-1">
          <Text
            className="text-sm font-semibold text-muted-foreground"
            selectable
          >
            Order overview
          </Text>
          <Text
            className="text-[23px] font-extrabold tracking-tight text-foreground"
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

export function ClassicOrderDetailPrimaryAction({
  disabled,
  onPress,
}: OrderDetailPrimaryActionProps) {
  const insets = useSafeAreaInsets()

  return (
    <VariableContextProvider
      value={{ "--order-action-bottom": Math.max(insets.bottom, 16) }}
    >
      <View className="absolute inset-x-0 bottom-0 z-20 border-t border-border bg-background px-6 pt-3 pb-[var(--order-action-bottom)] [-rn-elevation:20]">
        <ActionButton
          disabled={disabled}
          icon="CreditCard"
          onPress={onPress}
          testID="order-record-payment-action"
          tone="gold"
        >
          Record payment
        </ActionButton>
      </View>
    </VariableContextProvider>
  )
}

function OrderOverviewSummary({
  order,
  summary,
}: {
  order: CommercialOrder
  summary: ReturnType<typeof getCommercialOrderOverviewSummary>
}) {
  const colors = useColors()
  const closed = isClosedOrder(order.status)
  const paidPercent =
    order.totalMinor > 0
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round((order.amountPaidMinor / order.totalMinor) * 100),
          ),
        )
      : 0
  if (closed)
    return (
      <View className="gap-3 rounded-[26px] bg-muted p-5">
        <Text className="text-[23px] font-extrabold text-muted-foreground">
          {commerceStatusLabel(order.status)}
        </Text>
        <Text className="text-sm text-muted-foreground">
          Order value · {formatMinorMoney(order.totalMinor, order.currencyCode)}
        </Text>
        <Text className="text-xs text-muted-foreground">
          Payment and fulfilment are unavailable for this order.
        </Text>
      </View>
    )
  return (
    <View className="gap-3">
      <HeroCard
        label={order.balanceDueMinor > 0 ? "Balance due" : "Paid in full"}
        amount={formatMinorMoney(
          order.balanceDueMinor > 0 ? order.balanceDueMinor : order.totalMinor,
          order.currencyCode,
        )}
        sub={`${formatMinorMoney(order.amountPaidMinor, order.currencyCode)} paid of ${formatMinorMoney(order.totalMinor, order.currencyCode)}`}
        stats={[
          { label: "Items", value: formatCommerceQuantity(summary.itemCount) },
          {
            label: "Products fulfilled",
            value: summary.productLineCount
              ? `${summary.fulfilledProductLineCount} of ${summary.productLineCount}`
              : "Service order",
          },
          {
            label: "Delivery",
            value: order.deliveryDueAt
              ? formatCommerceDateTime(order.deliveryDueAt)
              : "Not scheduled",
          },
        ]}
      />
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Order paid"
        accessibilityValue={{ min: 0, max: 100, now: paidPercent }}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <NativeView
          style={{
            height: 6,
            width: `${paidPercent}%`,
            backgroundColor: colors.primary,
          }}
        />
      </View>
      <StatusPill {...ledgerPayment(order.paymentStatus)} />
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
        <Icon className="size-[18px] text-primary-foreground" name="User" />
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
        <Icon
          className="size-[18px] text-muted-foreground"
          name="ChevronRight"
        />
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
      <View className="rounded-[20px] bg-card px-3.5">{children}</View>
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
  const largeText = useLargeTextLayout()
  const canFulfill =
    !isClosedOrder(order.status) && canFulfillCommercialOrderLine(line)

  return (
    <View className="gap-3 border-b border-border py-4 last:border-b-0">
      <View
        className={cn(
          "gap-3",
          largeText ? "flex-col" : "flex-row items-start justify-between",
        )}
      >
        <View className="min-w-0 flex-1 gap-1">
          <Text className="font-bold text-foreground" selectable>
            {commerceLineTitle(line)}
          </Text>
          <Text className="text-sm leading-5 text-muted-foreground" selectable>
            {commerceLineOption(line)}
          </Text>
          <Text className="text-sm text-muted-foreground" selectable>
            {formatCommerceQuantity(line.quantity)}
            {line.unitPriceMinor === null ? " · " : " × "}
            {line.unitPriceMinor === null
              ? "Price entered during order"
              : formatMinorMoney(line.unitPriceMinor, order.currencyCode)}
          </Text>
          {line.note ? (
            <Text className="text-sm text-muted-foreground" selectable>
              {line.note}
            </Text>
          ) : null}
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
            label={
              line.reservation.status === "ACTIVE"
                ? "Ready to fulfil"
                : commerceStatusLabel(line.reservation.status)
            }
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
          Fulfil
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
  const largeText = useLargeTextLayout()
  return (
    <View
      className={cn(
        "gap-3 border-b border-border py-3 last:border-b-0",
        largeText ? "flex-col" : "flex-row items-center justify-between",
      )}
    >
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
        <Icon className="size-[18px] text-primary" name={icon} />
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
