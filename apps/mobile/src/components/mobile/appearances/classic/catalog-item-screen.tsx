import { ActionButton } from "@/components/mobile/action-button"
import {
  catalogItemOfferings,
  catalogItemUnavailable,
} from "@/components/mobile/catalog-item/catalog-item-model"
import type {
  CatalogItemOverviewProps,
  CatalogItemScreenProps,
} from "@/components/mobile/catalog-item/catalog-item-presentation"
import {
  CatalogItemThumb,
  CatalogSavedPhotos,
} from "@/components/mobile/catalog-item/catalog-saved-photos"
import { flattenSaleOfferings } from "@/components/mobile/create-sale/create-sale-model"
import { EmptyState } from "@/components/mobile/empty-state"
import {
  QuickActionRow,
  RowDivider,
  SectionHeader,
  StatusPill,
} from "@/components/mobile/green-till/kit"
import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import { MobileScreen } from "@/components/mobile/screen"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { MotionView } from "@/components/ui/motion"
import { Pressable } from "@/components/ui/pressable"
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useColorScheme } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { GREEN_TILL_THEME, type GreenTillTint } from "@/lib/green-till-theme"
import { canEditMobileCatalog } from "@/lib/mobile-roles"
import { cn } from "@/lib/utils"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { StatusBar } from "expo-status-bar"
import { useState } from "react"
import { Text as NativeText, ScrollView, Share } from "react-native"

type OfferingEntry = ReturnType<typeof catalogItemOfferings>[number]
type StockBalance = NonNullable<
  CatalogItemOverviewProps["item"]["product"]
>["stockBalances"][number]

