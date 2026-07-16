import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { StatusBar } from "expo-status-bar"
import { type ReactNode, useCallback, useRef, useState } from "react"
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  View as RNView,
  View,
} from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { type MobileBottomTab, MobileBottomTabs } from "./bottom-tabs"

export type MobileAppShellRole = "attendant" | "owner"

export type MobileAppShellNavItem = {
  accessibilityLabel?: string
  disabled?: boolean
  icon: IconKeys
  isActive?: boolean
  label: string
  onPress: () => void
  ownerOnly?: boolean
}

type MobileAppShellProps = {
  businessName: string
  centralAction: MobileAppShellNavItem
  children: ReactNode
  headerAction?: ReactNode
  hero?: ReactNode
  keyboardBottomOffset?: number
  navItems: MobileAppShellNavItem[]
  onBusinessPress?: () => void
  role: MobileAppShellRole
  scrolledStatusBarColor?: string
  scrolledStatusBarStyle?: "dark" | "light"
  showHeader?: boolean
  statusBarColor?: string
  statusBarSwitchOffset?: number
  syncBanner?: ReactNode
  title: string
}

export function MobileAppShell({
  businessName,
  centralAction,
  children,
  headerAction,
  hero,
  keyboardBottomOffset = 140,
  navItems,
  onBusinessPress,
  role,
  scrolledStatusBarColor,
  scrolledStatusBarStyle,
  showHeader = true,
  statusBarColor,
  statusBarSwitchOffset = 1,
  syncBanner,
  title,
}: MobileAppShellProps) {
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const { colorScheme } = useColorScheme()
  const [hasStartedScroll, setHasStartedScroll] = useState(false)
  const [isBottomTabHidden, setIsBottomTabHidden] = useState(false)
  const lastScrollYRef = useRef(0)
  const visibleNavItems = navItems.filter(
    (item) => role === "owner" || !item.ownerOnly,
  )
  const leftItems = visibleNavItems.slice(0, 2)
  const rightItems = visibleNavItems.slice(2, 4)
  const bottomTabs: MobileBottomTab[] = [
    ...leftItems.map(toBottomTab),
    {
      icon: centralAction.icon,
      label: centralAction.label,
      onPress: centralAction.onPress,
      render: ({ active }) => (
        <RNView
          testID="mobile-shell-central-action"
          style={{
            alignItems: "center",
            height: 44,
            justifyContent: "center",
            overflow: "visible",
            position: "relative",
            width: 44,
            zIndex: 10,
          }}
        >
          <RNView
            style={{
              alignItems: "center",
              backgroundColor: colors.primary,
              borderRadius: 999,
              height: active ? 52 : 48,
              justifyContent: "center",
              position: "absolute",
              top: -20,
              width: active ? 52 : 48,
              zIndex: 10,
            }}
          >
            <Icon
              className="size-base"
              color={colors.primaryForeground}
              name={centralAction.icon}
            />
          </RNView>
        </RNView>
      ),
    },
    ...rightItems.map(toBottomTab),
  ]
  const contentStatusBarStyle =
    scrolledStatusBarStyle ?? (colorScheme === "dark" ? "light" : "dark")
  const heroStatusBarStyle = colorScheme === "dark" ? "dark" : "light"
  const shellStatusBarColor =
    statusBarColor ?? (hero ? colors.primary : colors.background)
  const statusBarBackgroundColor = hasStartedScroll
    ? (scrolledStatusBarColor ?? colors.card)
    : shellStatusBarColor
  const statusBarStyle = hasStartedScroll
    ? contentStatusBarStyle
    : heroStatusBarStyle

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const scrollY = Math.max(0, event.nativeEvent.contentOffset.y)
      const nextHasStartedScroll = scrollY > statusBarSwitchOffset
      const scrollDelta = scrollY - lastScrollYRef.current

      setHasStartedScroll((currentValue) =>
        currentValue === nextHasStartedScroll
          ? currentValue
          : nextHasStartedScroll,
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
    <RNView
      style={{ backgroundColor: colors.background, flex: 1 }}
      testID="mobile-app-shell"
    >
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
        testID="mobile-shell-status-bar-background"
      />
      <KeyboardAwareScrollView
        bottomOffset={keyboardBottomOffset}
        className="flex-1"
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: Math.max(insets.bottom + 116, 152),
        }}
        disableScrollOnKeyboardHide
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {hero}

        <RNView
          style={{
            gap: 24,
            minHeight: hero ? undefined : "100%",
            paddingHorizontal: 24,
            paddingTop: hero ? 24 : insets.top + 24,
          }}
        >
          {showHeader ? (
            <View className="flex-row items-center justify-between">
              <View className="min-w-0 flex-1 gap-1 pr-4">
                <Text className="text-3xl font-bold text-foreground">
                  {title}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  className="flex-row items-center gap-2 self-start active:opacity-80"
                  disabled={!onBusinessPress}
                  haptic
                  onPress={onBusinessPress}
                  transition
                >
                  <Text
                    className="text-base text-muted-foreground"
                    numberOfLines={1}
                  >
                    {businessName}
                  </Text>
                  {onBusinessPress ? (
                    <Icon
                      className="size-sm text-muted-foreground"
                      name="ChevronDown"
                    />
                  ) : null}
                </Pressable>
              </View>
              {headerAction}
            </View>
          ) : null}

          {syncBanner}
          {children}
        </RNView>
      </KeyboardAwareScrollView>

      <View pointerEvents="box-none" testID="mobile-shell-floating-nav">
        {/* Center action geometry follows MOBILE_DESIGN_FOUNDATION.layout.floatingControlRadiusClass. */}
        <MobileBottomTabs
          activeLabel="Home"
          floating
          haptic
          hideOnScroll
          isHidden={isBottomTabHidden}
          labelStack="horizontal"
          safeArea
          showLabel={false}
          showLabelOnActive
          tabs={bottomTabs}
          variant="reference"
        />
      </View>
    </RNView>
  )
}

function toBottomTab(item: MobileAppShellNavItem): MobileBottomTab {
  return {
    disabled: item.disabled,
    icon: item.icon,
    label: item.label,
    onPress: item.onPress,
  }
}
