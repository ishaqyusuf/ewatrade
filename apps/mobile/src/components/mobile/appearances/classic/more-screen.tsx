import type {
  MoreFrameProps,
  MoreHeaderProps,
} from "@/components/mobile/more/more-presentation"
import { StatusBadge } from "@/components/mobile/status-badge"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { useScrollEdgeFeedback } from "@/hooks/use-scroll-edge-feedback"
import type { AdminMoreItem } from "@/lib/admin-navigation"
import { StatusBar } from "expo-status-bar"
import { VariableContextProvider } from "nativewind"
import type { ReactNode } from "react"
import { ScrollView } from "react-native-css/components/ScrollView"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ActionButton } from "../../action-button"
import { HeroCard } from "../../green-till/hero-card"
import { ListCard, RecordRow, SectionHeader } from "../../green-till/kit"

export function ClassicMoreFrame({ children, onScroll }: MoreFrameProps) {
  const edgeFeedback = useScrollEdgeFeedback()
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
          {...edgeFeedback}
          className="flex-1"
          contentContainerClassName="gap-4 px-[18px] pt-[var(--more-list-top)] pb-[var(--more-list-bottom)]"
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
    <View>
      <SectionHeader title={title} />
      <ListCard>{children}</ListCard>
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
        <Icon className="size-[20px] text-primary" name="RefreshCw" />
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
  return (
    <HeroCard label="Current business" title={businessName} sub={roleLabel}>
      <View className="mt-4">
        <ActionButton tone="cream" icon="ArrowLeftRight" onPress={onPress}>
          Switch business
        </ActionButton>
      </View>
    </HeroCard>
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
  const colors = useColors()
  return (
    <RecordRow
      stackDetails
      title={item.label}
      meta={detail}
      avatar={{
        icon: item.icon,
        tint: item.id === "sign-out" ? "rose" : "lilac",
      }}
      status={
        item.disabled ? (
          <StatusBadge label="Set up" tone="warning" />
        ) : item.id === "sign-out" ? undefined : (
          <Icon
            className="size-[16px]"
            color={colors.mutedForeground}
            name="ChevronRight"
          />
        )
      }
      onPress={item.disabled ? undefined : onPress}
    />
  )
}