// 03 Price List: compact header, quick actions, variant filter and a price
// table with stock per option. Photos and the description sit at the bottom.
export function ClassicCatalogItemOverview({
  item,
  onBack,
  onCreateOrder,
  onCreateSelectedOrder,
  onOpenServiceJobs,
  onStockIn,
  storeId,
  cachedAt,
}: CatalogItemOverviewProps) {
  const [variantFilter, setVariantFilter] = useState<string>()
  const [editingImages, setEditingImages] = useState(false)
  const largeText = useLargeTextLayout()
  const { profile } = useAuthContext()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const canEditImages = canEditMobileCatalog(profile) && !offline && !cachedAt
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
  const isSellable = (entry: OfferingEntry) =>
    sellable.some((choice) => choice.id === entry.offering.id)
  const sellableOfferings = offerings.filter(isSellable)
  const product = item.kind === "product"
  const variants = item.variants.filter((variant) =>
    offerings.some((entry) => entry.variant.id === variant.id),
  )
  const activeFilter = variants.some((variant) => variant.id === variantFilter)
    ? variantFilter
    : undefined
  const rows = offerings.filter(
    (entry) => !activeFilter || entry.variant.id === activeFilter,
  )
  const stockFor = (entry: OfferingEntry) => {
    const unit = item.product?.currentUnitConfiguration?.units.find(
      (candidate) =>
        candidate.id === entry.offering.productUnit?.inventoryUnitId,
    )
    return item.product?.stockBalances.find(
      (balance) =>
        balance.storeId === storeId &&
        balance.variantId === entry.variant.id &&
        (unit?.stockBehavior === "packaged_stock"
          ? balance.kind === "packaged_stock" &&
            balance.inventoryUnitId === unit.id
          : balance.kind === "shared_pool"),
    )
  }
  const reason = !offerings.length
    ? "Add an active option with a price before this item can be ordered."
    : offerings.every(
          (entry) => entry.offering.pricingPolicy === "quote_required",
        )
      ? "Every option needs a quote before it can be sold."
      : "Add an active option with a price and available stock to sell this item."
  const newOrder = () => {
    const [only] = sellableOfferings
    if (!only) return
    if (sellableOfferings.length === 1 && onCreateSelectedOrder)
      onCreateSelectedOrder(only.offering.id)
    else onCreateOrder()
  }
  const share = () => {
    void Share.share({
      message: offerings.length
        ? [
            item.name,
            ...offerings.map(
              (entry) => `${entry.offering.name}: ${wholeMoney(entry.price)}`,
            ),
          ].join("\n")
        : item.name,
    })
  }
  return (
    <MobileScreen
      contentClassName="gap-4 px-[18px] pb-12"
      refreshControl={<QueryRefreshControl />}
      scroll
      keyboardAutoScrollEnabled={false}
      testID="catalog-item-overview"
    >
      <View className="min-h-11 flex-row items-center gap-2.5">
        <Pressable
          accessibilityLabel="Back to catalog"
          accessibilityRole="button"
          className="size-11 items-center justify-center rounded-full bg-card shadow-sm"
          haptic
          onPress={onBack}
        >
          <Icon className="size-[20px] text-foreground" name="ArrowLeft" />
        </Pressable>
        <Text
          numberOfLines={1}
          className="min-w-0 flex-1 text-xs font-bold text-muted-foreground"
        >
          {item.category ? `Catalog · ${item.category}` : "Catalog"}
        </Text>
        {canEditImages ? (
          <Pressable
            accessibilityLabel="Edit images"
            accessibilityRole="button"
            className="size-11 items-center justify-center rounded-full bg-card shadow-sm"
            haptic
            onPress={() => setEditingImages(true)}
          >
            <Icon className="size-[20px] text-foreground" name="Camera" />
          </Pressable>
        ) : null}
      </View>
      <View className="flex-row items-center gap-3">
        <CatalogItemThumb item={item} />
        <View className="min-w-0 flex-1 gap-1">
          <Text
            accessibilityRole="header"
            className="text-[21px] font-extrabold leading-[25px] tracking-tight text-foreground"
          >
            {item.name}
          </Text>
          <View className="flex-row flex-wrap items-center gap-1.5">
            <KindPill service={!product} />
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
          </View>
        </View>
      </View>
      {cachedAt ? (
        <StatusBanner
          tone="warning"
          icon="Wind"
          title="Saved item"
          message={`As of ${cachedAt}. Stock and prices may have changed.`}
        />
      ) : null}
      {editingImages ? (
        <CatalogSavedPhotos
          item={item}
          editing
          onEditingChange={setEditingImages}
        />
      ) : null}
      <QuickActionRow
        actions={[
          {
            disabled: !sellableOfferings.length,
            gold: true,
            icon: "Plus",
            label: "New order",
            onPress: newOrder,
          },
          product
            ? {
                disabled: !onStockIn || Boolean(cachedAt),
                icon: "Download",
                label: "Stock in",
                onPress: () =>
                  onStockIn?.(activeFilter ? { variantId: activeFilter } : {}),
              }
            : {
                disabled: !onOpenServiceJobs,
                icon: "Wrench",
                label: "Jobs",
                onPress: () => onOpenServiceJobs?.(),
              },
          {
            disabled: !canEditImages,
            icon: "Image",
            label: "Images",
            onPress: () => setEditingImages(true),
          },
          { icon: "Share", label: "Share", onPress: share },
        ]}
      />
      {!sellableOfferings.length ? (
        <StatusBanner
          tone="warning"
          icon="Tag"
          title="No sellable options"
          message={reason}
        />
      ) : null}
      {offerings.length ? (
        <View className="gap-2.5">
          {variants.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2 py-1"
            >
              <FilterChip
                count={offerings.length}
                label="All"
                selected={!activeFilter}
                onPress={() => setVariantFilter(undefined)}
              />
              {variants.map((variant) => (
                <FilterChip
                  key={variant.id}
                  count={
                    offerings.filter((entry) => entry.variant.id === variant.id)
                      .length
                  }
                  label={variant.name}
                  selected={activeFilter === variant.id}
                  onPress={() => setVariantFilter(variant.id)}
                />
              ))}
            </ScrollView>
          ) : null}
          <View className="rounded-[20px] bg-card shadow-sm">
            <View className="overflow-hidden rounded-[20px]">
              {largeText ? null : (
                <View className="h-[34px] flex-row items-center gap-2 bg-muted px-3.5">
                  <TableHead className="flex-1">Option</TableHead>
                  <TableHead className="w-16 text-right">
                    {product ? "Stock" : "Work"}
                  </TableHead>
                  <TableHead className="w-[84px] text-right">Price</TableHead>
                </View>
              )}
              {rows.map((entry, index) => (
                <PriceRow
                  key={entry.offering.id}
                  entry={entry}
                  first={index === 0}
                  largeText={largeText}
                  product={product}
                  stock={product ? stockFor(entry) : undefined}
                  onPress={
                    isSellable(entry) && onCreateSelectedOrder
                      ? () => onCreateSelectedOrder(entry.offering.id)
                      : undefined
                  }
                />
              ))}
            </View>
          </View>
        </View>
      ) : null}
      <View>
        <SectionHeader title="About" />
        <View className="rounded-[20px] bg-card px-3.5 shadow-sm">
          {item.description ? (
            <Text className="py-3 text-xs [-rn-line-height:22] text-muted-foreground">
              {item.description}
            </Text>
          ) : null}
          {item.category ? (
            <AboutRow
              border={Boolean(item.description)}
              icon="LayoutGrid"
              tint="mint"
              title={item.category}
              sub="Category"
            />
          ) : null}
          <AboutRow
            border={Boolean(item.description || item.category)}
            icon={product ? "Package" : "Wrench"}
            tint={product ? "sky" : "lilac"}
            title={product ? "Stock-tracked product" : "Service"}
            sub={
              product
                ? "Stock moves when orders are fulfilled"
                : "Work is tracked in Service jobs"
            }
          />
        </View>
      </View>
      {editingImages ? null : (
        <CatalogSavedPhotos
          item={item}
          editing={false}
          onEditingChange={setEditingImages}
        />
      )}
    </MobileScreen>
  )
}

