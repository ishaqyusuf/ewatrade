import { ActionButton } from "@/components/mobile/action-button"
import { BrandMark } from "@/components/mobile/brand"
import { whatsAppActionHint } from "@/components/mobile/customer-messages/message-model"
import { useOrderMessageAction } from "@/components/mobile/customer-messages/use-order-message"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { useAuthContext } from "@/hooks/use-auth"
import { useColorScheme } from "@/hooks/use-color"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { isSalesRepRole } from "@/lib/mobile-roles"
import {
  type OperationSuccessParams,
  type OutcomeExit,
  exitOutcome,
  rebaseOutcomeOnHome,
} from "@/lib/operation-success-navigation"
import { useRoute } from "@react-navigation/native"
import { useNavigation } from "expo-router"
import { useEffect, useId, useRef, useState } from "react"
import { Text as NativeText, StyleSheet, View } from "react-native"
import Animated, {
  Easing,
  FadeIn,
  ReduceMotion,
  SlideInDown,
} from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg"

const whole = (value?: string) => value?.replace(/\.00(?=\D*$)/, "")

const PAYMENT: Record<string, string> = {
  paid: "Paid in full",
  partially_paid: "Part payment",
  pending: "Payment pending",
}
const METHOD: Record<string, string> = {
  bank_transfer: "Transfer",
  cash: "Cash",
  pos: "POS",
}

/**
 * Create sale success (01, owner revision 9 Oct 2026): a bottom sheet that
 * rises over the confirmed checkout instead of replacing the screen.
 */
