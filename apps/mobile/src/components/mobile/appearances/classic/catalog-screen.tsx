import { ActionButton } from "@/components/mobile/action-button"
import type {
  CatalogChoiceProps,
  CatalogFrameProps,
  CatalogMastheadProps,
  CatalogRow,
} from "@/components/mobile/catalog/catalog-presentation"
import { HeroCard } from "@/components/mobile/green-till/hero-card"
import { GhostPreview, StatusPill } from "@/components/mobile/green-till/kit"
import { Pressable } from "@/components/ui/pressable"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { cn } from "@/lib/utils"
import { Image } from "expo-image"
import { StatusBar } from "expo-status-bar"
import { VariableContextProvider } from "nativewind"
import { useSafeAreaInsets } from "react-native-safe-area-context"

export function ClassicCatalogFrame({
  children,
  presentation,
  bottomSpace,
}: CatalogFrameProps) {
  const insets = useSafeAreaInsets()
  const { colorScheme } = useColorScheme()
  return (
    <VariableContextProvider
      value={{
        "--catalog-list-top": presentation === "tab" ? insets.top + 18 : 0,
        "--catalog-list-bottom": bottomSpace,
        "--catalog-safe-top": insets.top,
      }}
    >
      <View className="flex-1 bg-background">
        {presentation === "tab" ? (
          <>
            <StatusBar
              animated
              style={colorScheme === "dark" ? "light" : "dark"}
            />
            <View
              pointerEvents="none"
              className="absolute inset-x-0 top-0 z-[100] h-[var(--catalog-safe-top)] bg-background"
            />
          </>
        ) : null}
        {children}
      </View>
    </VariableContextProvider>
  )
}

export function ClassicCatalogMasthead({
  firstItem,
  onLayout,
  title = "Catalog",
  countLabel,
}: CatalogMastheadProps) {
  return (
    <View className="gap-1 px-[18px]" onLayout={onLayout}>
      <Text
        accessibilityRole="header"
        className="text-[23px] font-extrabold tracking-tight text-foreground"
      >
        {firstItem ? "Catalog" : title}
      </Text>
      {countLabel && !firstItem ? (
        <Text className="text-xs tabular-nums text-muted-foreground">
          {countLabel}
        </Text>
      ) : null}
    </View>
  )
}

export function ClassicCatalogChoices({
  disabled = false,
  onAddProduct,
  onAddService,
}: CatalogChoiceProps) {
  return (
    <View className="gap-3.5">
      <ActionButton
        disabled={disabled}
        icon="Package"
        onPress={onAddProduct}
        tone="soft"
      >
        Add a Product
      </ActionButton>
      <Text className="text-xs text-muted-foreground">
        Goods you stock, count and sell
      </Text>
      <ActionButton
        disabled={disabled}
        icon="Wrench"
        onPress={onAddService}
        tone="soft"
      >
        Add a Service
      </ActionButton>
      <Text className="text-xs text-muted-foreground">
        Work you price and deliver
      </Text>
    </View>
  )
}

export function ClassicCatalogFirstItemGate(props: CatalogChoiceProps) {
  return (
    <View className="mx-[18px] gap-4">
      <HeroCard
        label="Start with one item"
        title="What do you sell?"
        sub="Set a name and price now. You can add the other type any time."
      >
        <View className="mt-4 gap-3.5">
          <ActionButton
            disabled={props.disabled}
            icon="Package"
            onPress={props.onAddProduct}
            tone="cream"
          >
            Add a Product
          </ActionButton>
          <ActionButton
            disabled={props.disabled}
            icon="Wrench"
            onPress={props.onAddService}
            tone="cream"
          >
            Add a Service
          </ActionButton>
        </View>
      </HeroCard>
      <GhostPreview
        icon="Package"
        variant="rows"
        message="Search, types and stock show here after your first item."
      />
    </View>
  )
}

const problemLabels = {
  out_of_stock: "Out of stock",
  no_price: "No price",
  not_counted: "Not counted",
} as const

export function ClassicCatalogRow({
  item,
  onPress,
  index = 0,
  last = false,
}: { item: CatalogRow; onPress: () => void; index?: number; last?: boolean }) {
  const largeText = useLargeTextLayout()
  return (
    <View
      className={cn(
        "mx-[18px] bg-card px-3.5",
        index === 0 && "rounded-t-[20px]",
        last && "rounded-b-[20px]",
      )}
    >
      <Pressable
        accessibilityLabel={`Open ${item.name}, ${item.priceLabel}, ${item.availabilityLabel}`}
        accessibilityRole="button"
        className="min-h-[62px] flex-row items-center gap-3 border-b border-border py-3 active:opacity-70"
        haptic
        onPress={onPress}
        transition
      >
        <View
          className={cn(
            "size-[42px] items-center justify-center overflow-hidden rounded-[14px]",
            item.kind === "service" ? "bg-tint-lilac" : "bg-tint-mint",
          )}
        >
          {item.imageUrl ? (
            <Image
              source={{ uri: item.imageUrl }}
              style={{ width: 42, height: 42 }}
              contentFit="cover"
              recyclingKey={item.id}
            />
          ) : (
            <Text
              maxFontSizeMultiplier={1.3}
              className={cn(
                "text-sm font-bold",
                item.kind === "service"
                  ? "text-tint-lilac-foreground"
                  : "text-tint-mint-foreground",
              )}
            >
              {item.name.trim().slice(0, 1).toLocaleUpperCase()}
            </Text>
          )}
        </View>
        <View
          className={cn(
            "min-w-0 flex-1 gap-2",
            !largeText && "flex-row items-center",
          )}
        >
          <View className="min-w-0 flex-1 gap-1">
            <Text
              numberOfLines={largeText ? undefined : 1}
              className="text-sm font-bold text-foreground"
            >
              {item.name}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {item.problem === "not_counted"
                ? "Stock not counted"
                : item.availabilityLabel}
            </Text>
          </View>
          <View className={cn("gap-1", !largeText && "max-w-[44%] items-end")}>
            <Text className="text-sm font-bold tabular-nums text-foreground">
              {item.problem === "no_price" ? "—" : item.priceLabel}
            </Text>
            {item.problem ? (
              <StatusPill
                label={problemLabels[item.problem]}
                tone={
                  item.problem === "out_of_stock"
                    ? "danger"
                    : item.problem === "no_price"
                      ? "warn"
                      : "info"
                }
              />
            ) : null}
          </View>
        </View>
      </Pressable>
    </View>
  )
}

export function ClassicCatalogFilter({
  active,
  label,
  onPress,
}: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={cn(
        "min-h-11 min-w-0 flex-1 items-center justify-center rounded-[14px] px-3 py-2",
        active ? "bg-card shadow-sm" : "bg-muted",
      )}
      haptic
      onPress={onPress}
      transition
    >
      <Text
        className={cn(
          "text-[13px] font-bold",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
      </Text>
    </Pressable>
  )
}

export function CatalogShelfSkeleton() {
  return (
    <View
      accessibilityLabel="Loading catalog items"
      accessibilityRole="progressbar"
      className="mx-[18px] gap-3.5 rounded-[20px] bg-card p-3.5"
    >
      {["a", "b", "c", "d"].map((key) => (
        <View key={key} className="flex-row gap-3 py-3">
          <Skeleton className="size-[42px] rounded-[14px]" />
          <View className="flex-1 gap-2">
            <Skeleton className="h-4 w-3/4 rounded" />
            <Skeleton className="h-3 w-1/2 rounded" />
          </View>
          <Skeleton className="h-4 w-16 rounded" />
        </View>
      ))}
    </View>
  )
}
