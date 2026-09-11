import {
  ActionButton,
  MarketDayActionButton,
} from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { DISPLAY_TEXT_FONT_SCALE_CAP } from "@/lib/mobile-accessibility-layout"
import { formatOrderDetailMoney } from "@/lib/order-detail-dispatch-docket"
import type { ReactNode } from "react"
import { Text as NativeText, View } from "react-native"
import { VariableContextProvider } from "nativewind"
import { cn } from "@/lib/utils"
import type {
  OrderDetailContentProps,
  OrderDetailPrimaryActionProps,
} from "@/components/mobile/order-detail/order-detail-presentation"
import { useOrderDetailPresentation } from "@/components/mobile/order-detail/use-order-detail-presentation"
import { useSafeAreaInsets } from "react-native-safe-area-context"
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
  canFulfillCommercialOrderLine,
  getCommercialOrderOverviewSummary,
} from "@/components/mobile/commerce/commercial-order-overview-model"

export function OrderDetailDispatchDocket({
  activity,
  businessName,
  error,
  fulfillingOrderLineId,
  isFulfillingAll,
  isOffline,
  notice,
  onBack,
  onFulfillAll,
  onFulfillLine,
  onMastheadHeightChange,
  onOpenCustomer,
  order,
}: OrderDetailContentProps) {
  const marketDay = useMarketDayPalette()
  const largeTextLayout = useLargeTextLayout()
  const summary = getCommercialOrderOverviewSummary(order)
  const presentation = useOrderDetailPresentation(order)
  const fulfillmentScheduledForFuture =
    presentation.fulfillmentScheduledForFuture

  return (
    <View className={styles.screen} testID="order-detail-dispatch-docket">
      <View
        onLayout={(event) =>
          onMastheadHeightChange?.(event.nativeEvent.layout.height)
        }
        className={cn(styles.masthead, "bg-market-marigold")}
        testID="order-detail-docket-masthead"
      >
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          haptic
          onPress={onBack}
          className={cn(
            styles.backButton,
            "border-market-on-marigold active:bg-market-on-marigold-pressed",
          )}
        >
          <Icon color={marketDay.onMarigold} name="ArrowLeft" size={20} />
        </Pressable>
        <View className={styles.mastheadCopy}>
          <Text
            maxFontSizeMultiplier={DISPLAY_TEXT_FONT_SCALE_CAP}
            className={cn(styles.kicker, "text-market-on-marigold")}
          >
            {businessName.toUpperCase()} · ORDER DOCKET
          </Text>
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={DISPLAY_TEXT_FONT_SCALE_CAP}
            selectable
            className={cn(styles.orderNumber, "text-market-on-marigold")}
          >
            {order.orderNumber}
          </Text>
        </View>
      </View>

      <View
        className={cn(
          styles.summary,
          "bg-market-docket-paper border-market-ink",
        )}
        testID="order-detail-docket-summary"
      >
        <View
          className={cn(
            styles.summaryTop,
            largeTextLayout ? styles.stack : null,
            "border-b-market-docket-rule",
          )}
        >
          <View
            className={cn(styles.summaryMoney, largeTextLayout && "flex-none")}
          >
            <DocketLabel>Total order</DocketLabel>
            <Text
              maxFontSizeMultiplier={DISPLAY_TEXT_FONT_SCALE_CAP}
              selectable
              className={cn(styles.total, "text-market-ink")}
            >
              {presentation.totalLabel}
            </Text>
          </View>
          <View className={styles.badges}>
            <DocketBadge tone="marigold" label={presentation.paymentLabel} />
            <DocketBadge tone="palm" label={presentation.statusLabel} />
          </View>
        </View>
        <View
          className={cn(
            styles.summaryFacts,
            largeTextLayout ? styles.stack : null,
          )}
        >
          <SummaryFact label="Balance due" value={presentation.balanceLabel} />
          <SummaryFact
            label={`${presentation.lineLabel} · ${presentation.fulfillmentLabel}`}
            value={presentation.itemLabel}
          />
        </View>
      </View>

      <View className={styles.body}>
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
            message={`Product fulfilment becomes available at ${formatCommerceDateTime(
              order.deliveryDueAt ?? new Date(),
            )}.`}
            title="Delivery is scheduled"
            tone="warning"
          />
        ) : null}

        <DocketSection
          accessory={
            order.customerName || order.customerPhone || order.customerEmail
              ? "Open record ↗"
              : undefined
          }
          title="Customer"
        >
          <CustomerRow onPress={onOpenCustomer} order={order} />
        </DocketSection>

        <DocketSection
          accessory={`${summary.productLineCount} product · ${summary.serviceLineCount} service`}
          title="Dispatch lines"
        >
          {order.lines.map((line) => (
            <DocketLine
              disabled={
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
        </DocketSection>

        <DocketSection
          accessory={presentation.movementProgressLabel}
          title="Next movement"
        >
          <View
            className={cn(
              styles.nextMovement,
              largeTextLayout ? styles.stack : null,
            )}
          >
            <View className={styles.flexCopy}>
              <Text
                selectable
                className={cn(styles.rowTitle, "text-market-ink")}
              >
                {presentation.nextMovement.label}
              </Text>
              <Text
                selectable
                className={cn(styles.rowDetail, "text-market-muted-ink")}
              >
                {presentation.nextMovement.detail}
              </Text>
            </View>
            {summary.fulfillableProductLineCount > 0 ? (
              <Pressable
                accessibilityLabel={presentation.nextMovement.label}
                accessibilityRole="button"
                disabled={
                  isOffline ||
                  fulfillmentScheduledForFuture ||
                  isFulfillingAll ||
                  Boolean(fulfillingOrderLineId)
                }
                haptic
                onPress={onFulfillAll}
                className={cn(
                  styles.movementButton,
                  isOffline ||
                    fulfillmentScheduledForFuture ||
                    isFulfillingAll ||
                    Boolean(fulfillingOrderLineId)
                    ? "bg-market-line"
                    : "bg-market-palm active:bg-market-paprika-pressed",
                )}
              >
                <NativeText
                  className={cn(
                    styles.movementButtonText,
                    isOffline ||
                      fulfillmentScheduledForFuture ||
                      isFulfillingAll ||
                      Boolean(fulfillingOrderLineId)
                      ? "text-market-muted-ink"
                      : "text-market-on-palm",
                  )}
                >
                  {isFulfillingAll
                    ? "Working…"
                    : presentation.nextMovement.stepLabel}
                </NativeText>
              </Pressable>
            ) : null}
          </View>
        </DocketSection>

        <DocketSection title="Order total">
          <MoneyRow
            label="Subtotal"
            order={order}
            value={order.subtotalMinor}
          />
          {order.serviceChargeMinor > 0 ? (
            <MoneyRow
              label="Service charge"
              order={order}
              value={order.serviceChargeMinor}
            />
          ) : null}
          {order.discountMinor > 0 ? (
            <MoneyRow
              label="Discount"
              order={order}
              prefix="−"
              value={order.discountMinor}
            />
          ) : null}
          {order.taxMinor > 0 ? (
            <MoneyRow label="Tax" order={order} value={order.taxMinor} />
          ) : null}
          <MoneyRow
            emphasized
            label="Total"
            order={order}
            value={order.totalMinor}
          />
        </DocketSection>

        <DocketSection title="Payment & fulfilment">
          <InfoRow
            detail={
              order.deliveryDueAt
                ? formatCommerceDateTime(order.deliveryDueAt)
                : "No delivery time recorded"
            }
            label="Scheduled delivery"
          />
          <InfoRow
            detail={`${formatOrderDetailMoney(
              order.amountPaidMinor,
              order.currencyCode,
            )} paid · ${presentation.balanceLabel} due`}
            label={presentation.paymentLabel}
          />
          <InfoRow
            detail={`${summary.fulfilledProductLineCount} of ${summary.productLineCount} product lines fulfilled`}
            label={presentation.statusLabel}
          />
          <InfoRow
            detail={commerceStatusLabel(order.createdBy?.role ?? "team member")}
            label={`Taken by ${order.createdBy?.name ?? "Unknown team member"}`}
          />
        </DocketSection>

        {order.notes ? (
          <DocketSection title="Order note">
            <InfoRow detail={order.notes} label="Note" />
          </DocketSection>
        ) : null}

        <DocketSection title="Activity">
          {activity.map((event) => (
            <View
              key={event.key}
              className={cn(styles.activity, "border-b-market-line")}
            >
              <View className={cn(styles.activityDot, "bg-market-paprika")} />
              <View className={styles.flexCopy}>
                <Text
                  selectable
                  className={cn(styles.rowTitle, "text-market-ink")}
                >
                  {event.label}
                </Text>
                <Text
                  selectable
                  className={cn(styles.rowDetail, "text-market-muted-ink")}
                >
                  {event.detail}
                </Text>
                <Text
                  selectable
                  className={cn(styles.timestamp, "text-market-muted-ink")}
                >
                  {event.time}
                </Text>
              </View>
            </View>
          ))}
        </DocketSection>

        <Text className={cn(styles.createdDate, "text-market-muted-ink")}>
          Order created {formatCommerceDate(order.createdAt)}
        </Text>
      </View>
    </View>
  )
}

export function OrderDetailDispatchDocketPrimaryAction({
  disabled,
  onPress,
  order,
}: OrderDetailPrimaryActionProps) {
  const marketDay = useMarketDayPalette()
  const insets = useSafeAreaInsets()
  const largeTextLayout = useLargeTextLayout()

  return (
    <VariableContextProvider
      value={{ "--order-action-bottom": Math.max(insets.bottom, 16) }}
    >
      <View
        className={cn(
          styles.primaryAction,
          "bg-market-canvas border-t-market-line pb-[var(--order-action-bottom)]",
        )}
      >
        <View
          className={disabled ? "bg-market-line" : "bg-market-paprika-strong"}
        >
          <ActionButton
            className="min-h-[58px] rounded-none bg-transparent active:bg-transparent"
            contentClassName="translate-y-0"
            disabled={disabled}
            disabledForegroundColor={marketDay.mutedInk}
            foregroundColor={marketDay.onPalm}
            icon="CreditCard"
            iconSize={14}
            labelClassName={styles.primaryActionLabel}
            onPress={onPress}
            testID="order-record-payment-action"
          >
            {largeTextLayout
              ? "Record payment"
              : `Record ${formatOrderDetailMoney(order.balanceDueMinor, order.currencyCode)} payment`}
          </ActionButton>
        </View>
      </View>
    </VariableContextProvider>
  )
}

function DocketSection({
  accessory,
  children,
  title,
}: {
  accessory?: string
  children: ReactNode
  title: string
}) {
  const largeTextLayout = useLargeTextLayout()
  return (
    <View className={styles.section}>
      <View
        className={cn(
          styles.sectionHeading,
          largeTextLayout ? styles.stack : null,
          "border-b-market-line",
        )}
      >
        <DocketLabel>{title}</DocketLabel>
        {accessory ? (
          <Text className={cn(styles.accessory, "text-market-ink")}>
            {accessory}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  )
}

function DocketLabel({
  children,
}: {
  children: ReactNode
}) {
  return <Text className={cn(styles.label, "text-market-ink")}>{children}</Text>
}

function DocketBadge({
  tone,
  label,
}: {
  tone: "marigold" | "palm"
  label: string
}) {
  return (
    <View
      className={cn(
        styles.badge,
        tone === "marigold" ? "bg-market-marigold" : "bg-market-palm",
      )}
    >
      <NativeText
        maxFontSizeMultiplier={DISPLAY_TEXT_FONT_SCALE_CAP}
        className={cn(
          styles.badgeText,
          tone === "marigold"
            ? "text-market-on-marigold"
            : "text-market-on-palm",
        )}
      >
        {label}
      </NativeText>
    </View>
  )
}

function SummaryFact({ label, value }: { label: string; value: string }) {
  const largeTextLayout = useLargeTextLayout()
  return (
    <View className={cn(styles.fact, largeTextLayout && "flex-none")}>
      <Text selectable className={cn(styles.factValue, "text-market-ink")}>
        {value}
      </Text>
      <Text className={cn(styles.factLabel, "text-market-muted-ink")}>
        {label}
      </Text>
    </View>
  )
}

function CustomerRow({
  onPress,
  order,
}: {
  onPress: () => void
  order: CommercialOrder
}) {
  const largeTextLayout = useLargeTextLayout()
  const marketDay = useMarketDayPalette()
  const hasCustomer = Boolean(
    order.customerName || order.customerPhone || order.customerEmail,
  )
  const Wrapper = hasCustomer ? Pressable : View
  const customerName =
    order.customerName ||
    order.customerPhone ||
    order.customerEmail ||
    "Walk-in customer"
  const initials = customerName
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase()

  return (
    <Wrapper
      {...(hasCustomer
        ? {
            accessibilityLabel: "Open customer overview",
            accessibilityRole: "button" as const,
            allowOverflow: largeTextLayout,
            haptic: true,
            onPress,
          }
        : {})}
      className={cn(
        styles.customer,
        largeTextLayout ? styles.customerLargeText : null,
        "border-b-market-line",
      )}
    >
      <View className={cn(styles.avatar, "bg-market-palm")}>
        <NativeText
          maxFontSizeMultiplier={DISPLAY_TEXT_FONT_SCALE_CAP}
          className={cn(styles.avatarText, "text-market-on-palm")}
        >
          {initials || "CU"}
        </NativeText>
      </View>
      <View className={styles.flexCopy}>
        <Text selectable className={cn(styles.rowTitle, "text-market-ink")}>
          {customerName}
        </Text>
        <Text
          numberOfLines={largeTextLayout ? undefined : 2}
          selectable
          className={cn(styles.rowDetail, "text-market-muted-ink")}
        >
          {[order.customerPhone, order.customerEmail]
            .filter(Boolean)
            .join(" · ") || "No customer contact captured"}
        </Text>
      </View>
      {hasCustomer && !largeTextLayout ? (
        <Icon color={marketDay.ink} name="ChevronRight" size={18} />
      ) : null}
    </Wrapper>
  )
}

function DocketLine({
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
  const largeTextLayout = useLargeTextLayout()
  const canFulfill = canFulfillCommercialOrderLine(line)
  const lineDetail = [
    commerceLineOption(line),
    `${formatCommerceQuantity(line.quantity)} × ${formatOrderDetailMoney(line.unitPriceMinor, order.currencyCode)}`,
  ].join(" · ")
  return (
    <View className={cn(styles.line, "border-b-market-line")}>
      <View
        className={cn(styles.lineTop, largeTextLayout ? styles.stack : null)}
      >
        <View className={styles.flexCopy}>
          <Text selectable className={cn(styles.rowTitle, "text-market-ink")}>
            {commerceLineTitle(line)}
          </Text>
          <Text
            selectable
            className={cn(styles.rowDetail, "text-market-muted-ink")}
          >
            {lineDetail}
          </Text>
        </View>
        <Text selectable className={cn(styles.lineMoney, "text-market-ink")}>
          {formatOrderDetailMoney(line.totalMinor, order.currencyCode)}
        </Text>
      </View>
      <Text className={cn(styles.lineKind, "text-market-muted-ink")}>
        {line.kind === "service"
          ? "Service · managed in Service jobs"
          : line.productFulfillments.length > 0
            ? "Product · fulfilled"
            : `Product · ${commerceStatusLabel(line.reservation?.status ?? "not reserved")}`}
      </Text>
      {canFulfill ? (
        <MarketDayActionButton
          disabled={disabled}
          isLoading={isFulfilling}
          loadingLabel="Recording fulfilment"
          onPress={onFulfill}
          tone="palm"
        >
          {largeTextLayout ? "Fulfil line" : "Fulfil product line"}
        </MarketDayActionButton>
      ) : null}
    </View>
  )
}

function MoneyRow({
  emphasized,
  label,
  order,
  prefix = "",
  value,
}: {
  emphasized?: boolean
  label: string
  order: CommercialOrder
  prefix?: string
  value: number
}) {
  return (
    <View className={cn(styles.moneyRow, "border-b-market-line")}>
      <Text
        className={cn(
          emphasized ? styles.rowTitle : styles.rowDetail,
          emphasized ? "text-market-ink" : "text-market-muted-ink",
        )}
      >
        {label}
      </Text>
      <Text
        selectable
        className={cn(
          emphasized ? styles.lineMoney : styles.moneyValue,
          "text-market-ink",
        )}
      >
        {prefix}
        {formatOrderDetailMoney(value, order.currencyCode)}
      </Text>
    </View>
  )
}

function InfoRow({ detail, label }: { detail: string; label: string }) {
  return (
    <View className={cn(styles.infoRow, "border-b-market-line")}>
      <Text selectable className={cn(styles.rowTitle, "text-market-ink")}>
        {label}
      </Text>
      <Text
        selectable
        className={cn(styles.rowDetail, "text-market-muted-ink")}
      >
        {detail}
      </Text>
    </View>
  )
}

const styles = {
  accessory: "text-[10px] font-extrabold uppercase tracking-[1.2px]",
  activity: "flex-row gap-3 border-b-[length:var(--native-hairline)] py-[15px]",
  activityDot: "mt-[7px] h-2 w-2 rounded-[4px]",
  avatar: "h-11 w-11 items-center justify-center rounded-[22px]",
  avatarText: "text-[12px] font-black",
  backButton:
    "h-11 w-11 items-center justify-center rounded-[22px] border-[1.5px]",
  badge: "rounded-[20px] px-[9px] py-2",
  badgeText:
    "text-[8px] font-black uppercase tracking-[0.5px] [-rn-line-height:12]",
  badges: "flex-row shrink flex-wrap gap-[6px]",
  body: "gap-[22px] px-[18px] pt-4",
  createdDate: "pb-2 text-center text-[12px]",
  customer:
    "min-h-[72px] flex-row items-center gap-3 border-b-[length:var(--native-hairline)] py-3",
  customerLargeText: "flex-col items-start",
  fact: "min-w-[128px] flex-1 gap-1",
  factLabel: "text-[10px] uppercase tracking-[0.8px]",
  factValue: "text-[20px] font-black tracking-[-0.4px]",
  flexCopy: "min-w-0 flex-1 gap-[3px]",
  infoRow: "gap-1 border-b-[length:var(--native-hairline)] py-[14px]",
  kicker:
    "text-[9px] font-black uppercase tracking-[1.8px] [-rn-line-height:14]",
  label: "text-[9px] font-black uppercase tracking-[1.7px]",
  line: "gap-[10px] border-b-[length:var(--native-hairline)] py-[14px]",
  lineKind: "text-[11px] font-bold",
  lineMoney: "text-[16px] font-black",
  lineTop: "flex-row items-start gap-4",
  masthead: "min-h-[116px] flex-row items-center gap-[14px] px-[18px] py-5",
  mastheadCopy: "min-w-0 flex-1 gap-[5px]",
  moneyRow:
    "min-h-12 flex-row items-center justify-between gap-4 border-b-[length:var(--native-hairline)] py-[10px]",
  moneyValue: "text-[14px] font-extrabold",
  movementButton:
    "min-h-12 min-w-[84px] items-center justify-center rounded-[24px] px-[18px]",
  movementButtonText:
    "text-[11px] font-black uppercase tracking-[0.6px] [-rn-include-font-padding:false] [-rn-text-align-vertical:center]",
  nextMovement: "flex-row items-center gap-4 py-[15px]",
  orderNumber: "text-[38px] font-black tracking-[-1.3px] [-rn-line-height:42]",
  primaryAction:
    "absolute inset-x-0 bottom-0 z-20 border-t-[length:var(--native-hairline)] px-4 pt-[10px] [-rn-elevation:20]",
  primaryActionLabel:
    "text-[11px] font-black tracking-[0.1px] [-rn-line-height:16]",
  rowDetail: "text-[12px] [-rn-line-height:18]",
  rowTitle: "text-[14px] font-extrabold [-rn-line-height:20]",
  screen: "-mx-6 -mt-6",
  section: "px-[18px]",
  sectionHeading:
    "min-h-[31px] flex-row items-center justify-between gap-3 border-b-[length:var(--native-hairline)] py-2",
  stack: "flex-col items-stretch",
  summary: "-mt-px mx-[18px] border-[1.5px]",
  summaryFacts: "flex-row gap-[18px] p-[14px]",
  summaryMoney: "min-w-[124px] flex-1 gap-[3px]",
  summaryTop: "flex-row items-center justify-between gap-4 border-b p-[14px]",
  timestamp: "mt-[2px] text-[10px] font-bold",
  total: "text-[31px] font-black tracking-[-0.8px] [-rn-line-height:36]",
} as const
