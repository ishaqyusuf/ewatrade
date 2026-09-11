import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { DISPLAY_TEXT_FONT_SCALE_CAP } from "@/lib/mobile-accessibility-layout"
import type { ReactNode } from "react"
import { View } from "@/components/ui/view"
import { VariableContextProvider } from "nativewind"
import { cn } from "@/lib/utils"
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
    <VariableContextProvider value={{ "--dashboard-hero-top": insets.top + 8 }}>
      <View
        className={cn(
          styles.hero,
          "bg-market-marigold",
          "border-b-market-paprika",
          "pt-[var(--dashboard-hero-top)]",
        )}
        testID="sales-rep-shift-ledger-hero"
      >
        <View className={styles.heroTopRow}>
          <Pressable
            accessibilityHint="Opens Business switching"
            accessibilityLabel={`${businessName}, switch Business`}
            accessibilityRole="button"
            haptic
            hitSlop={4}
            onPress={onBusinessPress}
            className={cn(
              styles.businessButton,
              "opacity-100 active:opacity-[0.68]",
            )}
          >
            <Text
              numberOfLines={largeTextLayout ? 2 : 1}
              className={cn(
                styles.businessName,
                largeTextLayout ? styles.businessNameLargeText : null,
                "text-market-on-marigold",
              )}
            >
              {businessName}
            </Text>
            <Icon color={marketDay.onMarigold} name="ChevronDown" size={15} />
          </Pressable>

          <View
            className={cn(
              styles.heroActions,
              "border-market-on-marigold-hairline",
            )}
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
          className={cn(
            styles.greetingRow,
            largeTextLayout ? styles.greetingRowLargeText : null,
          )}
        >
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={DISPLAY_TEXT_FONT_SCALE_CAP}
            className={cn(styles.greeting, "text-market-on-marigold")}
          >
            Good morning,{"\n"}
            {greetingName}.
          </Text>
          <Text
            className={cn(
              styles.heroCue,
              largeTextLayout ? styles.heroCueLargeText : null,
              "border-market-on-marigold-divider",
              "text-market-on-marigold",
            )}
          >
            {cue}
          </Text>
        </View>
      </View>
    </VariableContextProvider>
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
      className={cn(
        styles.heroAction,
        "bg-transparent active:bg-market-on-marigold-pressed",
        "border-market-on-marigold-hairline",
        disabled ? "opacity-[0.42]" : "opacity-100",
      )}
    >
      <Icon color={marketDay.onMarigold} name={icon} size={20} />
      {hasBadge ? (
        <View
          className={cn(
            styles.notificationBadge,
            "bg-market-paprika",
            "border-market-marigold",
          )}
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
    <View className={styles.ledger} testID="sales-rep-shift-ledger-overview">
      <View
        className={cn(
          styles.metaRow,
          largeTextLayout ? styles.metaRowLargeText : null,
          "border-b-market-ink",
        )}
      >
        <Text
          className={cn(
            styles.metaLabel,
            largeTextLayout ? styles.metaLabelLargeText : null,
            "text-market-ink",
          )}
        >
          {readinessLabel.toUpperCase()}
        </Text>
        <View
          className={cn(
            styles.syncLabelRow,
            largeTextLayout ? styles.syncLabelRowLargeText : null,
          )}
        >
          <View
            className={cn(
              styles.syncDot,
              syncTone === "attention"
                ? "bg-market-marigold"
                : "bg-market-accent-ink",
            )}
          />
          <Text
            className={cn(
              styles.syncLabel,
              largeTextLayout ? styles.syncLabelLargeText : null,
              "text-market-accent-ink",
            )}
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
        className={cn(
          styles.saleTicket,
          largeTextLayout ? styles.saleTicketLargeText : null,
          "border-b-market-line",
          saleActionDisabled
            ? "opacity-[0.48]"
            : "opacity-100 active:opacity-[0.72]",
        )}
        testID="sales-rep-shift-ledger-start-sale"
      >
        <View
          className={cn(
            styles.ticketMark,
            "border-market-paprika",
            "bg-market-paprika-wash",
          )}
        >
          {largeTextLayout ? (
            <Icon color={marketDay.paprika} name="ReceiptText" size={22} />
          ) : (
            <Text
              maxFontSizeMultiplier={DISPLAY_TEXT_FONT_SCALE_CAP}
              className={cn(styles.ticketMarkText, "text-market-paprika")}
            >
              NEXT{"\n"}SALE
            </Text>
          )}
        </View>
        <View className={styles.saleCopy}>
          <Text
            className={cn(
              styles.saleTitle,
              largeTextLayout ? styles.saleTitleLargeText : null,
              "text-market-ink",
            )}
          >
            {saleActionLabel}
          </Text>
          <Text
            className={cn(
              styles.saleDetail,
              largeTextLayout ? styles.saleDetailLargeText : null,
              "text-market-muted-ink",
            )}
          >
            {saleActionDetail}
          </Text>
        </View>
        <Icon color={marketDay.paprika} name="ChevronRight" size={24} />
      </Pressable>

      <View
        className={cn(
          styles.facts,
          largeTextLayout ? styles.factsLargeText : null,
          "border-market-ink",
        )}
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

  return (
    <View
      className={cn(
        styles.fact,
        largeTextLayout ? styles.factLargeText : null,
        "border-b-market-line",
        "border-r-market-line",
        last || largeTextLayout
          ? "border-r-0"
          : "border-r-[length:var(--native-hairline)]",
      )}
    >
      <Text
        maxFontSizeMultiplier={DISPLAY_TEXT_FONT_SCALE_CAP}
        className={cn(
          styles.factValue,
          largeTextLayout ? styles.factValueLargeText : null,
          "text-market-ink",
        )}
      >
        {value}
      </Text>
      <View className={styles.factCopy}>
        <Text className={cn(styles.factLabel, "text-market-ink")}>{label}</Text>
        <Text
          className={cn(
            styles.factDetail,
            largeTextLayout ? styles.factDetailLargeText : null,
            "text-market-muted-ink",
          )}
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
      className={cn(
        styles.ledgerAction,
        largeTextLayout ? styles.ledgerActionLargeText : null,
        "bg-transparent active:bg-market-palm/[0.051]",
        "border-b-market-line",
      )}
    >
      <Text
        maxFontSizeMultiplier={DISPLAY_TEXT_FONT_SCALE_CAP}
        className={cn(
          styles.rowIndex,
          largeTextLayout ? styles.rowIndexLargeText : null,
          "text-market-accent-ink",
        )}
      >
        {String(index).padStart(2, "0")}
      </Text>
      <View className={styles.rowCopy}>
        <Text
          className={cn(
            styles.rowLabel,
            largeTextLayout ? styles.rowLabelLargeText : null,
            "text-market-ink",
          )}
        >
          {label}
        </Text>
        <Text
          className={cn(
            styles.rowDetail,
            largeTextLayout ? styles.rowDetailLargeText : null,
            "text-market-muted-ink",
          )}
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

  return (
    <View>
      <View className={cn(styles.sectionHeader, "border-t-market-ink")}>
        <Text
          accessibilityRole="header"
          className={cn(
            styles.sectionTitle,
            largeTextLayout ? styles.sectionTitleLargeText : null,
            "text-market-ink",
          )}
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
      className={cn(
        styles.emptySales,
        largeTextLayout ? styles.emptySalesLargeText : null,
        "border-market-line",
      )}
      testID="sales-rep-shift-ledger-empty-sales"
    >
      <View
        className={cn(
          styles.emptyMark,
          "border-market-paprika",
          "bg-market-paprika-wash",
        )}
      >
        <Icon color={marketDay.paprika} name="ReceiptText" size={22} />
      </View>
      <View className={styles.emptyCopy}>
        <Text
          className={cn(
            styles.emptyTitle,
            largeTextLayout ? styles.emptyTitleLargeText : null,
            "text-market-ink",
          )}
        >
          No recent sales
        </Text>
        <Text
          className={cn(
            styles.emptyMessage,
            largeTextLayout ? styles.emptyMessageLargeText : null,
            "text-market-muted-ink",
          )}
        >
          {message}
        </Text>
      </View>
    </View>
  )
}

const styles = {
  businessButton:
    "items-center flex-1 flex-row gap-[6px] min-h-[44px] min-w-[0px] pr-[8px]",
  businessName: "shrink text-[13px] font-black [-rn-line-height:18]",
  businessNameLargeText: "[-rn-line-height:32]",
  emptyCopy: "flex-1 gap-[4px] min-w-[0px]",
  emptyMark:
    "items-center rounded-full border-[2px] h-[52px] justify-center rotate-[-5deg] w-[52px]",
  emptyMessage: "text-[12px] [-rn-line-height:17]",
  emptyMessageLargeText: "[-rn-line-height:34]",
  emptySales:
    "items-center border-b-[length:var(--native-hairline)] flex-row gap-[14px] min-h-[88px] py-[14px]",
  emptySalesLargeText: "items-start flex-col",
  emptyTitle: "text-[16px] font-black [-rn-line-height:21]",
  emptyTitleLargeText: "[-rn-line-height:42]",
  fact: "flex-1 gap-[6px] min-w-[0px] px-[10px] py-[13px]",
  factCopy: "gap-[3px] min-w-[0px]",
  factDetail: "text-[9px] [-rn-line-height:13]",
  factDetailLargeText: "[-rn-line-height:25]",
  factLabel:
    "text-[9px] font-black tracking-[0.5px] [-rn-line-height:13] uppercase",
  factLargeText:
    "items-center border-b-[length:var(--native-hairline)] flex-row-reverse justify-between min-h-[86px] px-[0px]",
  facts: "border-b-[2px] border-t-[2px] flex-row",
  factsLargeText: "flex-col",
  factValue:
    "font-market-display text-[22px] font-black tracking-[-0.6px] [-rn-line-height:27]",
  factValueLargeText: "flex-1 [-rn-line-height:54] ml-[14px] text-right",
  greeting:
    "flex-1 font-market-display text-[30px] font-black tracking-[-1px] [-rn-line-height:29] min-w-[0px]",
  greetingRow: "items-end flex-row gap-[16px] mt-[6px]",
  greetingRowLargeText: "items-start flex-col",
  hero: "border-b-[6px] pb-[16px] px-[20px]",
  heroAction:
    "items-center border-r-[length:var(--native-hairline)] h-[44px] justify-center relative w-[44px]",
  heroActions:
    "border-b-[length:var(--native-hairline)] border-l-[length:var(--native-hairline)] border-t-[length:var(--native-hairline)] flex-row shrink-0",
  heroCue:
    "border-l-[2px] text-[11px] font-bold [-rn-line-height:15] pl-[10px] w-[126px]",
  heroCueLargeText: "[-rn-line-height:28] w-full",
  heroTopRow: "items-start flex-row gap-[12px]",
  ledger: "gap-[14px]",
  ledgerAction:
    "items-center border-b-[length:var(--native-hairline)] flex-row gap-[12px] min-h-[60px] py-[10px]",
  ledgerActionLargeText: "items-start min-h-[92px] py-[14px]",
  metaLabel:
    "flex-1 font-market-mono text-[10px] font-extrabold tracking-[0.8px] [-rn-line-height:14]",
  metaLabelLargeText: "[-rn-line-height:28]",
  metaRow:
    "items-center border-b-[2px] flex-row gap-[12px] justify-between min-h-[38px] pb-[9px]",
  metaRowLargeText: "items-start flex-col pb-[14px]",
  notificationBadge:
    "rounded-full border-[2px] h-[10px] absolute right-[6px] top-[6px] w-[10px]",
  rowCopy: "flex-1 gap-[3px] min-w-[0px]",
  rowDetail: "text-[10px] [-rn-line-height:14]",
  rowDetailLargeText: "[-rn-line-height:27]",
  rowIndex:
    "font-market-mono text-[10px] font-black tracking-[0.4px] [-rn-line-height:18] w-[24px]",
  rowIndexLargeText: "shrink-0 w-[40px]",
  rowLabel: "text-[14px] font-black [-rn-line-height:19]",
  rowLabelLargeText: "[-rn-line-height:34]",
  saleCopy: "flex-1 gap-[4px] min-w-[0px]",
  saleDetail: "text-[10px] [-rn-line-height:14]",
  saleDetailLargeText: "[-rn-line-height:28]",
  saleTicket:
    "items-center border-b-[length:var(--native-hairline)] flex-row gap-[12px] min-h-[96px] py-[13px]",
  saleTicketLargeText: "items-start min-h-[130px]",
  saleTitle: "text-[18px] font-black tracking-[-0.3px] [-rn-line-height:23]",
  saleTitleLargeText: "[-rn-line-height:43]",
  sectionHeader: "border-t-[2px] justify-center min-h-[58px]",
  sectionTitle: "text-[22px] font-black tracking-[-0.5px] [-rn-line-height:28]",
  sectionTitleLargeText: "[-rn-line-height:52]",
  syncDot: "rounded-full h-[8px] w-[8px]",
  syncLabel: "text-[10px] font-black [-rn-line-height:14]",
  syncLabelLargeText: "[-rn-line-height:28]",
  syncLabelRow: "items-center flex-row gap-[7px]",
  syncLabelRowLargeText: "min-h-[30px]",
  ticketMark:
    "items-center rounded-full border-[2px] h-[52px] justify-center rotate-[-5deg] w-[52px]",
  ticketMarkText:
    "font-market-mono text-[8px] font-black [-rn-line-height:10] text-center",
} as const
