import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { DISPLAY_TEXT_FONT_SCALE_CAP } from "@/lib/mobile-accessibility-layout"
import type { ReactNode } from "react"
import { StyleSheet, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

type SalesRepShiftLedgerHeroProps = {
  businessName: string
  cue: string
  greetingName: string
  hasNotification?: boolean
  onBusinessPress: () => void
  onNotificationPress: () => void
  onSearchPress?: () => void
}

export function SalesRepShiftLedgerHero({
  businessName,
  cue,
  greetingName,
  hasNotification = false,
  onBusinessPress,
  onNotificationPress,
  onSearchPress,
}: SalesRepShiftLedgerHeroProps) {
  const insets = useSafeAreaInsets()
  const largeTextLayout = useLargeTextLayout()
  const marketDay = useMarketDayPalette()

  return (
    <View
      style={[
        styles.hero,
        {
          backgroundColor: marketDay.marigold,
          borderBottomColor: marketDay.paprika,
          paddingTop: insets.top + 8,
        },
      ]}
      testID="sales-rep-shift-ledger-hero"
    >
      <View style={styles.heroTopRow}>
        <Pressable
          accessibilityHint="Opens Business switching"
          accessibilityLabel={`${businessName}, switch Business`}
          accessibilityRole="button"
          haptic
          hitSlop={4}
          onPress={onBusinessPress}
          style={({ pressed }) => [
            styles.businessButton,
            { opacity: pressed ? 0.68 : 1 },
          ]}
        >
          <Text
            numberOfLines={largeTextLayout ? 2 : 1}
            style={[
              styles.businessName,
              largeTextLayout ? styles.businessNameLargeText : null,
              { color: marketDay.onMarigold },
            ]}
          >
            {businessName}
          </Text>
          <Icon color={marketDay.onMarigold} name="ChevronDown" size={15} />
        </Pressable>

        <View
          style={[
            styles.heroActions,
            { borderColor: marketDay.onMarigoldHairline },
          ]}
        >
          <HeroAction
            accessibilityLabel={
              hasNotification
                ? "Open sync status, items need attention"
                : "Open sync status"
            }
            hasBadge={hasNotification}
            icon="Bell"
            onPress={onNotificationPress}
          />
          <HeroAction
            accessibilityLabel={
              onSearchPress
                ? "Open global search"
                : "Search unavailable offline"
            }
            disabled={!onSearchPress}
            icon="Search"
            onPress={onSearchPress}
          />
        </View>
      </View>

      <View
        style={[
          styles.greetingRow,
          largeTextLayout ? styles.greetingRowLargeText : null,
        ]}
      >
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={DISPLAY_TEXT_FONT_SCALE_CAP}
          style={[styles.greeting, { color: marketDay.onMarigold }]}
        >
          Good morning,{"\n"}
          {greetingName}.
        </Text>
        <Text
          style={[
            styles.heroCue,
            largeTextLayout ? styles.heroCueLargeText : null,
            {
              borderColor: marketDay.onMarigoldDivider,
              color: marketDay.onMarigold,
            },
          ]}
        >
          {cue}
        </Text>
      </View>
    </View>
  )
}

function HeroAction({
  accessibilityLabel,
  disabled = false,
  hasBadge = false,
  icon,
  onPress,
}: {
  accessibilityLabel: string
  disabled?: boolean
  hasBadge?: boolean
  icon: IconKeys
  onPress?: () => void
}) {
  const marketDay = useMarketDayPalette()

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      haptic={!disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.heroAction,
        {
          backgroundColor: pressed
            ? marketDay.onMarigoldPressed
            : "transparent",
          borderColor: marketDay.onMarigoldHairline,
          opacity: disabled ? 0.42 : 1,
        },
      ]}
    >
      <Icon color={marketDay.onMarigold} name={icon} size={20} />
      {hasBadge ? (
        <View
          style={[
            styles.notificationBadge,
            {
              backgroundColor: marketDay.paprika,
              borderColor: marketDay.marigold,
            },
          ]}
        />
      ) : null}
    </Pressable>
  )
}

type SalesRepShiftLedgerOverviewProps = {
  catalogFactDetail: string
  catalogFactValue: string
  onCloseoutPress: () => void
  onCustomerBookPress?: () => void
  onStartSalePress: () => void
  onSyncPress: () => void
  readinessLabel: string
  recentOrderCount: string
  recentOrderValue: string
  saleActionDetail: string
  saleActionDisabled: boolean
  saleActionLabel: string
  syncLabel: string
  syncTone: "attention" | "ready"
}

