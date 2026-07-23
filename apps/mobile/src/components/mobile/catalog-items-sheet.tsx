import { ActionButton } from "@/components/mobile/action-button"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { EmptyState } from "@/components/mobile/empty-state"
import { FormField } from "@/components/mobile/form-field"
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
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { formatMinorMoney } from "@ewatrade/utils"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
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
  onAddItem: () => void
  onComplete?: () => void
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
  presentation?: "modal" | "tab"
}

function mapCatalogItem(item: CatalogItem): CatalogRow {
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
  const balance = item.product?.stockBalances[0]
  const unitName = balance?.inventoryUnitName ?? canonicalUnit?.name ?? "unit"

  return {
    detail: `${balance?.onHandQuantity ?? "0"} ${unitName} available · ${priceLabel}`,
    id: item.id,
    kind: item.kind,
    name: item.name,
    priceLabel,
    unitName,
  }
}

function CatalogItemRow({ item }: { item: CatalogRow }) {
  return (
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
  onAddItem,
  onComplete,
  onScroll,
  presentation = "modal",
}: CatalogItemsContentProps) {
  const insets = useSafeAreaInsets()
  const trpc = useTRPC()
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
        query: deferredQuery || undefined,
      },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        retry: false,
      },
    ),
  )
  const rows = useMemo(
    () =>
      (itemsQuery.data?.pages.flatMap((page) => page.items) ?? []).map(
        mapCatalogItem,
      ),
    [itemsQuery.data?.pages],
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
          className="mx-4"
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
          <ActionButton onPress={onAddItem}>Add item</ActionButton>
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

          {presentation === "tab" && showSearch ? (
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
        <View className="px-4">
          <CatalogItemRow item={item} />
        </View>
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
    </View>
  )
}
