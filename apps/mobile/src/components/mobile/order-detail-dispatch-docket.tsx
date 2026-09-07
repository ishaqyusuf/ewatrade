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
import {
  formatOrderDetailMoney,
  getOrderDetailDispatchDocketPresentation,
} from "@/lib/order-detail-dispatch-docket"
import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { Text as NativeText, StyleSheet, View } from "react-native"
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
} from "./commerce/commerce-model"
import {
  type CommercialOrderActivity,
  canFulfillCommercialOrderLine,
  getCommercialOrderOverviewSummary,
} from "./commerce/commercial-order-overview-model"

type Props = {
  activity: CommercialOrderActivity[]
  businessName: string
  error: string | null
  fulfillingOrderLineId?: string
  isFulfillingAll: boolean
  isOffline: boolean
  notice: string | null
  onBack: () => void
  onFulfillAll: () => void
  onFulfillLine: (orderLineId: string) => void
  onMastheadHeightChange?: (height: number) => void
  onOpenCustomer: () => void
  order: CommercialOrder
}

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
}: Props) {
  const marketDay = useMarketDayPalette()
  const largeTextLayout = useLargeTextLayout()
  const summary = getCommercialOrderOverviewSummary(order)
  const [fulfillmentClock, setFulfillmentClock] = useState(Date.now())
  const presentation = getOrderDetailDispatchDocketPresentation(
    order,
    fulfillmentClock,
  )
  const deliveryDueTime = presentation.fulfillmentUnlockAtMs
  const fulfillmentScheduledForFuture =
    presentation.fulfillmentScheduledForFuture

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
    <View style={styles.screen} testID="order-detail-dispatch-docket">
      <View
        onLayout={(event) =>
          onMastheadHeightChange?.(event.nativeEvent.layout.height)
        }
        style={[styles.masthead, { backgroundColor: marketDay.marigold }]}
        testID="order-detail-docket-masthead"
      >
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          haptic
          onPress={onBack}
          style={({ pressed }) => [
            styles.backButton,
            {
              backgroundColor: pressed
                ? marketDay.onMarigoldPressed
                : "transparent",
              borderColor: marketDay.onMarigold,
            },
          ]}
        >
          <Icon color={marketDay.onMarigold} name="ArrowLeft" size={20} />
        </Pressable>
        <View style={styles.mastheadCopy}>
          <Text
            maxFontSizeMultiplier={DISPLAY_TEXT_FONT_SCALE_CAP}
            style={[styles.kicker, { color: marketDay.onMarigold }]}
          >
            {businessName.toUpperCase()} · ORDER DOCKET
          </Text>
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={DISPLAY_TEXT_FONT_SCALE_CAP}
            selectable
            style={[styles.orderNumber, { color: marketDay.onMarigold }]}
          >
            {order.orderNumber}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.summary,
          {
            backgroundColor: marketDay.docketPaper,
            borderColor: marketDay.ink,
          },
        ]}
        testID="order-detail-docket-summary"
      >
        <View
          style={[
            styles.summaryTop,
            largeTextLayout ? styles.stack : null,
            { borderBottomColor: marketDay.docketRule },
          ]}
        >
          <View style={styles.summaryMoney}>
            <DocketLabel color={marketDay.ink}>Total order</DocketLabel>
            <Text
              maxFontSizeMultiplier={DISPLAY_TEXT_FONT_SCALE_CAP}
              selectable
              style={[styles.total, { color: marketDay.ink }]}
            >
              {presentation.totalLabel}
            </Text>
          </View>
          <View style={styles.badges}>
            <DocketBadge
              background={marketDay.marigold}
              color={marketDay.onMarigold}
              label={presentation.paymentLabel}
            />
            <DocketBadge
              background={marketDay.palm}
              color={marketDay.onPalm}
              label={presentation.statusLabel}
            />
          </View>
        </View>
        <View
          style={[styles.summaryFacts, largeTextLayout ? styles.stack : null]}
        >
          <SummaryFact label="Balance due" value={presentation.balanceLabel} />
          <SummaryFact
            label={`${presentation.lineLabel} · ${presentation.fulfillmentLabel}`}
            value={presentation.itemLabel}
          />
        </View>
      </View>

      <View style={styles.body}>
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
            style={[styles.nextMovement, largeTextLayout ? styles.stack : null]}
          >
            <View style={styles.flexCopy}>
              <Text
                selectable
                style={[styles.rowTitle, { color: marketDay.ink }]}
              >
                {presentation.nextMovement.label}
              </Text>
              <Text
                selectable
                style={[styles.rowDetail, { color: marketDay.mutedInk }]}
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
                style={({ pressed }) => [
                  styles.movementButton,
                  {
                    backgroundColor:
                      isOffline ||
                      fulfillmentScheduledForFuture ||
                      isFulfillingAll
                        ? marketDay.line
                        : pressed
                          ? marketDay.paprikaPressed
                          : marketDay.palm,
                  },
                ]}
              >
                <NativeText
                  style={[
                    styles.movementButtonText,
                    { color: marketDay.onPalm },
                  ]}
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
              style={[styles.activity, { borderBottomColor: marketDay.line }]}
            >
              <View
                style={[
                  styles.activityDot,
                  { backgroundColor: marketDay.paprika },
                ]}
              />
              <View style={styles.flexCopy}>
                <Text
                  selectable
                  style={[styles.rowTitle, { color: marketDay.ink }]}
                >
                  {event.label}
                </Text>
                <Text
                  selectable
                  style={[styles.rowDetail, { color: marketDay.mutedInk }]}
                >
                  {event.detail}
                </Text>
                <Text
                  selectable
                  style={[styles.timestamp, { color: marketDay.mutedInk }]}
                >
                  {event.time}
                </Text>
              </View>
            </View>
          ))}
        </DocketSection>

        <Text style={[styles.createdDate, { color: marketDay.mutedInk }]}>
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
}: {
  disabled: boolean
  onPress: () => void
  order: CommercialOrder
}) {
  const insets = useSafeAreaInsets()
  const marketDay = useMarketDayPalette()
  const largeTextLayout = useLargeTextLayout()

  return (
    <View
      style={[
        styles.primaryAction,
        {
          backgroundColor: marketDay.canvas,
          borderTopColor: marketDay.line,
          paddingBottom: Math.max(insets.bottom, 16),
        },
      ]}
    >
      <View
        style={{
          backgroundColor: disabled ? marketDay.line : marketDay.paprikaStrong,
        }}
      >
        <ActionButton
          className="min-h-[58px] rounded-none bg-transparent active:bg-transparent"
          contentClassName="translate-y-0"
          disabled={disabled}
          disabledForegroundColor={marketDay.mutedInk}
          foregroundColor={marketDay.onPalm}
          icon="CreditCard"
          iconSize={14}
          labelStyle={styles.primaryActionLabel}
          onPress={onPress}
          testID="order-record-payment-action"
        >
          {largeTextLayout
            ? "Record payment"
            : `Record ${formatOrderDetailMoney(order.balanceDueMinor, order.currencyCode)} payment`}
        </ActionButton>
      </View>
    </View>
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
  const marketDay = useMarketDayPalette()
  const largeTextLayout = useLargeTextLayout()
  return (
    <View style={styles.section}>
      <View
        style={[
          styles.sectionHeading,
          largeTextLayout ? styles.stack : null,
          { borderBottomColor: marketDay.line },
        ]}
      >
        <DocketLabel color={marketDay.ink}>{title}</DocketLabel>
        {accessory ? (
          <Text style={[styles.accessory, { color: marketDay.ink }]}>
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
  color,
}: {
  children: ReactNode
  color: string
}) {
  return <Text style={[styles.label, { color }]}>{children}</Text>
}

function DocketBadge({
  background,
  color,
  label,
}: {
  background: string
  color: string
  label: string
}) {
  return (
    <View style={[styles.badge, { backgroundColor: background }]}>
      <NativeText
        maxFontSizeMultiplier={DISPLAY_TEXT_FONT_SCALE_CAP}
        style={[styles.badgeText, { color }]}
      >
        {label}
      </NativeText>
    </View>
  )
}

function SummaryFact({ label, value }: { label: string; value: string }) {
  const marketDay = useMarketDayPalette()
  return (
    <View style={styles.fact}>
      <Text selectable style={[styles.factValue, { color: marketDay.ink }]}>
        {value}
      </Text>
      <Text style={[styles.factLabel, { color: marketDay.mutedInk }]}>
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
  const marketDay = useMarketDayPalette()
  const largeTextLayout = useLargeTextLayout()
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
      style={[
        styles.customer,
        largeTextLayout ? styles.customerLargeText : null,
        { borderBottomColor: marketDay.line },
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: marketDay.palm }]}>
        <NativeText
          maxFontSizeMultiplier={DISPLAY_TEXT_FONT_SCALE_CAP}
          style={[styles.avatarText, { color: marketDay.onPalm }]}
        >
          {initials || "CU"}
        </NativeText>
      </View>
      <View style={styles.flexCopy}>
        <Text selectable style={[styles.rowTitle, { color: marketDay.ink }]}>
          {customerName}
        </Text>
        <Text
          numberOfLines={largeTextLayout ? undefined : 2}
          selectable
          style={[styles.rowDetail, { color: marketDay.mutedInk }]}
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
  const marketDay = useMarketDayPalette()
  const largeTextLayout = useLargeTextLayout()
  const canFulfill = canFulfillCommercialOrderLine(line)
  const lineDetail = [
    commerceLineOption(line),
    `${formatCommerceQuantity(line.quantity)} × ${formatOrderDetailMoney(line.unitPriceMinor, order.currencyCode)}`,
  ].join(" · ")
  return (
    <View style={[styles.line, { borderBottomColor: marketDay.line }]}>
      <View style={[styles.lineTop, largeTextLayout ? styles.stack : null]}>
        <View style={styles.flexCopy}>
          <Text selectable style={[styles.rowTitle, { color: marketDay.ink }]}>
            {commerceLineTitle(line)}
          </Text>
          <Text
            selectable
            style={[styles.rowDetail, { color: marketDay.mutedInk }]}
          >
            {lineDetail}
          </Text>
        </View>
        <Text selectable style={[styles.lineMoney, { color: marketDay.ink }]}>
          {formatOrderDetailMoney(line.totalMinor, order.currencyCode)}
        </Text>
      </View>
      <Text style={[styles.lineKind, { color: marketDay.mutedInk }]}>
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
  const marketDay = useMarketDayPalette()
  return (
    <View style={[styles.moneyRow, { borderBottomColor: marketDay.line }]}>
      <Text
        style={[
          emphasized ? styles.rowTitle : styles.rowDetail,
          { color: emphasized ? marketDay.ink : marketDay.mutedInk },
        ]}
      >
        {label}
      </Text>
      <Text
        selectable
        style={[
          emphasized ? styles.lineMoney : styles.moneyValue,
          { color: marketDay.ink },
        ]}
      >
        {prefix}
        {formatOrderDetailMoney(value, order.currencyCode)}
      </Text>
    </View>
  )
}

function InfoRow({ detail, label }: { detail: string; label: string }) {
  const marketDay = useMarketDayPalette()
  return (
    <View style={[styles.infoRow, { borderBottomColor: marketDay.line }]}>
      <Text selectable style={[styles.rowTitle, { color: marketDay.ink }]}>
        {label}
      </Text>
      <Text
        selectable
        style={[styles.rowDetail, { color: marketDay.mutedInk }]}
      >
        {detail}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  accessory: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  activity: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    paddingVertical: 15,
  },
  activityDot: { borderRadius: 4, height: 8, marginTop: 7, width: 8 },
  avatar: {
    alignItems: "center",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  avatarText: { fontSize: 12, fontWeight: "900" },
  backButton: {
    alignItems: "center",
    borderRadius: 22,
    borderWidth: 1.5,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  badge: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 8 },
  badgeText: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.5,
    lineHeight: 12,
    textTransform: "uppercase",
  },
  badges: {
    flexDirection: "row",
    flexShrink: 1,
    flexWrap: "wrap",
    gap: 6,
  },
  body: { gap: 22, paddingHorizontal: 18, paddingTop: 16 },
  createdDate: { fontSize: 12, paddingBottom: 8, textAlign: "center" },
  customer: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    minHeight: 72,
    paddingVertical: 12,
  },
  customerLargeText: {
    alignItems: "flex-start",
    flexDirection: "column",
  },
  fact: { flex: 1, gap: 4, minWidth: 128 },
  factLabel: { fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase" },
  factValue: { fontSize: 20, fontWeight: "900", letterSpacing: -0.4 },
  flexCopy: { flex: 1, gap: 3, minWidth: 0 },
  infoRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
    paddingVertical: 14,
  },
  kicker: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.8,
    lineHeight: 14,
    textTransform: "uppercase",
  },
  label: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.7,
    textTransform: "uppercase",
  },
  line: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
    paddingVertical: 14,
  },
  lineKind: { fontSize: 11, fontWeight: "700" },
  lineMoney: { fontSize: 16, fontWeight: "900" },
  lineTop: { alignItems: "flex-start", flexDirection: "row", gap: 16 },
  masthead: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    minHeight: 116,
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  mastheadCopy: { flex: 1, gap: 5, minWidth: 0 },
  moneyRow: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 16,
    justifyContent: "space-between",
    minHeight: 48,
    paddingVertical: 10,
  },
  moneyValue: { fontSize: 14, fontWeight: "800" },
  movementButton: {
    alignItems: "center",
    borderRadius: 24,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 84,
    paddingHorizontal: 18,
  },
  movementButtonText: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  nextMovement: {
    alignItems: "center",
    flexDirection: "row",
    gap: 16,
    paddingVertical: 15,
  },
  orderNumber: {
    fontSize: 38,
    fontWeight: "900",
    letterSpacing: -1.3,
    lineHeight: 42,
  },
  primaryAction: {
    borderTopWidth: StyleSheet.hairlineWidth,
    bottom: 0,
    elevation: 20,
    left: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    position: "absolute",
    right: 0,
    zIndex: 20,
  },
  primaryActionLabel: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.1,
    lineHeight: 16,
  },
  rowDetail: { fontSize: 12, lineHeight: 18 },
  rowTitle: { fontSize: 14, fontWeight: "800", lineHeight: 20 },
  screen: { marginHorizontal: -24, marginTop: -24 },
  section: { paddingHorizontal: 18 },
  sectionHeading: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    minHeight: 31,
    paddingVertical: 8,
  },
  stack: { alignItems: "stretch", flexDirection: "column" },
  summary: { borderWidth: 1.5, marginHorizontal: 18, marginTop: -1 },
  summaryFacts: { flexDirection: "row", gap: 18, padding: 14 },
  summaryMoney: { flex: 1, gap: 3, minWidth: 124 },
  summaryTop: {
    alignItems: "center",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 16,
    justifyContent: "space-between",
    padding: 14,
  },
  timestamp: { fontSize: 10, fontWeight: "700", marginTop: 2 },
  total: {
    fontSize: 31,
    fontWeight: "900",
    letterSpacing: -0.8,
    lineHeight: 36,
  },
})