export function SalesRepShiftLedgerOverview({
  catalogFactDetail,
  catalogFactValue,
  onCloseoutPress,
  onCustomerBookPress,
  onStartSalePress,
  onSyncPress,
  readinessLabel,
  recentOrderCount,
  recentOrderValue,
  saleActionDetail,
  saleActionDisabled,
  saleActionLabel,
  syncLabel,
  syncTone,
}: SalesRepShiftLedgerOverviewProps) {
  const largeTextLayout = useLargeTextLayout()
  const marketDay = useMarketDayPalette()
  const rowActions = [
    ...(onCustomerBookPress
      ? [
          {
            detail: "Find a returning buyer or add one",
            label: "Customer book",
            onPress: onCustomerBookPress,
          },
        ]
      : []),
    {
      detail: "Count stock and declare payments",
      label: "Daily closeout",
      onPress: onCloseoutPress,
    },
    {
      detail: syncTone === "attention" ? syncLabel : "Everything has been sent",
      label: "Sync status",
      onPress: onSyncPress,
    },
  ]

  return (
    <View style={styles.ledger} testID="sales-rep-shift-ledger-overview">
      <View
        style={[
          styles.metaRow,
          largeTextLayout ? styles.metaRowLargeText : null,
          { borderBottomColor: marketDay.ink },
        ]}
      >
        <Text
          style={[
            styles.metaLabel,
            largeTextLayout ? styles.metaLabelLargeText : null,
            { color: marketDay.ink },
          ]}
        >
          {readinessLabel.toUpperCase()}
        </Text>
        <View
          style={[
            styles.syncLabelRow,
            largeTextLayout ? styles.syncLabelRowLargeText : null,
          ]}
        >
          <View
            style={[
              styles.syncDot,
              {
                backgroundColor:
                  syncTone === "attention"
                    ? marketDay.marigold
                    : marketDay.accentInk,
              },
            ]}
          />
          <Text
            style={[
              styles.syncLabel,
              largeTextLayout ? styles.syncLabelLargeText : null,
              {
                color: marketDay.accentInk,
              },
            ]}
          >
            {syncLabel}
          </Text>
        </View>
      </View>

      <Pressable
        accessibilityHint={saleActionDetail}
        accessibilityLabel={saleActionLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled: saleActionDisabled }}
        disabled={saleActionDisabled}
        haptic={!saleActionDisabled}
        onPress={onStartSalePress}
        style={({ pressed }) => [
          styles.saleTicket,
          largeTextLayout ? styles.saleTicketLargeText : null,
          {
            borderBottomColor: marketDay.line,
            opacity: saleActionDisabled ? 0.48 : pressed ? 0.72 : 1,
          },
        ]}
        testID="sales-rep-shift-ledger-start-sale"
      >
        <View
          style={[
            styles.ticketMark,
            {
              borderColor: marketDay.paprika,
              backgroundColor: marketDay.paprikaWash,
            },
          ]}
        >
          {largeTextLayout ? (
            <Icon color={marketDay.paprika} name="ReceiptText" size={22} />
          ) : (
            <Text
              maxFontSizeMultiplier={DISPLAY_TEXT_FONT_SCALE_CAP}
              style={[styles.ticketMarkText, { color: marketDay.paprika }]}
            >
              NEXT{"\n"}SALE
            </Text>
          )}
        </View>
        <View style={styles.saleCopy}>
          <Text
            style={[
              styles.saleTitle,
              largeTextLayout ? styles.saleTitleLargeText : null,
              { color: marketDay.ink },
            ]}
          >
            {saleActionLabel}
          </Text>
          <Text
            style={[
              styles.saleDetail,
              largeTextLayout ? styles.saleDetailLargeText : null,
              { color: marketDay.mutedInk },
            ]}
          >
            {saleActionDetail}
          </Text>
        </View>
        <Icon color={marketDay.paprika} name="ChevronRight" size={24} />
      </Pressable>

      <View
        style={[
          styles.facts,
          largeTextLayout ? styles.factsLargeText : null,
          { borderColor: marketDay.ink },
        ]}
      >
        <LedgerFact
          detail="Latest orders loaded"
          label="Recent sales"
          value={recentOrderCount}
        />
        <LedgerFact
          detail={catalogFactDetail}
          label="Sellable catalog"
          value={catalogFactValue}
        />
        <LedgerFact
          detail="Across loaded sales"
          label="Recent value"
          last
          value={recentOrderValue}
        />
      </View>

      <View>
        {rowActions.map((action, index) => (
          <LedgerActionRow
            detail={action.detail}
            index={index + 1}
            key={action.label}
            label={action.label}
            onPress={action.onPress}
          />
        ))}
      </View>
    </View>
  )
}

