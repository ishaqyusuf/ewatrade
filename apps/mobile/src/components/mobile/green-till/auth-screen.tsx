import { AuthBrandHeader } from "@/components/mobile/auth-header"
import { BrandLogo, BrandMark } from "@/components/mobile/brand"
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
import { Platform, StyleSheet, View } from "react-native"
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg"

type GreenTillAuthScreenProps = {
  children: ReactNode
  title: string
  subtitle: string
  eyebrow?: string
  backHref?: Href
  onBack?: () => void
  backLabel?: string
  compact?: boolean
  headerContent?: ReactNode
  actions?: ReactNode
  footer?: ReactNode
  progress?: number
  motionKey?: string | number
  testID?: string
}

/** Option 01: one branded entry surface and a keyboard-safe form sheet. */
export function GreenTillAuthScreen({
  children,
  title,
  subtitle,
  eyebrow,
  backHref,
  onBack,
  backLabel = "Previous step",
  compact = false,
  headerContent,
  actions,
  footer,
  progress,
  testID,
  motionKey,
}: GreenTillAuthScreenProps) {
  const { colorScheme } = useColorScheme()
  const colors = useColors()
  const largeText = useLargeTextLayout()
  const palette = GREEN_TILL_THEME[colorScheme]
  const gradientId = `green-gate-${useId().replace(/:/g, "")}`
  return (
    <View className="flex-1 bg-card">
      <Stack.Screen options={{ statusBarStyle: "light" }} />
      <StatusBar style="light" />
      <MobileScreen
        safeAreaColor={palette.heroFrom}
        backgroundColor={colors.card}
        contentClassName="px-0 py-0"
        keyboardAutoScrollEnabled={
          largeText || compact || Platform.OS !== "android"
        }
        keyboardBottomOffset={24}
        testID={testID}
      >
        <View className="overflow-hidden px-[22px] pb-[52px] pt-[18px]">
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Svg width="100%" height="100%" accessible={false}>
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
          <View
            pointerEvents="none"
            className="absolute -bottom-10 -right-8 opacity-[0.07]"
          >
            <BrandMark size={200} color={palette.brandMark} />
          </View>
          <View className="min-h-11 flex-row items-center gap-3">
            {backHref || onBack ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={backLabel}
                className="size-11 items-center justify-center rounded-full bg-white/15 active:bg-white/25"
                href={backHref}
                onPress={onBack}
                haptic
              >
                <Icon name="ChevronLeft" className="size-base text-white" />
              </Pressable>
            ) : null}
            <BrandLogo reverse width={120} />
            {actions ? <View className="ml-auto">{actions}</View> : null}
          </View>
          {headerContent ?? (
            <View className="mt-5 gap-1.5">
              {eyebrow ? (
                <Text
                  style={{
                    color: palette.heroMuted,
                    fontSize: 12,
                    fontWeight: "800",
                    lineHeight: 18,
                  }}
                >
                  {eyebrow}
                </Text>
              ) : null}
              {!compact ? (
                <>
                  <Text
                    accessibilityRole="header"
                    style={{
                      color: palette.heroForeground,
                      fontSize: 26,
                      fontWeight: "800",
                      lineHeight: 31,
                      letterSpacing: -0.6,
                    }}
                  >
                    {title}
                  </Text>
                  <Text
                    style={{
                      color: palette.heroMuted,
                      fontSize: 14,
                      lineHeight: 21,
                    }}
                  >
                    {subtitle}
                  </Text>
                </>
              ) : null}
            </View>
          )}
        </View>
        <View className="-mt-[26px] flex-1 gap-4 rounded-t-[26px] bg-card px-[18px] py-[22px]">
          {compact ? (
            <View className="gap-1.5">
              <Text
                accessibilityRole="header"
                className="text-[22px] font-extrabold [-rn-line-height:28] text-foreground"
              >
                {title}
              </Text>
              <Text className="text-sm [-rn-line-height:21] text-muted-foreground">
                {subtitle}
              </Text>
            </View>
          ) : null}
          {progress !== undefined ? (
            <GreenTillSetupProgress step={progress} />
          ) : null}
          {motionKey === undefined ? (
            children
          ) : (
            <MotionView key={motionKey} fill>
              {children}
            </MotionView>
          )}
        </View>
      </MobileScreen>
      {footer}
    </View>
  )
}

export function GreenTillSetupProgress({ step }: { step: number }) {
  const { colorScheme } = useColorScheme()
  const colors = useColors()
  return (
    <View
      accessibilityLabel={`Step ${step} of 4`}
      accessible
      className="flex-row gap-1.5"
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
        <AuthBrandHeader title={props.title} subtitle={props.subtitle} />
        {props.children}
      </MobileScreen>
      {props.footer}
    </View>
  )
}
