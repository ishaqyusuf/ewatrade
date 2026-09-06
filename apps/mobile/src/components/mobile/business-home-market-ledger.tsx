import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { getBusinessHomeLedgerStepSemantics } from "@/lib/business-home-market-ledger-semantics"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { DISPLAY_TEXT_FONT_SCALE_CAP } from "@/lib/mobile-accessibility-layout"
import { StyleSheet, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { MarketDayActionButton } from "./action-button"

type BusinessHomeMarketLedgerHeroProps = {
  businessName: string
  greetingName: string
  hasNotification?: boolean
  onBusinessPress: () => void
  onNotificationPress: () => void
  onSearchPress?: () => void
}

export function BusinessHomeMarketLedgerHero({
  businessName,
  greetingName,
  hasNotification = false,
  onBusinessPress,
  onNotificationPress,
  onSearchPress,
}: BusinessHomeMarketLedgerHeroProps) {
  const insets = useSafeAreaInsets()
  const largeTextLayout = useLargeTextLayout()
  const marketDay = useMarketDayPalette()

  return (
    <View
      style={[
        styles.hero,
        largeTextLayout ? styles.heroLargeText : null,
        {
          backgroundColor: marketDay.paprika,
          paddingTop: insets.top + 14,
        },
      ]}
      testID="business-home-market-ledger-hero"
    >
      <View
        style={[
          styles.heroCopyRow,
          largeTextLayout ? styles.heroCopyRowLargeText : null,
        ]}
      >
        <View style={styles.heroCopy}>
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={DISPLAY_TEXT_FONT_SCALE_CAP}
            style={[
              styles.heroTitle,
              largeTextLayout ? styles.heroTitleLargeText : null,
              { color: marketDay.onPaprika },
            ]}
          >
            Good morning,{"\n"}
            {greetingName}.
          </Text>
          <Pressable
            accessibilityHint="Opens Business switching"
            accessibilityLabel={`${businessName}, switch Business`}
            accessibilityRole="button"
            haptic
            hitSlop={4}
            onPress={onBusinessPress}
            style={({ pressed }) => [
              styles.businessButton,
              {
                backgroundColor: pressed
                  ? marketDay.heroPressed
                  : "transparent",
              },
            ]}
          >
            <Text
              numberOfLines={largeTextLayout ? 2 : 1}
              style={[
                styles.businessName,
                largeTextLayout ? styles.businessNameLargeText : null,
                { color: marketDay.onPaprika },
              ]}
            >
              {businessName}
            </Text>
            <Icon color={marketDay.onPaprika} name="ChevronDown" size={15} />
          </Pressable>
        </View>

        <View
          style={[styles.heroActions, { borderColor: marketDay.heroHairline }]}
        >
          <HeaderAction
            accessibilityLabel={
              hasNotification
                ? "Open sync status, items need attention"
                : "Open sync status"
            }
            borderColor={marketDay.heroHairline}
            color={marketDay.onPaprika}
            hasBadge={hasNotification}
            icon="Bell"
            onPress={onNotificationPress}
          />
          <HeaderAction
            accessibilityLabel={
              onSearchPress
                ? "Open global search"
                : "Search unavailable offline"
            }
            borderColor={marketDay.heroHairline}
            color={marketDay.onPaprika}
            disabled={!onSearchPress}
            icon="Search"
            onPress={onSearchPress}
          />
        </View>
      </View>
    </View>
  )
}

function HeaderAction({
  accessibilityLabel,
  borderColor,
  color,
  disabled = false,
  hasBadge = false,
  icon,
  onPress,
}: {
  accessibilityLabel: string
  borderColor: string
  color: string
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
            ? marketDay.heroActionPressed
            : "transparent",
          borderColor,
          opacity: disabled ? 0.45 : 1,
        },
      ]}
    >
      <Icon color={color} name={icon} size={20} />
      {hasBadge ? (
        <View
          style={[
            styles.notificationBadge,
            {
              backgroundColor: marketDay.marigold,
              borderColor: marketDay.paprika,
            },
          ]}
        />
      ) : null}
    </Pressable>
  )
}

type BusinessHomeMarketLedgerSetupProps = {
  catalogReady: boolean
  itemValue: string
  onAddItemPress: () => void
  onCreateOrderPress: () => void
  onInviteStaffPress: () => void
  orderValue: string
  revenueValue: string
  syncLabel?: string
  syncTone?: "attention" | "ready"
}

