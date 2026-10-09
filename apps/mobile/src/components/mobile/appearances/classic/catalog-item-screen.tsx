import { ActionButton } from "@/components/mobile/action-button"
import {
  catalogItemOfferings,
  catalogItemUnavailable,
} from "@/components/mobile/catalog-item/catalog-item-model"
import type {
  CatalogItemOverviewProps,
  CatalogItemScreenProps,
} from "@/components/mobile/catalog-item/catalog-item-presentation"
import { CatalogSavedPhotos } from "@/components/mobile/catalog-item/catalog-saved-photos"
import {
  CATALOG_AVATAR_TINT,
  CatalogAvatar,
} from "@/components/mobile/catalog/catalog-avatar"
import { selectCatalogAvatar } from "@/components/mobile/catalog/catalog-avatar-model"
import { catalogAvatarTint } from "@/components/mobile/catalog/catalog-shelf-model"
import { flattenSaleOfferings } from "@/components/mobile/create-sale/create-sale-model"
import { EmptyState } from "@/components/mobile/empty-state"
import { HeroCard } from "@/components/mobile/green-till/hero-card"
import {
  ListCard,
  SectionHeader,
  StatusPill,
} from "@/components/mobile/green-till/kit"
import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import { MobileScreen } from "@/components/mobile/screen"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { cn } from "@/lib/utils"
import { StatusBar } from "expo-status-bar"
import { useState } from "react"

