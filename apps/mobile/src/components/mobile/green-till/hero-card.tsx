import { ActionButton } from "@/components/mobile/action-button"
import { BrandMark } from "@/components/mobile/brand"
import type { IconKeys } from "@/components/ui/icon"
import { Icon } from "@/components/ui/icon"
import { useColorScheme } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { type ReactNode, useId, useState } from "react"
import { Text as NativeText, StyleSheet, View } from "react-native"
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg"

export type HeroStat = {
  label: string
  value: string
  /** Gold value, for money still to collect. */
  accent?: boolean
}
export type HeroPill = {
  label: string
  tone?: "synced" | "offline" | "busy" | "draft"
}

type HeroCardProps = {
  /** Small label at the top left, such as "Today’s sales". */
  label?: string
  /** A gold check above the title, for a finished task. */
  done?: boolean
  pill?: HeroPill
  /** The one big answer, such as ₦184,500. */
  amount?: string
  /** A sentence-style headline used instead of an amount (setup states). */
  title?: string
  /** Muted line under the amount or title. */
  sub?: ReactNode
  /** A positive or negative change shown before the sub line. */
  delta?: { value: string; direction: "up" | "down" }
  stats?: HeroStat[]
  progress?: { done: number; total: number }
  /** A continuous bar above the stats, e.g. how much of an order is paid. */
  meter?: { label: string; percent: number; tone: "gold" | "up" }
  cta?: { label: string; icon?: IconKeys; onPress: () => void; testID?: string }
  children?: ReactNode
  /** Rendered above the label row, e.g. a customer's avatar and name. */
  top?: ReactNode
  testID?: string
}

/** The Green Till hero: gradient surface, brand watermark, one answer. */
export function HeroCard({
  amount,
  children,
  cta,
  delta,
  done,
  label,
  pill,
  progress,
  meter,
  stats,
  sub,
  testID,
  title,
  top,
}: HeroCardProps) {
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const largeText = useLargeTextLayout()
  const gradientId = `hero-${useId().replace(/:/g, "")}`
  // Size the gradient from the measured card: a percentage-sized Svg keeps its
  // first height when the card grows (seen with a CTA on Android).
  const [size, setSize] = useState({ height: 0, width: 0 })
  const fg = palette.heroForeground
  const muted = palette.heroMuted

  return (
    <View
      onLayout={(event) => {
        const { height, width } = event.nativeEvent.layout
        setSize((current) =>
          current.height === height && current.width === width
            ? current
            : { height, width },
        )
      }}
      style={[styles.card, { shadowColor: palette.heroTo }]}
      testID={testID}
    >
      <View style={[StyleSheet.absoluteFill, styles.clip]}>
        <Svg height={size.height} width={size.width}>
          <Defs>
            <RadialGradient
              cx="100%"
              cy="0%"
              id={gradientId}
              rx="130%"
              ry="140%"
            >
              <Stop offset="0" stopColor={palette.heroHighlight} />
              <Stop offset="0.4" stopColor={palette.heroFrom} />
              <Stop offset="1" stopColor={palette.heroTo} />
            </RadialGradient>
          </Defs>
          <Rect fill={`url(#${gradientId})`} height="100%" width="100%" />
        </Svg>
        <View pointerEvents="none" style={styles.watermark}>
          <BrandMark color={palette.heroWatermark} size={170} />
        </View>
      </View>

      {top ? <View style={styles.top}>{top}</View> : null}
      {label || pill ? (
        <View style={styles.row}>
          <NativeText style={[styles.label, { color: muted }]}>
            {label}
          </NativeText>
          {pill ? <HeroSyncPill palette={palette} pill={pill} /> : null}
        </View>
      ) : null}
      {done ? (
        <View
          accessibilityLabel="Done"
          accessible
          style={[styles.done, { backgroundColor: palette.gold }]}
        >
          <Icon
            className="size-[26px]"
            color={palette.goldForeground}
            name="Check"
            strokeWidth={2.6}
          />
        </View>
      ) : null}

      {amount ? (
        <NativeText
          accessibilityRole="header"
          adjustsFontSizeToFit={!largeText}
          numberOfLines={largeText ? undefined : 1}
          style={[styles.amount, { color: fg }]}
        >
          {amount}
        </NativeText>
      ) : null}
      {title ? (
        <NativeText
          accessibilityRole="header"
          style={[styles.title, { color: fg }]}
        >
          {title}
        </NativeText>
      ) : null}
      {delta || sub ? (
        <View style={styles.deltaRow}>
          {delta ? (
            <View style={styles.deltaValue}>
              <Icon
                className="size-[12px]"
                color={
                  delta.direction === "up" ? palette.heroUp : palette.heroDown
                }
                name={delta.direction === "up" ? "ArrowUp" : "ArrowDown"}
              />
              <NativeText
                style={[
                  styles.deltaText,
                  {
                    color:
                      delta.direction === "up"
                        ? palette.heroUp
                        : palette.heroDown,
                  },
                ]}
              >
                {delta.value}
              </NativeText>
            </View>
          ) : null}
          {typeof sub === "string" ? (
            <NativeText style={[styles.sub, { color: muted }]}>
              {sub}
            </NativeText>
          ) : (
            sub
          )}
        </View>
      ) : null}

      {progress ? (
        <View
          accessibilityLabel={`${progress.done} of ${progress.total} done`}
          accessible
          style={styles.progress}
        >
          {Array.from({ length: progress.total }, (_, index) => (
            <View
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length bar
              key={index}
              style={[
                styles.progressBar,
                {
                  backgroundColor:
                    index < progress.done
                      ? palette.gold
                      : "rgba(255,255,255,0.18)",
                },
              ]}
            />
          ))}
        </View>
      ) : null}

      {meter ? <HeroMeter meter={meter} palette={palette} /> : null}

      {stats?.length ? (
        <View
          style={[
            styles.stats,
            { borderTopColor: palette.heroLine },
            largeText && styles.statsStacked,
          ]}
        >
          {stats.map((stat, index) => (
            <View
              accessible
              accessibilityLabel={`${stat.label}: ${stat.value}`}
              key={stat.label}
              style={[
                styles.stat,
                index > 0 &&
                  !largeText && {
                    borderLeftColor: palette.heroLine,
                    borderLeftWidth: 1,
                    paddingLeft: 12,
                  },
              ]}
            >
              <NativeText style={[styles.statLabel, { color: muted }]}>
                {stat.label}
              </NativeText>
              <NativeText
                numberOfLines={largeText ? undefined : 1}
                style={[
                  styles.statValue,
                  { color: stat.accent ? palette.gold : fg },
                ]}
              >
                {stat.value}
              </NativeText>
            </View>
          ))}
        </View>
      ) : null}

      {children}

      {cta ? (
        <View style={styles.cta}>
          <ActionButton
            icon={cta.icon}
            onPress={cta.onPress}
            testID={cta.testID}
            tone="cream"
          >
            {cta.label}
          </ActionButton>
        </View>
      ) : null}
    </View>
  )
}

