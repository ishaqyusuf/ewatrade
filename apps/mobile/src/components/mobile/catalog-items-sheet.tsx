import { ActionButton } from "@/components/mobile/action-button"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { EmptyState } from "@/components/mobile/empty-state"
import { FormField } from "@/components/mobile/form-field"
import { ListCreateFab } from "@/components/mobile/list-create-fab"
import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import {
  SecondaryOperationalRow,
  SecondarySheetHeader,
} from "@/components/mobile/secondary-operations"
import { StatusBadge } from "@/components/mobile/status-badge"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import {
  LIST_PAGE_SIZE,
  shouldFetchNextListPage,
  shouldShowListSearch,
} from "@/lib/list-pagination"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { formatMinorMoney, subtractExactDecimals } from "@ewatrade/utils"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { useDeferredValue, useMemo, useState } from "react"
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  View,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

type CatalogKindFilter = "all" | "product" | "service"
type CatalogItem = RouterOutputs["catalog"]["listItems"][number]

type CatalogRow = {
  detail: string
  id: string
  kind: "product" | "service"
  name: string
  priceLabel: string
  unitName: string
}

type CatalogItemsContentProps = {
  dockHidden?: boolean
  onAddItem: () => void
  onComplete?: () => void
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
  presentation?: "modal" | "tab"
}

function mapCatalogItem(item: CatalogItem, storeId?: string): CatalogRow {
  const defaultVariant =
    item.variants.find((variant) => variant.isDefault) ?? item.variants[0]
  const offering = defaultVariant?.offerings[0]
  const currencyCode = offering?.currencyCode ?? "NGN"
  const priceLabel =
    offering?.pricingPolicy === "fixed" && offering.fixedPriceMinor !== null
      ? formatMinorMoney(offering.fixedPriceMinor, currencyCode)
      : "Quote"

  if (item.kind === "service") {
    return {
      detail: `${priceLabel} · No inventory`,
      id: item.id,
      kind: item.kind,
      name: item.name,
      priceLabel,
      unitName: offering?.name ?? "Service",
    }
  }

  const canonicalUnit =
    item.product?.currentUnitConfiguration?.units.find(
      (unit) => unit.stockBehavior === "canonical_shared",
    ) ?? item.product?.currentUnitConfiguration?.units[0]
  const offeringUnit = item.product?.currentUnitConfiguration?.units.find(
    (unit) => unit.id === offering?.productUnit?.inventoryUnitId,
  )
  const balance = item.product?.stockBalances.find(
    (candidate) =>
      candidate.storeId === storeId &&
      candidate.variantId === defaultVariant?.id &&
      (offeringUnit?.stockBehavior === "packaged_stock"
        ? candidate.kind === "packaged_stock" &&
          candidate.inventoryUnitId === offeringUnit.id
        : candidate.kind === "shared_pool"),
  )
  const unitName = balance?.inventoryUnitName ?? canonicalUnit?.name ?? "unit"
  const availableQuantity = balance
    ? subtractExactDecimals(balance.onHandQuantity, balance.reservedQuantity)
    : "0"

  return {
    detail: `${availableQuantity} ${unitName} available · ${priceLabel}`,
    id: item.id,
    kind: item.kind,
    name: item.name,
    priceLabel,
    unitName,
  }
}

function CatalogItemRow({
  item,
  onPress,
}: {
  item: CatalogRow
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityLabel={`Open ${item.name}`}
      accessibilityRole="button"
      className="mx-2 px-2 active:bg-accent"
      haptic
      onPress={onPress}
      transition
    >
      <SecondaryOperationalRow
        detail={item.detail}
        icon={item.kind === "service" ? "Wrench" : "Warehouse"}
        title={item.name}
        trailing={
          <StatusBadge
            label={item.kind === "service" ? "Service" : "Product"}
            tone={item.kind === "service" ? "primary" : "success"}
          />
        }
      />
    </Pressable>
  )
}

function KindFilter({
  active,
  label,
  onPress,
}: {
  active: boolean
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      className={
        active
          ? "rounded-full bg-primary px-4 py-2"
          : "rounded-full bg-muted px-4 py-2"
      }
      haptic
      onPress={onPress}
      transition
    >
      <Text
        className={
          active
            ? "text-xs font-bold text-primary-foreground"
            : "text-xs font-bold text-foreground"
        }
      >
        {label}
      </Text>
    </Pressable>
  )
}

