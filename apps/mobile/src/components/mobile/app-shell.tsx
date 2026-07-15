import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useColors } from "@/hooks/use-color"
import type { ReactNode } from "react"
import { View, View as RNView } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { MobileBottomTabs, type MobileBottomTab } from "./bottom-tabs"
import { MobileScreen } from "./screen"

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
  showHeader?: boolean
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
  showHeader = true,
  syncBanner,
  title,
}: MobileAppShellProps) {
  const insets = useSafeAreaInsets()
  const colors = useColors()
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

  return (
    <View className="flex-1 bg-background" testID="mobile-app-shell">
      <MobileScreen
        contentClassName="gap-6"
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom + 116, 152),
        }}
        keyboardBottomOffset={keyboardBottomOffset}
      >
        {hero}

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
      </MobileScreen>

      <MobileBottomTabs
        activeLabel="Home"
        floating
        haptic
        hideOnScroll={false}
        labelStack="horizontal"
        safeArea
        showLabel={false}
        showLabelOnActive
        tabs={bottomTabs}
        variant="reference"
      />
    </View>
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
