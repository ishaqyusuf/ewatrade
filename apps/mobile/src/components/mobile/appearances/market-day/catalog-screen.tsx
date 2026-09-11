import type {
  CatalogChoiceProps,
  CatalogFrameProps,
  CatalogMastheadProps,
  CatalogRow,
} from "@/components/mobile/catalog/catalog-presentation"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { cn } from "@/lib/utils"
import { StatusBar } from "expo-status-bar"
import { VariableContextProvider } from "nativewind"
import { useSafeAreaInsets } from "react-native-safe-area-context"

export function MarketDayCatalogFrame({
  children,
  presentation,
  bottomSpace,
  showCanvasStatusBar,
}: CatalogFrameProps) {
  const insets = useSafeAreaInsets()
  const palette = useMarketDayPalette()
  const { colorScheme } = useColorScheme()
  return (
    <VariableContextProvider
      value={{
        "--catalog-list-top": 0,
        "--catalog-list-bottom": bottomSpace,
        "--catalog-safe-top": presentation === "tab" ? insets.top : 0,
      }}
    >
      <View className="flex-1 bg-market-canvas">
        {presentation === "tab" ? (
          <>
            <StatusBar
              animated
              backgroundColor={
                showCanvasStatusBar ? palette.canvas : palette.marigold
              }
              style={
                showCanvasStatusBar && colorScheme === "dark" ? "light" : "dark"
              }
            />
            <View
              pointerEvents="none"
              className={cn(
                "absolute inset-x-0 top-0 z-[100] h-[var(--catalog-safe-top)]",
                showCanvasStatusBar ? "bg-market-canvas" : "bg-market-marigold",
              )}
            />
          </>
        ) : null}
        {children}
      </View>
    </VariableContextProvider>
  )
}

export function MarketDayCatalogAddButton({
  onPress,
  disabled,
}: { onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      accessibilityLabel="Add catalog item"
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      haptic={!disabled}
      onPress={onPress}
      className={cn(
        "size-12 shrink-0 items-center justify-center rounded-full bg-market-palm active:opacity-80",
        disabled && "opacity-45",
      )}
    >
      <Icon name="Plus" className="size-md text-market-on-palm" />
    </Pressable>
  )
}

export function MarketDayCatalogMasthead({
  onLayout,
  onAdd,
  disabled,
}: CatalogMastheadProps) {
  return (
    <View
      onLayout={onLayout}
      className="border-b-[7px] border-market-paprika bg-market-marigold px-[18px] pb-5 pt-[var(--catalog-safe-top)]"
    >
      <View className="flex-row items-center gap-4 pt-4">
        <View className="min-w-0 flex-1 gap-2">
          <Text className="font-market-mono text-[10px] font-bold uppercase tracking-[1.4px] text-market-on-marigold">
            Your market · stockbook
          </Text>
          <Text
            accessibilityRole="header"
            className="font-market-display text-[44px] font-black tracking-[-2px] text-market-on-marigold [-rn-line-height:50]"
          >
            Catalog
          </Text>
        </View>
        <MarketDayCatalogAddButton disabled={disabled} onPress={onAdd} />
      </View>
    </View>
  )
}

export function MarketDayCatalogSummary({ rows }: { rows: CatalogRow[] }) {
  const largeText = useLargeTextLayout()
  const products = rows.filter((item) => item.kind === "product").length
  return (
    <View
      className={cn(
        "mx-[18px] border-y border-market-line py-3",
        largeText ? "gap-3" : "flex-row gap-3",
      )}
    >
      {[
        ["Products", products],
        ["Services", rows.length - products],
        ["Loaded items", rows.length],
      ].map(([label, value]) => (
        <View
          key={label}
          className={cn("min-w-0 gap-1", !largeText && "flex-1")}
        >
          <Text className="font-market-display text-[27px] font-bold text-market-ink [-rn-line-height:32]">
            {value}
          </Text>
          <Text className="text-[10px] font-bold uppercase tracking-[0.7px] text-market-muted-ink">
            {label === "Loaded items" ? label : `Loaded ${label}`}
          </Text>
        </View>
      ))}
    </View>
  )
}

