import type {
  SearchAction,
  SearchFrameProps,
  SearchHeaderProps,
  SearchResult,
} from "@/components/mobile/global-search/search-presentation"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { StatusBar } from "expo-status-bar"
import { VariableContextProvider } from "nativewind"
import type { ReactNode } from "react"
import { ScrollView } from "react-native-css/components/ScrollView"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { matchParts, searchPayment } from "../../global-search/search-display"
import { ListCard, StatusPill } from "../../green-till/kit"
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
          contentContainerClassName="gap-4 px-[18px] pt-[var(--search-content-top)] pb-[var(--search-content-bottom)]"
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
        <Icon className="size-[20px] text-foreground" name="ArrowLeft" />
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
      <ListCard>{children}</ListCard>
    </View>
  )
}
export function ClassicSearchRow({
  item,
  onPress,
  query = "",
  sell = false,
}: {
  item: SearchResult
  onPress: () => void
  query?: string
  sell?: boolean
}) {
  const large = useLargeTextLayout()
  const payment = item.type === "order" ? searchPayment(item.subtitle) : null
  const [before, match, after] = matchParts(item.title, query)
  const icon: IconKeys =
    item.type === "order"
      ? "ReceiptText"
      : item.type === "customer"
        ? "User"
        : item.type === "service_job"
          ? "Wrench"
          : item.type === "staff"
            ? "Users"
            : "Warehouse"
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${sell ? "Sell" : "Open"} ${item.title}`}
      onPress={onPress}
      haptic
      className="min-h-[62px] gap-2 py-3"
    >
      <View className="flex-row items-center gap-3">
        <View className="size-[38px] items-center justify-center rounded-full bg-tint-lilac">
          <Icon
            name={icon}
            className="size-[20px] text-tint-lilac-foreground"
          />
        </View>
        <View className="min-w-0 flex-1">
          <Text
            className="text-sm font-bold text-foreground"
            numberOfLines={large ? undefined : 2}
          >
            {before}
            <Text className="bg-tint-amber text-tint-amber-foreground">
              {match}
            </Text>
            {after}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {payment
              ? item.subtitle.split(" · ").slice(0, -1).join(" · ")
              : item.subtitle}
          </Text>
        </View>
      </View>
      {payment ? <StatusPill {...payment} /> : null}
      {sell ? <StatusPill label="Sell" tone="ok" /> : null}
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
