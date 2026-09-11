import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import type {
  SearchResult,
  SearchAction,
  SearchFrameProps,
  SearchHeaderProps,
} from "@/components/mobile/global-search/search-presentation"
import type { ReactNode } from "react"
import { ScrollView } from "react-native-css/components/ScrollView"
import { VariableContextProvider } from "nativewind"
import { StatusBar } from "expo-status-bar"
import { useSafeAreaInsets } from "react-native-safe-area-context"
export function ClassicSearchFrame({
  children,
  footerHeight,
  onScroll,
}: SearchFrameProps) {
  const insets = useSafeAreaInsets()
  const { colorScheme } = useColorScheme()
  return (
    <VariableContextProvider
      value={{
        "--search-safe-top": insets.top,
        "--search-content-top": insets.top + 24,
        "--search-content-bottom": footerHeight + 24,
      }}
    >
      <View className="flex-1 bg-background">
        <StatusBar animated style={colorScheme === "dark" ? "light" : "dark"} />
        <View
          pointerEvents="none"
          className="absolute inset-x-0 top-0 z-[100] h-[var(--search-safe-top)] bg-background"
        />
        <ScrollView
          automaticallyAdjustKeyboardInsets
          className="flex-1"
          contentContainerClassName="gap-6 px-6 pt-[var(--search-content-top)] pb-[var(--search-content-bottom)]"
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onScroll={onScroll}
          scrollEventThrottle={16}
        >
          {children}
        </ScrollView>
      </View>
    </VariableContextProvider>
  )
}
export function ClassicSearchHeader({ onClose, onLayout }: SearchHeaderProps) {
  return (
    <View onLayout={onLayout} className="flex-row items-center gap-3">
      <Pressable
        accessibilityLabel="Close global search"
        accessibilityRole="button"
        className="size-11 shrink-0 items-center justify-center rounded-full bg-card active:bg-accent"
        haptic
        onPress={onClose}
      >
        <Icon className="size-base text-foreground" name="ArrowLeft" />
      </Pressable>
      <View className="min-w-0 flex-1">
        <Text className="text-3xl font-extrabold tracking-tight text-foreground">
          Search
        </Text>
        <Text className="text-sm text-muted-foreground">
          Orders, customers, catalog, services, and staff
        </Text>
      </View>
    </View>
  )
}
export function ClassicSearchSection({
  title,
  children,
}: { title: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <Text
        accessibilityRole="header"
        className="text-lg font-extrabold text-foreground"
      >
        {title}
      </Text>
      <View className="border-y border-border">{children}</View>
    </View>
  )
}
function resultAppearance(type: SearchResult["type"]): {
  avatarClassName: string
  icon: IconKeys
} {
  if (type === "order") {
    return { avatarClassName: "bg-primary", icon: "ReceiptText" }
  }
  if (type === "customer") {
    return { avatarClassName: "bg-secondary", icon: "User" }
  }
  if (type === "service_job") {
    return { avatarClassName: "bg-accent", icon: "Wrench" }
  }
  if (type === "staff") {
    return { avatarClassName: "bg-muted", icon: "Users" }
  }
  return { avatarClassName: "bg-muted", icon: "Warehouse" }
}

export function ClassicSearchRow({
  item,
  onPress,
}: {
  item: SearchResult
  onPress: () => void
}) {
  const appearance = resultAppearance(item.type)

  return (
    <Pressable
      accessibilityLabel={`Open ${item.title}`}
      accessibilityRole="button"
      className="min-h-16 flex-row items-center gap-3 border-b border-border py-3 active:bg-accent"
      haptic
      onPress={onPress}
      transition
    >
      <View
        className={`size-11 items-center justify-center rounded-full ${appearance.avatarClassName}`}
      >
        <Icon
          className={
            item.type === "order"
              ? "size-sm text-primary-foreground"
              : "size-sm text-foreground"
          }
          name={appearance.icon}
        />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-extrabold text-foreground">{item.title}</Text>
        <Text className="text-xs text-muted-foreground">{item.subtitle}</Text>
      </View>
      <Icon className="size-sm text-muted-foreground" name="ChevronRight" />
    </Pressable>
  )
}

export function ClassicSearchActionRow({ action }: { action: SearchAction }) {
  return (
    <Pressable
      accessibilityHint={action.detail}
      accessibilityLabel={action.label}
      accessibilityRole="button"
      className="min-h-16 flex-row items-center gap-3 border-b border-border py-3 active:bg-accent"
      haptic
      onPress={action.onPress}
      transition
    >
      <View className="size-11 items-center justify-center rounded-full bg-muted">
        <Icon className="size-sm text-primary" name={action.icon} />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-extrabold text-foreground">{action.label}</Text>
        <Text className="text-xs text-muted-foreground">{action.detail}</Text>
      </View>
      <Icon className="size-sm text-muted-foreground" name="ChevronRight" />
    </Pressable>
  )
}
