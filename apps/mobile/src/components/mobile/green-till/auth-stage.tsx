import { Icon, type IconKeys } from "@/components/ui/icon"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { GREEN_TILL_THEME, type GreenTillTint } from "@/lib/green-till-theme"
import { Children, type ReactElement, type ReactNode, useId } from "react"
import {
  StyleSheet,
  Text,
  View,
  type ViewStyle,
  useWindowDimensions,
} from "react-native"
import Animated, {
  Easing,
  FadeInLeft,
  FadeInRight,
  FadeOut,
  ReduceMotion,
} from "react-native-reanimated"
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg"

// 03 Market Preview: small app cards on a mint stage above each auth form.
// Sample figures are always labelled as examples; setup previews use the
// owner's own answers.

type Box = Pick<ViewStyle, "left" | "right" | "top" | "width"> & {
  rotate?: number
}

function usePalette() {
  const { colorScheme } = useColorScheme()
  return GREEN_TILL_THEME[colorScheme]
}

function frame({ rotate = 0, ...box }: Box): ViewStyle {
  return {
    position: "absolute",
    ...box,
    transform: [{ rotate: `${rotate}deg` }],
  }
}

export function StageHeroCard({
  label,
  value,
  chips = [],
  valueSize = 26,
  ...box
}: Box & {
  label: string
  value: string
  chips?: string[]
  valueSize?: number
}) {
  const palette = usePalette()
  const gradientId = `stage-hero-${useId().replace(/:/g, "")}`
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.card, frame(box), { shadowColor: palette.cardShadow }]}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient
              id={gradientId}
              cx="100%"
              cy="0%"
              rx="130%"
              ry="140%"
            >
              <Stop offset="0" stopColor={palette.heroHighlight} />
              <Stop offset="0.4" stopColor={palette.heroFrom} />
              <Stop offset="1" stopColor={palette.heroTo} />
            </RadialGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#${gradientId})`} />
        </Svg>
      </View>
      <Text
        maxFontSizeMultiplier={1.2}
        style={{
          color: palette.heroMuted,
          fontSize: 11,
          fontWeight: "700",
          lineHeight: 15,
        }}
      >
        {label}
      </Text>
      <Text
        maxFontSizeMultiplier={1.2}
        numberOfLines={1}
        style={{
          color: palette.heroForeground,
          fontSize: valueSize,
          fontWeight: "800",
          letterSpacing: -0.6,
          lineHeight: valueSize + 6,
          fontVariant: ["tabular-nums"],
        }}
      >
        {value}
      </Text>
      {chips.length ? (
        <View style={styles.chips}>
          {chips.map((chip) => (
            <View key={chip} style={styles.chip}>
              <Text
                maxFontSizeMultiplier={1.2}
                style={[styles.chipText, { color: palette.heroForeground }]}
              >
                {chip}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}

export function StageCard({
  icon,
  tint = "mint",
  title,
  subtitle,
  dashed = false,
  centered = false,
  ...box
}: Box & {
  icon?: IconKeys
  tint?: GreenTillTint
  title: string
  subtitle?: string
  dashed?: boolean
  centered?: boolean
}) {
  const palette = usePalette()
  const colors = useColors()
  const ink = dashed ? palette.stageInk : colors.foreground
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.card,
        frame(box),
        dashed
          ? {
              backgroundColor: "transparent",
              borderWidth: 1.5,
              borderStyle: "dashed",
              borderColor: palette.stageInk,
              elevation: 0,
              shadowOpacity: 0,
            }
          : { backgroundColor: colors.card, shadowColor: palette.cardShadow },
        centered ? { alignItems: "center" } : null,
      ]}
    >
      {icon ? (
        <View style={[styles.iconChip, { backgroundColor: palette[tint] }]}>
          <Icon
            name={icon}
            className="size-[15px]"
            color={palette[`${tint}Foreground`]}
          />
        </View>
      ) : null}
      <Text
        maxFontSizeMultiplier={1.2}
        numberOfLines={1}
        style={{ color: ink, fontSize: 13, fontWeight: "800", lineHeight: 18 }}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          maxFontSizeMultiplier={1.2}
          numberOfLines={1}
          style={{
            color: dashed ? palette.stageInk : colors.mutedForeground,
            fontSize: 11,
            lineHeight: 15,
          }}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  )
}

/** Login, sign-up and early access: an example Home, clearly labelled. */
export function SalesExampleStage() {
  return (
    <>
      <StageHeroCard
        label="Example · Today’s sales"
        value="₦184,500"
        chips={["14 orders", "Synced"]}
        left={22}
        right={60}
        top={44}
        rotate={-3}
      />
      <StageCard
        icon="Wallet"
        tint="amber"
        title="3 unpaid"
        subtitle="₦22,000 to collect"
        left={30}
        top={148}
        width={150}
        rotate={-2}
      />
      <StageCard
        icon="Warehouse"
        tint="mint"
        title="Eggs · ₦4,500"
        subtitle="40 crates"
        right={18}
        top={138}
        width={168}
        rotate={4}
      />
    </>
  )
}

export function VerifyStage({ email }: { email?: string }) {
  const { width } = useWindowDimensions()
  return (
    <StageCard
      icon="ShieldCheck"
      tint="mint"
      title="Check your email"
      subtitle={email || "We sent your code"}
      centered
      left={Math.max(16, (width - 220) / 2)}
      width={220}
      top={58}
    />
  )
}

/** Staff invitation: an example sales-rep day, clearly labelled. */
export function SalesRepExampleStage() {
  return (
    <>
      <StageHeroCard
        label="Example · Your sales today"
        value="₦46,000"
        chips={["5 sales", "Sales rep"]}
        left={22}
        right={60}
        top={44}
        rotate={-3}
      />
      <StageCard
        icon="ClipboardList"
        tint="amber"
        title="Close out at 6pm"
        subtitle="Cash and stock"
        right={18}
        top={138}
        width={168}
        rotate={4}
      />
    </>
  )
}

export function NoAccessStage() {
  return (
    <StageCard
      dashed
      title="No business yet"
      subtitle="Your workspace will appear here"
      left={24}
      right={24}
      top={58}
    />
  )
}

/** Setup steps: a preview of the owner's own Home, built from their answers. */
export function SetupPreviewStage({
  businessName,
  chips,
  ownerLine,
}: {
  businessName?: string
  chips: string[]
  ownerLine?: { title: string; subtitle: string }
}) {
  return (
    <>
      <StageHeroCard
        label="Your Home · preview"
        value={businessName?.trim() || "Your business"}
        valueSize={20}
        chips={chips.length ? chips : ["Setting up"]}
        left={22}
        right={40}
        top={44}
        rotate={-3}
      />
      {ownerLine ? (
        <StageCard
          icon="Users"
          tint="lilac"
          title={ownerLine.title}
          subtitle={ownerLine.subtitle}
          right={18}
          top={148}
          width={168}
          rotate={4}
        />
      ) : (
        <StageCard
          icon="Warehouse"
          tint="mint"
          title="First item next"
          subtitle="After setup"
          right={18}
          top={148}
          width={168}
          rotate={4}
        />
      )}
    </>
  )
}

/** Intro panels: what the app does, with example records. */
function IntroCards({ index }: { index: number }) {
  if (index === 1)
    return (
      <>
        <StageCard
          icon="Warehouse"
          tint="amber"
          title="Eggs"
          subtitle="₦4,500 per crate"
          left={24}
          top={48}
          width={150}
          rotate={-4}
        />
        <StageCard
          icon="Warehouse"
          tint="mint"
          title="Broilers"
          subtitle="₦6,500 per bird"
          right={24}
          top={68}
          width={150}
          rotate={3}
        />
        <StageCard
          icon="Warehouse"
          tint="sky"
          title="Feed 25kg"
          subtitle="₦14,000 per bag"
          left={80}
          top={148}
          width={170}
        />
      </>
    )
  if (index === 2)
    return (
      <>
        <StageCard
          title="Aisha Bello · ₦65,000"
          subtitle="Example · Paid · 10:42"
          left={22}
          right={22}
          top={52}
        />
        <StageCard
          icon="Clock"
          tint="amber"
          title="Mama Tunde · ₦4,500"
          subtitle="Waiting to sync"
          left={34}
          right={34}
          top={128}
          rotate={-2}
        />
      </>
    )
  return (
    <>
      <StageHeroCard
        label="Example · Workspace"
        value="Jawdah Farms"
        valueSize={20}
        chips={["Owner", "2 staff"]}
        left={22}
        right={60}
        top={44}
        rotate={-3}
      />
      <StageCard
        icon="UserPlus"
        tint="lilac"
        title="Musa joined"
        subtitle="Sales rep"
        right={18}
        top={138}
        width={168}
        rotate={4}
      />
    </>
  )
}

const introEase = Easing.out(Easing.cubic)

/**
 * Intro stage: cards slide in from the side the owner is moving towards, one
 * after another; the previous panel's cards fade out. Off under Reduce Motion.
 */
export function IntroStage({
  index,
  direction = 1,
}: {
  index: number
  direction?: 1 | -1
}) {
  const cards = Children.toArray(
    (IntroCards({ index }) as ReactElement<{ children: ReactNode }>).props
      .children,
  )
  return (
    <>
      {cards.map((card, cardIndex) => (
        <Animated.View
          // biome-ignore lint/suspicious/noArrayIndexKey: cards are fixed per panel
          key={`intro-${index}-${cardIndex}`}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          entering={(direction > 0 ? FadeInRight : FadeInLeft)
            .duration(320)
            .delay(cardIndex * 70)
            .easing(introEase)
            .withInitialValues({
              opacity: 0,
              transform: [{ translateX: 48 * direction }],
            })
            .reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(140).reduceMotion(ReduceMotion.System)}
        >
          {card}
        </Animated.View>
      ))}
    </>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    overflow: "hidden",
    paddingHorizontal: 14,
    paddingVertical: 12,
    elevation: 8,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 6 },
  chip: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipText: {
    fontSize: 10.5,
    // 800 mis-measures short labels on Android ("2 staff" drew as "2").
    fontWeight: "700",
    includeFontPadding: false,
    lineHeight: 14,
  },
  iconChip: {
    alignItems: "center",
    borderRadius: 9,
    height: 28,
    justifyContent: "center",
    marginBottom: 6,
    width: 28,
  },
})
