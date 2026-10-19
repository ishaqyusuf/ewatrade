import { ActionButton } from "@/components/mobile/action-button"
import { BrandMark } from "@/components/mobile/brand"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { useColorScheme } from "@/hooks/use-color"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { useId, useState } from "react"
import { Text as NativeText, StyleSheet, View } from "react-native"
import Animated, {
  Easing,
  FadeIn,
  ReduceMotion,
  SlideInDown,
} from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg"

export type StockOutcomeAction = {
  label: string
  icon: IconKeys
  onPress: () => void
  loading?: boolean
  loadingLabel?: string
  disabled?: boolean
}

/**
 * Stock outcome (Workshop mobile/stock-review-outcomes 01 Ledger sheet): the
 * selected Sales recorded hero sheet, with the circle tinted by outcome.
 */
export function StockOutcomeSheet({
  tone,
  kicker,
  title,
  amount,
  amountUnit,
  rows,
  warning,
  primary,
  secondary,
  onHome,
}: {
  tone: "recorded" | "not_recorded" | "unknown"
  kicker: string
  title: string
  amount: string
  amountUnit?: string
  /** Optional third item: { selectable } lets a value (e.g. a reference) be copied. */
  rows: Array<[string, string] | [string, string, { selectable?: boolean }]>
  warning?: string | null
  primary: StockOutcomeAction
  secondary?: StockOutcomeAction
  onHome?: () => void
}) {
  const insets = useSafeAreaInsets()
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const gradientId = `stock-outcome-${useId().replace(/:/g, "")}`
  const [size, setSize] = useState({ height: 0, width: 0 })
  const fg = palette.heroForeground
  const muted = palette.heroMuted
  const circle =
    tone === "recorded"
      ? { bg: fg, fg: palette.heroTo, icon: "Check" as const }
      : tone === "not_recorded"
        ? {
            bg: palette.heroDown,
            fg: palette.roseForeground,
            icon: "X" as const,
          }
        : {
            bg: palette.gold,
            fg: palette.goldForeground,
            icon: "HelpCircle" as const,
          }

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Animated.View
        entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)}
        style={[StyleSheet.absoluteFill, { backgroundColor: palette.scrim }]}
      />
      <Animated.View
        accessibilityViewIsModal
        accessibilityLabel={title}
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
        testID="stock-outcome-sheet"
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
                <Stop offset="0" stopColor={palette.heroHighlight} />
                <Stop offset="0.4" stopColor={palette.heroFrom} />
                <Stop offset="1" stopColor={palette.heroTo} />
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
          <View style={[styles.circle, { backgroundColor: circle.bg }]}>
            <Icon
              className="size-[28px]"
              color={circle.fg}
              name={circle.icon}
              strokeWidth={2.6}
            />
          </View>
          <View style={styles.headText}>
            <NativeText style={[styles.kicker, { color: muted }]}>
              {kicker}
            </NativeText>
            <NativeText
              accessibilityRole="header"
              style={[styles.title, { color: fg }]}
            >
              {title}
            </NativeText>
          </View>
        </View>
        <NativeText
          maxFontSizeMultiplier={1.4}
          style={[styles.amount, { color: fg }]}
        >
          {amount}
          {amountUnit ? (
            <NativeText style={[styles.amountUnit, { color: muted }]}>
              {` ${amountUnit}`}
            </NativeText>
          ) : null}
        </NativeText>
        <View style={[styles.rows, { borderColor: palette.heroLine }]}>
          {rows.map(([label, value, options]) => (
            <View
              key={label}
              style={[styles.row, { borderColor: palette.heroLine }]}
            >
              <NativeText style={[styles.rowLabel, { color: muted }]}>
                {label}
              </NativeText>
              <NativeText
                selectable={options?.selectable}
                style={[styles.rowValue, { color: fg }]}
              >
                {value}
              </NativeText>
            </View>
          ))}
        </View>
        {warning ? (
          <View
            accessibilityRole="alert"
            style={[styles.warning, { backgroundColor: palette.heroChip }]}
          >
            <Icon
              className="size-[16px]"
              color={palette.gold}
              name="TriangleAlert"
            />
            <NativeText style={[styles.warningText, { color: fg }]}>
              {warning}
            </NativeText>
          </View>
        ) : null}
        <View style={styles.primary}>
          <ActionButton
            tone="cream"
            icon={primary.icon}
            disabled={primary.disabled}
            isLoading={primary.loading}
            loadingLabel={primary.loadingLabel}
            onPress={primary.onPress}
          >
            {primary.label}
          </ActionButton>
        </View>
        {secondary ? (
          <Pressable
            accessibilityLabel={secondary.label}
            accessibilityRole="button"
            accessibilityState={{ disabled: secondary.disabled }}
            disabled={secondary.disabled}
            haptic
            onPress={secondary.onPress}
            style={[
              styles.ghost,
              {
                backgroundColor: palette.heroChip,
                opacity: secondary.disabled ? 0.5 : 1,
              },
            ]}
          >
            <Icon className="size-[17px]" color={fg} name={secondary.icon} />
            <NativeText style={[styles.ghostLabel, { color: fg }]}>
              {secondary.label}
            </NativeText>
          </Pressable>
        ) : null}
        {onHome ? (
          <Pressable
            accessibilityLabel="Go to home"
            accessibilityRole="button"
            haptic
            onPress={onHome}
            style={styles.home}
          >
            <NativeText style={[styles.homeLabel, { color: muted }]}>
              Go to home
            </NativeText>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  amount: {
    fontSize: 34,
    fontVariant: ["tabular-nums"],
    fontWeight: "800",
    letterSpacing: -1.2,
    marginTop: 12,
  },
  amountUnit: { fontSize: 16, fontWeight: "700", letterSpacing: 0 },
  circle: {
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
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    marginTop: 10,
    minHeight: 46,
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
  primary: { marginTop: 14 },
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
  warning: {
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    padding: 12,
  },
  warningText: { flex: 1, fontSize: 16, lineHeight: 22 },
  watermark: { position: "absolute", right: -40, top: 30 },
})
