import { View } from "@/components/ui/view"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { StatusBar } from "expo-status-bar"
import { type ReactNode, useCallback, useRef, useState } from "react"
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  View as RNView,
} from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type { ReferenceFabsProps } from "./reference-fabs"
import { ReferenceFabs } from "./reference-fabs"

type ReferenceImmersiveScreenShellProps = ReferenceFabsProps & {
  bottomTabBar?: (state: { isHidden: boolean }) => ReactNode
  children: ReactNode
  hero: ReactNode
  scrolledStatusBarColor?: string
  scrolledStatusBarStyle?: "dark" | "light"
  statusBarColor: string
  statusBarSwitchOffset?: number
}

export function ReferenceImmersiveScreenShell({
  bottomTabBar,
  children,
  hero,
  scrolledStatusBarColor,
  scrolledStatusBarStyle,
  secondaryAccessibilityLabel,
  secondaryHref,
  secondaryIcon,
  statusBarColor,
  statusBarSwitchOffset = 1,
}: ReferenceImmersiveScreenShellProps) {
  const colors = useColors()
  const { colorScheme } = useColorScheme()
  const insets = useSafeAreaInsets()
  const [hasStartedScroll, setHasStartedScroll] = useState(false)
  const [isBottomTabHidden, setIsBottomTabHidden] = useState(false)
  const lastScrollYRef = useRef(0)

  const contentStatusBarStyle =
    scrolledStatusBarStyle ?? (colorScheme === "dark" ? "light" : "dark")
  const heroStatusBarStyle = colorScheme === "dark" ? "dark" : "light"
  const statusBarStyle = hasStartedScroll
    ? contentStatusBarStyle
    : heroStatusBarStyle
  const contentStatusBarBackgroundColor = scrolledStatusBarColor ?? colors.card
  const statusBarBackgroundColor = hasStartedScroll
    ? contentStatusBarBackgroundColor
    : statusBarColor
  const floatingFooterOffset = bottomTabBar ? 42 : 0

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const scrollY = Math.max(0, event.nativeEvent.contentOffset.y)
      const nextValue = scrollY > statusBarSwitchOffset
      const scrollDelta = scrollY - lastScrollYRef.current

      setHasStartedScroll((currentValue) =>
        currentValue === nextValue ? currentValue : nextValue,
      )

      if (scrollY <= statusBarSwitchOffset) {
        setIsBottomTabHidden(false)
      } else if (scrollDelta > 4) {
        setIsBottomTabHidden(true)
      } else if (scrollDelta < -4) {
        setIsBottomTabHidden(false)
      }

      lastScrollYRef.current = scrollY
    },
    [statusBarSwitchOffset],
  )

  return (
    <RNView style={{ backgroundColor: colors.background, flex: 1 }}>
      <StatusBar
        animated
        backgroundColor={statusBarBackgroundColor}
        style={statusBarStyle}
      />
      <RNView
        pointerEvents="none"
        style={{
          backgroundColor: statusBarBackgroundColor,
          elevation: 100,
          height: insets.top,
          left: 0,
          position: "absolute",
          right: 0,
          top: 0,
          zIndex: 100,
        }}
      />
      <KeyboardAwareScrollView
        className="flex-1"
        bottomOffset={bottomTabBar ? 176 : 132}
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: bottomTabBar
            ? Math.max(insets.bottom + 176, 208)
            : Math.max(insets.bottom + 96, 132),
        }}
        disableScrollOnKeyboardHide
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {hero}
        <View className="gap-5 px-6 pt-6">{children}</View>
      </KeyboardAwareScrollView>
      {bottomTabBar?.({ isHidden: isBottomTabHidden })}
      <ReferenceFabs
        bottomOffset={floatingFooterOffset}
        isHidden={isBottomTabHidden}
        secondaryAccessibilityLabel={secondaryAccessibilityLabel}
        secondaryHref={secondaryHref}
        secondaryIcon={secondaryIcon}
      />
    </RNView>
  )
}
