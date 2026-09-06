import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { StatusBar } from "expo-status-bar"
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useRef,
  useState,
} from "react"
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  View as RNView,
  type RefreshControlProps,
  type StyleProp,
  View,
  type ViewStyle,
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
  backgroundColor?: string
  businessName: string
  centralAction: MobileAppShellNavItem
  children: ReactNode
  contentStyle?: StyleProp<ViewStyle>
  headerAction?: ReactNode
  hero?: ReactNode
  heroStatusBarStyle?: "dark" | "light"
  keyboardBottomOffset?: number
  navItems: MobileAppShellNavItem[]
  onBottomTabVisibilityChange?: (hidden: boolean) => void
  onBusinessPress?: () => void
  refreshControl?: ReactElement<RefreshControlProps>
  role: MobileAppShellRole
  scrolledStatusBarColor?: string
  scrolledStatusBarStyle?: "dark" | "light"
  showHeader?: boolean
  showBottomTabs?: boolean
  statusBarColor?: string
  statusBarFollowsHero?: boolean
  statusBarSwitchOffset?: number
  syncBanner?: ReactNode
  title: string
}

export function MobileAppShell({
  backgroundColor,
  businessName,
  centralAction,
  children,
  contentStyle,
  headerAction,
  hero,
  heroStatusBarStyle,
  keyboardBottomOffset = 140,
  navItems,
  onBottomTabVisibilityChange,
  onBusinessPress,
  refreshControl,
  role,
  scrolledStatusBarColor,
  scrolledStatusBarStyle,
  showBottomTabs = true,
  showHeader = true,
  statusBarColor,
  statusBarFollowsHero = false,
  statusBarSwitchOffset = 1,
  syncBanner,
  title,
}: MobileAppShellProps) {
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const { colorScheme } = useColorScheme()
  const [hasStartedScroll, setHasStartedScroll] = useState(false)
  const [heroHeight, setHeroHeight] = useState(0)
  const [isBottomTabHidden, setIsBottomTabHidden] = useState(false)
  const lastScrollYRef = useRef(0)
  const visibleNavItems = navItems.filter(
    (item) => role === "owner" || !item.ownerOnly,
  )
  const middleIndex = Math.ceil(visibleNavItems.length / 2)
  const leftItems = visibleNavItems.slice(0, middleIndex)
  const rightItems = visibleNavItems.slice(middleIndex)
  const bottomTabs: MobileBottomTab[] = [
    ...leftItems.map(toBottomTab),
    {
      accessibilityLabel:
        centralAction.accessibilityLabel ??
        (role === "owner" ? "Open create options" : "Create order"),
      disabled: centralAction.disabled,
      icon: centralAction.icon,
      kind: "action",
      label: centralAction.label,
      onPress: centralAction.onPress,
      testID: "mobile-shell-central-action",
    },
    ...rightItems.map(toBottomTab),
  ]
  const contentStatusBarStyle =
    scrolledStatusBarStyle ?? (colorScheme === "dark" ? "light" : "dark")
  const resolvedHeroStatusBarStyle =
    heroStatusBarStyle ?? (colorScheme === "dark" ? "dark" : "light")
  const shellBackgroundColor = backgroundColor ?? colors.background
  const shellStatusBarColor =
    statusBarColor ?? (hero ? colors.primary : shellBackgroundColor)
  const effectiveStatusBarSwitchOffset =
    statusBarFollowsHero && heroHeight > 0
      ? Math.max(0, heroHeight - insets.top)
      : statusBarSwitchOffset
  const bottomTabScrollThreshold = statusBarSwitchOffset
  const statusBarBackgroundColor = hasStartedScroll
    ? (scrolledStatusBarColor ?? colors.card)
    : shellStatusBarColor
  const statusBarStyle = hasStartedScroll
    ? contentStatusBarStyle
    : hero
      ? resolvedHeroStatusBarStyle
      : contentStatusBarStyle

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const scrollY = Math.max(0, event.nativeEvent.contentOffset.y)
      const nextHasStartedScroll =
        scrollY > 0 && scrollY + 0.5 >= effectiveStatusBarSwitchOffset
      const scrollDelta = scrollY - lastScrollYRef.current

      setHasStartedScroll((currentValue) =>
        currentValue === nextHasStartedScroll
          ? currentValue
          : nextHasStartedScroll,
      )

      if (scrollY <= bottomTabScrollThreshold) {
        setIsBottomTabHidden(false)
        onBottomTabVisibilityChange?.(false)
      } else if (scrollDelta > 4) {
        setIsBottomTabHidden(true)
        onBottomTabVisibilityChange?.(true)
      } else if (scrollDelta < -4) {
        setIsBottomTabHidden(false)
        onBottomTabVisibilityChange?.(false)
      }

      lastScrollYRef.current = scrollY
    },
    [
      bottomTabScrollThreshold,
      effectiveStatusBarSwitchOffset,
      onBottomTabVisibilityChange,
    ],
  )

  return (
    <RNView
      style={{ backgroundColor: shellBackgroundColor, flex: 1 }}
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
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom:
            Math.max(insets.bottom + 116, 152) +
            (statusBarFollowsHero ? insets.top : 0),
        }}
        disableScrollOnKeyboardHide
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        refreshControl={refreshControl}
        scrollEventThrottle={16}
        style={{ backgroundColor: shellBackgroundColor, flex: 1 }}
      >
        {hero ? (
          <RNView
            onLayout={(event) => {
              const nextHeroHeight = event.nativeEvent.layout.height
              setHeroHeight((currentHeight) =>
                currentHeight === nextHeroHeight
                  ? currentHeight
                  : nextHeroHeight,
              )
            }}
          >
            {hero}
          </RNView>
        ) : null}

        <RNView
          style={[
            {
              gap: 24,
              minHeight: !hero || statusBarFollowsHero ? "100%" : undefined,
              paddingHorizontal: 24,
              paddingTop: hero ? 24 : insets.top + 24,
            },
            contentStyle,
          ]}
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

      {showBottomTabs ? (
        <View pointerEvents="box-none" testID="mobile-shell-floating-nav">
          <MobileBottomTabs
            activeLabel="Home"
            floating
            haptic
            hideOnScroll
            isHidden={isBottomTabHidden}
            labelStack="vertical"
            safeArea
            showLabel
            showLabelOnActive={false}
            tabs={bottomTabs}
            variant="operational-detail"
          />
        </View>
      ) : null}
    </RNView>
  )
}

function toBottomTab(item: MobileAppShellNavItem): MobileBottomTab {
  return {
    accessibilityLabel: item.accessibilityLabel,
    disabled: item.disabled,
    icon: item.icon,
    isActive: item.isActive,
    kind: "navigation",
    label: item.label,
    onPress: item.onPress,
  }
}
