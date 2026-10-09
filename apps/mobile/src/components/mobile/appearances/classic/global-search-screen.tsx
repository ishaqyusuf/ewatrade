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
import { useColorScheme, useColors } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { GREEN_TILL_THEME, type GreenTillTint } from "@/lib/green-till-theme"
import { cn } from "@/lib/utils"
import { StatusBar } from "expo-status-bar"
import { VariableContextProvider } from "nativewind"
import type { ReactNode } from "react"
import {
  ScrollView as NativeScrollView,
  Text as NativeText,
  Platform,
} from "react-native"
import { ScrollView } from "react-native-css/components/ScrollView"
import { useKeyboardState } from "react-native-keyboard-controller"
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
  // iOS insets the scroll view for the keyboard itself; Android needs the
  // keyboard's height as extra room so the last result scrolls above the field.
  const keyboardHeight = useKeyboardState((state) =>
    Platform.OS === "android" && state.isVisible ? state.height : 0,
  )
  return (
    <VariableContextProvider
      value={{
        "--search-safe-top": insets.top,
        "--search-content-top": insets.top + 12,
        "--search-content-bottom": footerHeight + 24 + keyboardHeight,
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

export function ClassicSearchHeader({
  onClose,
  onLayout,
  salesRep = false,
}: SearchHeaderProps & { salesRep?: boolean }) {
  const colors = useColors()
  return (
    <View onLayout={onLayout} className="flex-row items-center gap-3">
      <View className="rounded-full bg-card shadow-sm">
        <Pressable
          accessibilityLabel="Close global search"
          accessibilityRole="button"
          className="size-10 items-center justify-center rounded-full active:opacity-80"
          haptic
          onPress={onClose}
          transition
        >
          <Icon
            className="size-[18px]"
            color={colors.foreground}
            name="ChevronLeft"
          />
        </Pressable>
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-2xl font-extrabold tracking-tight [-rn-line-height:28] text-foreground">
          Search
        </Text>
        <Text className="text-[12.5px] text-muted-foreground">
          {salesRep
            ? "Orders, customers, items and jobs"
            : "Orders, people, items and jobs"}
        </Text>
      </View>
    </View>
  )
}

export function ClassicSearchSection({
  title,
  count,
  children,
}: {
  title: string
  count?: number
  children: ReactNode
}) {
  return (
    <View className="gap-2">
      <View className="flex-row items-baseline justify-between px-0.5">
        <Text
          accessibilityRole="header"
          className="text-[15px] font-extrabold text-foreground"
        >
          {title}
        </Text>
        {count ? (
          <Text className="text-[12.5px] font-bold tabular-nums text-muted-foreground">
            {count}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  )
}

/** Muted one-line hint with a leading icon (idle and offline guidance). */
export function ClassicSearchHint({
  icon,
  children,
}: {
  icon: IconKeys
  children: string
}) {
  const colors = useColors()
  return (
    <View className="flex-row items-center gap-2.5 px-0.5">
      <Icon
        className="size-[16px]"
        color={colors.mutedForeground}
        name={icon}
      />
      <Text className="min-w-0 flex-1 text-[13px] text-muted-foreground">
        {children}
      </Text>
    </View>
  )
}

/** Scope chips: a quick jump to one result type, with its count. */
export function ClassicSearchScopes({
  active,
  groups,
  onChange,
}: {
  active: SearchResult["type"] | "all"
  groups: { count: number; label: string; type: SearchResult["type"] }[]
  onChange: (type: SearchResult["type"] | "all") => void
}) {
  return (
    <NativeScrollView
      contentContainerStyle={{ gap: 8, paddingHorizontal: 18 }}
      horizontal
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0, marginHorizontal: -18 }}
    >
      {groups.map((group) => {
        const selected = active === group.type
        return (
          <View
            key={group.type}
            className={cn(
              "rounded-full",
              selected ? "bg-primary" : "bg-card shadow-sm",
            )}
          >
            <Pressable
              accessibilityLabel={`${group.label}, ${group.count}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className="h-[34px] flex-row items-center gap-1.5 rounded-full px-3 active:opacity-80"
              haptic
              onPress={() => onChange(selected ? "all" : group.type)}
              transition
            >
              <Text
                className={cn(
                  "text-[12.5px] font-extrabold",
                  selected ? "text-primary-foreground" : "text-foreground",
                )}
              >
                {group.label}
              </Text>
              <Text
                className={cn(
                  "text-[11px] tabular-nums",
                  selected
                    ? "text-primary-foreground opacity-80"
                    : "text-muted-foreground",
                )}
              >
                {group.count}
              </Text>
            </Pressable>
          </View>
        )
      })}
    </NativeScrollView>
  )
}

function Highlighted({ text, query }: { text: string; query: string }) {
  const [before, match, after] = matchParts(
    text,
    query.trim().length >= 2 ? query : "",
  )
  return (
    <>
      {before}
      {match ? (
        <Text className="bg-tint-amber text-tint-amber-foreground">
          {match}
        </Text>
      ) : null}
      {after}
    </>
  )
}

function resultThumb(
  item: SearchResult,
  payment: ReturnType<typeof searchPayment>,
): { icon?: IconKeys; initials?: string; round: boolean; tint: GreenTillTint } {
  if (item.type === "order")
    return {
      icon: "ReceiptText",
      round: false,
      tint:
        payment?.tone === "ok"
          ? "mint"
          : payment?.label === "Unpaid" || payment?.tone === "danger"
            ? "rose"
            : "amber",
    }
  if (item.type === "customer")
    return {
      initials: item.title
        .split(/\s+/)
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase(),
      round: true,
      tint: "lilac",
    }
  if (item.type === "catalog_item") {
    const service = item.subtitle.toLowerCase().startsWith("service")
    return {
      icon: service ? "Wrench" : "Warehouse",
      round: false,
      tint: service ? "sky" : "mint",
    }
  }
  if (item.type === "service_job")
    return { icon: "Wrench", round: false, tint: "sky" }
  return { icon: "Users", round: true, tint: "lilac" }
}

/** Orders read as the customer; other results keep the API subtitle. */
function resultSubtitle(item: SearchResult) {
  if (item.type !== "order") return item.subtitle
  const parts = item.subtitle.split(" · ")
  return searchPayment(item.subtitle)
    ? (parts.at(-2) ?? item.subtitle)
    : (parts.at(-1) ?? item.subtitle)
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
  const colors = useColors()
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const payment = item.type === "order" ? searchPayment(item.subtitle) : null
  const thumb = resultThumb(item, payment)
  const tintBg = palette[thumb.tint]
  const tintFg = palette[`${thumb.tint}Foreground`]
  const subtitle = resultSubtitle(item)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${sell ? "Sell" : "Open"} ${item.title}, ${subtitle}${payment ? `, ${payment.label}` : ""}`}
      onPress={onPress}
      haptic
      className="-mx-3.5 min-h-[62px] flex-row items-center gap-3 px-3.5 py-3 active:opacity-80"
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: tintBg,
          borderRadius: thumb.round ? 20 : 13,
          height: 40,
          justifyContent: "center",
          width: 40,
        }}
      >
        {thumb.icon ? (
          <Icon className="size-[18px]" color={tintFg} name={thumb.icon} />
        ) : (
          <NativeText
            maxFontSizeMultiplier={1.3}
            style={{ color: tintFg, fontSize: 13.5, fontWeight: "800" }}
          >
            {thumb.initials}
          </NativeText>
        )}
      </View>
      <View className="min-w-0 flex-1">
        <Text
          className="text-sm font-bold [-rn-line-height:19] text-foreground"
          numberOfLines={large ? undefined : 1}
        >
          <Highlighted query={query} text={item.title} />
        </Text>
        <Text
          className="text-xs [-rn-line-height:17] text-muted-foreground"
          numberOfLines={large ? undefined : 1}
        >
          <Highlighted query={query} text={subtitle} />
        </Text>
      </View>
      {payment ? (
        <StatusPill
          label={payment.label}
          tone={payment.label === "Unpaid" ? "danger" : payment.tone}
        />
      ) : sell ? (
        <StatusPill label="Sell" tone="ok" />
      ) : (
        <Icon
          className="size-[16px]"
          color={colors.mutedForeground}
          name="ChevronRight"
        />
      )}
    </Pressable>
  )
}

export function ClassicSearchResults({
  children,
}: {
  children: ReactNode
}) {
  return <ListCard>{children}</ListCard>
}

/** Compact action chips shown when the query also matches an action. */
export function ClassicSearchActionChips({
  actions,
}: {
  actions: (SearchAction & { gold?: boolean })[]
}) {
  const { colorScheme } = useColorScheme()
  const colors = useColors()
  const palette = GREEN_TILL_THEME[colorScheme]
  return (
    <View className="flex-row flex-wrap gap-2">
      {actions.map((action) => (
        <View
          key={action.id}
          className={cn(
            "rounded-xl",
            action.gold ? "bg-gold" : "bg-card shadow-sm",
          )}
        >
          <Pressable
            accessibilityHint={action.detail}
            accessibilityLabel={action.label}
            accessibilityRole="button"
            className="h-[38px] flex-row items-center gap-[7px] rounded-xl px-3 active:opacity-80"
            haptic
            onPress={action.onPress}
            transition
          >
            <Icon
              className="size-[16px]"
              color={action.gold ? palette.goldForeground : colors.primary}
              name={action.icon}
            />
            <Text
              className={cn(
                "text-[13px] font-extrabold",
                action.gold ? "text-gold-foreground" : "text-foreground",
              )}
            >
              {action.label}
            </Text>
          </Pressable>
        </View>
      ))}
    </View>
  )
}

function SoftButton({
  icon,
  label,
  onPress,
}: {
  icon: IconKeys
  label: string
  onPress: () => void
}) {
  const colors = useColors()
  return (
    <View className="flex-1 rounded-xl bg-accent">
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        className="min-h-11 flex-row items-center justify-center gap-1.5 rounded-xl px-3 active:opacity-80"
        haptic
        onPress={onPress}
        transition
      >
        <Icon className="size-[16px]" color={colors.primary} name={icon} />
        <Text className="text-[13px] font-extrabold text-primary">{label}</Text>
      </Pressable>
    </View>
  )
}

export function ClassicSearchNoResults({
  query,
  salesRep,
  onAddCustomer,
  onNewOrder,
}: {
  query: string
  salesRep: boolean
  onAddCustomer: () => void
  onNewOrder: () => void
}) {
  const colors = useColors()
  return (
    <View
      accessibilityLiveRegion="polite"
      className="items-center rounded-[20px] bg-card px-[18px] pb-[18px] pt-[22px] shadow-sm"
    >
      <View className="mb-2.5 size-12 items-center justify-center rounded-2xl bg-muted">
        <Icon
          className="size-[20px]"
          color={colors.mutedForeground}
          name="Search"
        />
      </View>
      <Text className="text-center text-[15px] font-bold text-foreground">
        No matches for “{query}”
      </Text>
      <Text className="mb-3.5 mt-1 text-center text-[12.5px] text-muted-foreground">
        Try an order number, a phone number, an item
        {salesRep ? "" : " or a staff name"}.
      </Text>
      <View className="w-full flex-row gap-2">
        <SoftButton icon="Plus" label="New order" onPress={onNewOrder} />
        <SoftButton
          icon="UserPlus"
          label="Add customer"
          onPress={onAddCustomer}
        />
      </View>
    </View>
  )
}

export function ClassicSearchOffline() {
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        backgroundColor: palette.amber,
        borderRadius: 16,
        flexDirection: "row",
        gap: 10,
        padding: 14,
      }}
    >
      <Icon
        className="mt-0.5 size-[18px]"
        color={palette.amberForeground}
        name="WifiOff"
      />
      <View className="min-w-0 flex-1">
        <NativeText
          style={{
            color: palette.amberForeground,
            fontSize: 13.5,
            fontWeight: "800",
          }}
        >
          Search is unavailable offline
        </NativeText>
        <NativeText style={{ color: palette.amberForeground, fontSize: 12.5 }}>
          You can still create an order. It syncs when you reconnect.
        </NativeText>
      </View>
    </View>
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