export function BusinessHomeMarketLedgerSetup({
  catalogReady,
  itemValue,
  onAddItemPress,
  onCreateOrderPress,
  onInviteStaffPress,
  orderValue,
  revenueValue,
  syncLabel,
  syncTone,
}: BusinessHomeMarketLedgerSetupProps) {
  const largeTextLayout = useLargeTextLayout()
  const marketDay = useMarketDayPalette()
  const completedSteps = catalogReady ? 2 : 1

  return (
    <View
      style={styles.ledgerSection}
      testID="business-home-market-ledger-setup"
    >
      <LedgerMeta label={syncLabel} tone={syncTone} />

      <View
        style={[
          styles.setupLedger,
          { borderBottomColor: marketDay.line },
          largeTextLayout ? styles.setupLedgerLargeText : null,
        ]}
      >
        <View
          style={[
            styles.progressColumn,
            {
              borderColor: marketDay.line,
            },
            largeTextLayout ? styles.progressColumnLargeText : null,
          ]}
        >
          <Text
            maxFontSizeMultiplier={DISPLAY_TEXT_FONT_SCALE_CAP}
            style={[
              styles.progressValue,
              largeTextLayout ? styles.progressValueLargeText : null,
              { color: marketDay.ink },
            ]}
          >
            {completedSteps}/3
          </Text>
          <Text
            style={[
              styles.progressLabel,
              largeTextLayout ? styles.progressLabelLargeText : null,
              { color: marketDay.mutedInk },
            ]}
          >
            OPEN
          </Text>
        </View>

        <View style={styles.setupCopy}>
          <View
            style={[
              styles.setupHeadingRow,
              largeTextLayout ? styles.setupHeadingRowLargeText : null,
            ]}
          >
            <Text
              style={[
                styles.setupTitle,
                largeTextLayout ? styles.setupTitleLargeText : null,
                { color: marketDay.ink },
              ]}
            >
              Set up your Store
            </Text>
            <Text
              style={[
                styles.nextLabel,
                largeTextLayout ? styles.nextLabelLargeText : null,
                { color: marketDay.accentInk },
              ]}
            >
              {catalogReady ? "Order next" : "Catalog next"}
            </Text>
          </View>
          <Text
            style={[
              styles.setupDescription,
              largeTextLayout ? styles.setupDescriptionLargeText : null,
              { color: marketDay.mutedInk },
            ]}
          >
            {catalogReady
              ? "Your catalog is ready. Take one order to turn on your trading overview."
              : "Add one Product or Service to unlock orders, stock, and revenue."}
          </Text>

          <View style={[styles.stepList, { borderTopColor: marketDay.line }]}>
            <LedgerStep
              current={!catalogReady}
              detail={
                catalogReady
                  ? "Your Store has something ready to sell."
                  : "Name it, price it, and save it."
              }
              label={
                catalogReady ? "Catalog is ready" : "Add a Product or Service"
              }
              onPress={catalogReady ? undefined : onAddItemPress}
              step="01"
            />
            <LedgerStep
              current={catalogReady}
              detail={
                catalogReady
                  ? "Create a sale and your overview will come alive."
                  : "Available as soon as your first item is ready."
              }
              disabled={!catalogReady}
              label="Take your first order"
              onPress={catalogReady ? onCreateOrderPress : undefined}
              step="02"
            />
            <LedgerStep
              detail="Optional when you run the Store alone."
              label="Invite your team"
              onPress={onInviteStaffPress}
              step="03"
            />
          </View>
        </View>
      </View>

      <MarketLedgerFacts
        facts={[
          { label: "Orders", value: orderValue },
          { label: "Revenue", value: revenueValue },
          { label: "Items", value: itemValue },
        ]}
      />
    </View>
  )
}