function TableHead({
  children,
  className,
}: { children: string; className: string }) {
  return (
    <Text
      className={cn(
        "text-xs font-extrabold uppercase tracking-[0.8px] text-muted-foreground",
        className,
      )}
    >
      {children}
    </Text>
  )
}

function PriceRow({
  entry,
  first,
  largeText,
  onPress,
  product,
  stock,
}: {
  entry: OfferingEntry
  first: boolean
  largeText: boolean
  onPress?: () => void
  product: boolean
  stock?: StockBalance
}) {
  const { offering, variant, price } = entry
  const quote = offering.pricingPolicy === "quote_required"
  const priceLabel = quote
    ? "Quote"
    : offering.fixedPriceMinor === null
      ? "Not set"
      : wholeMoney(price)
  const sub = [variant.name, offering.productUnit?.sku]
    .filter(Boolean)
    .join(" · ")
  const priceText = (
    <Text
      className={cn(
        "text-right tabular-nums",
        quote || offering.fixedPriceMinor === null
          ? "text-xs font-bold text-muted-foreground"
          : "text-sm font-extrabold text-foreground",
        !largeText && "w-[84px]",
      )}
    >
      {priceLabel}
    </Text>
  )
  const stockText = product ? (
    stock ? (
      <View className={largeText ? "flex-row items-baseline gap-1.5" : "w-16"}>
        <Text className="text-right text-xs font-bold tabular-nums text-foreground">
          {largeText ? `${stock.onHandQuantity} on hand` : stock.onHandQuantity}
        </Text>
        <Text className="text-right text-xs font-semibold tabular-nums text-muted-foreground">
          {`${stock.reservedQuantity} res.`}
        </Text>
      </View>
    ) : (
      <Text
        className={cn(
          "text-right text-xs font-bold text-muted-foreground",
          !largeText && "w-16",
        )}
      >
        —
      </Text>
    )
  ) : (
    <Text
      className={cn(
        "text-right text-xs font-semibold text-muted-foreground",
        !largeText && "w-16",
      )}
    >
      Job
    </Text>
  )
  const content = (
    <>
      {first ? null : <RowDivider position="top" />}
      <View className="min-w-0 flex-1">
        <Text className="text-xs font-bold text-foreground">
          {offering.name}
        </Text>
        {sub ? (
          <Text className="text-xs text-muted-foreground">{sub}</Text>
        ) : null}
      </View>
      {largeText ? (
        <View className="flex-row items-center justify-between gap-3">
          {stockText}
          {priceText}
        </View>
      ) : (
        <>
          {stockText}
          {priceText}
        </>
      )}
    </>
  )
  const className = cn(
    "min-h-14 gap-2 px-3.5 py-2",
    !largeText && "flex-row items-center",
  )
  const label = `${offering.name}, ${variant.name}, ${quote ? "quote required" : priceLabel === "Not set" ? "price not set" : priceLabel}${
    stock ? `, ${stock.onHandQuantity} on hand` : ""
  }`
  return onPress ? (
    <Pressable
      accessibilityHint="Starts an order with this option"
      accessibilityLabel={label}
      accessibilityRole="button"
      className={className}
      haptic
      onPress={onPress}
    >
      {content}
    </Pressable>
  ) : (
    <View accessible accessibilityLabel={label} className={className}>
      {content}
    </View>
  )
}

