import { AuthBrandHeader } from "@/components/mobile/auth-header"
import { BrandLogo } from "@/components/mobile/brand"
import { SalesExampleStage } from "@/components/mobile/green-till/auth-stage"
import { MobileScreen } from "@/components/mobile/screen"
import { Icon } from "@/components/ui/icon"
import { MotionView } from "@/components/ui/motion"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import type { MobileDesignScreen } from "@/lib/mobile-design/screens"
import { type Href, Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { type ReactNode, useId } from "react"
import { StyleSheet, View } from "react-native"
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg"

type GreenTillAuthScreenProps = {
  children: ReactNode
  title: string
  subtitle: ReactNode
  /** Kept for callers; Market Preview shows the title and subtitle only. */
  eyebrow?: string
  backHref?: Href
  onBack?: () => void
  backLabel?: string
  /** Long forms keep a shorter stage so fields stay above the keyboard. */
  compact?: boolean
  /** Replaces the title block, for example intro panel dots and copy. */
  headerContent?: ReactNode
  actions?: ReactNode
  footer?: ReactNode
  progress?: number
  motionKey?: string | number
  /** Cards on the mint stage. Defaults to the labelled sales example. */
  stage?: ReactNode
  testID?: string
}

const STAGE_HEIGHT = 250
const COMPACT_STAGE_HEIGHT = 250
const LARGE_TEXT_STAGE_HEIGHT = 120

/** Option 03 Market Preview: app cards on a mint stage above a light form sheet. */
export function GreenTillAuthScreen({
  children,
  title,
  subtitle,
  backHref,
  onBack,
  backLabel = "Previous step",
  compact = false,
  headerContent,
  actions,
  footer,
  progress,
  stage,
  testID,
  motionKey,
}: GreenTillAuthScreenProps) {
  const { colorScheme } = useColorScheme()
  const colors = useColors()
  const largeText = useLargeTextLayout()
  const palette = GREEN_TILL_THEME[colorScheme]
  const gradientId = `market-stage-${useId().replace(/:/g, "")}`
  const stageHeight = largeText
    ? LARGE_TEXT_STAGE_HEIGHT
    : compact
      ? COMPACT_STAGE_HEIGHT
      : STAGE_HEIGHT
  const iconTone = colorScheme === "dark" ? "light" : "dark"
  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ statusBarStyle: iconTone }} />
      <StatusBar style={iconTone} />
      <MobileScreen
        safeAreaColor={palette.stageCenter}
        backgroundColor={colors.background}
        contentClassName="px-0 py-0"
        keyboardBottomOffset={24}
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
          {largeText ? null : (stage ?? <SalesExampleStage />)}
          <View className="absolute left-5 right-4 top-1 min-h-11 flex-row items-center gap-2">
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
        <View className="-mt-[30px] flex-1 gap-4 rounded-t-[28px] bg-background px-[18px] pb-6 pt-5">
          {headerContent ?? (
            <View className="gap-1">
              <Text
                accessibilityRole="header"
                className="text-[23px] font-extrabold tracking-tight [-rn-line-height:28] text-foreground"
              >
                {title}
              </Text>
              <Text className="text-[13.5px] [-rn-line-height:20] text-muted-foreground">
                {subtitle}
              </Text>
            </View>
          )}
          {progress !== undefined ? (
            <GreenTillSetupProgress step={progress} />
          ) : null}
          {motionKey === undefined ? (
            children
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
      <Text className="text-[13px] font-extrabold [-rn-line-height:18] text-foreground">
        {label}
      </Text>
    </Pressable>
  )
}

export function GreenTillSetupProgress({ step }: { step: number }) {
  const { colorScheme } = useColorScheme()
  const colors = useColors()
  return (
    <View
      accessibilityLabel={`Step ${step} of 4`}
      accessible
      style={styles.progress}
    >
      {[1, 2, 3, 4].map((index) => (
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

/** Preserve the other appearance's generic entry surface. */
export function AuthFlowScreen({
  appearanceScreen = "sign-up",
  ...props
}: GreenTillAuthScreenProps & { appearanceScreen?: MobileDesignScreen }) {
  const design = useMobileDesign(appearanceScreen)
  if (design === "classic") return <GreenTillAuthScreen {...props} />
  return (
    <View className="flex-1 bg-background">
      <MobileScreen contentClassName="gap-6">
        <AuthBrandHeader
          title={props.title}
          subtitle={typeof props.subtitle === "string" ? props.subtitle : ""}
        />
        {props.children}
      </MobileScreen>
      {props.footer}
    </View>
  )
}

const styles = StyleSheet.create({
  stage: { overflow: "hidden", position: "relative" },
  progress: { flexDirection: "row", gap: 6 },
})
