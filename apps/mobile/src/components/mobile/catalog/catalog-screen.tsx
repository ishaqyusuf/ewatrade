import { ActionButton } from "@/components/mobile/action-button"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { EmptyState } from "@/components/mobile/empty-state"
import { FormField } from "@/components/mobile/form-field"
import { ListCreateFab } from "@/components/mobile/list-create-fab"
import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { Modal, useModal } from "@/components/ui/modal"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import {
  LIST_PAGE_SIZE,
  shouldFetchNextListPage,
  shouldShowListSearch,
} from "@/lib/list-pagination"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { useRouter } from "expo-router"
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import {
  Keyboard,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  useWindowDimensions,
} from "react-native"
import { FlatList } from "react-native-css/components/FlatList"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import {
  ClassicCatalogFrame,
  ClassicCatalogMasthead,
  ClassicCatalogFirstItemGate,
  ClassicCatalogRow,
  ClassicCatalogFilter,
} from "@/components/mobile/appearances/classic/catalog-screen"
import {
  MarketDayCatalogFrame,
  MarketDayCatalogMasthead,
  MarketDayCatalogFirstItemGate,
  MarketDayCatalogRow,
  MarketDayCatalogFilter,
  MarketDayCatalogSummary,
  MarketDayCatalogChoices,
  MarketDayCatalogAddButton,
} from "@/components/mobile/appearances/market-day/catalog-screen"
import { shouldShowCatalogFirstItemGate } from "../catalog-items-model"
import { mapCatalogItem } from "./catalog-row-model"
import type {
  CatalogItemsContentProps,
  CatalogKindFilter,
} from "./catalog-presentation"

