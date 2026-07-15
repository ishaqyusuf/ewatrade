import { Pressable } from "@/components/ui/pressable"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { shouldShowFloatingThemeToggle } from "@/lib/app-variant"
import {
  type ThemeOverride,
  getThemeOverride,
  setThemeOverride,
} from "@/lib/theme-preference"
import { usePathname } from "expo-router"
import { useEffect, useState } from "react"
import { Image, StyleSheet, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

const THEME_TOGGLE_IMAGES = {
  light: require("@assets/images/theme-toggle-light.png"),
  dark: require("@assets/images/theme-toggle-dark.png"),
}

export function FloatingThemeToggle() {
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const pathname = usePathname()
  const { colorScheme, setColorScheme } = useColorScheme()
  const [themeOverride, setThemeOverrideState] =
    useState<ThemeOverride>("system")

  useEffect(() => {
    ;(async () => {
      const override = await getThemeOverride()
      setThemeOverrideState(override)
    })()
  }, [])

  if (
    !shouldShowFloatingThemeToggle() ||
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

    setThemeOverrideState(nextOverride)
    await setThemeOverride(nextOverride)
    setColorScheme(nextOverride)
  }

  return (
    <View
      style={[
        styles.container,
        {
          bottom: Math.max(insets.bottom, 16) + 24,
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
          height: 56,
          justifyContent: "center",
          shadowColor: colors.foreground,
          shadowOffset: { height: 8, width: 0 },
          shadowOpacity: 0.18,
          shadowRadius: 16,
          width: 56,
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
    right: 20,
    zIndex: 50,
  },
  icon: {
    height: 24,
    width: 24,
  },
})