export function MarketDayCatalogFilter({
  active,
  label,
  onPress,
}: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      haptic
      onPress={onPress}
      className={cn(
        "min-h-11 items-center justify-center rounded-full border px-4 py-2",
        active
          ? "border-market-palm bg-market-palm"
          : "border-market-line bg-market-field",
      )}
    >
      <Text
        className={cn(
          "text-xs font-bold",
          active ? "text-market-on-palm" : "text-market-ink",
        )}
      >
        {label}
      </Text>
    </Pressable>
  )
}

export function MarketDayCatalogRow({
  item,
  index,
  onPress,
}: { item: CatalogRow; index: number; onPress: () => void }) {
  const largeText = useLargeTextLayout()
  return (
    <Pressable
      accessibilityLabel={`Open ${item.name}, ${item.priceLabel}, ${item.availabilityLabel}`}
      accessibilityRole="button"
      haptic
      onPress={onPress}
      className="mx-[10px] min-h-[80px] border-b border-market-line px-2 py-4 active:bg-market-field"
    >
      <View className="flex-row items-start gap-3">
        <Text className="w-6 pt-1 font-market-mono text-[10px] font-bold text-market-accent-ink">
          {String(index + 1).padStart(2, "0")}
        </Text>
        <View className={cn("min-w-0 flex-1 gap-3", !largeText && "flex-row")}>
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-[15px] font-extrabold text-market-ink [-rn-line-height:21]">
              {item.name}
            </Text>
            <Text className="text-xs text-market-muted-ink [-rn-line-height:18]">
              {item.availabilityLabel}
            </Text>
          </View>
          <View
            className={cn(
              "min-w-0 gap-1",
              !largeText && "max-w-[42%] items-end",
            )}
          >
            <Text className="font-market-mono text-sm font-bold text-market-ink">
              {item.priceLabel}
            </Text>
            <Text className="text-[10px] font-bold uppercase tracking-[0.8px] text-market-muted-ink">
              {item.kind}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  )
}

export function MarketDayCatalogChoices({
  disabled = false,
  onAddProduct,
  onAddService,
}: CatalogChoiceProps) {
  return (
    <View>
      {[
        {
          label: "Product",
          detail: "Track stock, units, variants, and price",
          icon: "Warehouse" as const,
          onPress: onAddProduct,
        },
        {
          label: "Service",
          detail: "Set price and delivery without stock",
          icon: "Wrench" as const,
          onPress: onAddService,
        },
      ].map((choice) => (
        <Pressable
          key={choice.label}
          accessibilityLabel={`Add a ${choice.label}`}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          disabled={disabled}
          haptic={!disabled}
          onPress={choice.onPress}
          className={cn(
            "min-h-[76px] flex-row items-center gap-3 border-b border-market-line py-4 active:opacity-80",
            disabled && "opacity-45",
          )}
        >
          <View className="size-11 shrink-0 items-center justify-center rounded-xl bg-market-palm">
            <Icon
              name={choice.icon}
              className="size-base text-market-on-palm"
            />
          </View>
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-base font-extrabold text-market-ink">
              {choice.label}
            </Text>
            <Text className="text-xs text-market-muted-ink [-rn-line-height:18]">
              {choice.detail}
            </Text>
          </View>
          <Icon name="ChevronRight" className="size-sm text-market-ink" />
        </Pressable>
      ))}
    </View>
  )
}

export function MarketDayCatalogFirstItemGate(props: CatalogChoiceProps) {
  return (
    <View className="mx-[18px] gap-3 rounded-[22px] border border-market-line bg-market-field p-5">
      <Text className="font-market-mono text-[10px] font-bold uppercase tracking-[1.2px] text-market-muted-ink">
        Start with one item
      </Text>
      <Text className="font-market-display text-[30px] font-bold text-market-ink [-rn-line-height:35]">
        What do you sell?
      </Text>
      <Text className="text-sm text-market-muted-ink [-rn-line-height:21]">
        Add a stocked Product or a priced Service. The first setup stays short.
      </Text>
      <MarketDayCatalogChoices {...props} />
    </View>
  )
}