export function ClassicSaleSuccessSheet({
  params,
}: {
  params: OperationSuccessParams
}) {
  const navigation = useNavigation()
  const route = useRoute()
  const { profile } = useAuthContext()
  const salesRep = isSalesRepRole(profile?.role)
  // Completed sale: history becomes Home + this checkout (same route key), so
  // back, swipe and close reach Home; every action below replaces both.
  const rebased = useRef(false)
  useEffect(() => {
    if (rebased.current) return
    rebased.current = true
    rebaseOutcomeOnHome(
      navigation,
      { key: route.key, name: route.name, params: route.params },
      { salesRep },
    )
  }, [navigation, route.key, route.name, route.params, salesRep])
  const leave = (exit: OutcomeExit) =>
    exitOutcome(navigation, exit, { salesRep })
  const insets = useSafeAreaInsets()
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const gradientId = `sale-success-${useId().replace(/:/g, "")}`
  const [size, setSize] = useState({ height: 0, width: 0 })
  const queued = params.status === "queued"
  const fg = palette.heroForeground
  const muted = palette.heroMuted
  const items = Number(params.itemCount ?? "0")
  const itemsLabel = `${items} ${items === 1 ? "item" : "items"}${
    params.unitCount
      ? ` · ${params.unitCount} ${params.unitCount === "1" ? "unit" : "units"}`
      : ""
  }`
  const payment = [
    params.paymentState ? PAYMENT[params.paymentState] : undefined,
    params.paymentState !== "pending" && params.paymentMethod
      ? METHOD[params.paymentMethod]
      : undefined,
  ]
    .filter(Boolean)
    .join(" · ")
  const rows: Array<[string, string, boolean?]> = [
    [
      "Customer",
      params.customer && params.customer !== "Guest customer"
        ? params.customer
        : "Walk-in customer",
    ],
    ["Items", itemsLabel],
    ...(payment ? [["Payment", payment] as [string, string]] : []),
    // Where the money went, so it can be checked against the account.
    ...(params.moneyAccount && params.paymentState !== "pending"
      ? [
          // Queued money isn't recorded yet: it's where it will go.
          [queued ? "Into, once synced" : "Into", params.moneyAccount] as [
            string,
            string,
          ],
        ]
      : []),
    ...(params.balance && params.paymentState !== "paid"
      ? [
          ["Balance due", whole(params.balance) ?? "", true] as [
            string,
            string,
            boolean,
          ],
        ]
      : []),
  ]

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Animated.View
        entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)}
        style={[StyleSheet.absoluteFill, { backgroundColor: palette.scrim }]}
      />
      <Animated.View
        accessibilityViewIsModal
        accessibilityLabel={queued ? "Order queued" : "Sale recorded"}
        entering={SlideInDown.duration(320)
          .easing(Easing.out(Easing.cubic))
          .reduceMotion(ReduceMotion.System)}
        onLayout={(event) => {
          const { height, width } = event.nativeEvent.layout
          setSize((current) =>
            current.height === height && current.width === width
              ? current
              : { height, width },
          )
        }}
        style={[
          styles.sheet,
          { paddingBottom: Math.max(insets.bottom, 16) + 10 },
        ]}
        testID="sale-success-sheet"
      >
        <View style={[StyleSheet.absoluteFill, styles.clip]}>
          <Svg height={size.height} width={size.width}>
            <Defs>
              <RadialGradient
                cx="100%"
                cy="0%"
                id={gradientId}
                rx="130%"
                ry="120%"
              >
                <Stop
                  offset="0"
                  stopColor={
                    queued ? palette.queuedHighlight : palette.heroHighlight
                  }
                />
                <Stop
                  offset="0.4"
                  stopColor={queued ? palette.queuedFrom : palette.heroFrom}
                />
                <Stop
                  offset="1"
                  stopColor={queued ? palette.queuedTo : palette.heroTo}
                />
              </RadialGradient>
            </Defs>
            <Rect fill={`url(#${gradientId})`} height="100%" width="100%" />
          </Svg>
          <View pointerEvents="none" style={styles.watermark}>
            <BrandMark color={palette.heroWatermark} size={210} />
          </View>
        </View>
        <View style={[styles.grab, { backgroundColor: palette.heroLine }]} />
        <View style={styles.head}>
          <View
            style={[
              styles.check,
              { backgroundColor: queued ? palette.gold : fg },
            ]}
          >
            <Icon
              className="size-[28px]"
              color={queued ? palette.goldForeground : palette.heroTo}
              name={queued ? "Clock" : "Check"}
              strokeWidth={2.6}
            />
          </View>
          <View style={styles.headText}>
            <NativeText style={[styles.kicker, { color: muted }]}>
              {queued
                ? "Saved on this device · waiting to sync"
                : `${params.reference ? `${params.reference} · ` : ""}just now`}
            </NativeText>
            <NativeText
              accessibilityRole="header"
              style={[styles.title, { color: fg }]}
            >
              {queued ? "Order queued" : "Sale recorded"}
            </NativeText>
          </View>
        </View>
        <NativeText
          maxFontSizeMultiplier={1.4}
          style={[styles.amount, { color: fg }]}
        >
          {whole(params.amount)}
        </NativeText>
        <View style={[styles.rows, { borderColor: palette.heroLine }]}>
          {rows.map(([label, value, gold]) => (
            <View
              key={label}
              style={[styles.row, { borderColor: palette.heroLine }]}
            >
              <NativeText style={[styles.rowLabel, { color: muted }]}>
                {label}
              </NativeText>
              <NativeText
                style={[styles.rowValue, { color: gold ? palette.gold : fg }]}
              >
                {value}
              </NativeText>
            </View>
          ))}
        </View>
        <View style={styles.newSale}>
          <ActionButton
            tone="gold"
            icon="Plus"
            onPress={() =>
              leave({
                to: "new-sale",
                service: params.saleKind === "service",
              })
            }
          >
            New sale
          </ActionButton>
        </View>
        <View style={styles.actions}>
          <Pressable
            accessibilityLabel={
              queued ? "Receipt available after sync" : "Receipt"
            }
            accessibilityRole="button"
            accessibilityState={{ disabled: queued || !params.orderId }}
            disabled={queued || !params.orderId}
            haptic
            onPress={() => {
              if (params.orderId && !queued)
                leave({ to: "receipt", orderId: params.orderId })
            }}
            style={[
              styles.ghost,
              {
                backgroundColor: palette.heroChip,
                opacity: queued ? 0.5 : 1,
              },
            ]}
          >
            <Icon className="size-[17px]" color={fg} name="Share" />
            <NativeText style={[styles.ghostLabel, { color: fg }]}>
              {queued ? "After sync" : "Receipt"}
            </NativeText>
          </Pressable>
          <Pressable
            accessibilityLabel={queued ? "Sync status" : "View order"}
            accessibilityRole="button"
            haptic
            onPress={() => {
              if (queued) leave({ to: "sync-status" })
              else if (params.orderId)
                leave({ to: "order", orderId: params.orderId })
            }}
            style={[styles.ghost, { backgroundColor: palette.heroChip }]}
          >
            <Icon
              className="size-[17px]"
              color={fg}
              name={queued ? "RefreshCw" : "ReceiptText"}
            />
            <NativeText style={[styles.ghostLabel, { color: fg }]}>
              {queued ? "Sync status" : "View order"}
            </NativeText>
          </Pressable>
          {!queued && params.orderId ? (
            <WhatsAppPill
              onOpen={() => {
                if (params.orderId)
                  leave({
                    to: "customer-message",
                    orderId: params.orderId,
                    eventKey: "order.recorded",
                  })
              }}
              orderId={params.orderId}
            />
          ) : null}
        </View>
        <Pressable
          accessibilityLabel="Go to home"
          accessibilityRole="button"
          haptic
          onPress={() => leave({ to: "home" })}
          style={styles.home}
        >
          <NativeText style={[styles.homeLabel, { color: muted }]}>
            Go to home
          </NativeText>
        </Pressable>
      </Animated.View>
    </View>
  )
}

