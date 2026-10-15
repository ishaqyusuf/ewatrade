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
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { EmptyState } from "@/components/mobile/empty-state"
import { ListCreateFab } from "@/components/mobile/list-create-fab"
import { getListCreateFabFooterOffset } from "@/components/mobile/list-create-fab-model"
import { ListSkeleton } from "@/components/mobile/loading-skeletons"
import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import { ScrollToTopButton } from "@/components/mobile/scroll-to-top-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { TabSearchBubble } from "@/components/mobile/tab-search-bubble"
import { Icon } from "@/components/ui/icon"
import { Modal, useModal } from "@/components/ui/modal"
import { RevealItem, useFirstReveal } from "@/components/ui/motion"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useBottomSearchScroll } from "@/hooks/use-bottom-search-scroll"
import { useColorScheme } from "@/hooks/use-color"
import { useScrollEdgeFeedback } from "@/hooks/use-scroll-edge-feedback"
import { useScrollToTop } from "@/hooks/use-scroll-to-top"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import {
  LIST_PAGE_SIZE,
  shouldFetchNextListPage,
  shouldShowListSearch,
} from "@/lib/list-pagination"
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
  dockHidden = false,
  onAddItem,
  onAddProduct = onAddItem,
  onAddService = onAddItem,
  onComplete,
  onScroll,
  presentation = "modal",
}: CatalogItemsContentProps) {
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
  const scrollHide = useBottomSearchScroll()
  const scrollToTop = useScrollToTop()
  const deferredQuery = useDeferredValue(query)
  const addSheet = useModal()
  const pendingAdd = useRef<"product" | "service" | null>(null)
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
  // Server search results arrive ranked best first; keep that order.
  const rankedOnline = !isOffline && Boolean(deferredQuery.trim())
  const loadedRows = useMemo(() => {
    const rows = (
      visibleQuery.data?.pages.flatMap((page) => page.items) ?? []
    ).map((item) => mapCatalogItem(item, availabilityQuery.data?.storeId))
    return rankedOnline ? rows : sortCatalogRows(rows)
  }, [availabilityQuery.data?.storeId, visibleQuery.data?.pages, rankedOnline])
  const rows = filterCatalogShelf(loadedRows, {
    query: isOffline ? deferredQuery : "",
    kind: isOffline ? kindFilter : "all",
    attention,
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
  // Search stays put when a type filter narrows the list.
  const showSearch =
    shouldShowListSearch(Math.max(totalCount, counts?.all ?? 0)) ||
    query.length > 0
  const revealRows = useFirstReveal(rows.length > 0)
  const showFirstItemGate = shouldShowCatalogFirstItemGate({
    hasCatalogItems: availabilityQuery.data?.hasCatalogItems,
    isError: visibleQuery.isError || isOffline || !canEdit,
    isPending: visibleQuery.isPending,
    presentation,
    rowCount: rows.length,
  })
  const showBottomSearch =
    !showFirstItemGate && presentation === "modal" && showSearch
  const bottomSpace = showBottomSearch
    ? footerHeight + 24
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
    scrollHide.onScroll(event)
    scrollToTop.onScroll(event)
    const canvas =
      mastheadHeight > 0 &&
      Math.max(0, event.nativeEvent.contentOffset.y) >=
        mastheadHeight - (presentation === "tab" ? insets.top : 0)
    setShowCanvasStatusBar((current) => (current === canvas ? current : canvas))
  }
  return (
    <ClassicCatalogFrame
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
        onContentSizeChange={scrollToTop.onContentSizeChange}
        onScroll={handleScroll}
        ref={scrollToTop.ref}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View className="gap-4 pb-4">
            <ClassicCatalogMasthead
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
              {availabilityQuery.data?.hasCatalogItems && mixedCatalog ? (
                <View className="flex-row rounded-[13px] border border-border bg-muted p-[3px]">
                  <ClassicCatalogFilter
                    active={kindFilter === "all"}
                    count={counts?.all}
                    label="All"
                    onPress={() => setKindFilter("all")}
                  />
                  {availabilityQuery.data.hasProductItems ? (
                    <ClassicCatalogFilter
                      active={kindFilter === "product"}
                      count={counts?.product}
                      label="Products"
                      onPress={() => setKindFilter("product")}
                    />
                  ) : null}
                  {availabilityQuery.data.hasServiceItems ? (
                    <ClassicCatalogFilter
                      active={kindFilter === "service"}
                      count={counts?.service}
                      label="Services"
                      onPress={() => setKindFilter("service")}
                    />
                  ) : null}
                </View>
              ) : null}
              {!canEdit ? (
                <Text className="text-xs text-muted-foreground">
                  View only · Ask an owner to add or edit items.
                </Text>
              ) : null}
              {attention || loadedRows.some((row) => row.problem) ? (
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
          visibleQuery.isPending && !isOffline ? (
            <CatalogShelfSkeleton />
          ) : showFirstItemGate ? (
            <ClassicCatalogFirstItemGate
              disabled={isOffline || !canEdit}
              onAddProduct={() => {
                if (!isOffline && canEdit) onAddProduct()
              }}
              onAddService={() => {
                if (!isOffline && canEdit) onAddService()
              }}
            />
          ) : !visibleQuery.isError && visibleQuery.isPending && !isOffline ? (
            <View className="px-4">
              <ListSkeleton
                count={7}
                label="Loading catalog items"
                variant="item"
              />
            </View>
          ) : !visibleQuery.isError ? (
            <EmptyState
              className="m-4 flex-1 justify-center"
              icon="Warehouse"
              title={
                isOffline
                  ? loadedRows.length
                    ? "No matching saved items"
                    : "No cached items"
                  : query || attention || kindFilter !== "all"
                    ? "No matching items"
                    : "No catalog items"
              }
              message={
                isOffline
                  ? loadedRows.length
                    ? "Try another search or filter."
                    : "Reconnect to load your Catalog."
                  : query || attention || kindFilter !== "all"
                    ? "Try another search or item type."
                    : "Add a Product or Service to start your Catalog."
              }
            />
          ) : null
        }
        ListFooterComponent={
          <View className="gap-3 px-4 pt-4 pb-8">
            {attention && itemsQuery.hasNextPage && !isOffline ? (
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
              <ActionButton onPress={onComplete} variant="outline">
                Done
              </ActionButton>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => (
          <RevealItem active={revealRows} index={index}>
            <ClassicCatalogRow
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
          </RevealItem>
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
          alwaysShowSearch={query.length > 0}
          hidden={scrollHide.hidden}
          onHeightChange={setFooterHeight}
          maxLength={160}
          onChangeText={setQuery}
          placeholder="Find item, type, or unit"
          totalCount={totalCount}
          value={query}
        />
      ) : null}
      {presentation === "tab" && showSearch && !showFirstItemGate ? (
        <TabSearchBubble
          accessibilityLabel="Search catalog"
          dockHidden={dockHidden}
          onChangeText={setQuery}
          placeholder={
            isOffline ? "Search saved items" : "Search name, type or unit"
          }
          testID="catalog-search-button"
          value={query}
        />
      ) : null}
      {/* Only the Products tab is a main screen; full-screen Catalog is not. */}
      {presentation === "tab" ? (
        <ScrollToTopButton
          dockHidden={dockHidden}
          hidden={query.length > 0 || showFirstItemGate}
          onPress={scrollToTop.scrollToTop}
          testID="catalog-scroll-to-top"
          visible={scrollToTop.visible}
        />
      ) : null}
      {/* The tab bar's + already adds items, so only full-screen Catalog
          (no tab bar) shows the Add button. */}
      {presentation === "modal" && canEdit && !showFirstItemGate ? (
        <ListCreateFab
          tone="gold"
          accessibilityLabel="Add catalog item"
          bottomOffset={
            showBottomSearch && !(scrollHide.hidden && !query)
              ? getListCreateFabFooterOffset({
                  bottomInset: insets.bottom,
                  footerHeight,
                })
              : 0
          }
          disabled={isOffline || !canEdit}
          onPress={openAdd}
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
            <Text className="text-[13px] text-muted-foreground">
              What are you adding?
            </Text>
            <ClassicCatalogChoices
              disabled={isOffline || !canEdit}
              onAddProduct={() => chooseAdd("product")}
              onAddService={() => chooseAdd("service")}
            />
            {isOffline ? (
              <Text className="text-xs text-muted-foreground">
                Reconnect to add an item.
              </Text>
            ) : null}
          </View>
        </BottomSheetScrollView>
      </Modal>
    </ClassicCatalogFrame>
  )
}
