import { ActionButton } from "@/components/mobile/action-button"
import { EmptyState } from "@/components/mobile/empty-state"
import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import { StatusBadge } from "@/components/mobile/status-badge"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { formatMinorMoney } from "@ewatrade/utils"
import { ScrollView } from "react-native"

type CatalogItem = RouterOutputs["catalog"]["getItem"]

function offeringPrice(
  offering: CatalogItem["variants"][number]["offerings"][number],
) {
  return offering.pricingPolicy === "fixed" && offering.fixedPriceMinor !== null
    ? formatMinorMoney(offering.fixedPriceMinor, offering.currencyCode)
    : "Quote required"
}

export function CatalogItemOverview({
  item,
  onBack,
  onCreateOrder,
}: {
  item: CatalogItem
  onBack: () => void
  onCreateOrder: () => void
}) {
  const offerings = item.variants.flatMap((variant) =>
    variant.offerings.map((offering) => ({ offering, variant })),
  )

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-6 px-4 pb-36"
      refreshControl={<QueryRefreshControl />}
      showsVerticalScrollIndicator={false}
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
          {offerings.map(({ offering, variant }) => (
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
              <Text className="font-extrabold text-foreground">
                {offeringPrice(offering)}
              </Text>
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
    </ScrollView>
  )
}