function FilterChip({
  count,
  label,
  onPress,
  selected,
}: {
  count: number
  label: string
  onPress: () => void
  selected: boolean
}) {
  // Border width stays the same in both states (Android drops the label of a
  // chip whose border disappears on selection).
  return (
    <Pressable
      accessibilityLabel={`${label}, ${count} option${count === 1 ? "" : "s"}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={cn(
        "min-h-[34px] flex-row items-center gap-1.5 rounded-full border px-3.5",
        selected ? "border-foreground bg-foreground" : "border-border bg-card",
      )}
      haptic
      onPress={onPress}
    >
      <Text
        className={cn(
          "text-xs font-bold",
          selected ? "text-background" : "text-muted-foreground",
        )}
      >
        {label}
      </Text>
      <Text
        className={cn(
          "text-xs font-bold opacity-70 tabular-nums",
          selected ? "text-background" : "text-muted-foreground",
        )}
      >
        {count}
      </Text>
    </Pressable>
  )
}

function KindPill({ service }: { service: boolean }) {
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const fg = service ? palette.lilacForeground : palette.skyForeground
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: service ? palette.lilac : palette.sky,
        borderRadius: 999,
        flexDirection: "row",
        gap: 4,
        minHeight: 26,
        paddingVertical: 2,
        justifyContent: "center",
        marginTop: 3,
        paddingHorizontal: 8,
      }}
    >
      <Icon
        className="size-[11px]"
        color={fg}
        name={service ? "Wrench" : "Package"}
      />
      <NativeText
        maxFontSizeMultiplier={1.4}
        style={{
          color: fg,
          fontSize: 16,
          fontWeight: "700",
          includeFontPadding: false,
          lineHeight: 22,
          textAlignVertical: "center",
        }}
      >
        {service ? "Service" : "Product"}
      </NativeText>
    </View>
  )
}

const wholeMoney = (value: string) => value.replace(/\.00(?=\D*$)/, "")

function AboutRow({
  border,
  icon,
  sub,
  tint,
  title,
}: {
  border: boolean
  icon: IconKeys
  sub: string
  tint: GreenTillTint
  title: string
}) {
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  return (
    <View
      className={cn(
        "flex-row items-center gap-3 py-3",
        border && "border-t border-border",
      )}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: palette[tint],
          borderRadius: 11,
          height: 36,
          justifyContent: "center",
          width: 36,
        }}
      >
        <Icon
          className="size-[17px]"
          color={palette[`${tint}Foreground`]}
          name={icon}
        />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-bold text-foreground">{title}</Text>
        <Text className="text-xs text-muted-foreground">{sub}</Text>
      </View>
    </View>
  )
}

export function ClassicCatalogItemScreen(props: CatalogItemScreenProps) {
  const { colorScheme } = useColorScheme()
  const unavailable = catalogItemUnavailable(props)
  const [itemReadyOnOpen] = useState(() => Boolean(props.item))
  return (
    <View className="flex-1 bg-background">
      <StatusBar animated style={colorScheme === "dark" ? "light" : "dark"} />
      {props.item && props.storeId ? (
        <MotionView animate={!itemReadyOnOpen} fill>
          <ClassicCatalogItemOverview
            key={props.item.id}
            {...props}
            item={props.item}
          />
        </MotionView>
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
            <SkeletonGroup accessibilityLabel="Loading item">
              <View className="gap-4">
                <Skeleton height={28} radius={4} width="66%" />
                <Skeleton height={224} radius={26} />
                <Skeleton height={144} radius={20} />
              </View>
            </SkeletonGroup>
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