/**
 * Tell the customer: only for a recorded Order (never a queued sale). The
 * server hides it without a phone; bright icon means wording is ready.
 */
function WhatsAppPill({
  orderId,
  onOpen,
}: {
  orderId: string
  /** Leave the outcome for the composer (history Home → message). */
  onOpen: () => void
}) {
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const fg = palette.heroForeground
  const action = useOrderMessageAction({
    target: { orderId, eventKey: "order.recorded" },
    hasPhone: true,
  })
  if (action.state.kind === "hidden") return null
  const ready = action.state.kind === "ready"
  return (
    <Pressable
      accessibilityLabel={`WhatsApp: ${whatsAppActionHint(action.state)}`}
      accessibilityRole="button"
      accessibilityState={{ disabled: action.state.kind === "loading" }}
      disabled={action.state.kind === "loading"}
      haptic
      // A failed preview only retries and loading is inert; every other
      // state opens the protected composer (which explains blocked, invalid
      // phone and similar), leaving Sales recorded first.
      onPress={
        action.state.kind === "error"
          ? action.retry
          : action.state.kind === "loading"
            ? undefined
            : onOpen
      }
      style={[styles.ghost, { backgroundColor: palette.heroChip }]}
    >
      <Icon
        className="size-[17px]"
        color={ready ? palette.heroUp : palette.heroMuted}
        name="WhatsApp"
      />
      <NativeText style={[styles.ghostLabel, { color: fg }]}>
        WhatsApp
      </NativeText>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", gap: 10, marginTop: 10 },
  amount: {
    fontSize: 34,
    fontVariant: ["tabular-nums"],
    fontWeight: "800",
    letterSpacing: -1.2,
    marginTop: 12,
  },
  check: {
    alignItems: "center",
    borderRadius: 999,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  clip: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
  },
  ghost: {
    alignItems: "center",
    borderRadius: 14,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    height: 46,
    justifyContent: "center",
  },
  ghostLabel: { fontSize: 16, fontWeight: "800" },
  grab: {
    alignSelf: "center",
    borderRadius: 5,
    height: 5,
    marginBottom: 12,
    width: 40,
  },
  head: { alignItems: "center", flexDirection: "row", gap: 14 },
  headText: { flex: 1, minWidth: 0 },
  home: { alignItems: "center", minHeight: 44, justifyContent: "center" },
  homeLabel: { fontSize: 16, fontWeight: "700" },
  kicker: { fontSize: 16, fontWeight: "700" },
  newSale: { marginTop: 14 },
  row: {
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    paddingVertical: 9,
  },
  rowLabel: { fontSize: 16 },
  rowValue: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "right",
  },
  rows: { borderTopWidth: 1, marginTop: 10 },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    bottom: 0,
    left: 0,
    paddingHorizontal: 18,
    paddingTop: 10,
    position: "absolute",
    right: 0,
  },
  title: { fontSize: 22, fontWeight: "800", letterSpacing: -0.6 },
  watermark: { position: "absolute", right: -40, top: 30 },
})
