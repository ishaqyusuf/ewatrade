import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { MOBILE_DESIGN_FOUNDATION } from "@/lib/design-foundation"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"
import { View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
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
  keyboardBottomOffset?: number
  navItems: MobileAppShellNavItem[]
  onBusinessPress?: () => void
  role: MobileAppShellRole
  syncBanner?: ReactNode
  title: string
}

function FloatingNavItem({
  item,
}: {
  item: MobileAppShellNavItem
}) {
  return (
    <Pressable
      accessibilityLabel={item.accessibilityLabel ?? item.label}
      accessibilityRole="button"
      className={cn(
        "min-h-12 flex-1 items-center justify-center gap-1 rounded-2xl px-2 active:bg-accent",
        item.disabled && "opacity-50",
      )}
      disabled={item.disabled}
      haptic
      onPress={item.onPress}
      transition
    >
      <Icon
        className={cn(
          "size-base",
          item.isActive ? "text-primary" : "text-muted-foreground",
        )}
        name={item.icon}
      />
      <Text
        className={cn(
          "text-center text-[11px] font-semibold",
          item.isActive ? "text-primary" : "text-muted-foreground",
        )}
        numberOfLines={1}
      >
        {item.label}
      </Text>
    </Pressable>
  )
}

function FloatingCentralAction({
  item,
}: {
  item: MobileAppShellNavItem
}) {
  return (
    <Pressable
      accessibilityLabel={item.accessibilityLabel ?? item.label}
      accessibilityRole="button"
      className={cn(
        "h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg active:opacity-90",
        item.disabled && "opacity-50",
      )}
      disabled={item.disabled}
      haptic
      onPress={item.onPress}
      testID="mobile-shell-central-action"
      transition
    >
      <Icon className="size-md text-primary-foreground" name={item.icon} />
    </Pressable>
  )
}

export function MobileAppShell({
  businessName,
  centralAction,
  children,
  headerAction,
  keyboardBottomOffset = 140,
  navItems,
  onBusinessPress,
  role,
  syncBanner,
  title,
}: MobileAppShellProps) {
  const insets = useSafeAreaInsets()
  const visibleNavItems = navItems.filter(
    (item) => role === "owner" || !item.ownerOnly,
  )
  const leftItems = visibleNavItems.slice(0, 2)
  const rightItems = visibleNavItems.slice(2, 4)

  return (
    <View className="flex-1 bg-background" testID="mobile-app-shell">
      <MobileScreen
        contentClassName="gap-6"
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom + 116, 152),
        }}
        keyboardBottomOffset={keyboardBottomOffset}
      >
        <View className="flex-row items-center justify-between">
          <View className="min-w-0 flex-1 gap-1 pr-4">
            <Text className="text-3xl font-bold text-foreground">{title}</Text>
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

        {syncBanner}
        {children}
      </MobileScreen>

      <View
        pointerEvents="box-none"
        style={{
          bottom: Math.max(insets.bottom + 10, 18),
          left: 16,
          position: "absolute",
          right: 16,
        }}
      >
        <View
          className={cn(
            "min-h-20 flex-row items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-3 shadow-xl",
            MOBILE_DESIGN_FOUNDATION.layout.floatingControlRadiusClass,
          )}
          testID="mobile-shell-floating-nav"
        >
          <View className="flex-1 flex-row items-center gap-1">
            {leftItems.map((item) => (
              <FloatingNavItem item={item} key={item.label} />
            ))}
          </View>
          <FloatingCentralAction item={centralAction} />
          <View className="flex-1 flex-row items-center gap-1">
            {rightItems.map((item) => (
              <FloatingNavItem item={item} key={item.label} />
            ))}
          </View>
        </View>
      </View>
    </View>
  )
}