export function ClassicCatalogItemOverview({
  item,
  onBack,
  onCreateOrder,
  onCreateSelectedOrder,
  storeId,
  cachedAt,
}: CatalogItemOverviewProps) {
  const [selectedId, setSelectedId] = useState<string>()
  const largeText = useLargeTextLayout()
  const tint = catalogAvatarTint(item.name, item.kind)
  const offerings = catalogItemOfferings(item).filter(
    ({ offering, variant }) =>
      offering.status === "active" &&
      variant.status === "active" &&
      offering.stores.some(
        (store) => store.storeId === storeId && store.isAvailable,
      ),
  )
  const sellable =
    item.status === "active"
      ? flattenSaleOfferings(
          [
            {
              ...item,
              variants: item.variants.filter(
                (variant) => variant.status === "active",
              ),
            },
          ],
          storeId,
        )
      : []
  const selected =
    offerings.find((entry) => entry.offering.id === selectedId) ??
    offerings.find((entry) =>
      sellable.some((choice) => choice.id === entry.offering.id),
    ) ??
    offerings[0]
  const canSell = Boolean(
    selected && sellable.some((choice) => choice.id === selected.offering.id),
  )
  const selectedUnit = item.product?.currentUnitConfiguration?.units.find(
    (unit) => unit.id === selected?.offering.productUnit?.inventoryUnitId,
  )
  const stock = item.product?.stockBalances.find(
    (balance) =>
      balance.storeId === storeId &&
      balance.variantId === selected?.variant.id &&
      (selectedUnit?.stockBehavior === "packaged_stock"
        ? balance.kind === "packaged_stock" &&
          balance.inventoryUnitId === selectedUnit.id
        : balance.kind === "shared_pool"),
  )
  const reason = canSell
    ? undefined
    : selected?.offering.pricingPolicy === "quote_required"
      ? "This option needs a quote before it can be sold."
      : "Add an active option with a price and available stock to sell this item."
  return (
    <MobileScreen
      contentClassName="gap-4 px-[18px] pb-12"
      refreshControl={<QueryRefreshControl />}
      scroll
      keyboardAutoScrollEnabled={false}
      testID="catalog-item-overview"
    >
      <View className="min-h-11 flex-row items-center gap-3">
        <Pressable
          accessibilityLabel="Back to catalog"
          accessibilityRole="button"
          className="size-11 items-center justify-center rounded-full bg-card"
          haptic
          onPress={onBack}
        >
          <Icon className="size-[20px] text-foreground" name="ArrowLeft" />
        </Pressable>
        <Text className="flex-1 text-[13px] text-muted-foreground">
          {item.kind === "service" ? "Service" : "Product"}
        </Text>
      </View>
      {cachedAt ? (
        <StatusBanner
          tone="warning"
          icon="Wind"
          title="Saved item"
          message={`As of ${cachedAt}. Stock and prices may have changed.`}
        />
      ) : null}
      <View className="flex-row items-center gap-3">
        <View
          className={`size-[42px] items-center justify-center overflow-hidden rounded-[13px] ${CATALOG_AVATAR_TINT[tint].bg}`}
        >
          <CatalogAvatar
            media={selectCatalogAvatar(item, storeId, item.imageUrl)}
            name={item.name}
            service={item.kind === "service"}
            tint={tint}
          />
        </View>
        <Text
          accessibilityRole="header"
          className="min-w-0 flex-1 text-[23px] font-extrabold text-foreground"
        >
          {item.name}
        </Text>
      </View>
      <View className="flex-row flex-wrap items-center gap-2">
        <StatusPill
          tone={item.status === "active" ? "ok" : "muted"}
          label={
            item.status === "active"
              ? "Active"
              : item.status === "draft"
                ? "Draft"
                : "Archived"
          }
        />
        <Text className="text-xs text-muted-foreground">{item.category}</Text>
      </View>
      <CatalogSavedPhotos item={item} />
      <HeroCard
        label={
          selected
            ? `${selected.variant.name} · ${selected.offering.name}`
            : "Price"
        }
        amount={selected?.price.replace(/\.00(?=\D*$)/, "") ?? "No price set"}
        pill={{
          label: `${offerings.length} options`,
          tone: cachedAt ? "offline" : "synced",
        }}
        sub={
          reason ??
          (item.kind === "product" && !stock
            ? "Stock not counted for this option."
            : "Tap an option to choose what to sell.")
        }
        stats={
          item.kind === "product"
            ? [
                {
                  label: "On hand",
                  value: stock
                    ? `${stock.onHandQuantity} ${stock.inventoryUnitName}`
                    : "—",
                },
                {
                  label: "Reserved",
                  value: stock
                    ? `${stock.reservedQuantity} ${stock.inventoryUnitName}`
                    : "—",
                },
              ]
            : [
                { label: "Options", value: String(offerings.length) },
                {
                  label: "By quote",
                  value: String(
                    offerings.filter(
                      (entry) =>
                        entry.offering.pricingPolicy === "quote_required",
                    ).length,
                  ),
                },
              ]
        }
      >
        <View className="mt-4">
          <ActionButton
            tone="cream"
            icon="Plus"
            disabled={!canSell}
            onPress={() => {
              if (!canSell || !selected) return
              if (onCreateSelectedOrder)
                onCreateSelectedOrder(selected.offering.id)
              else onCreateOrder()
            }}
          >
            Create order{selected ? ` · ${selected.offering.name}` : ""}
          </ActionButton>
        </View>
      </HeroCard>
      <View>
        <SectionHeader
          title="Sellable options"
          trailing={
            <Text className="text-xs text-muted-foreground">Tap to choose</Text>
          }
        />
        {offerings.length ? (
          item.variants.map((variant) => {
            const options = offerings.filter(
              (entry) => entry.variant.id === variant.id,
            )
            if (!options.length) return null
            return (
              <View key={variant.id} className="mb-3.5 gap-2">
                <Text className="text-xs font-bold text-muted-foreground">
                  {variant.name}
                </Text>
                <ListCard>
                  {options.map(({ offering, price }) => (
                    <Pressable
                      key={offering.id}
                      accessibilityRole="radio"
                      accessibilityLabel={`${offering.name}, ${price}`}
                      accessibilityState={{
                        selected: selected?.offering.id === offering.id,
                      }}
                      onPress={() => setSelectedId(offering.id)}
                      className={cn(
                        "min-h-[62px] gap-3 py-3",
                        !largeText && "flex-row items-center",
                      )}
                    >
                      {selected?.offering.id === offering.id ? (
                        <Icon
                          className="size-[20px] text-primary"
                          name="CheckCircle2"
                        />
                      ) : (
                        <View className="size-[20px] rounded-full border-2 border-border" />
                      )}
                      <View className="min-w-0 flex-1">
                        <Text className="text-sm font-bold text-foreground">
                          {offering.name}
                        </Text>
                        <Text className="text-xs text-muted-foreground">
                          {offering.productUnit?.sku
                            ? `SKU ${offering.productUnit.sku}`
                            : variant.name}
                        </Text>
                      </View>
                      <Text className="text-sm font-bold tabular-nums text-foreground">
                        {price.replace(/\.00(?=\D*$)/, "")}
                      </Text>
                    </Pressable>
                  ))}
                </ListCard>
              </View>
            )
          })
        ) : (
          <EmptyState
            title="No sellable options"
            icon="Package"
            message="This item has no active option with a price, so it cannot be added to an order yet."
          />
        )}
      </View>
      <View>
        <SectionHeader title="About" />
        <ListCard>
          <View className="gap-3 py-3">
            <Text className="text-[13px] text-foreground">
              {item.description ||
                (item.kind === "service"
                  ? "Work is tracked in Service jobs."
                  : "Stock moves when orders are fulfilled.")}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {item.category ||
                (item.kind === "service" ? "Service" : "Stock-tracked product")}
            </Text>
          </View>
        </ListCard>
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
      {props.item && props.storeId ? (
        <ClassicCatalogItemOverview
          key={props.item.id}
          {...props}
          item={props.item}
        />
      ) : (
        <MobileScreen
          contentClassName="gap-4 px-[18px] pb-12"
          scroll
          keyboardAutoScrollEnabled={false}
        >
          <ActionButton variant="ghost" icon="ArrowLeft" onPress={props.onBack}>
            Back to catalog
          </ActionButton>
          {props.isPending && !props.isOffline ? (
            <View
              accessibilityLabel="Loading item"
              accessibilityRole="progressbar"
              className="gap-4"
            >
              <Skeleton className="h-7 w-2/3 rounded" />
              <Skeleton className="h-56 rounded-[26px]" />
              <Skeleton className="h-36 rounded-[20px]" />
            </View>
          ) : (
            <EmptyState
              icon="Package"
              title={unavailable.title}
              message={unavailable.message}
            />
          )}
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