export function CatalogItemsContent({
  dockHidden = false,
  onAddItem,
  onComplete,
  onScroll,
  presentation = "modal",
}: CatalogItemsContentProps) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const trpc = useTRPC()
  const isOffline = useOperationalModeStore((state) => state.isOfflineMode)
  const [kindFilter, setKindFilter] = useState<CatalogKindFilter>("all")
  const [query, setQuery] = useState("")
  const deferredQuery = useDeferredValue(query)
  const availabilityQuery = useQuery(
    trpc.tenant.featureAvailability.queryOptions(undefined, { retry: false }),
  )
  const itemsQuery = useInfiniteQuery(
    trpc.catalog.listItemsPage.infiniteQueryOptions(
      {
        kind: kindFilter === "all" ? undefined : kindFilter,
        limit: LIST_PAGE_SIZE,
        query: isOffline ? undefined : deferredQuery || undefined,
      },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        retry: false,
      },
    ),
  )
  const rows = useMemo(
    () =>
      (itemsQuery.data?.pages.flatMap((page) => page.items) ?? []).map((item) =>
        mapCatalogItem(item, availabilityQuery.data?.storeId),
      ),
    [availabilityQuery.data?.storeId, itemsQuery.data?.pages],
  )
  const totalCount = itemsQuery.data?.pages[0]?.totalCount ?? 0
  const showSearch = shouldShowListSearch(totalCount)

  return (
    <View className="flex-1">
      <FlatList<CatalogRow>
        className="flex-1"
        contentContainerStyle={{
          paddingBottom:
            presentation === "tab"
              ? Math.max(insets.bottom + 116, 152)
              : showSearch
                ? 112
                : 24,
        }}
        data={rows}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        ListEmptyComponent={
          <EmptyState
            className="m-4 flex-1 justify-center"
            icon="Warehouse"
            message={
              itemsQuery.isPending
                ? "Loading catalog items."
                : "Add a Product or Service to start your Catalog."
            }
            title={itemsQuery.isPending ? "Loading" : "No catalog items"}
          />
        }
        ListFooterComponent={
          <View className="gap-3 px-4 pt-4 pb-8">
            {itemsQuery.isFetchingNextPage ? (
              <Text className="py-2 text-center text-xs font-semibold text-muted-foreground">
                Loading more items…
              </Text>
            ) : null}
            {onComplete ? (
              <ActionButton onPress={onComplete} variant="outline">
                Done
              </ActionButton>
            ) : null}
          </View>
        }
        ListHeaderComponent={
          <View className="gap-5 px-4 pb-4">
            <SecondarySheetHeader
              description="Products track stock. Services stay outside inventory."
              icon="Warehouse"
              title="Catalog items"
            />

            {itemsQuery.isError ? (
              <StatusBanner
                actionLabel="Try again"
                icon="AlertCircle"
                message={itemsQuery.error.message}
                onActionPress={() => void itemsQuery.refetch()}
                tone="destructive"
              />
            ) : null}

            {availabilityQuery.data?.hasCatalogItems ? (
              <View className="flex-row flex-wrap gap-2">
                <KindFilter
                  active={kindFilter === "all"}
                  label="All"
                  onPress={() => setKindFilter("all")}
                />
                {availabilityQuery.data.hasProductItems ? (
                  <KindFilter
                    active={kindFilter === "product"}
                    label="Products"
                    onPress={() => setKindFilter("product")}
                  />
                ) : null}
                {availabilityQuery.data.hasServiceItems ? (
                  <KindFilter
                    active={kindFilter === "service"}
                    label="Services"
                    onPress={() => setKindFilter("service")}
                  />
                ) : null}
              </View>
            ) : null}

            {presentation === "tab" && showSearch && !isOffline ? (
              <FormField
                autoCapitalize="words"
                label="Find item"
                leadingIcon="Search"
                onChangeText={setQuery}
                placeholder="Search name, type, or unit"
                value={query}
              />
            ) : null}
          </View>
        }
        ListHeaderComponentStyle={
          presentation === "tab" ? { paddingTop: insets.top + 24 } : undefined
        }
        renderItem={({ item }) => (
          <CatalogItemRow
            item={item}
            onPress={() =>
              router.push({
                params: { catalogItemId: item.id },
                pathname: "/catalog-item/[catalogItemId]",
              })
            }
          />
        )}
        onEndReached={() => {
          if (
            shouldFetchNextListPage({
              hasNextPage: Boolean(itemsQuery.hasNextPage),
              isFetchingNextPage: itemsQuery.isFetchingNextPage,
            })
          ) {
            void itemsQuery.fetchNextPage()
          }
        }}
        onEndReachedThreshold={0.35}
        refreshControl={<QueryRefreshControl />}
        scrollEventThrottle={onScroll ? 16 : undefined}
      />
      {presentation === "modal" && showSearch ? (
        <BottomSearchFooter
          accessibilityLabel="Search catalog items"
          onChangeText={setQuery}
          placeholder="Search name, type, or unit"
          totalCount={totalCount}
          value={query}
        />
      ) : null}
      <ListCreateFab
        accessibilityLabel="Add catalog item"
        bottomOffset={presentation === "modal" && showSearch ? 88 : 0}
        dockHidden={dockHidden}
        disabled={isOffline}
        onPress={onAddItem}
        sitsAboveDock={presentation === "tab"}
        testID="catalog-add-fab"
      />
    </View>
  )
}
