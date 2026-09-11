import { ActionButton } from "@/components/mobile/action-button"
import {
  catalogItemOfferings,
  catalogItemUnavailable,
} from "@/components/mobile/catalog-item/catalog-item-model"
import type { CatalogItemScreenProps } from "@/components/mobile/catalog-item/catalog-item-presentation"
import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
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
import { useState } from "react"
import { ScrollView } from "react-native-css/components/ScrollView"
import { useSafeAreaInsets } from "react-native-safe-area-context"

export function MarketDayCatalogItemScreen(props: CatalogItemScreenProps) {
  const { item, onBack, onCreateOrder } = props
  const insets = useSafeAreaInsets()
  const palette = useMarketDayPalette()
  const { colorScheme } = useColorScheme()
  const largeText = useLargeTextLayout()
  const [headerHeight, setHeaderHeight] = useState(0)
  const [canvasStatus, setCanvasStatus] = useState(false)
  const offerings = item ? catalogItemOfferings(item) : []
  const unavailable = catalogItemUnavailable(props)
  return (
    <VariableContextProvider
      value={{
        "--catalog-detail-safe-top": insets.top,
        "--catalog-detail-bottom": Math.max(insets.bottom + 24, 40),
      }}
    >
      <View className="flex-1 bg-market-canvas" testID="catalog-item-overview">
        <StatusBar
          animated
          backgroundColor={canvasStatus ? palette.canvas : palette.marigold}
          style={canvasStatus && colorScheme === "dark" ? "light" : "dark"}
        />
        <View
          pointerEvents="none"
          className={cn(
            "absolute inset-x-0 top-0 z-[100] h-[var(--catalog-detail-safe-top)]",
            canvasStatus ? "bg-market-canvas" : "bg-market-marigold",
          )}
        />
        <ScrollView
          className="flex-1"
          contentContainerClassName="grow pb-[var(--catalog-detail-bottom)]"
          refreshControl={<QueryRefreshControl />}
          scrollEventThrottle={16}
          onScroll={(event) => {
            const next =
              headerHeight > 0 &&
              Math.max(0, event.nativeEvent.contentOffset.y) >=
                headerHeight - insets.top
            setCanvasStatus((current) => (current === next ? current : next))
          }}
        >
          <View
            onLayout={(event) =>
              setHeaderHeight(event.nativeEvent.layout.height)
            }
            className="gap-5 border-b-[7px] border-market-paprika bg-market-marigold px-5 pb-6 pt-[var(--catalog-detail-safe-top)]"
          >
            <View className="flex-row items-center gap-3 pt-3">
              <Pressable
                accessibilityLabel="Back to catalog"
                accessibilityRole="button"
                className="size-11 shrink-0 items-center justify-center rounded-full border border-market-on-marigold-hairline active:bg-market-on-marigold-pressed"
                haptic
                onPress={onBack}
              >
                <Icon
                  name="ArrowLeft"
                  className="size-base text-market-on-marigold"
                />
              </Pressable>
              <Text className="min-w-0 flex-1 font-market-mono text-[10px] font-bold uppercase tracking-[1.2px] text-market-on-marigold">
                Catalog / Item card
              </Text>
              {item ? (
                <Icon
                  name={item.kind === "service" ? "Wrench" : "Warehouse"}
                  className="size-md text-market-on-marigold"
                />
              ) : null}
            </View>
            <View className="gap-3">
              <Text
                accessibilityRole="header"
                className="font-market-display text-[38px] font-black tracking-[-1px] text-market-on-marigold [-rn-line-height:44]"
              >
                {item?.name ?? "Catalog overview"}
              </Text>
              {item ? (
                <View className="flex-row flex-wrap gap-2">
                  <Text className="rounded-full bg-market-palm px-3 py-2 text-xs font-bold capitalize text-market-on-palm">
                    {item.kind}
                  </Text>
                  <Text className="rounded-full border border-market-on-marigold-hairline px-3 py-2 text-xs font-bold capitalize text-market-on-marigold">
                    {item.status}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          {item ? (
            <View className="gap-6 px-5 pt-5">
              <View className="gap-3 border-b border-market-line pb-5">
                <Text className="text-base text-market-ink [-rn-line-height:24]">
                  {item.description ||
                    (item.kind === "service"
                      ? "Priced work, without inventory. Service delivery is managed separately."
                      : "Product pricing and selling options for your business.")}
                </Text>
                <Text className="font-market-mono text-[11px] font-bold text-market-muted-ink">
                  {offerings.length}{" "}
                  {offerings.length === 1 ? "option" : "options"} · Priced
                  individually
                </Text>
                {props.isOffline ? (
                  <Text className="text-xs text-market-muted-ink [-rn-line-height:18]">
                    Cached details. Order creation will use the workspace's
                    current offline rules.
                  </Text>
                ) : null}
              </View>
              <ActionButton
                icon="PlusCircle"
                className="rounded-xl bg-market-palm active:bg-market-palm"
                foregroundColor={palette.onPalm}
                onPress={onCreateOrder}
              >
                Create order with this {item.kind}
              </ActionButton>
              <View className="gap-3">
                <Text
                  accessibilityRole="header"
                  className="font-market-mono text-[11px] font-bold uppercase tracking-[1.2px] text-market-muted-ink"
                >
                  Options & pricing
                </Text>
                <View className="border-t border-market-line">
                  {offerings.map(({ offering, variant, price }, index) => (
                    <View
                      key={offering.id}
                      className="flex-row items-start gap-3 border-b border-market-line py-4"
                    >
                      <Text className="w-6 pt-1 font-market-mono text-[10px] font-bold text-market-accent-ink">
                        {String(index + 1).padStart(2, "0")}
                      </Text>
                      <View
                        className={cn(
                          "min-w-0 flex-1 gap-3",
                          !largeText && "flex-row",
                        )}
                      >
                        <View className="min-w-0 flex-1 gap-1">
                          <Text className="text-base font-bold text-market-ink">
                            {offering.name}
                          </Text>
                          <Text className="text-xs text-market-muted-ink [-rn-line-height:18]">
                            {variant.name}
                          </Text>
                          {offering.status !== "active" ||
                          variant.status !== "active" ? (
                            <Text className="text-xs capitalize text-market-muted-ink">
                              Option: {offering.status} · Variant:{" "}
                              {variant.status}
                            </Text>
                          ) : null}
                        </View>
                        <Text
                          className={cn(
                            "font-market-mono text-sm font-bold text-market-ink",
                            !largeText && "max-w-[42%] text-right",
                          )}
                        >
                          {price}
                        </Text>
                      </View>
                    </View>
                  ))}
                  {offerings.length === 0 ? (
                    <View className="gap-2 border-b border-market-line py-6">
                      <Text className="text-base font-bold text-market-ink">
                        No sellable options
                      </Text>
                      <Text className="text-sm text-market-muted-ink [-rn-line-height:21]">
                        Add an active offering before creating an order.
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <Text className="text-xs text-market-muted-ink [-rn-line-height:18]">
                This is an overview. The order flow checks current availability
                and pricing before a sale.
              </Text>
            </View>
          ) : (
            <View className="gap-4 px-5 py-8">
              <Text
                accessibilityRole="header"
                className="font-market-display text-[28px] font-bold text-market-ink"
              >
                {unavailable.title}
              </Text>
              <Text className="text-base text-market-muted-ink [-rn-line-height:24]">
                {unavailable.message}
              </Text>
              {!props.isPending && !props.isOffline && props.onRetry ? (
                <ActionButton
                  className="bg-market-palm"
                  foregroundColor={palette.onPalm}
                  onPress={props.onRetry}
                >
                  Try again
                </ActionButton>
              ) : null}
            </View>
          )}
        </ScrollView>
      </View>
    </VariableContextProvider>
  )
}
