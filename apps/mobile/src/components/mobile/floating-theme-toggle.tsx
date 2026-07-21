import { Pressable } from "@/components/ui/pressable"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { shouldShowFloatingThemeToggle } from "@/lib/app-variant"
import {
  type ThemeOverride,
  setThemeOverride,
} from "@/lib/theme-preference"
import { usePathname } from "expo-router"
import { useEffect, useState } from "react"
import { Image, Keyboard, StyleSheet, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

const THEME_TOGGLE_IMAGES = {
  light: require("@assets/images/theme-toggle-light.png"),
  dark: require("@assets/images/theme-toggle-dark.png"),
}

const TOGGLE_SIZE = 40
const TOGGLE_ICON_SIZE = 18
const OPERATIONAL_DOCK_PATHS = new Set([
  "/admin-home",
  "/dashboard",
  "/sales-rep-home",
])

export function FloatingThemeToggle() {
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const pathname = usePathname()
  const { colorScheme, setColorScheme, themeOverride } = useColorScheme()
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false)
  const hasOperationalDock = OPERATIONAL_DOCK_PATHS.has(pathname)

  useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardDidShow", () => {
      setIsKeyboardVisible(true)
    })
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      setIsKeyboardVisible(false)
    })

    return () => {
      showSubscription.remove()
      hideSubscription.remove()
    }
  }, [])

  if (
    !shouldShowFloatingThemeToggle() ||
    isKeyboardVisible ||
    pathname.startsWith("/design-system") ||
    pathname.startsWith("/updates")
  ) {
    return null
  }

  async function toggleColorScheme() {
    const nextOverride: ThemeOverride =
      themeOverride === "dark"
        ? "light"
        : themeOverride === "light"
          ? "dark"
          : colorScheme === "dark"
            ? "light"
            : "dark"

    setColorScheme(nextOverride)
    await setThemeOverride(nextOverride)
  }

  return (
    <View
      style={[
        styles.container,
        {
          // This development-only control stays independently available for
          // theme QA, but stacks above the production dock instead of covering it.
          bottom: Math.max(insets.bottom, 12) + (hasOperationalDock ? 104 : 16),
        },
      ]}
    >
      <Pressable
        accessibilityLabel="Toggle theme"
        accessibilityRole="button"
        haptic
        onPress={toggleColorScheme}
        style={{
          alignItems: "center",
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: 999,
          borderWidth: 1,
          height: TOGGLE_SIZE,
          justifyContent: "center",
          shadowColor: colors.foreground,
          shadowOffset: { height: 8, width: 0 },
          shadowOpacity: 0.18,
          shadowRadius: 16,
          width: TOGGLE_SIZE,
        }}
      >
        <Image source={THEME_TOGGLE_IMAGES[colorScheme]} style={styles.icon} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    right: 12,
    zIndex: 50,
  },
  icon: {
    height: TOGGLE_ICON_SIZE,
    width: TOGGLE_ICON_SIZE,
  },
})
