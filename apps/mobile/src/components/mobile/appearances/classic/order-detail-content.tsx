import { ActionButton } from "@/components/mobile/action-button"
import { catalogAvatarTint } from "@/components/mobile/catalog/catalog-shelf-model"
import {
  type CommercialOrder,
  type CommercialOrderLine,
  commerceLineOption,
  commerceLineTitle,
  commerceStatusLabel,
  formatCommerceDateTime,
  formatCommerceQuantity,
} from "@/components/mobile/commerce/commerce-model"
import {
  type CommercialOrderActivity,
  canFulfillCommercialOrderLine,
  getCommercialOrderOverviewSummary,
} from "@/components/mobile/commerce/commercial-order-overview-model"
import { recordAvatar } from "@/components/mobile/dashboard/green-till-home-model"
import { HeroCard } from "@/components/mobile/green-till/hero-card"
import { QuickActionRow } from "@/components/mobile/green-till/kit"
import type {
  OrderDetailContentProps,
  OrderDetailPrimaryActionProps,
} from "@/components/mobile/order-detail/order-detail-presentation"
import { useOrderDetailPresentation } from "@/components/mobile/order-detail/use-order-detail-presentation"
import {
  ledgerDayLabel,
  ledgerPayment,
  ledgerWhen,
} from "@/components/mobile/orders/orders-ledger-model"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { isClosedOrder } from "@/lib/order-action-eligibility"
import { formatOrderDetailMoney as formatMinorMoney } from "@/lib/order-detail-dispatch-docket"
import { cn } from "@/lib/utils"
import { isReceiptOrderEligible } from "@ewatrade/order-receipts"
import { VariableContextProvider } from "nativewind"
import type { ReactNode } from "react"
import { Text as NativeText, View as NativeView } from "react-native"
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
        kicker={`Order · ${ledgerWhen(order.createdAt)}`}
        onBack={onBack}
        onReceipt={
          !isOffline && onReceipt && isReceiptOrderEligible(order.status)
            ? onReceipt
            : undefined
        }
        title={order.orderNumber}
      />

      <OrderOverviewSummary order={order} summary={summary} />
      <QuickActionRow
        actions={[
          {
            label:
              summary.fulfillableProductLineCount > 0
                ? `Fulfil ${summary.fulfillableProductLineCount}`
                : summary.productLineCount > 0 &&
                    summary.fulfilledProductLineCount ===
                      summary.productLineCount
                  ? "Fulfilled"
                  : "Fulfil",
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

      <OrderCustomerRow
        onCall={!order.customerPhone ? undefined : onCall}
        onPress={onOpenCustomer}
        order={order}
      />

      <OrderOverviewSection
        accessory={`${summary.lineCount} ${summary.lineCount === 1 ? "line" : "lines"} · ${formatCommerceQuantity(summary.itemCount)} ${Number(summary.itemCount) === 1 ? "item" : "items"}`}
        title="Items"
      >
        {order.lines.map((line, index) => (
          <OrderLineRow
            first={index === 0}
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

      <OrderOverviewSection title="Totals">
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
          divided
          emphasized
          label="Total"
          value={formatMinorMoney(order.totalMinor, order.currencyCode)}
        />
        <OrderTotalRow
          label="Paid"
          tone="paid"
          value={formatMinorMoney(order.amountPaidMinor, order.currencyCode)}
        />
        <OrderTotalRow
          emphasized
          label="Balance due"
          tone={order.balanceDueMinor > 0 ? "due" : undefined}
          value={formatMinorMoney(order.balanceDueMinor, order.currencyCode)}
        />
      </OrderOverviewSection>

      <OrderOverviewSection title="Details">
        <OrderInfoRow
          detail={
            order.deliveryDueAt ? "Scheduled delivery" : "No delivery time set"
          }
          icon="Calendar"
          tint="sky"
          title={
            order.deliveryDueAt ? ledgerWhen(order.deliveryDueAt) : "Delivery"
          }
        />
        <OrderInfoRow
          detail={
            order.createdBy?.role
              ? commerceStatusLabel(order.createdBy.role)
              : "Workspace team member"
          }
          icon="User"
          tint="lilac"
          title={`Taken by ${order.createdBy?.name ?? "a team member"}`}
        />
        {order.notes ? (
          <OrderInfoRow
            detail={order.notes}
            icon="StickyNote"
            tint="amber"
            title="Note"
          />
        ) : null}
        {summary.serviceLineCount > 0 ? (
          <OrderInfoRow
            detail={fulfilmentDetail(summary)}
            icon="Warehouse"
            tint="mint"
            title={commerceStatusLabel(order.status)}
          />
        ) : null}
      </OrderOverviewSection>

      <OrderActivityTimeline activity={activity} />
    </View>
  )
}

export function CommercialOrderOverviewHeader({
  kicker,
  onBack,
  onReceipt,
  subtitle,
  title,
}: {
  kicker?: string
  onBack: () => void
  onReceipt?: () => void
  subtitle?: string
  title: string
}) {
  return (
    <View className="gap-3">
      <View className="min-h-11 flex-row items-center gap-3">
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          className="size-11 items-center justify-center rounded-full bg-card shadow-sm active:bg-accent"
          haptic
          onPress={onBack}
        >
          <Icon className="size-[20px] text-foreground" name="ArrowLeft" />
        </Pressable>
        <View className="min-w-0 flex-1">
          <Text
            className="text-xs font-bold text-muted-foreground"
            numberOfLines={1}
            selectable
          >
            {kicker ?? "Order overview"}
          </Text>
          <Text
            className="text-[17px] font-extrabold tracking-tight text-foreground"
            numberOfLines={1}
            selectable
          >
            {title}
          </Text>
        </View>
        {onReceipt ? (
          <Pressable
            accessibilityLabel="Open receipt"
            accessibilityRole="button"
            className="size-11 items-center justify-center rounded-full bg-card shadow-sm active:bg-accent"
            haptic
            onPress={onReceipt}
          >
            <Icon className="size-[19px] text-foreground" name="ReceiptText" />
          </Pressable>
        ) : null}
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
  order,
}: OrderDetailPrimaryActionProps) {
  const insets = useSafeAreaInsets()
  const colors = useColors()

  return (
    <VariableContextProvider
      value={{ "--order-action-bottom": Math.max(insets.bottom, 16) }}
    >
      <NativeView
        style={{
          backgroundColor: colors.card,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          bottom: 0,
          boxShadow: "0 -10px 30px rgba(24, 36, 32, 0.10)",
          left: 0,
          paddingHorizontal: 16,
          paddingTop: 12,
          position: "absolute",
          right: 0,
          zIndex: 20,
        }}
      >
        <View className="flex-row items-center gap-3 pb-[var(--order-action-bottom)]">
          <View className="min-w-0 shrink">
            <Text className="text-[11px] font-bold text-muted-foreground">
              Balance due
            </Text>
            <Text className="text-[22px] font-extrabold tabular-nums tracking-tight text-foreground">
              {formatMinorMoney(order.balanceDueMinor, order.currencyCode)}
            </Text>
          </View>
          <View className="min-w-0 flex-1">
            <ActionButton
              disabled={disabled}
              icon="CreditCard"
              onPress={onPress}
              testID="order-record-payment-action"
            >
              Record payment
            </ActionButton>
          </View>
        </View>
      </NativeView>
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
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
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
  const due = order.balanceDueMinor > 0
  const payment = ledgerPayment(order.paymentStatus)
  return (
    <View className="gap-3">
      <HeroCard
        label={due ? "Balance due" : "Paid in full"}
        amount={formatMinorMoney(
          due ? order.balanceDueMinor : order.totalMinor,
          order.currencyCode,
        )}
        pill={{ label: payment.label, tone: due ? "draft" : "synced" }}
        sub={
          due
            ? `of ${formatMinorMoney(order.totalMinor, order.currencyCode)} · ${formatMinorMoney(order.amountPaidMinor, order.currencyCode)} paid`
            : `${commerceStatusLabel(order.status)} · nothing left to collect`
        }
        stats={[
          { label: "Items", value: formatCommerceQuantity(summary.itemCount) },
          {
            label: "Fulfilled",
            value: summary.productLineCount
              ? `${summary.fulfilledProductLineCount} of ${summary.productLineCount}`
              : "Service order",
          },
          {
            label: "Delivery",
            value: order.deliveryDueAt
              ? ledgerDayLabel(order.deliveryDueAt)
              : "Not set",
          },
        ]}
        meter={{
          label: `${paidPercent}% paid`,
          percent: paidPercent,
          tone: due ? "gold" : "up",
        }}
      />
    </View>
  )
}

function OrderCustomerRow({
  onCall,
  onPress,
  order,
}: {
  onCall?: () => void
  onPress: () => void
  order: CommercialOrder
}) {
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const colors = useColors()
  const name =
    order.customerName ||
    order.customerPhone ||
    order.customerEmail ||
    "Walk-in customer"
  const hasCustomer = Boolean(
    order.customerName || order.customerPhone || order.customerEmail,
  )
  const avatar = recordAvatar(hasCustomer ? name : "", 2)
  return (
    <View className="gap-2">
      <Text className="text-base font-extrabold text-foreground">Customer</Text>
      <Pressable
        accessibilityLabel={hasCustomer ? "Open customer overview" : name}
        accessibilityRole={hasCustomer ? "button" : "text"}
        className="min-h-[66px] flex-row items-center gap-3 rounded-[20px] bg-card px-3.5 py-3 shadow-sm active:opacity-80"
        disabled={!hasCustomer}
        haptic
        onPress={onPress}
      >
        <NativeView
          style={{
            alignItems: "center",
            backgroundColor: hasCustomer ? palette.lilac : palette.sky,
            borderRadius: 999,
            height: 44,
            justifyContent: "center",
            width: 44,
          }}
        >
          {"icon" in avatar || !hasCustomer ? (
            <Icon
              className="size-[19px]"
              color={palette.skyForeground}
              name="Store"
            />
          ) : (
            <NativeText
              maxFontSizeMultiplier={1.3}
              style={{
                color: palette.lilacForeground,
                fontSize: 14,
                fontWeight: "800",
              }}
            >
              {avatar.initials}
            </NativeText>
          )}
        </NativeView>
        <View className="min-w-0 flex-1">
          <Text
            className="text-[15px] font-bold text-foreground"
            numberOfLines={1}
            selectable
          >
            {name}
          </Text>
          <Text
            className="text-[13px] text-muted-foreground"
            numberOfLines={1}
            selectable
          >
            {[order.customerPhone, order.customerEmail]
              .filter(Boolean)
              .join(" · ") || "No contact details"}
          </Text>
        </View>
        {onCall ? (
          <Pressable
            accessibilityLabel={`Call ${name}`}
            accessibilityRole="button"
            haptic
            onPress={onCall}
            style={{
              alignItems: "center",
              backgroundColor: colors.accent,
              borderRadius: 999,
              height: 44,
              justifyContent: "center",
              width: 44,
            }}
          >
            <Icon
              className="size-[19px]"
              color={colors.accentForeground}
              name="Phone"
            />
          </Pressable>
        ) : null}
      </Pressable>
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
        <Text className="text-base font-extrabold text-foreground">
          {title}
        </Text>
        {accessory ? (
          <Text className="text-[13px] font-bold text-muted-foreground">
            {accessory}
          </Text>
        ) : null}
      </View>
      <View className="rounded-[20px] bg-card px-3.5 shadow-sm">
        {children}
      </View>
    </View>
  )
}

function OrderLineRow({
  disabled,
  first,
  isFulfilling,
  line,
  onFulfill,
  order,
}: {
  disabled: boolean
  first: boolean
  isFulfilling: boolean
  line: CommercialOrderLine
  onFulfill: () => void
  order: CommercialOrder
}) {
  const largeText = useLargeTextLayout()
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const colors = useColors()
  const canFulfill =
    !isClosedOrder(order.status) && canFulfillCommercialOrderLine(line)
  const title = commerceLineTitle(line)
  const service = line.kind === "service"
  const tint = service ? "lilac" : catalogAvatarTint(title, "product")
  const option = commerceLineOption(line)
  const price =
    line.unitPriceMinor === null
      ? "price set in order"
      : formatMinorMoney(line.unitPriceMinor, order.currencyCode)
  const state = service
    ? {
        label: "In Service jobs",
        icon: "Wrench" as const,
        tint: "lilac" as const,
      }
    : line.productFulfillments.length > 0
      ? { label: "Fulfilled", icon: "Check" as const, tint: "mint" as const }
      : line.reservation?.status === "ACTIVE"
        ? {
            label: "Reserved · ready",
            icon: "Package" as const,
            tint: "sky" as const,
          }
        : line.reservation
          ? {
              label: commerceStatusLabel(line.reservation.status),
              icon: "Package" as const,
              tint: null,
            }
          : { label: "Not reserved", icon: "Package" as const, tint: null }
  return (
    <View
      className={cn(
        "min-h-[66px] gap-3 py-3",
        !largeText && "flex-row items-start",
        !first && "border-t border-border",
      )}
    >
      <NativeView
        style={{
          alignItems: "center",
          backgroundColor: palette[tint],
          borderRadius: 13,
          height: 42,
          justifyContent: "center",
          width: 42,
        }}
      >
        {service ? (
          <Icon
            className="size-[19px]"
            color={palette[`${tint}Foreground`]}
            name="Wrench"
          />
        ) : (
          <NativeText
            maxFontSizeMultiplier={1.3}
            style={{
              color: palette[`${tint}Foreground`],
              fontSize: 16,
              fontWeight: "800",
            }}
          >
            {Array.from(title.trim())[0]?.toUpperCase() ?? "?"}
          </NativeText>
        )}
      </NativeView>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-sm font-bold text-foreground" selectable>
          {title}
        </Text>
        <Text className="text-xs text-muted-foreground" selectable>
          {`${option ? `${option} · ` : ""}${formatCommerceQuantity(line.quantity)} × ${price}`}
        </Text>
        {line.note ? (
          <Text className="text-xs text-muted-foreground" selectable>
            {line.note}
          </Text>
        ) : null}
        <NativeView
          style={{
            alignItems: "center",
            alignSelf: "flex-start",
            backgroundColor: state.tint ? palette[state.tint] : colors.muted,
            borderRadius: 999,
            flexDirection: "row",
            gap: 4,
            height: 22,
            marginTop: 2,
            paddingHorizontal: 8,
          }}
        >
          <Icon
            className="size-[12px]"
            color={
              state.tint
                ? palette[`${state.tint}Foreground`]
                : colors.mutedForeground
            }
            name={state.icon}
          />
          <NativeText
            style={{
              color: state.tint
                ? palette[`${state.tint}Foreground`]
                : colors.mutedForeground,
              fontSize: 11,
              fontWeight: "700",
              includeFontPadding: false,
            }}
          >
            {state.label}
          </NativeText>
        </NativeView>
      </View>
      <View className={cn("gap-2", !largeText && "items-end")}>
        <Text
          className="text-sm font-extrabold tabular-nums text-foreground"
          selectable
        >
          {formatMinorMoney(line.totalMinor, order.currencyCode)}
        </Text>
        {canFulfill ? (
          <Pressable
            accessibilityLabel={`Fulfil ${title}`}
            accessibilityRole="button"
            accessibilityState={{ busy: isFulfilling, disabled }}
            disabled={disabled}
            haptic
            onPress={onFulfill}
            style={{
              alignItems: "center",
              backgroundColor: colors.primary,
              borderRadius: 12,
              flexDirection: "row",
              gap: 5,
              height: 36,
              opacity: disabled ? 0.5 : 1,
              paddingHorizontal: 12,
            }}
          >
            <Icon
              className="size-[15px]"
              color={colors.primaryForeground}
              name="Package"
            />
            <NativeText
              style={{
                color: colors.primaryForeground,
                fontSize: 13,
                fontWeight: "800",
              }}
            >
              {isFulfilling ? "Fulfilling…" : "Fulfil"}
            </NativeText>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

function OrderTotalRow({
  divided = false,
  emphasized = false,
  label,
  tone,
  value,
}: {
  divided?: boolean
  emphasized?: boolean
  label: string
  tone?: "paid" | "due"
  value: string
}) {
  const largeText = useLargeTextLayout()
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const colors = useColors()
  return (
    <View
      className={cn(
        "gap-3 py-3",
        largeText ? "flex-col" : "flex-row items-center justify-between",
        divided && "border-t border-border",
      )}
    >
      <Text
        className={
          emphasized
            ? "text-[15px] font-extrabold text-foreground"
            : "text-sm text-muted-foreground"
        }
        selectable
      >
        {label}
      </Text>
      <NativeText
        selectable
        style={{
          color:
            tone === "paid"
              ? palette.mintForeground
              : tone === "due"
                ? palette.amberForeground
                : colors.foreground,
          fontSize: emphasized ? 16 : 14,
          fontVariant: ["tabular-nums"],
          fontWeight: emphasized ? "800" : "700",
        }}
      >
        {value}
      </NativeText>
    </View>
  )
}

function OrderInfoRow({
  detail,
  icon,
  tint,
  title,
}: {
  detail: string
  icon: "Calendar" | "CreditCard" | "StickyNote" | "User" | "Warehouse"
  tint: "mint" | "sky" | "lilac" | "amber"
  title: string
}) {
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  return (
    <View className="flex-row items-center gap-3 border-b border-border py-3 last:border-b-0">
      <NativeView
        style={{
          alignItems: "center",
          backgroundColor: palette[tint],
          borderRadius: 11,
          height: 36,
          justifyContent: "center",
          width: 36,
        }}
      >
        <Icon
          className="size-[17px]"
          color={palette[`${tint}Foreground`]}
          name={icon}
        />
      </NativeView>
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-bold text-foreground" selectable>
          {title}
        </Text>
        <Text className="text-xs leading-5 text-muted-foreground" selectable>
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
      {activity.map((event, index) => (
        <View className="flex-row gap-3 py-3" key={event.key}>
          <View className="items-center pt-1.5">
            <View className="size-2 rounded-full bg-primary" />
            {index < activity.length - 1 ? (
              <View className="mt-1 w-0.5 flex-1 bg-border" />
            ) : null}
          </View>
          <View className="min-w-0 flex-1 gap-0.5">
            <View className="flex-row items-baseline justify-between gap-3">
              <Text
                className="min-w-0 flex-1 text-sm font-bold text-foreground"
                selectable
              >
                {event.label}
              </Text>
              <Text
                className="text-xs tabular-nums text-muted-foreground"
                selectable
              >
                {event.time}
              </Text>
            </View>
            <Text
              className="text-xs leading-5 text-muted-foreground"
              selectable
            >
              {event.detail}
            </Text>
          </View>
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