function LedgerMeta({
  label = "Synced now",
  tone = "ready",
}: {
  label?: string
  tone?: "attention" | "ready"
}) {
  const largeTextLayout = useLargeTextLayout()
  const marketDay = useMarketDayPalette()

  return (
    <View
      style={[
        styles.ledgerMeta,
        largeTextLayout ? styles.ledgerMetaLargeText : null,
        { borderBottomColor: marketDay.ink },
      ]}
    >
      <Text
        style={[
          styles.ledgerMetaTitle,
          largeTextLayout ? styles.ledgerMetaTitleLargeText : null,
          { color: marketDay.ink },
        ]}
      >
        TODAY · MARKET LEDGER
      </Text>
      <View style={styles.syncStatus}>
        <View
          style={[
            styles.syncDot,
            {
              backgroundColor:
                tone === "attention" ? marketDay.marigold : marketDay.palm,
            },
          ]}
        />
        <Text
          style={[
            styles.syncLabel,
            largeTextLayout ? styles.syncLabelLargeText : null,
            { color: marketDay.accentInk },
          ]}
        >
          {label}
        </Text>
      </View>
    </View>
  )
}

function LedgerStep({
  current = false,
  detail,
  disabled = false,
  label,
  onPress,
  step,
}: {
  current?: boolean
  detail: string
  disabled?: boolean
  label: string
  onPress?: () => void
  step: string
}) {
  const largeTextLayout = useLargeTextLayout()
  const marketDay = useMarketDayPalette()
  const semantics = getBusinessHomeLedgerStepSemantics({
    disabled,
    hasAction: Boolean(onPress),
  })

  return (
    <Pressable
      accessibilityHint={detail}
      accessibilityRole={semantics.accessibilityRole}
      accessibilityState={semantics.accessibilityState}
      disabled={disabled}
      haptic={semantics.available}
      onPress={onPress}
      style={({ pressed }) => [
        styles.step,
        largeTextLayout ? styles.stepLargeText : null,
        {
          backgroundColor: pressed ? marketDay.softBand : "transparent",
          borderBottomColor: marketDay.line,
          opacity: disabled ? 0.52 : 1,
        },
      ]}
    >
      <Text style={[styles.stepNumber, { color: marketDay.accentInk }]}>
        {step}
      </Text>
      <View style={styles.stepCopy}>
        <Text
          numberOfLines={largeTextLayout ? undefined : 2}
          style={[
            styles.stepLabel,
            largeTextLayout ? styles.stepLabelLargeText : null,
            { color: marketDay.ink },
          ]}
        >
          {label}
        </Text>
        <Text
          style={[
            styles.stepDetail,
            largeTextLayout ? styles.stepDetailLargeText : null,
            { color: marketDay.mutedInk },
          ]}
        >
          {detail}
        </Text>
      </View>
      {semantics.available ? (
        <Icon color={marketDay.accentInk} name="ChevronRight" size={18} />
      ) : current ? (
        <View
          style={[styles.currentMark, { backgroundColor: marketDay.marigold }]}
        />
      ) : (
        <Text style={[styles.unavailableMark, { color: marketDay.mutedInk }]}>
          —
        </Text>
      )}
    </Pressable>
  )
}

export function BusinessHomeMarketLedgerOverview({
  primaryDetail,
  primaryLabel,
  primaryValue,
  recentOrderDetail,
  recentOrderValue,
  revenueDetail,
  revenueValue,
  syncLabel,
  syncTone,
}: {
  primaryDetail: string
  primaryLabel: string
  primaryValue: string
  recentOrderDetail: string
  recentOrderValue: string
  revenueDetail: string
  revenueValue: string
  syncLabel?: string
  syncTone?: "attention" | "ready"
}) {
  const largeTextLayout = useLargeTextLayout()
  const marketDay = useMarketDayPalette()

  return (
    <View
      style={styles.ledgerSection}
      testID="business-home-market-ledger-overview"
    >
      <LedgerMeta label={syncLabel} tone={syncTone} />
      <View
        style={[
          styles.operationalHeading,
          largeTextLayout ? styles.operationalHeadingLargeText : null,
        ]}
      >
        <Text
          style={[
            styles.operationalTitle,
            largeTextLayout ? styles.operationalTitleLargeText : null,
            { color: marketDay.ink },
          ]}
        >
          Store snapshot
        </Text>
        <Text
          style={[
            styles.operationalEyebrow,
            largeTextLayout ? styles.operationalEyebrowLargeText : null,
            { color: marketDay.accentInk },
          ]}
        >
          LIVE OPERATIONS
        </Text>
      </View>
      <MarketLedgerFacts
        facts={[
          { label: primaryLabel, value: primaryValue },
          { label: "Recent orders", value: recentOrderValue },
          { label: "Recent revenue", value: revenueValue },
        ]}
      />
      <View
        style={[styles.detailLedger, { borderBottomColor: marketDay.line }]}
      >
        <LedgerDetail label={primaryLabel} value={primaryDetail} />
        <LedgerDetail label="Orders" value={recentOrderDetail} />
        <LedgerDetail label="Revenue" value={revenueDetail} />
      </View>
    </View>
  )
}