function LedgerFact({
  detail,
  label,
  last = false,
  value,
}: {
  detail: string
  label: string
  last?: boolean
  value: string
}) {
  const largeTextLayout = useLargeTextLayout()
  const marketDay = useMarketDayPalette()

  return (
    <View
      style={[
        styles.fact,
        largeTextLayout ? styles.factLargeText : null,
        {
          borderBottomColor: marketDay.line,
          borderRightColor: marketDay.line,
          borderRightWidth:
            last || largeTextLayout ? 0 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      <Text
        maxFontSizeMultiplier={DISPLAY_TEXT_FONT_SCALE_CAP}
        style={[
          styles.factValue,
          largeTextLayout ? styles.factValueLargeText : null,
          { color: marketDay.ink },
        ]}
      >
        {value}
      </Text>
      <View style={styles.factCopy}>
        <Text style={[styles.factLabel, { color: marketDay.ink }]}>
          {label}
        </Text>
        <Text
          style={[
            styles.factDetail,
            largeTextLayout ? styles.factDetailLargeText : null,
            { color: marketDay.mutedInk },
          ]}
        >
          {detail}
        </Text>
      </View>
    </View>
  )
}

function LedgerActionRow({
  detail,
  index,
  label,
  onPress,
}: {
  detail: string
  index: number
  label: string
  onPress: () => void
}) {
  const largeTextLayout = useLargeTextLayout()
  const marketDay = useMarketDayPalette()

  return (
    <Pressable
      accessibilityHint={detail}
      accessibilityLabel={label}
      accessibilityRole="button"
      haptic
      onPress={onPress}
      style={({ pressed }) => [
        styles.ledgerAction,
        largeTextLayout ? styles.ledgerActionLargeText : null,
        {
          backgroundColor: pressed ? `${marketDay.palm}0D` : "transparent",
          borderBottomColor: marketDay.line,
        },
      ]}
    >
      <Text
        maxFontSizeMultiplier={DISPLAY_TEXT_FONT_SCALE_CAP}
        style={[
          styles.rowIndex,
          largeTextLayout ? styles.rowIndexLargeText : null,
          { color: marketDay.accentInk },
        ]}
      >
        {String(index).padStart(2, "0")}
      </Text>
      <View style={styles.rowCopy}>
        <Text
          style={[
            styles.rowLabel,
            largeTextLayout ? styles.rowLabelLargeText : null,
            { color: marketDay.ink },
          ]}
        >
          {label}
        </Text>
        <Text
          style={[
            styles.rowDetail,
            largeTextLayout ? styles.rowDetailLargeText : null,
            { color: marketDay.mutedInk },
          ]}
        >
          {detail}
        </Text>
      </View>
      <Icon color={marketDay.mutedInk} name="ChevronRight" size={18} />
    </Pressable>
  )
}

export function SalesRepShiftLedgerSection({
  children,
  title,
}: {
  children: ReactNode
  title: string
}) {
  const largeTextLayout = useLargeTextLayout()
  const marketDay = useMarketDayPalette()

  return (
    <View>
      <View style={[styles.sectionHeader, { borderTopColor: marketDay.ink }]}>
        <Text
          accessibilityRole="header"
          style={[
            styles.sectionTitle,
            largeTextLayout ? styles.sectionTitleLargeText : null,
            { color: marketDay.ink },
          ]}
        >
          {title}
        </Text>
      </View>
      {children}
    </View>
  )
}

export function SalesRepShiftLedgerEmptySales({
  message,
}: { message: string }) {
  const largeTextLayout = useLargeTextLayout()
  const marketDay = useMarketDayPalette()

  return (
    <View
      style={[
        styles.emptySales,
        largeTextLayout ? styles.emptySalesLargeText : null,
        { borderColor: marketDay.line },
      ]}
      testID="sales-rep-shift-ledger-empty-sales"
    >
      <View
        style={[
          styles.emptyMark,
          {
            borderColor: marketDay.paprika,
            backgroundColor: marketDay.paprikaWash,
          },
        ]}
      >
        <Icon color={marketDay.paprika} name="ReceiptText" size={22} />
      </View>
      <View style={styles.emptyCopy}>
        <Text
          style={[
            styles.emptyTitle,
            largeTextLayout ? styles.emptyTitleLargeText : null,
            { color: marketDay.ink },
          ]}
        >
          No recent sales
        </Text>
        <Text
          style={[
            styles.emptyMessage,
            largeTextLayout ? styles.emptyMessageLargeText : null,
            { color: marketDay.mutedInk },
          ]}
        >
          {message}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  businessButton: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 6,
    minHeight: 44,
    minWidth: 0,
    paddingRight: 8,
  },
  businessName: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 18,
  },
  businessNameLargeText: { lineHeight: 32 },
  emptyCopy: { flex: 1, gap: 4, minWidth: 0 },
  emptyMark: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 2,
    height: 52,
    justifyContent: "center",
    transform: [{ rotate: "-5deg" }],
    width: 52,
  },
  emptyMessage: { fontSize: 12, lineHeight: 17 },
  emptyMessageLargeText: { lineHeight: 34 },
  emptySales: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 14,
    minHeight: 88,
    paddingVertical: 14,
  },
  emptySalesLargeText: { alignItems: "flex-start", flexDirection: "column" },
  emptyTitle: { fontSize: 16, fontWeight: "900", lineHeight: 21 },
  emptyTitleLargeText: { lineHeight: 42 },
  fact: {
    flex: 1,
    gap: 6,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 13,
  },
  factCopy: { gap: 3, minWidth: 0 },
  factDetail: { fontSize: 9, lineHeight: 13 },
  factDetailLargeText: { lineHeight: 25 },
  factLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
    lineHeight: 13,
    textTransform: "uppercase",
  },
  factLargeText: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    minHeight: 86,
    paddingHorizontal: 0,
  },
  facts: { borderBottomWidth: 2, borderTopWidth: 2, flexDirection: "row" },
  factsLargeText: { flexDirection: "column" },
  factValue: {
    fontFamily: "serif",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.6,
    lineHeight: 27,
  },
  factValueLargeText: {
    flex: 1,
    lineHeight: 54,
    marginLeft: 14,
    textAlign: "right",
  },
  greeting: {
    flex: 1,
    fontFamily: "serif",
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -1,
    lineHeight: 29,
    minWidth: 0,
  },
  greetingRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 16,
    marginTop: 6,
  },
  greetingRowLargeText: { alignItems: "flex-start", flexDirection: "column" },
  hero: { borderBottomWidth: 6, paddingBottom: 16, paddingHorizontal: 20 },
  heroAction: {
    alignItems: "center",
    borderRightWidth: StyleSheet.hairlineWidth,
    height: 44,
    justifyContent: "center",
    position: "relative",
    width: 44,
  },
  heroActions: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    flexShrink: 0,
  },
  heroCue: {
    borderLeftWidth: 2,
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
    paddingLeft: 10,
    width: 126,
  },
  heroCueLargeText: { lineHeight: 28, width: "100%" },
  heroTopRow: { alignItems: "flex-start", flexDirection: "row", gap: 12 },
  ledger: { gap: 14 },
  ledgerAction: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    minHeight: 60,
    paddingVertical: 10,
  },
  ledgerActionLargeText: {
    alignItems: "flex-start",
    minHeight: 92,
    paddingVertical: 14,
  },
  metaLabel: {
    flex: 1,
    fontFamily: "monospace",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    lineHeight: 14,
  },
  metaLabelLargeText: { lineHeight: 28 },
  metaRow: {
    alignItems: "center",
    borderBottomWidth: 2,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    minHeight: 38,
    paddingBottom: 9,
  },
  metaRowLargeText: {
    alignItems: "flex-start",
    flexDirection: "column",
    paddingBottom: 14,
  },
  notificationBadge: {
    borderRadius: 999,
    borderWidth: 2,
    height: 10,
    position: "absolute",
    right: 6,
    top: 6,
    width: 10,
  },
  rowCopy: { flex: 1, gap: 3, minWidth: 0 },
  rowDetail: { fontSize: 10, lineHeight: 14 },
  rowDetailLargeText: { lineHeight: 27 },
  rowIndex: {
    fontFamily: "monospace",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.4,
    lineHeight: 18,
    width: 24,
  },
  rowIndexLargeText: { flexShrink: 0, width: 40 },
  rowLabel: { fontSize: 14, fontWeight: "900", lineHeight: 19 },
  rowLabelLargeText: { lineHeight: 34 },
  saleCopy: { flex: 1, gap: 4, minWidth: 0 },
  saleDetail: { fontSize: 10, lineHeight: 14 },
  saleDetailLargeText: { lineHeight: 28 },
  saleTicket: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    minHeight: 96,
    paddingVertical: 13,
  },
  saleTicketLargeText: { alignItems: "flex-start", minHeight: 130 },
  saleTitle: {
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.3,
    lineHeight: 23,
  },
  saleTitleLargeText: { lineHeight: 43 },
  sectionHeader: { borderTopWidth: 2, justifyContent: "center", minHeight: 58 },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  sectionTitleLargeText: { lineHeight: 52 },
  syncDot: { borderRadius: 999, height: 8, width: 8 },
  syncLabel: { fontSize: 10, fontWeight: "900", lineHeight: 14 },
  syncLabelLargeText: { lineHeight: 28 },
  syncLabelRow: { alignItems: "center", flexDirection: "row", gap: 7 },
  syncLabelRowLargeText: { minHeight: 30 },
  ticketMark: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 2,
    height: 52,
    justifyContent: "center",
    transform: [{ rotate: "-5deg" }],
    width: 52,
  },
  ticketMarkText: {
    fontFamily: "monospace",
    fontSize: 8,
    fontWeight: "900",
    lineHeight: 10,
    textAlign: "center",
  },
})