function HeroSyncPill({
  palette,
  pill,
}: {
  palette: (typeof GREEN_TILL_THEME)["light" | "dark"]
  pill: HeroPill
}) {
  const dot =
    pill.tone === "offline"
      ? palette.dotOffline
      : pill.tone === "busy"
        ? palette.dotBusy
        : pill.tone === "draft"
          ? palette.gold
          : palette.dotSynced
  return (
    <View
      accessibilityLabel={pill.label}
      accessible
      style={[styles.pill, { backgroundColor: palette.heroChip }]}
    >
      <View style={[styles.pillDot, { backgroundColor: dot }]} />
      <NativeText style={[styles.pillText, { color: palette.heroForeground }]}>
        {pill.label}
      </NativeText>
    </View>
  )
}

const styles = StyleSheet.create({
  amount: {
    fontSize: 36,
    fontVariant: ["tabular-nums"],
    fontWeight: "800",
    letterSpacing: -1.2,
    lineHeight: 42,
    marginBottom: 2,
    marginTop: 6,
  },
  card: {
    borderRadius: 26,
    elevation: 8,
    paddingBottom: 16,
    paddingHorizontal: 18,
    paddingTop: 18,
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
  },
  clip: { borderRadius: 26, overflow: "hidden" },
  top: { marginBottom: 16 },
  cta: { marginTop: 14 },
  done: {
    alignItems: "center",
    borderRadius: 26,
    height: 52,
    justifyContent: "center",
    marginBottom: 2,
    width: 52,
  },
  deltaRow: {
    alignItems: "center",
    columnGap: 6,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  deltaText: { fontSize: 12.5, fontWeight: "700", lineHeight: 18 },
  deltaValue: { alignItems: "center", flexDirection: "row", gap: 2 },
  label: { flexShrink: 1, fontSize: 12.5, fontWeight: "700", lineHeight: 18 },
  pill: {
    alignItems: "center",
    borderRadius: 999,
    flexDirection: "row",
    gap: 5,
    height: 24,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  pillDot: { borderRadius: 3, height: 6, width: 6 },
  pillText: {
    fontSize: 11,
    fontWeight: "700",
    includeFontPadding: false,
    lineHeight: 14,
    textAlignVertical: "center",
  },
  progress: { flexDirection: "row", gap: 6, marginTop: 14 },
  meter: {
    borderRadius: 999,
    height: 8,
    marginTop: 14,
    overflow: "hidden",
  },
  progressBar: { borderRadius: 6, flex: 1, height: 6 },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
  },
  stat: { flex: 1, minWidth: 0 },
  statLabel: { fontSize: 11, fontWeight: "600", lineHeight: 15 },
  statValue: {
    fontSize: 15,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
    lineHeight: 21,
  },
  stats: {
    borderTopWidth: 1,
    flexDirection: "row",
    marginTop: 14,
    paddingTop: 12,
  },
  statsStacked: { flexDirection: "column", gap: 8 },
  sub: { flexShrink: 1, fontSize: 13, lineHeight: 18 },
  title: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
    lineHeight: 27,
    marginBottom: 4,
    marginTop: 8,
  },
  watermark: { bottom: -30, position: "absolute", right: -22 },
})

/** Paid share of an order, sized in pixels from the measured track. */
function HeroMeter({
  meter,
  palette,
}: {
  meter: NonNullable<HeroCardProps["meter"]>
  palette: (typeof GREEN_TILL_THEME)["light"]
}) {
  const [width, setWidth] = useState(0)
  const percent = Math.max(0, Math.min(100, meter.percent))
  return (
    <View
      accessibilityLabel={meter.label}
      accessibilityRole="progressbar"
      accessibilityValue={{ max: 100, min: 0, now: percent }}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[styles.meter, { backgroundColor: palette.heroLine }]}
    >
      <View
        style={{
          backgroundColor:
            meter.tone === "gold" ? palette.gold : palette.heroUp,
          borderRadius: 999,
          height: 8,
          width: Math.round((width * percent) / 100),
        }}
      />
    </View>
  )
}
