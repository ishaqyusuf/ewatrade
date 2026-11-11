import { BrandLogo } from "@/components/mobile/brand"
import { SalesExampleStage } from "@/components/mobile/green-till/auth-stage"
import { MobileScreen } from "@/components/mobile/screen"
import { Icon } from "@/components/ui/icon"
import { MotionView } from "@/components/ui/motion"
import { Pressable } from "@/components/ui/pressable"
import { StepTransition } from "@/components/ui/step-transition"
import { Text } from "@/components/ui/text"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { nativeStackStatusBarStyle } from "@/lib/native-stack-status-bar"
import type { StepDirection } from "@/lib/step-motion"
import { type Href, Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { type ReactNode, useId } from "react"
import { StyleSheet, View, useWindowDimensions } from "react-native"
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg"

type GreenTillAuthScreenProps = {
  children: ReactNode
  title: string
  subtitle?: ReactNode
  /** Kept for callers; Market Preview shows the title and subtitle only. */
  eyebrow?: string
  backHref?: Href
  onBack?: () => void
  backLabel?: string
  /** Long forms keep a shorter stage so fields stay above the keyboard. */
  compact?: boolean
  scrollEnabled?: boolean
  stageCollapsed?: boolean
  footerHeight?: number
  /** Replaces the title block, for example intro panel dots and copy. */
  headerContent?: ReactNode
  actions?: ReactNode
  footer?: ReactNode
  progress?: number
  progressTotal?: number
  motionKey?: string | number
  /**
   * With motionKey, which way the step changed. The body then drifts in from
   * that side (shared step motion) instead of only fading.
   */
  motionDirection?: StepDirection
  /** Cards on the mint stage. Defaults to the labelled sales example. */
  stage?: ReactNode
  /** The dimmed sign-in layout pairs grouped spacing with quieter artwork. */
  spacing?: "default" | "grouped" | "dimmed"
  testID?: string
}

const STAGE_HEIGHT = 266
const COMPACT_STAGE_HEIGHT = 266
const LARGE_TEXT_STAGE_HEIGHT = 120
// Workshop stage measurements include the status bar; MobileScreen adds it.
const DIMMED_STAGE_HEIGHT = 228
const NARROW_DIMMED_STAGE_HEIGHT = 190

/** Option 03 Market Preview: app cards on a mint stage above a light form sheet. */
export function GreenTillAuthScreen({
  children,
  title,
  subtitle,
  backHref,
  onBack,
  backLabel = "Previous step",
  compact = false,
  stageCollapsed = false,
  scrollEnabled = true,
  footerHeight = 0,
  headerContent,
  actions,
  footer,
  progress,
  progressTotal = 4,
  stage,
  spacing = "default",
  testID,
  motionKey,
  motionDirection,
}: GreenTillAuthScreenProps) {
  const { colorScheme } = useColorScheme()
  const colors = useColors()
  const largeText = useLargeTextLayout()
  const { width } = useWindowDimensions()
  const palette = GREEN_TILL_THEME[colorScheme]
  const gradientId = `market-stage-${useId().replace(/:/g, "")}`
  const dimmed = spacing === "dimmed"
  const narrow = width <= 340
  const showArtwork = !(largeText || stageCollapsed)
  const stageHeight = stageCollapsed
    ? 70
    : largeText
      ? LARGE_TEXT_STAGE_HEIGHT
      : dimmed
        ? narrow
          ? NARROW_DIMMED_STAGE_HEIGHT
          : DIMMED_STAGE_HEIGHT
        : compact
          ? COMPACT_STAGE_HEIGHT
          : STAGE_HEIGHT
  const iconTone = colorScheme === "dark" ? "light" : "dark"
  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={nativeStackStatusBarStyle(iconTone)} />
      <StatusBar style={iconTone} />
      <MobileScreen
        scrollEnabled={scrollEnabled}
        safeAreaColor={palette.stageCenter}
        backgroundColor={colors.background}
        contentClassName="px-0 py-0"
        keyboardBottomOffset={Math.max(24, footerHeight + 12)}
        testID={testID}
      >
        <View style={[styles.stage, { height: stageHeight }]}>
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Svg width="100%" height="100%" accessible={false}>
              <Defs>
                <RadialGradient
                  id={gradientId}
                  cx="80%"
                  cy="0%"
                  rx="90%"
                  ry="90%"
                >
                  <Stop offset="0" stopColor={palette.stageCenter} />
                  <Stop offset="0.7" stopColor={palette.stageEdge} />
                  <Stop offset="1" stopColor={palette.stageEdge} />
                </RadialGradient>
              </Defs>
              <Rect width="100%" height="100%" fill={`url(#${gradientId})`} />
            </Svg>
          </View>
          {showArtwork
            ? (stage ?? (
                <SalesExampleStage
                  layout={
                    dimmed ? (narrow ? "narrow-dimmed" : "dimmed") : "default"
                  }
                />
              ))
            : null}
          {showArtwork && dimmed ? (
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, styles.artworkShade]}
            >
              <Svg width="100%" height="100%" accessible={false}>
                <Defs>
                  <LinearGradient
                    id={`${gradientId}-veil`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="100%"
                  >
                    <Stop
                      offset="0"
                      stopColor={palette.stageEdge}
                      stopOpacity={0.35}
                    />
                    <Stop
                      offset="1"
                      stopColor={palette.stageEdge}
                      stopOpacity={0.61}
                    />
                  </LinearGradient>
                </Defs>
                <Rect
                  width="100%"
                  height="100%"
                  fill={`url(#${gradientId}-veil)`}
                />
              </Svg>
            </View>
          ) : null}
          <View
            className={
              dimmed
                ? undefined
                : "absolute left-5 right-4 top-3 min-h-11 flex-row items-center gap-2"
            }
            style={dimmed ? styles.stageControls : undefined}
          >
            <BrandLogo reverse={colorScheme === "dark"} width={92} />
            <View className="ml-auto flex-row items-center gap-2">
              {actions}
              {backHref || onBack ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={backLabel}
                  className="size-11 items-center justify-center rounded-full bg-card shadow-sm active:bg-accent"
                  href={backHref}
                  onPress={onBack}
                  haptic
                >
                  <Icon
                    name="ChevronLeft"
                    className="size-base text-foreground"
                  />
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
        {/* The sheet casts a soft shadow up onto the stage so it reads as its
            own layer (owner, 10 Oct). boxShadow, because Android elevation
            ignores shadowOffset and drew no upward shadow. */}
        <View
          style={[
            styles.sheet,
            spacing !== "default" ? styles.groupedSheet : null,
            dimmed ? styles.dimmedSheet : null,
            dimmed && narrow ? styles.narrowDimmedSheet : null,
            {
              backgroundColor: colors.background,
              boxShadow: dimmed
                ? `0 -6px 20px -12px ${palette.heroTo}59`
                : `0 -8px 26px -8px ${palette.heroTo}6B`,
            },
          ]}
        >
          {/* Grouped keeps the progress bar close to its title. */}
          <View
            style={spacing === "default" ? styles.header : styles.groupedHeader}
          >
            {headerContent ?? (
              <View className="gap-1">
                <Text
                  accessibilityRole="header"
                  className={
                    dimmed
                      ? undefined
                      : "text-[23px] font-extrabold tracking-tight [-rn-line-height:28] text-foreground"
                  }
                  style={
                    dimmed
                      ? [
                          styles.dimmedTitle,
                          narrow && styles.narrowDimmedTitle,
                          { color: colors.foreground },
                        ]
                      : undefined
                  }
                >
                  {title}
                </Text>
                {subtitle ? (
                  <Text className="text-xs [-rn-line-height:22] text-muted-foreground">
                    {subtitle}
                  </Text>
                ) : null}
              </View>
            )}
            {progress !== undefined ? (
              <GreenTillSetupProgress step={progress} total={progressTotal} />
            ) : null}
          </View>
          {motionKey === undefined ? (
            children
          ) : motionDirection !== undefined ? (
            <StepTransition
              direction={motionDirection}
              order={[motionKey]}
              step={motionKey}
            >
              {children}
            </StepTransition>
          ) : (
            <MotionView key={`body-${motionKey}`} fill>
              {children}
            </MotionView>
          )}
        </View>
      </MobileScreen>
      {footer}
    </View>
  )
}

