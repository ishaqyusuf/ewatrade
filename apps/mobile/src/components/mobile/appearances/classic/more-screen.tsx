import { StatusBadge } from "@/components/mobile/status-badge"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { useColorScheme } from "@/hooks/use-color"
import type { AdminMoreItem } from "@/lib/admin-navigation"
import {
  businessInitials,
  type MoreHeaderProps,
  type MoreFrameProps,
} from "@/components/mobile/more/more-presentation"
import { ScrollView } from "react-native-css/components/ScrollView"
import { VariableContextProvider } from "nativewind"
import { StatusBar } from "expo-status-bar"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import type { ReactNode } from "react"

export function ClassicMoreFrame({ children, onScroll }: MoreFrameProps) {
  const insets = useSafeAreaInsets()
  const { colorScheme } = useColorScheme()
  return (
    <VariableContextProvider
      value={{
        "--more-safe-top": insets.top,
        "--more-list-top": insets.top + 20,
        "--more-list-bottom": Math.max(insets.bottom + 116, 152),
      }}
    >
      <View className="flex-1 bg-background">
        <StatusBar animated style={colorScheme === "dark" ? "light" : "dark"} />
        <View
          pointerEvents="none"
          className="absolute inset-x-0 top-0 z-[100] h-[var(--more-safe-top)] bg-background"
        />
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pt-[var(--more-list-top)] pb-[var(--more-list-bottom)]"
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </View>
    </VariableContextProvider>
  )
}
export function ClassicMoreSection({
  title,
  children,
}: { title: string; children: ReactNode }) {
  return (
    <View className="mb-6">
      <Text className="mb-1 text-[11px] font-extrabold uppercase tracking-[1.5px] text-muted-foreground">
        {title}
      </Text>
      {children}
    </View>
  )
}
export function ClassicMoreHeader({
  onSyncPress,
  syncAlertCount,
  onLayout,
}: MoreHeaderProps) {
  const largeTextLayout = useLargeTextLayout()

  return (
    <View
      onLayout={onLayout}
      className={
        largeTextLayout
          ? "mb-5 items-start gap-3"
          : "mb-5 flex-row items-start justify-between gap-4"
      }
    >
      <View className={largeTextLayout ? "min-w-0" : "min-w-0 flex-1"}>
        <Text className="text-[34px] font-extrabold tracking-tight text-foreground">
          More
        </Text>
        <Text className="mt-1 text-sm text-muted-foreground">
          Manage your store and account.
        </Text>
      </View>
      <Pressable
        accessibilityLabel={
          syncAlertCount > 0
            ? `Open sync status, ${syncAlertCount} items need attention`
            : "Open sync status"
        }
        accessibilityRole="button"
        className="relative min-h-11 flex-row items-center gap-2 rounded-full border border-border bg-card px-4 active:bg-accent will-change-pressable"
        haptic
        onPress={onSyncPress}
      >
        <Icon className="size-sm text-primary" name="RefreshCw" />
        <Text className="text-sm font-extrabold text-primary">
          {syncAlertCount > 0 ? `Sync ${syncAlertCount}` : "Sync"}
        </Text>
        {syncAlertCount > 0 ? (
          <View className="absolute left-7 top-1 size-2.5 rounded-full border border-card bg-destructive" />
        ) : null}
      </Pressable>
    </View>
  )
}

export function ClassicMoreWorkspace({
  businessName,
  onPress,
  roleLabel,
}: {
  businessName: string
  onPress: () => void
  roleLabel: string
}) {
  const largeTextLayout = useLargeTextLayout()

  return (
    <Pressable
      accessibilityLabel={`Switch business from ${businessName}`}
      accessibilityRole="button"
      className={
        largeTextLayout
          ? "mb-6 min-h-20 flex-row items-start gap-4 rounded-2xl border border-border bg-card px-4 py-3"
          : "mb-6 min-h-20 flex-row items-center gap-4 rounded-2xl border border-border bg-card px-4 py-3"
      }
      haptic
      onPress={onPress}
      rippleOpacity={0.07}
    >
      <View
        className={
          largeTextLayout
            ? "mt-1 size-12 items-center justify-center rounded-full bg-primary"
            : "size-12 items-center justify-center rounded-full bg-primary"
        }
      >
        <Text className="font-extrabold text-primary-foreground">
          {businessInitials(businessName)}
        </Text>
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-lg font-bold text-foreground">
          {businessName}
        </Text>
        <Text
          className="mt-0.5 text-sm text-muted-foreground"
          numberOfLines={largeTextLayout ? undefined : 1}
        >
          {roleLabel} · Current business
        </Text>
      </View>
      <Icon
        className={
          largeTextLayout
            ? "mt-1 size-sm text-muted-foreground"
            : "size-sm text-muted-foreground"
        }
        name="ChevronRight"
      />
    </Pressable>
  )
}

export function ClassicMoreRow({
  detail,
  item,
  onPress,
}: {
  detail?: string
  item: AdminMoreItem
  onPress: () => void
}) {
  const largeTextLayout = useLargeTextLayout()

  return (
    <Pressable
      accessibilityHint={detail}
      accessibilityRole="button"
      accessibilityState={{ disabled: item.disabled }}
      className={
        item.disabled
          ? "min-h-16 flex-row items-stretch gap-3"
          : "min-h-16 flex-row items-stretch gap-3 active:bg-accent"
      }
      disabled={item.disabled}
      haptic
      onPress={onPress}
      transition
    >
      <View className={largeTextLayout ? "w-9 pt-4" : "w-9 justify-center"}>
        <View className="h-9 w-9 items-center justify-center rounded-full bg-muted">
          <Icon className="size-sm text-muted-foreground" name={item.icon} />
        </View>
      </View>
      <View
        className={
          largeTextLayout
            ? "min-w-0 flex-1 flex-row items-start gap-3 border-b border-border py-4"
            : "min-w-0 flex-1 flex-row items-center gap-3 border-b border-border py-4"
        }
      >
        <View className="min-w-0 flex-1 gap-1">
          <Text className="font-extrabold text-foreground">{item.label}</Text>
          {detail ? (
            <Text className="text-sm leading-5 text-muted-foreground">
              {detail}
            </Text>
          ) : null}
        </View>
        {item.disabled ? (
          <StatusBadge
            className={largeTextLayout ? "mt-1" : undefined}
            label="Set up"
            tone="warning"
          />
        ) : (
          <Icon
            className={
              largeTextLayout
                ? "mt-1 size-sm text-muted-foreground"
                : "size-sm text-muted-foreground"
            }
            name="ChevronRight"
          />
        )}
      </View>
    </Pressable>
  )
}
