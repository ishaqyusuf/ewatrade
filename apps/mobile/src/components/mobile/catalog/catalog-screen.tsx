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
import { Icon } from "@/components/ui/icon"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useColorScheme } from "@/hooks/use-color"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import { useScrollEdgeFeedback } from "@/hooks/use-scroll-edge-feedback"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
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
  catalogCountLabel,
  catalogShelfCounts,
  catalogShelfTitle,
  filterCatalogShelf,
  sortCatalogRows,
} from "./catalog-shelf-model"

/** The Catalog lists items A to Z; the server sorts so every page follows on. */
const CATALOG_SORT = { field: "name", direction: "asc" } as const

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
  const greenTill = GREEN_TILL_THEME[useColorScheme().colorScheme]
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
      { limit: LIST_PAGE_SIZE, sort: CATALOG_SORT },
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
        sort: CATALOG_SORT,
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
      sortCatalogRows(
        (visibleQuery.data?.pages.flatMap((page) => page.items) ?? []).map(
          (item) => mapCatalogItem(item, availabilityQuery.data?.storeId),
        ),
      ),
    [availabilityQuery.data?.storeId, visibleQuery.data?.pages],
  )
  const rows = filterCatalogShelf(loadedRows, {
    query: isOffline ? deferredQuery : "",
    kind: isOffline ? kindFilter : "all",
    attention: isMarketDay ? null : attention,
  })
  const totalCount = visibleQuery.data?.pages[0]?.totalCount ?? 0
  // Online, the type switch and search filter on the server, so counts are kept
  // from the last unfiltered, fully loaded page set.
  const unfiltered = isOffline || (kindFilter === "all" && !deferredQuery)
  const hasPages = Boolean(visibleQuery.data)
  const freshCounts = useMemo(
    () =>
      unfiltered && hasPages
        ? catalogShelfCounts(loadedRows, isOffline ? 0 : totalCount)
        : null,
    [unfiltered, hasPages, loadedRows, isOffline, totalCount],
  )
  const [keptCounts, setKeptCounts] = useState(freshCounts)
  useEffect(() => {
    if (freshCounts) setKeptCounts(freshCounts)
  }, [freshCounts])
  const counts = unfiltered ? freshCounts : keptCounts
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
  // Search stays put when a type filter narrows the list.
  const showSearch =
    shouldShowListSearch(Math.max(totalCount, counts?.all ?? 0)) ||
    query.length > 0
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
                counts
                  ? `${catalogCountLabel(counts)}${isOffline ? " · saved" : ""}`
                  : visibleQuery.data
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
                  accessibilityLabel="Search catalog"
                  autoCapitalize="words"
                  label="Search catalog"
                  leadingIcon="Search"
                  onChangeText={setQuery}
                  placeholder={
                    isOffline
                      ? "Search saved items"
                      : "Search name, type or unit"
                  }
                  value={query}
                  variant="till-search"
                />
              ) : null}
              {availabilityQuery.data?.hasCatalogItems &&
              (isMarketDay || mixedCatalog) ? (
                <View
                  className={
                    isMarketDay
                      ? "flex-row flex-wrap gap-2"
                      : "flex-row rounded-[13px] border border-border bg-muted p-[3px]"
                  }
                >
                  <Filter
                    active={kindFilter === "all"}
                    count={isMarketDay ? undefined : counts?.all}
                    label="All"
                    onPress={() => setKindFilter("all")}
                  />
                  {availabilityQuery.data.hasProductItems ? (
                    <Filter
                      active={kindFilter === "product"}
                      count={isMarketDay ? undefined : counts?.product}
                      label="Products"
                      onPress={() => setKindFilter("product")}
                    />
                  ) : null}
                  {availabilityQuery.data.hasServiceItems ? (
                    <Filter
                      active={kindFilter === "service"}
                      count={isMarketDay ? undefined : counts?.service}
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
                  {counts ? null : (
                    <Text className="text-xs text-muted-foreground">
                      {isOffline ? "Saved items" : "Loaded items"}
                    </Text>
                  )}
                  <View className="flex-row flex-wrap gap-2">
                    {(
                      [
                        ["out_of_stock", "out of stock", "TriangleAlert"],
                        ["no_price", "no price", "Tag"],
                        ["not_counted", "not counted", "ClipboardList"],
                      ] as const
                    )
                      .filter(
                        ([key]) =>
                          attention === key ||
                          loadedRows.some((row) => row.problem === key),
                      )
                      .map(([key, problem, icon]) => {
                        const count = counts?.[key]
                        const label =
                          count === undefined
                            ? `${problem[0]?.toUpperCase()}${problem.slice(1)}`
                            : `${count} ${problem}`
                        const tone =
                          key === "out_of_stock"
                            ? "rose"
                            : key === "no_price"
                              ? "amber"
                              : "sky"
                        return (
                          <Pressable
                            key={key}
                            accessibilityLabel={label}
                            accessibilityRole="button"
                            accessibilityState={{ selected: attention === key }}
                            onPress={() =>
                              setAttention(attention === key ? null : key)
                            }
                            className={cn(
                              "min-h-[34px] flex-row items-center justify-center gap-1.5 rounded-full border-2 px-[11px] py-1",
                              tone === "rose"
                                ? "bg-tint-rose"
                                : tone === "amber"
                                  ? "bg-tint-amber"
                                  : "bg-tint-sky",
                              attention !== key
                                ? "border-transparent"
                                : tone === "rose"
                                  ? "border-tint-rose-foreground"
                                  : tone === "amber"
                                    ? "border-tint-amber-foreground"
                                    : "border-tint-sky-foreground",
                            )}
                          >
                            <Icon
                              className="size-[14px]"
                              color={greenTill[`${tone}Foreground`]}
                              name={icon}
                            />
                            <Text
                              className={cn(
                                "text-xs font-bold",
                                tone === "rose"
                                  ? "text-tint-rose-foreground"
                                  : tone === "amber"
                                    ? "text-tint-amber-foreground"
                                    : "text-tint-sky-foreground",
                              )}
                            >
                              {label}
                            </Text>
                          </Pressable>
                        )
                      })}
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