function LedgerDetail({ label, value }: { label: string; value: string }) {
  const largeTextLayout = useLargeTextLayout()
  const marketDay = useMarketDayPalette()

  return (
    <View
      style={[
        styles.detailRow,
        largeTextLayout ? styles.detailRowLargeText : null,
        { borderTopColor: marketDay.line },
      ]}
    >
      <Text
        style={[
          styles.detailLabel,
          largeTextLayout ? styles.detailLabelLargeText : null,
          { color: marketDay.accentInk },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.detailValue,
          largeTextLayout ? styles.detailValueLargeText : null,
          { color: marketDay.mutedInk },
        ]}
      >
        {value}
      </Text>
    </View>
  )
}

function MarketLedgerFacts({
  facts,
}: {
  facts: Array<{ label: string; value: string }>
}) {
  const largeTextLayout = useLargeTextLayout()
  const marketDay = useMarketDayPalette()

  return (
    <View
      style={[
        styles.facts,
        {
          borderBottomColor: marketDay.ink,
          borderTopColor: marketDay.ink,
        },
        largeTextLayout ? styles.factsLargeText : null,
      ]}
    >
      {facts.map((fact, index) => (
        <View
          key={fact.label}
          style={[
            styles.fact,
            {
              borderColor: marketDay.line,
            },
            largeTextLayout ? styles.factLargeText : null,
            index === facts.length - 1 ? styles.factLast : null,
          ]}
        >
          <Text
            style={[
              styles.factValue,
              largeTextLayout ? styles.factValueLargeText : null,
              { color: marketDay.ink },
            ]}
          >
            {fact.value}
          </Text>
          <Text
            style={[
              styles.factLabel,
              largeTextLayout ? styles.factLabelLargeText : null,
              { color: marketDay.mutedInk },
            ]}
          >
            {fact.label}
          </Text>
        </View>
      ))}
    </View>
  )
}

export function BusinessHomeMarketLedgerSectionHeader({
  actionLabel,
  onActionPress,
  title,
}: {
  actionLabel?: string
  onActionPress?: () => void
  title: string
}) {
  const largeTextLayout = useLargeTextLayout()
  const marketDay = useMarketDayPalette()

  return (
    <View
      style={[
        styles.sectionHeader,
        largeTextLayout ? styles.sectionHeaderLargeText : null,
        { borderTopColor: marketDay.ink },
      ]}
    >
      <Text
        style={[
          styles.sectionTitle,
          largeTextLayout ? styles.sectionTitleLargeText : null,
          { color: marketDay.ink },
        ]}
      >
        {title}
      </Text>
      {actionLabel && onActionPress ? (
        <Pressable
          accessibilityRole="button"
          haptic
          onPress={onActionPress}
          style={({ pressed }) => [
            styles.sectionAction,
            largeTextLayout ? styles.sectionActionLargeText : null,
            { backgroundColor: pressed ? marketDay.softBand : "transparent" },
          ]}
        >
          <Text
            style={[
              styles.sectionActionLabel,
              largeTextLayout ? styles.sectionActionLabelLargeText : null,
              { color: marketDay.accentInk },
            ]}
          >
            {actionLabel}
          </Text>
          <Icon color={marketDay.accentInk} name="ArrowRight" size={16} />
        </Pressable>
      ) : null}
    </View>
  )
}

