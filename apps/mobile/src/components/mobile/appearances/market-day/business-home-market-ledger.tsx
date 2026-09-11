import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { getBusinessHomeLedgerStepSemantics } from "@/lib/business-home-market-ledger-semantics"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { DISPLAY_TEXT_FONT_SCALE_CAP } from "@/lib/mobile-accessibility-layout"
import { View } from "@/components/ui/view"
import { VariableContextProvider } from "nativewind"
import { cn } from "@/lib/utils"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { MarketDayActionButton } from "@/components/mobile/action-button"

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
    <VariableContextProvider
      value={{ "--dashboard-hero-top": insets.top + 14 }}
    >
      <View
        className={cn(
          styles.hero,
          largeTextLayout ? styles.heroLargeText : null,
          "bg-market-paprika",
          "pt-[var(--dashboard-hero-top)]",
        )}
        testID="business-home-market-ledger-hero"
      >
        <View
          className={cn(
            styles.heroCopyRow,
            largeTextLayout ? styles.heroCopyRowLargeText : null,
          )}
        >
          <View className={styles.heroCopy}>
            <Text
              accessibilityRole="header"
              maxFontSizeMultiplier={DISPLAY_TEXT_FONT_SCALE_CAP}
              className={cn(
                styles.heroTitle,
                largeTextLayout ? styles.heroTitleLargeText : null,
                "text-market-on-paprika",
              )}
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
              className={cn(
                styles.businessButton,
                "bg-transparent active:bg-market-hero-pressed",
              )}
            >
              <Text
                numberOfLines={largeTextLayout ? 2 : 1}
                className={cn(
                  styles.businessName,
                  largeTextLayout ? styles.businessNameLargeText : null,
                  "text-market-on-paprika",
                )}
              >
                {businessName}
              </Text>
              <Icon color={marketDay.onPaprika} name="ChevronDown" size={15} />
            </Pressable>
          </View>

          <View
            className={cn(styles.heroActions, "border-market-hero-hairline")}
          >
            <HeaderAction
              accessibilityLabel={
                hasNotification
                  ? "Open sync status, items need attention"
                  : "Open sync status"
              }
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
              color={marketDay.onPaprika}
              disabled={!onSearchPress}
              icon="Search"
              onPress={onSearchPress}
            />
          </View>
        </View>
      </View>
    </VariableContextProvider>
  )
}