export function CatalogItemsContent({
  designScreen = "catalog",
  dockHidden = false,
  onAddItem,
  onAddProduct = onAddItem,
  onAddService = onAddItem,
  onComplete,
  onScroll,
  presentation = "modal",
}: CatalogItemsContentProps) {
  const isMarketDay = useMobileDesign(designScreen) === "market-day"
  const palette = useMarketDayPalette()
  const Frame = isMarketDay ? MarketDayCatalogFrame : ClassicCatalogFrame
  const Masthead = isMarketDay
    ? MarketDayCatalogMasthead
    : ClassicCatalogMasthead
  const FirstItemGate = isMarketDay
    ? MarketDayCatalogFirstItemGate
    : ClassicCatalogFirstItemGate
  const Row = isMarketDay ? MarketDayCatalogRow : ClassicCatalogRow
  const Filter = isMarketDay ? MarketDayCatalogFilter : ClassicCatalogFilter
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const trpc = useTRPC()
  const isOffline = useOperationalModeStore((state) => state.isOfflineMode)
  const [kindFilter, setKindFilter] = useState<CatalogKindFilter>("all")
  const [query, setQuery] = useState("")
  const [mastheadHeight, setMastheadHeight] = useState(0)
  const [showCanvasStatusBar, setShowCanvasStatusBar] = useState(false)
  const [footerHeight, setFooterHeight] = useState(100)
  const deferredQuery = useDeferredValue(query)
  const addSheet = useModal()
  const pendingAdd = useRef<"product" | "service" | null>(null)
  useEffect(() => {
    setShowCanvasStatusBar(false)
    setMastheadHeight(0)
    pendingAdd.current = null
    if (!isMarketDay) addSheet.dismiss()
  }, [isMarketDay, addSheet.dismiss])
  useEffect(() => {
    if (isOffline && query) setQuery("")
  }, [isOffline, query])
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
      { getNextPageParam: (lastPage) => lastPage.nextCursor, retry: false },
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
  const showSearch = shouldShowListSearch(totalCount) || query.length > 0
  const showFirstItemGate = shouldShowCatalogFirstItemGate({
    hasCatalogItems: availabilityQuery.data?.hasCatalogItems,
    isError: itemsQuery.isError,
    isPending: itemsQuery.isPending,
    presentation,
    rowCount: rows.length,
  })
  const showBottomSearch =
    !showFirstItemGate &&
    (isMarketDay || (presentation === "modal" && showSearch && !isOffline))
  const footerOffset =
    isMarketDay && presentation === "tab" && !dockHidden ? 84 : 0
  const bottomSpace = showBottomSearch
    ? footerHeight + footerOffset + 24
    : presentation === "tab"
      ? Math.max(insets.bottom + 116, 152)
      : 24
  const openAdd = () => {
    if (isOffline) return
    Keyboard.dismiss()
    if (isMarketDay) addSheet.present()
    else onAddItem()
  }
  const chooseAdd = (kind: "product" | "service") => {
    if (isOffline || pendingAdd.current) return
    pendingAdd.current = kind
    addSheet.dismiss()
  }
  const completeAddDismissal = () => {
    const kind = pendingAdd.current
    pendingAdd.current = null
    if (isOffline || !isMarketDay || !kind) return
    if (kind === "product") onAddProduct()
    else onAddService()
  }
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    onScroll?.(event)
    const canvas =
      mastheadHeight > 0 &&
      Math.max(0, event.nativeEvent.contentOffset.y) >=
        mastheadHeight - (presentation === "tab" ? insets.top : 0)
    setShowCanvasStatusBar((current) => (current === canvas ? current : canvas))
  }
  return (
    <Frame
      presentation={presentation}
      bottomSpace={bottomSpace}
      showCanvasStatusBar={showCanvasStatusBar}
    >
      <FlatList
        className="flex-1"
        contentContainerClassName="grow pt-[var(--catalog-list-top)] pb-[var(--catalog-list-bottom)]"
        data={rows}
        keyExtractor={(item) => item.id}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View className="gap-5 pb-4">
            <Masthead
              firstItem={showFirstItemGate}
              disabled={isOffline}
              onAdd={openAdd}
              onLayout={(event) =>
                setMastheadHeight(event.nativeEvent.layout.height)
              }
            />
            {isMarketDay && rows.length > 0 ? (
              <MarketDayCatalogSummary rows={rows} />
            ) : null}
            <View className="gap-4 px-4">
              {isOffline ? (
                <StatusBanner
                  title="Offline mode"
                  icon="Wind"
                  message="Showing cached Catalog items. Reconnect to search or add a Product or Service."
                  tone="warning"
                />
              ) : null}
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
                  <Filter
                    active={kindFilter === "all"}
                    label="All"
                    onPress={() => setKindFilter("all")}
                  />
                  {availabilityQuery.data.hasProductItems ? (
                    <Filter
                      active={kindFilter === "product"}
                      label="Products"
                      onPress={() => setKindFilter("product")}
                    />
                  ) : null}
                  {availabilityQuery.data.hasServiceItems ? (
                    <Filter
                      active={kindFilter === "service"}
                      label="Services"
                      onPress={() => setKindFilter("service")}
                    />
                  ) : null}
                </View>
              ) : null}
              {!isMarketDay &&
              presentation === "tab" &&
              showSearch &&
              !isOffline ? (
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
          </View>
        }
        ListEmptyComponent={
          showFirstItemGate ? (
            <FirstItemGate
              disabled={isOffline}
              onAddProduct={() => {
                if (!isOffline) onAddProduct()
              }}
              onAddService={() => {
                if (!isOffline) onAddService()
              }}
            />
          ) : !itemsQuery.isError ? (
            <EmptyState
              className="m-4 flex-1 justify-center"
              icon="Warehouse"
              title={
                isOffline
                  ? "No cached items"
                  : itemsQuery.isPending
                    ? "Loading"
                    : query || kindFilter !== "all"
                      ? "No matching items"
                      : "No catalog items"
              }
              message={
                isOffline
                  ? "Reconnect to load your Catalog."
                  : itemsQuery.isPending
                    ? "Loading catalog items."
                    : query || kindFilter !== "all"
                      ? "Try another search or item type."
                      : "Add a Product or Service to start your Catalog."
              }
            />
          ) : null
        }
        ListFooterComponent={
          <View className="gap-3 px-4 pt-4 pb-8">
            {itemsQuery.isFetchingNextPage ? (
              <Text className="py-2 text-center text-xs font-semibold text-muted-foreground">
                Loading more items…
              </Text>
            ) : null}
            {onComplete ? (
              <ActionButton
                onPress={onComplete}
                variant="outline"
                foregroundColor={isMarketDay ? palette.ink : undefined}
                className={
                  isMarketDay
                    ? "border-market-line bg-market-field active:bg-market-line"
                    : undefined
                }
              >
                Done
              </ActionButton>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => (
          <Row
            item={item}
            index={index}
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
          )
            void itemsQuery.fetchNextPage()
        }}
        onEndReachedThreshold={0.35}
        refreshControl={<QueryRefreshControl />}
      />
      {showBottomSearch ? (
        <BottomSearchFooter
          accessibilityLabel="Search catalog items"
          alwaysShowSearch={isMarketDay || query.length > 0}
          bottomOffset={footerOffset}
          onHeightChange={setFooterHeight}
          maxLength={160}
          layout={isMarketDay ? "inline" : "stacked"}
          onChangeText={setQuery}
          placeholder="Find item, type, or unit"
          totalCount={totalCount}
          value={query}
          variant={isMarketDay ? "market-day" : "default"}
        >
          {isMarketDay ? (
            <MarketDayCatalogAddButton disabled={isOffline} onPress={openAdd} />
          ) : null}
        </BottomSearchFooter>
      ) : null}
      {!isMarketDay && !showFirstItemGate ? (
        <ListCreateFab
          accessibilityLabel="Add catalog item"
          bottomOffset={showBottomSearch ? footerHeight : 0}
          dockHidden={dockHidden}
          disabled={isOffline}
          onPress={openAdd}
          sitsAboveDock={presentation === "tab"}
          testID="catalog-add-fab"
        />
      ) : null}
      {isMarketDay ? (
        <Modal
          ref={addSheet.ref}
          snapPoints={[]}
          enableDynamicSizing
          maxDynamicContentSize={height * 0.44}
          title="Add to Catalog"
          onDismiss={completeAddDismissal}
        >
          <BottomSheetScrollView keyboardShouldPersistTaps="handled">
            <View className="gap-3 px-5 pb-6">
              <Text className="text-sm text-market-muted-ink">
                Choose the kind of thing your Store sells.
              </Text>
              <MarketDayCatalogChoices
                disabled={isOffline}
                onAddProduct={() => chooseAdd("product")}
                onAddService={() => chooseAdd("service")}
              />
              {isOffline ? (
                <Text className="text-xs text-market-muted-ink">
                  Reconnect to add an item.
                </Text>
              ) : null}
            </View>
          </BottomSheetScrollView>
        </Modal>
      ) : null}
    </Frame>
  )
}