/** Small round pill for the stage's top-right corner, such as Skip. */
export function AuthStagePill({
  label,
  onPress,
  accessibilityLabel,
}: {
  label: string
  onPress: () => void
  accessibilityLabel?: string
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      className="min-h-11 justify-center rounded-full bg-card px-4 shadow-sm active:bg-accent"
      onPress={onPress}
      haptic
    >
      <Text className="text-xs font-extrabold [-rn-line-height:22] text-foreground">
        {label}
      </Text>
    </Pressable>
  )
}

export function GreenTillSetupProgress({
  step,
  total = 4,
}: { step: number; total?: number }) {
  const { colorScheme } = useColorScheme()
  const colors = useColors()
  return (
    <View
      accessibilityLabel={`Step ${step} of ${total}`}
      accessible
      style={styles.progress}
    >
      {Array.from({ length: total }, (_, i) => i + 1).map((index) => (
        <View
          key={index}
          style={{
            flex: 1,
            height: 5,
            borderRadius: 5,
            backgroundColor:
              index < step
                ? colors.primary
                : index === step
                  ? GREEN_TILL_THEME[colorScheme].gold
                  : colors.border,
          }}
        />
      ))}
    </View>
  )
}

export function AuthFlowScreen(props: GreenTillAuthScreenProps) {
  return <GreenTillAuthScreen {...props} />
}

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    flex: 1,
    gap: 16,
    marginTop: -30,
    paddingBottom: 24,
    paddingHorizontal: 18,
    paddingTop: 28,
  },
  groupedSheet: { gap: 28, paddingHorizontal: 20, paddingTop: 32 },
  dimmedSheet: { marginTop: -26, paddingBottom: 56, paddingHorizontal: 24 },
  narrowDimmedSheet: { gap: 20, paddingHorizontal: 16, paddingTop: 24 },
  header: { gap: 16 },
  groupedHeader: { gap: 14 },
  stage: { overflow: "hidden", position: "relative" },
  artworkShade: { zIndex: 1, elevation: 9 },
  stageControls: {
    alignItems: "center",
    elevation: 10,
    flexDirection: "row",
    gap: 8,
    left: 20,
    minHeight: 44,
    position: "absolute",
    right: 16,
    top: 16,
    zIndex: 2,
  },
  dimmedTitle: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.6,
    lineHeight: 28,
  },
  narrowDimmedTitle: { fontSize: 21, lineHeight: 26 },
  progress: { flexDirection: "row", gap: 6 },
})
