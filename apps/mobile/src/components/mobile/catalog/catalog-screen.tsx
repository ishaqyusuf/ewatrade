import { ActionButton } from "@/components/mobile/action-button"
import {
  CatalogShelfSkeleton,
  ClassicCatalogChoices,
  ClassicCatalogFilter,
  ClassicCatalogFirstItemGate,
  ClassicCatalogFrame,
  ClassicCatalogMasthead,
  ClassicCatalogRow,
} from "@/components/mobile/appearances/classic/catalog-screen"
import {
  MarketDayCatalogAddButton,
  MarketDayCatalogChoices,
  MarketDayCatalogFilter,
  MarketDayCatalogFirstItemGate,
  MarketDayCatalogFrame,
  MarketDayCatalogMasthead,
  MarketDayCatalogRow,
  MarketDayCatalogSummary,
} from "@/components/mobile/appearances/market-day/catalog-screen"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { EmptyState } from "@/components/mobile/empty-state"
import { FormField } from "@/components/mobile/form-field"
import { ListCreateFab } from "@/components/mobile/list-create-fab"
import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import { useScrollEdgeFeedback } from "@/hooks/use-scroll-edge-feedback"
import {
  LIST_PAGE_SIZE,
  shouldFetchNextListPage,
  shouldShowListSearch,
} from "@/lib/list-pagination"
import { useMarketDayPalette } from "@/lib/market-day-theme"
import { canEditMobileCatalog } from "@/lib/mobile-roles"
import { cn } from "@/lib/utils"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
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
import { shouldShowCatalogFirstItemGate } from "../catalog-items-model"
import type {
  CatalogItemsContentProps,
  CatalogKindFilter,
} from "./catalog-presentation"
import { mapCatalogItem } from "./catalog-row-model"
import {
  type CatalogAttention,
  catalogShelfTitle,
  filterCatalogShelf,
} from "./catalog-shelf-model"

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
  const canEdit = canEditMobileCatalog(useAuthContext().profile)
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const trpc = useTRPC()
  const isOffline = useOperationalModeStore((state) => state.isOfflineMode)
  const [kindFilter, setKindFilter] = useState<CatalogKindFilter>("all")
  const [query, setQuery] = useState("")
  const [attention, setAttention] = useState<CatalogAttention | null>(null)
  const [mastheadHeight, setMastheadHeight] = useState(0)
  const [showCanvasStatusBar, setShowCanvasStatusBar] = useState(false)
  const [footerHeight, setFooterHeight] = useState(100)
  const deferredQuery = useDeferredValue(query)
  const addSheet = useModal()
  const pendingAdd = useRef<"product" | "service" | null>(null)
  // The appearance change resets measurements even though only the effect's
  // trigger depends on it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when appearance changes
  useEffect(() => {
    setShowCanvasStatusBar(false)
    setMastheadHeight(0)
    pendingAdd.current = null
    addSheet.dismiss()
  }, [isMarketDay, addSheet.dismiss])
  const availabilityQuery = useQuery(
    trpc.tenant.featureAvailability.queryOptions(undefined, { retry: false }),
  )
  // Keep the unfiltered first page available when a search loses connectivity.
  const savedItemsQuery = useInfiniteQuery(
    trpc.catalog.listItemsPage.infiniteQueryOptions(
      { limit: LIST_PAGE_SIZE },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        retry: false,
        enabled: !isOffline,
      },
    ),
  )
  const itemsQuery = useInfiniteQuery(
    trpc.catalog.listItemsPage.infiniteQueryOptions(
      {
        kind: isOffline || kindFilter === "all" ? undefined : kindFilter,
        limit: LIST_PAGE_SIZE,
        query: isOffline ? undefined : deferredQuery || undefined,
      },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        retry: false,
        enabled: !isOffline,
      },
    ),
  )
  const visibleQuery = isOffline ? savedItemsQuery : itemsQuery
  const loadedRows = useMemo(
    () =>
      (visibleQuery.data?.pages.flatMap((page) => page.items) ?? []).map(
        (item) => mapCatalogItem(item, availabilityQuery.data?.storeId),
      ),
    [availabilityQuery.data?.storeId, visibleQuery.data?.pages],
  )
  const rows = filterCatalogShelf(loadedRows, {
    query: isOffline ? deferredQuery : "",
    kind: isOffline ? kindFilter : "all",
    attention: isMarketDay ? null : attention,
  })
  const totalCount = visibleQuery.data?.pages[0]?.totalCount ?? 0
  const mixedCatalog =
    availabilityQuery.data?.hasProductItems &&
    availabilityQuery.data?.hasServiceItems
  const catalogTitle = catalogShelfTitle(
    availabilityQuery.data?.hasProductItems,
    availabilityQuery.data?.hasServiceItems,
  )
  const savedAt = visibleQuery.dataUpdatedAt
    ? new Date(visibleQuery.dataUpdatedAt).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })
    : null
  const Choices = isMarketDay ? MarketDayCatalogChoices : ClassicCatalogChoices
  const showSearch = shouldShowListSearch(totalCount) || query.length > 0
  const showFirstItemGate = shouldShowCatalogFirstItemGate({
    hasCatalogItems: availabilityQuery.data?.hasCatalogItems,
    isError: visibleQuery.isError || isOffline || !canEdit,
    isPending: visibleQuery.isPending,
    presentation,
    rowCount: rows.length,
  })
  const showBottomSearch =
    !showFirstItemGate &&
    (isMarketDay || (presentation === "modal" && showSearch))
  const footerOffset =
    isMarketDay && presentation === "tab" && !dockHidden ? 84 : 0
  const bottomSpace = showBottomSearch
    ? footerHeight + footerOffset + 24
    : presentation === "tab"
      ? Math.max(insets.bottom + 116, 152)
      : 24
  const openAdd = () => {
    if (!canEdit) return
    if (isOffline) return
    Keyboard.dismiss()
    addSheet.present()
  }
  const chooseAdd = (kind: "product" | "service") => {
    if (!canEdit || isOffline || pendingAdd.current) return
    pendingAdd.current = kind
    addSheet.dismiss()
  }
  const completeAddDismissal = () => {
    const kind = pendingAdd.current
    pendingAdd.current = null
    if (isOffline || !canEdit || !kind) return
    if (kind === "product") onAddProduct()
    else onAddService()
  }
  const edgeFeedback = useScrollEdgeFeedback()
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
        {...edgeFeedback}
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
          <View className="gap-4 pb-4">
            <Masthead
              title={catalogTitle}
              countLabel={
                visibleQuery.data
                  ? `${isOffline ? loadedRows.length : totalCount} ${isOffline ? "saved items" : "items"}`
                  : undefined
              }
              firstItem={showFirstItemGate}
              disabled={isOffline || !canEdit}
              onAdd={openAdd}
              onLayout={(event) =>
                setMastheadHeight(event.nativeEvent.layout.height)
              }
            />
            {isMarketDay && rows.length > 0 ? (
              <MarketDayCatalogSummary rows={rows} />
            ) : null}
            <View className="gap-4 px-[18px]">
              {isOffline ? (
                <StatusBanner
                  title="Offline mode"
                  icon="Wind"
                  message={`Saved items${savedAt ? ` · as of ${savedAt}` : ""}. Search saved items; reconnect to add an item.`}
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
              {!isMarketDay && presentation === "tab" && showSearch ? (
                <FormField
                  autoCapitalize="words"
                  label="Find item"
                  leadingIcon="Search"
                  onChangeText={setQuery}
                  placeholder="Search name, type, or unit"
                  value={query}
                />
              ) : null}
              {availabilityQuery.data?.hasCatalogItems &&
              (isMarketDay || mixedCatalog) ? (
                <View
                  className={
                    isMarketDay
                      ? "flex-row flex-wrap gap-2"
                      : "flex-row rounded-[14px] bg-muted p-1"
                  }
                >
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
              {!isMarketDay && !canEdit ? (
                <Text className="text-xs text-muted-foreground">
                  View only · Ask an owner to add or edit items.
                </Text>
              ) : null}
              {!isMarketDay &&
              (attention || loadedRows.some((row) => row.problem)) ? (
                <View className="gap-2">
                  <Text className="text-xs text-muted-foreground">
                    {isOffline ? "Saved items" : "Loaded items"}
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {(
                      [
                        ["out_of_stock", "Out of stock"],
                        ["no_price", "No price"],
                        ["not_counted", "Not counted"],
                      ] as const
                    )
                      .filter(
                        ([key]) =>
                          attention === key ||
                          loadedRows.some((row) => row.problem === key),
                      )
                      .map(([key, label]) => (
                        <Pressable
                          key={key}
                          accessibilityLabel={label}
                          accessibilityRole="button"
                          accessibilityState={{ selected: attention === key }}
                          onPress={() =>
                            setAttention(attention === key ? null : key)
                          }
                          className={cn(
                            "min-h-11 justify-center rounded-full border px-3 py-2",
                            attention === key
                              ? "border-primary"
                              : "border-transparent",
                            key === "out_of_stock"
                              ? "bg-tint-rose"
                              : key === "no_price"
                                ? "bg-tint-amber"
                                : "bg-tint-sky",
                          )}
                        >
                          <Text
                            className={
                              key === "out_of_stock"
                                ? "text-xs font-bold text-tint-rose-foreground"
                                : key === "no_price"
                                  ? "text-xs font-bold text-tint-amber-foreground"
                                  : "text-xs font-bold text-tint-sky-foreground"
                            }
                          >
                            {label}
                          </Text>
                        </Pressable>
                      ))}
                  </View>
                </View>
              ) : null}
              {query || attention ? (
                <ActionButton
                  variant="ghost"
                  onPress={() => {
                    setQuery("")
                    setAttention(null)
                  }}
                >
                  Clear filters
                </ActionButton>
              ) : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          !isMarketDay && visibleQuery.isPending && !isOffline ? (
            <CatalogShelfSkeleton />
          ) : showFirstItemGate ? (
            <FirstItemGate
              disabled={isOffline || !canEdit}
              onAddProduct={() => {
                if (!isOffline && canEdit) onAddProduct()
              }}
              onAddService={() => {
                if (!isOffline && canEdit) onAddService()
              }}
            />
          ) : !visibleQuery.isError ? (
            <EmptyState
              className="m-4 flex-1 justify-center"
              icon="Warehouse"
              title={
                isOffline
                  ? loadedRows.length
                    ? "No matching saved items"
                    : "No cached items"
                  : itemsQuery.isPending
                    ? "Loading"
                    : query || attention || kindFilter !== "all"
                      ? "No matching items"
                      : "No catalog items"
              }
              message={
                isOffline
                  ? loadedRows.length
                    ? "Try another search or filter."
                    : "Reconnect to load your Catalog."
                  : itemsQuery.isPending
                    ? "Loading catalog items."
                    : query || attention || kindFilter !== "all"
                      ? "Try another search or item type."
                      : "Add a Product or Service to start your Catalog."
              }
            />
          ) : null
        }
        ListFooterComponent={
          <View className="gap-3 px-4 pt-4 pb-8">
            {!isMarketDay &&
            attention &&
            itemsQuery.hasNextPage &&
            !isOffline ? (
              <ActionButton
                variant="outline"
                disabled={itemsQuery.isFetchingNextPage}
                onPress={() => void itemsQuery.fetchNextPage()}
              >
                Search more items
              </ActionButton>
            ) : null}
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
            last={index === rows.length - 1}
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
            !isOffline &&
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
          {isMarketDay && canEdit ? (
            <MarketDayCatalogAddButton
              disabled={isOffline || !canEdit}
              onPress={openAdd}
            />
          ) : null}
        </BottomSearchFooter>
      ) : null}
      {canEdit && !isMarketDay && !showFirstItemGate ? (
        <ListCreateFab
          tone="gold"
          accessibilityLabel="Add catalog item"
          bottomOffset={showBottomSearch ? footerHeight : 0}
          dockHidden={dockHidden}
          disabled={isOffline || !canEdit}
          onPress={openAdd}
          sitsAboveDock={presentation === "tab"}
          testID="catalog-add-fab"
        />
      ) : null}
      <Modal
        ref={addSheet.ref}
        snapPoints={[]}
        enableDynamicSizing
        maxDynamicContentSize={height * 0.8}
        title={`Add to ${catalogTitle}`}
        onDismiss={completeAddDismissal}
      >
        <BottomSheetScrollView keyboardShouldPersistTaps="handled">
          <View className="gap-3 px-5 pb-6">
            <Text
              className={
                isMarketDay
                  ? "text-sm text-market-muted-ink"
                  : "text-[13px] text-muted-foreground"
              }
            >
              What are you adding?
            </Text>
            <Choices
              disabled={isOffline || !canEdit}
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
    </Frame>
  )
}
