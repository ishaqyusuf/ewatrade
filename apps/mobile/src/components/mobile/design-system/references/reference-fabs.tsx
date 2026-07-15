import { Icon, type IconKeys } from "@/components/ui/icon"
import { useColorScheme } from "@/hooks/use-color"
import { useColors } from "@/hooks/use-color"
import { setThemeOverride } from "@/lib/theme-preference"
import { type LinkProps, useRouter } from "expo-router"
import { useEffect } from "react"
import { Pressable as RNPressable, View as RNView } from "react-native"
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"

export type ReferenceFabsProps = {
  bottomOffset?: number
  isHidden?: boolean
  secondaryAccessibilityLabel: string
  secondaryHref: LinkProps["href"]
  secondaryIcon: IconKeys
}

export function ReferenceFabs({
  bottomOffset = 0,
  isHidden = false,
  secondaryAccessibilityLabel,
  secondaryHref,
  secondaryIcon,
}: ReferenceFabsProps) {
  const router = useRouter()
  const { colorScheme, setColorScheme } = useColorScheme()
  const colors = useColors()
  const insets = useSafeAreaInsets()
  const isDark = colorScheme === "dark"
  const hiddenProgress = useSharedValue(isHidden ? 1 : 0)

  async function toggleTheme() {
    const nextTheme = isDark ? "light" : "dark"
    setColorScheme(nextTheme)
    await setThemeOverride(nextTheme)
  }

  const lowerBottom = Math.max(
    insets.bottom + bottomOffset + 12,
    bottomOffset + 24,
  )
  const hiddenTranslateY = Math.max(insets.bottom + bottomOffset + 156, 188)

  useEffect(() => {
    hiddenProgress.value = withTiming(isHidden ? 1 : 0, { duration: 220 })
  }, [hiddenProgress, isHidden])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 1 - hiddenProgress.value,
    transform: [{ translateY: hiddenProgress.value * hiddenTranslateY }],
  }))

  return (
    <Animated.View
      pointerEvents={isHidden ? "none" : "box-none"}
      style={[
        {
          bottom: lowerBottom,
          gap: 8,
          position: "absolute",
          right: 20,
          width: 56,
          zIndex: 1000,
        },
        animatedStyle,
      ]}
    >
      <ReferenceFabButton
        accessibilityLabel="Toggle reference screen theme"
        backgroundColor={colors.card}
        foregroundClassName="text-foreground"
        icon={isDark ? "EyeOff" : "Eye"}
        onPress={toggleTheme}
        routerPush={router.push}
        shadowColor={colors.foreground}
      />
      <ReferenceFabButton
        accessibilityLabel={secondaryAccessibilityLabel}
        backgroundColor={colors.primary}
        foregroundClassName="text-primary-foreground"
        href={secondaryHref}
        icon={secondaryIcon}
        routerPush={router.push}
        shadowColor={colors.foreground}
      />
    </Animated.View>
  )
}

function ReferenceFabButton({
  accessibilityLabel,
  backgroundColor,
  foregroundClassName,
  href,
  icon,
  onPress,
  routerPush,
  shadowColor,
}: {
  accessibilityLabel: string
  backgroundColor: string
  foregroundClassName: string
  href?: LinkProps["href"]
  icon: IconKeys
  onPress?: () => void
  routerPush: (href: LinkProps["href"]) => void
  shadowColor: string
}) {
  return (
    <RNView
      style={{
        elevation: 1000,
        height: 56,
        width: 56,
      }}
    >
      <RNPressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        onPress={() => {
          onPress?.()
          if (href) routerPush(href)
        }}
        style={{
          alignItems: "center",
          backgroundColor,
          borderRadius: 999,
          elevation: 10,
          height: 56,
          justifyContent: "center",
          shadowColor,
          shadowOpacity: 0.16,
          shadowRadius: 18,
          width: 56,
        }}
      >
        <Icon className={`size-base ${foregroundClassName}`} name={icon} />
      </RNPressable>
    </RNView>
  )
}
