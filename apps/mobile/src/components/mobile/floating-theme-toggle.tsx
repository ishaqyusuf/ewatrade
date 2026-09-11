import { Pressable } from "@/components/ui/pressable"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { shouldShowFloatingThemeToggle } from "@/lib/app-variant"
import {
  DEFAULT_FLOATING_THEME_TOGGLE_POSITION,
  type FloatingThemeTogglePosition,
  resolveFloatingThemeToggleCoordinates,
} from "@/lib/floating-theme-toggle-position"
import {
  getFloatingThemeTogglePosition,
  setFloatingThemeTogglePosition,
} from "@/lib/floating-theme-toggle-position-store"
import { type ThemeOverride, setThemeOverride } from "@/lib/theme-preference"
import { usePathname } from "expo-router"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Image, Keyboard, StyleSheet, useWindowDimensions } from "react-native"
import { Gesture, GestureDetector } from "react-native-gesture-handler"
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"

const THEME_TOGGLE_IMAGES = {
  light: require("@assets/images/theme-toggle-light.png"),
  dark: require("@assets/images/theme-toggle-dark.png"),
}

const TOGGLE_SIZE = 40
const TOGGLE_ICON_SIZE = 18
const EDGE_INSET = 12
const OPERATIONAL_DOCK_PATHS = new Set([
  "/admin-home",
  "/catalog",
  "/dashboard",
  "/more",
  "/orders",
  "/sales-rep-home",
  "/sign-up",
])
const PRIMARY_BUSINESS_PATHS = new Set([
  "/admin-home",
  "/catalog",
  "/dashboard",
  "/first-product-setup-modal",
  "/more",
  "/orders",
  "/sales-rep-home",
])
const FLOATING_ACTION_PATHS = new Set([
  "/business-switch-modal",
  "/catalog",
  "/catalog-items-modal",
  "/create-sale-modal",
  "/customer-book-modal",
  "/new-business-onboarding-modal",
  "/orders",
  "/staff-invite-modal",
])

export function FloatingThemeToggle() {
  const insets = useSafeAreaInsets()
  const { height: screenHeight, width: screenWidth } = useWindowDimensions()
  const colors = useColors()
  const pathname = usePathname()
  const { colorScheme, setColorScheme, themeOverride } = useColorScheme()
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false)
  const [savedPosition, setSavedPosition] =
    useState<FloatingThemeTogglePosition>(
      DEFAULT_FLOATING_THEME_TOGGLE_POSITION,
    )
  const hasOperationalDock = OPERATIONAL_DOCK_PATHS.has(pathname)
  const hasFloatingAction =
    FLOATING_ACTION_PATHS.has(pathname) || pathname.startsWith("/order/")
  const hasCustomerComposer =
    pathname.startsWith("/r/") || pathname.startsWith("/conversations/")
  const bottomClearance =
    Math.max(insets.bottom, EDGE_INSET) +
    (hasCustomerComposer
      ? 104
      : hasOperationalDock
        ? hasFloatingAction
          ? 184
          : 104
        : hasFloatingAction
          ? 160
          : 16)
  const bounds = useMemo(
    () => ({
      bottom: Math.max(
        insets.top + EDGE_INSET,
        screenHeight - bottomClearance - TOGGLE_SIZE,
      ),
      left: EDGE_INSET,
      right: Math.max(EDGE_INSET, screenWidth - EDGE_INSET - TOGGLE_SIZE),
      top: insets.top + EDGE_INSET,
    }),
    [bottomClearance, insets.top, screenHeight, screenWidth],
  )
  const initialCoordinates = resolveFloatingThemeToggleCoordinates(
    DEFAULT_FLOATING_THEME_TOGGLE_POSITION,
    bounds,
  )
  const x = useSharedValue(initialCoordinates.x)
  const y = useSharedValue(initialCoordinates.y)
  const dragStartX = useSharedValue(initialCoordinates.x)
  const dragStartY = useSharedValue(initialCoordinates.y)

  useEffect(() => {
    let active = true
    void getFloatingThemeTogglePosition().then((position) => {
      if (active) setSavedPosition(position)
    })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const coordinates = resolveFloatingThemeToggleCoordinates(
      savedPosition,
      bounds,
    )
    x.value = withSpring(coordinates.x, { damping: 20, stiffness: 220 })
    y.value = withSpring(coordinates.y, { damping: 20, stiffness: 220 })
  }, [bounds, savedPosition, x, y])

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

  const persistDraggedPosition = useCallback(
    (edge: "left" | "right", verticalRatio: number) => {
      const position = { edge, verticalRatio }
      setSavedPosition(position)
      void setFloatingThemeTogglePosition(position)
    },
    [],
  )

  const dragGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(6)
        .onBegin(() => {
          dragStartX.value = x.value
          dragStartY.value = y.value
        })
        .onUpdate((event) => {
          x.value = Math.min(
            Math.max(dragStartX.value + event.translationX, bounds.left),
            bounds.right,
          )
          y.value = Math.min(
            Math.max(dragStartY.value + event.translationY, bounds.top),
            bounds.bottom,
          )
        })
        .onEnd(() => {
          const edge =
            x.value + TOGGLE_SIZE / 2 <= screenWidth / 2 ? "left" : "right"
          const verticalRange = Math.max(0, bounds.bottom - bounds.top)
          const verticalRatio =
            verticalRange === 0 ? 0 : (y.value - bounds.top) / verticalRange
          x.value = withSpring(edge === "left" ? bounds.left : bounds.right, {
            damping: 18,
            stiffness: 240,
          })
          y.value = withSpring(
            Math.min(Math.max(y.value, bounds.top), bounds.bottom),
            { damping: 18, stiffness: 240 },
          )
          runOnJS(persistDraggedPosition)(edge, verticalRatio)
        }),
    [
      bounds.bottom,
      bounds.left,
      bounds.right,
      bounds.top,
      dragStartX,
      dragStartY,
      persistDraggedPosition,
      screenWidth,
      x,
      y,
    ],
  )

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }))

  if (
    !shouldShowFloatingThemeToggle() ||
    isKeyboardVisible ||
    pathname === "/" ||
    pathname === "/onboarding" ||
    pathname === "/verify-email" ||
    PRIMARY_BUSINESS_PATHS.has(pathname) ||
    pathname.startsWith("/business-switch-modal") ||
    pathname.startsWith("/design-system") ||
    pathname.startsWith("/domain-management-modal") ||
    pathname.startsWith("/order-reminder-settings-modal") ||
    pathname.startsWith("/payments-received-modal") ||
    pathname.startsWith("/reports-modal") ||
    pathname.startsWith("/subscription-modal") ||
    pathname.startsWith("/sync-status-modal") ||
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
    <GestureDetector gesture={dragGesture}>
      <Animated.View style={[styles.container, animatedStyle]}>
        <Pressable
          accessibilityHint="Double tap to change theme. Drag to move it to either screen edge."
          accessibilityLabel="Toggle theme"
          accessibilityRole="button"
          haptic
          hitSlop={8}
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
          <Image
            source={THEME_TOGGLE_IMAGES[colorScheme]}
            style={styles.icon}
          />
        </Pressable>
      </Animated.View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  container: {
    left: 0,
    position: "absolute",
    top: 0,
    zIndex: 50,
  },
  icon: {
    height: TOGGLE_ICON_SIZE,
    width: TOGGLE_ICON_SIZE,
  },
})
