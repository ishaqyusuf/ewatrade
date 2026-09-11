import { ActionButton } from "@/components/mobile/action-button"
import { EmptyState } from "@/components/mobile/empty-state"
import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import { MobileScreen } from "@/components/mobile/screen"
import { StatusBadge } from "@/components/mobile/status-badge"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import type {
  CatalogItemOverviewProps,
  CatalogItemScreenProps,
} from "@/components/mobile/catalog-item/catalog-item-presentation"
import {
  catalogItemOfferings,
  catalogItemUnavailable,
} from "@/components/mobile/catalog-item/catalog-item-model"
import { StatusBar } from "expo-status-bar"
import { useColorScheme } from "@/hooks/use-color"

export function ClassicCatalogItemOverview({
  item,
  onBack,
  onCreateOrder,
}: CatalogItemOverviewProps) {
  const offerings = catalogItemOfferings(item)

  return (
    <MobileScreen
      contentClassName="gap-6 px-4 pb-36"
      refreshControl={<QueryRefreshControl />}
      scroll
      keyboardAutoScrollEnabled={false}
      testID="catalog-item-overview"
    >
      <View className="min-h-11 flex-row items-center gap-3">
        <Pressable
          accessibilityLabel="Back to catalog"
          accessibilityRole="button"
          className="size-11 items-center justify-center rounded-full bg-card active:bg-accent"
          haptic
          onPress={onBack}
        >
          <Icon className="size-base text-foreground" name="ArrowLeft" />
        </Pressable>
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-muted-foreground">
            {item.kind === "service" ? "Service overview" : "Product overview"}
          </Text>
          <Text
            className="text-3xl font-extrabold tracking-tight text-foreground"
            numberOfLines={2}
          >
            {item.name}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center gap-4">
        <View className="size-16 items-center justify-center rounded-full bg-muted">
          <Icon
            className="size-md text-primary"
            name={item.kind === "service" ? "Wrench" : "Warehouse"}
          />
        </View>
        <View className="min-w-0 flex-1 gap-2">
          <View className="flex-row flex-wrap gap-2">
            <StatusBadge
              label={item.kind === "service" ? "Service" : "Product"}
              tone={item.kind === "service" ? "primary" : "success"}
            />
            <StatusBadge
              label={item.status}
              tone={item.status === "active" ? "success" : "muted"}
            />
          </View>
          <Text className="text-sm leading-5 text-muted-foreground">
            {item.description ||
              (item.kind === "service"
                ? "Sellable service in this workspace."
                : "Stock-tracked product in this workspace.")}
          </Text>
        </View>
      </View>

      <ActionButton icon="PlusCircle" onPress={onCreateOrder}>
        Create order with this {item.kind}
      </ActionButton>

      <View className="gap-2">
        <Text className="text-lg font-extrabold text-foreground">
          Sellable options
        </Text>
        <View className="border-y border-border">
          {offerings.map(({ offering, variant, price }) => (
            <View
              className="flex-row items-center justify-between gap-4 border-b border-border py-4 last:border-b-0"
              key={offering.id}
            >
              <View className="min-w-0 flex-1 gap-1">
                <Text className="font-bold text-foreground">
                  {offering.name}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {variant.name}
                </Text>
              </View>
              <Text className="font-extrabold text-foreground">{price}</Text>
            </View>
          ))}
          {offerings.length === 0 ? (
            <EmptyState
              icon="Warehouse"
              message="Add an active offering before creating an order."
              title="No sellable options"
            />
          ) : null}
        </View>
      </View>
    </MobileScreen>
  )
}

export function ClassicCatalogItemScreen(props: CatalogItemScreenProps) {
  const { colorScheme } = useColorScheme()
  const unavailable = catalogItemUnavailable(props)
  return (
    <View className="flex-1 bg-background">
      <StatusBar animated style={colorScheme === "dark" ? "light" : "dark"} />
      {props.item ? (
        <ClassicCatalogItemOverview
          item={props.item}
          onBack={props.onBack}
          onCreateOrder={props.onCreateOrder}
        />
      ) : (
        <MobileScreen
          contentClassName="gap-6 px-4 pb-12"
          refreshControl={<QueryRefreshControl />}
          keyboardAutoScrollEnabled={false}
          scroll
        >
          <View className="min-h-11 flex-row items-center gap-3">
            <Pressable
              accessibilityLabel="Back to catalog"
              accessibilityRole="button"
              className="size-11 items-center justify-center rounded-full bg-card active:bg-accent"
              haptic
              onPress={props.onBack}
            >
              <Icon className="size-base text-foreground" name="ArrowLeft" />
            </Pressable>
            <Text className="min-w-0 flex-1 text-3xl font-extrabold tracking-tight text-foreground">
              Catalog overview
            </Text>
          </View>
          <View className="flex-1 items-center justify-center py-16">
            <EmptyState
              icon="Warehouse"
              title={unavailable.title}
              message={unavailable.message}
            />
          </View>
          {!props.isPending && !props.isOffline && props.onRetry ? (
            <ActionButton variant="outline" onPress={props.onRetry}>
              Try again
            </ActionButton>
          ) : null}
        </MobileScreen>
      )}
    </View>
  )
}