function HeaderAction({
  accessibilityLabel,
  color,
  disabled = false,
  hasBadge = false,
  icon,
  onPress,
}: {
  accessibilityLabel: string
  color: string
  disabled?: boolean
  hasBadge?: boolean
  icon: IconKeys
  onPress?: () => void
}) {
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
        "bg-transparent active:bg-market-hero-action-pressed",
        "border-market-hero-hairline",
        disabled ? "opacity-[0.45]" : "opacity-100",
      )}
    >
      <Icon color={color} name={icon} size={20} />
      {hasBadge ? (
        <View
          className={cn(
            styles.notificationBadge,
            "bg-market-marigold",
            "border-market-paprika",
          )}
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
  const completedSteps = catalogReady ? 2 : 1

  return (
    <View
      className={styles.ledgerSection}
      testID="business-home-market-ledger-setup"
    >
      <LedgerMeta label={syncLabel} tone={syncTone} />

      <View
        className={cn(
          styles.setupLedger,
          "border-b-market-line",
          largeTextLayout ? styles.setupLedgerLargeText : null,
        )}
      >
        <View
          className={cn(
            styles.progressColumn,
            "border-market-line",
            largeTextLayout ? styles.progressColumnLargeText : null,
          )}
        >
          <Text
            maxFontSizeMultiplier={DISPLAY_TEXT_FONT_SCALE_CAP}
            className={cn(
              styles.progressValue,
              largeTextLayout ? styles.progressValueLargeText : null,
              "text-market-ink",
            )}
          >
            {completedSteps}/3
          </Text>
          <Text
            className={cn(
              styles.progressLabel,
              largeTextLayout ? styles.progressLabelLargeText : null,
              "text-market-muted-ink",
            )}
          >
            OPEN
          </Text>
        </View>

        <View className={styles.setupCopy}>
          <View
            className={cn(
              styles.setupHeadingRow,
              largeTextLayout ? styles.setupHeadingRowLargeText : null,
            )}
          >
            <Text
              className={cn(
                styles.setupTitle,
                largeTextLayout ? styles.setupTitleLargeText : null,
                "text-market-ink",
              )}
            >
              Set up your Store
            </Text>
            <Text
              className={cn(
                styles.nextLabel,
                largeTextLayout ? styles.nextLabelLargeText : null,
                "text-market-accent-ink",
              )}
            >
              {catalogReady ? "Order next" : "Catalog next"}
            </Text>
          </View>
          <Text
            className={cn(
              styles.setupDescription,
              largeTextLayout ? styles.setupDescriptionLargeText : null,
              "text-market-muted-ink",
            )}
          >
            {catalogReady
              ? "Your catalog is ready. Take one order to turn on your trading overview."
              : "Add one Product or Service to unlock orders, stock, and revenue."}
          </Text>

          <View className={cn(styles.stepList, "border-t-market-line")}>
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

  return (
    <View
      className={cn(
        styles.ledgerMeta,
        largeTextLayout ? styles.ledgerMetaLargeText : null,
        "border-b-market-ink",
      )}
    >
      <Text
        className={cn(
          styles.ledgerMetaTitle,
          largeTextLayout ? styles.ledgerMetaTitleLargeText : null,
          "text-market-ink",
        )}
      >
        TODAY · MARKET LEDGER
      </Text>
      <View className={styles.syncStatus}>
        <View
          className={cn(
            styles.syncDot,
            tone === "attention" ? "bg-market-marigold" : "bg-market-palm",
          )}
        />
        <Text
          className={cn(
            styles.syncLabel,
            largeTextLayout ? styles.syncLabelLargeText : null,
            "text-market-accent-ink",
          )}
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
      className={cn(
        styles.step,
        largeTextLayout ? styles.stepLargeText : null,
        "bg-transparent active:bg-market-soft-band",
        "border-b-market-line",
        disabled ? "opacity-[0.52]" : "opacity-100",
      )}
    >
      <Text className={cn(styles.stepNumber, "text-market-accent-ink")}>
        {step}
      </Text>
      <View className={styles.stepCopy}>
        <Text
          numberOfLines={largeTextLayout ? undefined : 2}
          className={cn(
            styles.stepLabel,
            largeTextLayout ? styles.stepLabelLargeText : null,
            "text-market-ink",
          )}
        >
          {label}
        </Text>
        <Text
          className={cn(
            styles.stepDetail,
            largeTextLayout ? styles.stepDetailLargeText : null,
            "text-market-muted-ink",
          )}
        >
          {detail}
        </Text>
      </View>
      {semantics.available ? (
        <Icon color={marketDay.accentInk} name="ChevronRight" size={18} />
      ) : current ? (
        <View className={cn(styles.currentMark, "bg-market-marigold")} />
      ) : (
        <Text className={cn(styles.unavailableMark, "text-market-muted-ink")}>
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

  return (
    <View
      className={styles.ledgerSection}
      testID="business-home-market-ledger-overview"
    >
      <LedgerMeta label={syncLabel} tone={syncTone} />
      <View
        className={cn(
          styles.operationalHeading,
          largeTextLayout ? styles.operationalHeadingLargeText : null,
        )}
      >
        <Text
          className={cn(
            styles.operationalTitle,
            largeTextLayout ? styles.operationalTitleLargeText : null,
            "text-market-ink",
          )}
        >
          Store snapshot
        </Text>
        <Text
          className={cn(
            styles.operationalEyebrow,
            largeTextLayout ? styles.operationalEyebrowLargeText : null,
            "text-market-accent-ink",
          )}
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
      <View className={cn(styles.detailLedger, "border-b-market-line")}>
        <LedgerDetail label={primaryLabel} value={primaryDetail} />
        <LedgerDetail label="Orders" value={recentOrderDetail} />
        <LedgerDetail label="Revenue" value={revenueDetail} />
      </View>
    </View>
  )
}

function LedgerDetail({ label, value }: { label: string; value: string }) {
  const largeTextLayout = useLargeTextLayout()

  return (
    <View
      className={cn(
        styles.detailRow,
        largeTextLayout ? styles.detailRowLargeText : null,
        "border-t-market-line",
      )}
    >
      <Text
        className={cn(
          styles.detailLabel,
          largeTextLayout ? styles.detailLabelLargeText : null,
          "text-market-accent-ink",
        )}
      >
        {label}
      </Text>
      <Text
        className={cn(
          styles.detailValue,
          largeTextLayout ? styles.detailValueLargeText : null,
          "text-market-muted-ink",
        )}
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

  return (
    <View
      className={cn(
        styles.facts,
        "border-b-market-ink",
        "border-t-market-ink",
        largeTextLayout ? styles.factsLargeText : null,
      )}
    >
      {facts.map((fact, index) => (
        <View
          key={fact.label}
          className={cn(
            styles.fact,
            "border-market-line",
            largeTextLayout ? styles.factLargeText : null,
            index === facts.length - 1 ? styles.factLast : null,
          )}
        >
          <Text
            className={cn(
              styles.factValue,
              largeTextLayout ? styles.factValueLargeText : null,
              "text-market-ink",
            )}
          >
            {fact.value}
          </Text>
          <Text
            className={cn(
              styles.factLabel,
              largeTextLayout ? styles.factLabelLargeText : null,
              "text-market-muted-ink",
            )}
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
      className={cn(
        styles.sectionHeader,
        largeTextLayout ? styles.sectionHeaderLargeText : null,
        "border-t-market-ink",
      )}
    >
      <Text
        className={cn(
          styles.sectionTitle,
          largeTextLayout ? styles.sectionTitleLargeText : null,
          "text-market-ink",
        )}
      >
        {title}
      </Text>
      {actionLabel && onActionPress ? (
        <Pressable
          accessibilityRole="button"
          haptic
          onPress={onActionPress}
          className={cn(
            styles.sectionAction,
            largeTextLayout ? styles.sectionActionLargeText : null,
            "bg-transparent active:bg-market-soft-band",
          )}
        >
          <Text
            className={cn(
              styles.sectionActionLabel,
              largeTextLayout ? styles.sectionActionLabelLargeText : null,
              "text-market-accent-ink",
            )}
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
      className={cn(
        styles.emptyOrders,
        largeTextLayout ? styles.emptyOrdersLargeText : null,
        "border-b-market-line",
        "border-t-market-line",
      )}
      testID="business-home-market-ledger-empty-orders"
    >
      <View className={cn(styles.tillSeal, "border-market-accent-ink")}>
        <Icon color={marketDay.accentInk} name="ReceiptText" size={20} />
        <Text className={cn(styles.tillSealText, "text-market-accent-ink")}>
          CLEAR TILL
        </Text>
      </View>
      <View className={styles.emptyCopy}>
        <Text
          className={cn(
            styles.emptyTitle,
            largeTextLayout ? styles.emptyTitleLargeText : null,
            "text-market-ink",
          )}
        >
          No orders yet
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
        {actionLabel && onActionPress ? (
          <View className={styles.emptyAction}>
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

const styles = {
  businessButton:
    "items-center self-start flex-row gap-[6px] ml-[-8px] min-h-[44px] px-[8px]",
  businessName: "shrink text-[13px] font-extrabold [-rn-line-height:18]",
  businessNameLargeText: "[-rn-line-height:34]",
  currentMark: "rounded-full h-[8px] w-[8px]",
  detailLabel:
    "shrink-0 font-market-mono text-[10px] font-bold uppercase w-[92px]",
  detailLabelLargeText: "[-rn-line-height:24] w-full",
  detailLedger: "border-b-[length:var(--native-hairline)]",
  detailRow:
    "items-start border-t-[length:var(--native-hairline)] flex-row gap-[12px] min-h-[44px] py-[10px]",
  detailRowLargeText: "flex-col gap-[4px] py-[14px]",
  detailValue: "flex-1 text-[12px] [-rn-line-height:17]",
  detailValueLargeText: "[-rn-line-height:32]",
  emptyAction: "mt-[12px] max-w-[260px] w-full",
  emptyCopy: "flex-1 gap-[4px] min-w-[0px]",
  emptyMessage: "text-[12px] [-rn-line-height:17]",
  emptyMessageLargeText: "[-rn-line-height:34]",
  emptyOrders:
    "items-center border-b-[length:var(--native-hairline)] border-t-[length:var(--native-hairline)] flex-row gap-[16px] py-[16px]",
  emptyOrdersLargeText: "items-start flex-col",
  emptyTitle:
    "text-[16px] font-extrabold tracking-[-0.2px] [-rn-line-height:21]",
  emptyTitleLargeText: "[-rn-line-height:42]",
  fact: "border-r-[length:var(--native-hairline)] flex-1 gap-[5px] min-w-[0px] px-[12px] py-[13px]",
  factLabel:
    "text-[9px] font-extrabold tracking-[0.8px] [-rn-line-height:13] uppercase",
  factLabelLargeText: "[-rn-line-height:26]",
  factLast: "border-r-[0px]",
  factLargeText:
    "items-center border-b-[length:var(--native-hairline)] border-r-[0px] flex-row-reverse justify-between min-h-[84px] px-[0px]",
  facts: "border-b-[2px] border-t-[2px] flex-row",
  factsLargeText: "flex-col",
  factValue:
    "font-market-display text-[24px] font-black tracking-[-0.7px] [-rn-line-height:27]",
  factValueLargeText: "flex-1 [-rn-line-height:58] ml-[16px] text-right",
  hero: "pb-[18px] px-[20px]",
  heroAction:
    "items-center border-r-[length:var(--native-hairline)] h-[48px] justify-center relative w-[48px]",
  heroActions:
    "border-b-[length:var(--native-hairline)] border-l-[length:var(--native-hairline)] border-t-[length:var(--native-hairline)] flex-row",
  heroCopy: "flex-1 min-w-[0px]",
  heroCopyRow: "items-start flex-row gap-[14px] justify-between",
  heroCopyRowLargeText: "gap-[12px]",
  heroLargeText: "pb-[22px]",
  heroTitle:
    "font-market-display text-[31px] font-black tracking-[-1px] [-rn-line-height:30]",
  heroTitleLargeText: "text-[28px] [-rn-line-height:29]",
  ledgerMeta:
    "items-center border-b-[2px] flex-row gap-[12px] justify-between min-h-[38px] pb-[9px]",
  ledgerMetaLargeText: "items-start flex-col gap-[4px] min-h-[0px]",
  ledgerMetaTitle:
    "flex-1 font-market-mono text-[10px] font-bold tracking-[0.8px] [-rn-line-height:14]",
  ledgerMetaTitleLargeText: "flex-none [-rn-line-height:28]",
  ledgerSection: "gap-[14px]",
  nextLabel: "text-[11px] font-extrabold [-rn-line-height:15]",
  nextLabelLargeText: "[-rn-line-height:28]",
  notificationBadge:
    "rounded-full border-[2px] h-[10px] absolute right-[8px] top-[8px] w-[10px]",
  operationalEyebrow: "font-market-mono text-[9px] font-bold tracking-[0.8px]",
  operationalEyebrowLargeText: "[-rn-line-height:24]",
  operationalHeading: "items-end flex-row gap-[16px] justify-between",
  operationalHeadingLargeText: "items-start flex-col gap-[4px]",
  operationalTitle:
    "text-[21px] font-black tracking-[-0.5px] [-rn-line-height:26]",
  operationalTitleLargeText: "[-rn-line-height:50] w-full",
  progressColumn:
    "items-center border-r-[length:var(--native-hairline)] gap-[2px] pr-[12px] pt-[2px] w-[66px]",
  progressColumnLargeText:
    "items-center border-b-[length:var(--native-hairline)] border-r-[0px] flex-row justify-between pb-[10px] pr-[0px] w-full",
  progressLabel:
    "text-[8px] font-extrabold tracking-[0.7px] [-rn-line-height:11]",
  progressLabelLargeText: "[-rn-line-height:22]",
  progressValue:
    "font-market-display text-[30px] font-black tracking-[-1px] [-rn-line-height:34]",
  progressValueLargeText: "[-rn-line-height:52]",
  sectionAction:
    "items-center flex-row gap-[5px] justify-center min-h-[44px] px-[8px]",
  sectionActionLabel: "text-[12px] font-extrabold",
  sectionActionLabelLargeText: "[-rn-line-height:32]",
  sectionActionLargeText: "self-start px-[0px]",
  sectionHeader:
    "items-center border-t-[2px] flex-row gap-[16px] justify-between min-h-[52px]",
  sectionHeaderLargeText: "items-start flex-col gap-[0px] py-[8px]",
  sectionTitle:
    "flex-1 text-[20px] font-black tracking-[-0.5px] [-rn-line-height:25]",
  sectionTitleLargeText: "flex-none [-rn-line-height:48] w-full",
  setupCopy: "flex-1 gap-[8px] min-w-[0px]",
  setupDescription: "text-[12px] [-rn-line-height:17]",
  setupDescriptionLargeText: "[-rn-line-height:34]",
  setupHeadingRow: "items-center flex-row gap-[12px] justify-between",
  setupHeadingRowLargeText: "items-start flex-col gap-[3px]",
  setupLedger:
    "border-b-[length:var(--native-hairline)] flex-row gap-[12px] pb-[2px]",
  setupLedgerLargeText: "flex-col gap-[12px]",
  setupTitle:
    "flex-1 text-[21px] font-black tracking-[-0.5px] [-rn-line-height:26]",
  setupTitleLargeText: "flex-none [-rn-line-height:50] w-full",
  step: "items-center border-b-[length:var(--native-hairline)] flex-row gap-[8px] min-h-[52px] py-[7px]",
  stepCopy: "flex-1 gap-[2px] min-w-[0px]",
  stepDetail: "text-[10px] [-rn-line-height:14]",
  stepDetailLargeText: "[-rn-line-height:28]",
  stepLabel: "text-[12px] font-extrabold [-rn-line-height:17]",
  stepLabelLargeText: "[-rn-line-height:34]",
  stepLargeText: "items-start min-h-[64px] py-[10px]",
  stepList: "border-t-[length:var(--native-hairline)]",
  stepNumber: "font-market-mono text-[9px] font-bold w-[25px]",
  syncDot: "rounded-full h-[7px] w-[7px]",
  syncLabel: "text-[9px] font-extrabold [-rn-line-height:13]",
  syncLabelLargeText: "[-rn-line-height:26]",
  syncStatus: "items-center flex-row gap-[5px]",
  tillSeal:
    "items-center rounded-full border-[2px] gap-[2px] h-[62px] justify-center rotate-[-5deg] w-[62px]",
  tillSealText: "font-market-mono text-[7px] font-bold [-rn-line-height:9]",
  unavailableMark: "text-[16px] [-rn-line-height:20]",
} as const