export function BusinessHomeMarketLedgerEmptyOrders({
  actionLabel,
  actionDisabled = false,
  message,
  onActionPress,
}: {
  actionDisabled?: boolean
  actionLabel?: string
  message: string
  onActionPress?: () => void
}) {
  const largeTextLayout = useLargeTextLayout()
  const marketDay = useMarketDayPalette()

  return (
    <View
      style={[
        styles.emptyOrders,
        largeTextLayout ? styles.emptyOrdersLargeText : null,
        {
          borderBottomColor: marketDay.line,
          borderTopColor: marketDay.line,
        },
      ]}
      testID="business-home-market-ledger-empty-orders"
    >
      <View
        style={[
          styles.tillSeal,
          {
            borderColor: marketDay.accentInk,
          },
        ]}
      >
        <Icon color={marketDay.accentInk} name="ReceiptText" size={20} />
        <Text style={[styles.tillSealText, { color: marketDay.accentInk }]}>
          CLEAR TILL
        </Text>
      </View>
      <View style={styles.emptyCopy}>
        <Text
          style={[
            styles.emptyTitle,
            largeTextLayout ? styles.emptyTitleLargeText : null,
            { color: marketDay.ink },
          ]}
        >
          No orders yet
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
        {actionLabel && onActionPress ? (
          <View style={styles.emptyAction}>
            <MarketDayActionButton
              disabled={actionDisabled}
              onPress={onActionPress}
              tone="marigold"
              trailingIcon="ArrowRight"
            >
              {actionLabel}
            </MarketDayActionButton>
          </View>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  businessButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 6,
    marginLeft: -8,
    minHeight: 44,
    paddingHorizontal: 8,
  },
  businessName: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
  businessNameLargeText: {
    lineHeight: 34,
  },
  currentMark: {
    borderRadius: 999,
    height: 8,
    width: 8,
  },
  detailLabel: {
    flexShrink: 0,
    fontFamily: "monospace",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    width: 92,
  },
  detailLabelLargeText: {
    lineHeight: 24,
    width: "100%",
  },
  detailLedger: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  detailRow: {
    alignItems: "flex-start",
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    minHeight: 44,
    paddingVertical: 10,
  },
  detailRowLargeText: {
    flexDirection: "column",
    gap: 4,
    paddingVertical: 14,
  },
  detailValue: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  detailValueLargeText: {
    lineHeight: 32,
  },
  emptyAction: {
    marginTop: 12,
    maxWidth: 260,
    width: "100%",
  },
  emptyCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  emptyMessage: {
    fontSize: 12,
    lineHeight: 17,
  },
  emptyMessageLargeText: {
    lineHeight: 34,
  },
  emptyOrders: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 16,
    paddingVertical: 16,
  },
  emptyOrdersLargeText: {
    alignItems: "flex-start",
    flexDirection: "column",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.2,
    lineHeight: 21,
  },
  emptyTitleLargeText: {
    lineHeight: 42,
  },
  fact: {
    borderRightWidth: StyleSheet.hairlineWidth,
    flex: 1,
    gap: 5,
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 13,
  },
  factLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
    lineHeight: 13,
    textTransform: "uppercase",
  },
  factLabelLargeText: {
    lineHeight: 26,
  },
  factLast: {
    borderRightWidth: 0,
  },
  factLargeText: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRightWidth: 0,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    minHeight: 84,
    paddingHorizontal: 0,
  },
  facts: {
    borderBottomWidth: 2,
    borderTopWidth: 2,
    flexDirection: "row",
  },
  factsLargeText: {
    flexDirection: "column",
  },
  factValue: {
    fontFamily: "serif",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.7,
    lineHeight: 27,
  },
  factValueLargeText: {
    flex: 1,
    lineHeight: 58,
    marginLeft: 16,
    textAlign: "right",
  },
  hero: {
    paddingBottom: 18,
    paddingHorizontal: 20,
  },
  heroAction: {
    alignItems: "center",
    borderRightWidth: StyleSheet.hairlineWidth,
    height: 48,
    justifyContent: "center",
    position: "relative",
    width: 48,
  },
  heroActions: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  heroCopyRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 14,
    justifyContent: "space-between",
  },
  heroCopyRowLargeText: {
    gap: 12,
  },
  heroLargeText: {
    paddingBottom: 22,
  },
  heroTitle: {
    fontFamily: "serif",
    fontSize: 31,
    fontWeight: "900",
    letterSpacing: -1,
    lineHeight: 30,
  },
  heroTitleLargeText: {
    fontSize: 28,
    lineHeight: 29,
  },
  ledgerMeta: {
    alignItems: "center",
    borderBottomWidth: 2,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    minHeight: 38,
    paddingBottom: 9,
  },
  ledgerMetaLargeText: {
    alignItems: "flex-start",
    flexDirection: "column",
    gap: 4,
    minHeight: 0,
  },
  ledgerMetaTitle: {
    flex: 1,
    fontFamily: "monospace",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    lineHeight: 14,
  },
  ledgerMetaTitleLargeText: {
    flex: 0,
    lineHeight: 28,
  },
  ledgerSection: {
    gap: 14,
  },
  nextLabel: {
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 15,
  },
  nextLabelLargeText: {
    lineHeight: 28,
  },
  notificationBadge: {
    borderRadius: 999,
    borderWidth: 2,
    height: 10,
    position: "absolute",
    right: 8,
    top: 8,
    width: 10,
  },
  operationalEyebrow: {
    fontFamily: "monospace",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  operationalEyebrowLargeText: {
    lineHeight: 24,
  },
  operationalHeading: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 16,
    justifyContent: "space-between",
  },
  operationalHeadingLargeText: {
    alignItems: "flex-start",
    flexDirection: "column",
    gap: 4,
  },
  operationalTitle: {
    fontSize: 21,
    fontWeight: "900",
    letterSpacing: -0.5,
    lineHeight: 26,
  },
  operationalTitleLargeText: {
    lineHeight: 50,
    width: "100%",
  },
  progressColumn: {
    alignItems: "center",
    borderRightWidth: StyleSheet.hairlineWidth,
    gap: 2,
    paddingRight: 12,
    paddingTop: 2,
    width: 66,
  },
  progressColumnLargeText: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRightWidth: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 10,
    paddingRight: 0,
    width: "100%",
  },
  progressLabel: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.7,
    lineHeight: 11,
  },
  progressLabelLargeText: {
    lineHeight: 22,
  },
  progressValue: {
    fontFamily: "serif",
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -1,
    lineHeight: 34,
  },
  progressValueLargeText: {
    lineHeight: 52,
  },
  sectionAction: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 8,
  },
  sectionActionLabel: {
    fontSize: 12,
    fontWeight: "800",
  },
  sectionActionLabelLargeText: {
    lineHeight: 32,
  },
  sectionActionLargeText: {
    alignSelf: "flex-start",
    paddingHorizontal: 0,
  },
  sectionHeader: {
    alignItems: "center",
    borderTopWidth: 2,
    flexDirection: "row",
    gap: 16,
    justifyContent: "space-between",
    minHeight: 52,
  },
  sectionHeaderLargeText: {
    alignItems: "flex-start",
    flexDirection: "column",
    gap: 0,
    paddingVertical: 8,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.5,
    lineHeight: 25,
  },
  sectionTitleLargeText: {
    flex: 0,
    lineHeight: 48,
    width: "100%",
  },
  setupCopy: {
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  setupDescription: {
    fontSize: 12,
    lineHeight: 17,
  },
  setupDescriptionLargeText: {
    lineHeight: 34,
  },
  setupHeadingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  setupHeadingRowLargeText: {
    alignItems: "flex-start",
    flexDirection: "column",
    gap: 3,
  },
  setupLedger: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    paddingBottom: 2,
  },
  setupLedgerLargeText: {
    flexDirection: "column",
    gap: 12,
  },
  setupTitle: {
    flex: 1,
    fontSize: 21,
    fontWeight: "900",
    letterSpacing: -0.5,
    lineHeight: 26,
  },
  setupTitleLargeText: {
    flex: 0,
    lineHeight: 50,
    width: "100%",
  },
  step: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 8,
    minHeight: 52,
    paddingVertical: 7,
  },
  stepCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  stepDetail: {
    fontSize: 10,
    lineHeight: 14,
  },
  stepDetailLargeText: {
    lineHeight: 28,
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
  },
  stepLabelLargeText: {
    lineHeight: 34,
  },
  stepLargeText: {
    alignItems: "flex-start",
    minHeight: 64,
    paddingVertical: 10,
  },
  stepList: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  stepNumber: {
    fontFamily: "monospace",
    fontSize: 9,
    fontWeight: "700",
    width: 25,
  },
  syncDot: {
    borderRadius: 999,
    height: 7,
    width: 7,
  },
  syncLabel: {
    fontSize: 9,
    fontWeight: "800",
    lineHeight: 13,
  },
  syncLabelLargeText: {
    lineHeight: 26,
  },
  syncStatus: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
  },
  tillSeal: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 2,
    gap: 2,
    height: 62,
    justifyContent: "center",
    transform: [{ rotate: "-5deg" }],
    width: 62,
  },
  tillSealText: {
    fontFamily: "monospace",
    fontSize: 7,
    fontWeight: "700",
    lineHeight: 9,
  },
  unavailableMark: {
    fontSize: 16,
    lineHeight: 20,
  },
})
