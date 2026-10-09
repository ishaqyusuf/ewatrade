import {
  ClassicSearchActionRow,
  ClassicSearchFrame,
  ClassicSearchHeader,
  ClassicSearchRow,
  ClassicSearchSection,
} from "@/components/mobile/appearances/classic/global-search-screen"
import {
  MarketDaySearchActionRow,
  MarketDaySearchFrame,
  MarketDaySearchHeader,
  MarketDaySearchRow,
  MarketDaySearchSection,
} from "@/components/mobile/appearances/market-day/global-search-screen"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { EmptyState } from "@/components/mobile/empty-state"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useBottomSearchScroll } from "@/hooks/use-bottom-search-scroll"
import { useDebounce } from "@/hooks/use-debounce"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import { canManageMobileOperations, isSalesRepRole } from "@/lib/mobile-roles"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { useEffect, useMemo, useState } from "react"
import { Keyboard } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { CommerceFilterChip } from "../commerce"
import { QuickActionRow } from "../green-till/kit"
import { availableSearchActions } from "./search-display"
import {
  SEARCH_GROUP_ORDER,
  type SearchAction,
  type SearchResult,
  resultGroupLabel,
} from "./search-presentation"

export function GlobalSearchScreen() {
  const router = useRouter()
  const appearance = useMobileDesign("global-search")
  const market = appearance === "market-day"
  const Frame = market ? MarketDaySearchFrame : ClassicSearchFrame
  const Header = market ? MarketDaySearchHeader : ClassicSearchHeader
  const Section = market ? MarketDaySearchSection : ClassicSearchSection
  const ResultRow = market ? MarketDaySearchRow : ClassicSearchRow
  const ActionRow = market ? MarketDaySearchActionRow : ClassicSearchActionRow
  const insets = useSafeAreaInsets()
  const [footerHeight, setFooterHeight] = useState(100)
  const [headerHeight, setHeaderHeight] = useState(0)
  const [showCanvasStatusBar, setShowCanvasStatusBar] = useState(false)
  const scrollHide = useBottomSearchScroll()
  // biome-ignore lint/correctness/useExhaustiveDependencies: appearance changes invalidate measured header geometry
  useEffect(() => {
    setHeaderHeight(0)
    setShowCanvasStatusBar(false)
  }, [market])
  const trpc = useTRPC()
  const { profile } = useAuthContext()
  const isOffline = useOperationalModeStore((state) => state.isOfflineMode)
  const [query, setQuery] = useState("")
  const [resultType, setResultType] = useState<SearchResult["type"] | "all">(
    "all",
  )
  const normalizedQuery = query.trim()
  const debouncedQuery = useDebounce(normalizedQuery, 180)
  const canSearch = !isOffline && normalizedQuery.length >= 2
  const querySettled = debouncedQuery === normalizedQuery
  useEffect(() => {
    if (isOffline) setResultType("all")
  }, [isOffline])
  const canManage = canManageMobileOperations(profile?.role)
  const isSalesRep = isSalesRepRole(profile?.role)
  const search = useQuery(
    trpc.search.global.queryOptions(
      { limit: 6, query: debouncedQuery },
      {
        enabled: !isOffline && debouncedQuery.length >= 2,
        placeholderData: (previous) => previous,
        retry: false,
      },
    ),
  )
  const actions = useMemo<SearchAction[]>(
    () => [
      {
        detail: "Start an order and select sellable items.",
        icon: "PlusCircle",
        id: "create-order",
        label: "Create order",
        onPress: () => router.push("/create-sale-modal"),
      },
      ...(canManage && !isOffline
        ? [
            {
              detail: "Add a stock-tracked catalog item.",
              icon: "Warehouse" as const,
              id: "create-product",
              label: "Create product",
              onPress: () =>
                router.push("/first-product-setup-modal?kind=product"),
            },
            {
              detail: "Add work that the business can sell.",
              icon: "Wrench" as const,
              id: "create-service",
              label: "Create service",
              onPress: () =>
                router.push("/first-product-setup-modal?kind=service"),
            },
          ]
        : []),
      {
        detail: "Save a customer before their next order.",
        icon: "UserPlus",
        id: "create-customer",
        label: "Create customer",
        onPress: () =>
          router.push({
            params: { create: "true" },
            pathname: "/customer-book-modal",
          }),
      },
      ...(canManage
        ? [
            {
              detail: "Invite a team member to this workspace.",
              icon: "Users" as const,
              id: "invite-staff",
              label: "Invite staff",
              onPress: () => router.push("/staff-invite-modal"),
            },
            {
              detail: "See every payment, order, and receiver.",
              icon: "CreditCard" as const,
              id: "payments-received",
              label: "Payments received",
              onPress: () => router.push("/payments-received-modal"),
            },
          ]
        : []),
    ],
    [canManage, isOffline, router],
  )
  const filteredActions = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const available = availableSearchActions(actions, isOffline)
    if (!normalized) return available
    return available.filter((action) =>
      `${action.label} ${action.detail}`.toLowerCase().includes(normalized),
    )
  }, [actions, query, isOffline])
  const groupedResults = useMemo(
    () =>
      SEARCH_GROUP_ORDER.flatMap((type) => {
        const items = (
          canSearch && querySettled && !search.isPlaceholderData
            ? (search.data ?? [])
            : []
        ).filter((item) => item.type === type)
        return items.length ? [{ items, type }] : []
      }),
    [canSearch, querySettled, search.data, search.isPlaceholderData],
  )

  function openResult(item: SearchResult) {
    if (!canSearch || !querySettled || search.isPlaceholderData) return
    Keyboard.dismiss()
    if (item.type === "order") {
      router.push(`/order/${encodeURIComponent(item.orderId)}`)
      return
    }
    if (item.type === "customer") {
      router.push({
        params: {
          customerId: item.customerId ?? undefined,
          customerName: item.customerName,
          customerOrderId: item.orderId ?? undefined,
        },
        pathname: "/customer-book-modal",
      })
      return
    }
    if (item.type === "catalog_item") {
      if (isSalesRep) {
        router.push({
          params: { catalogItemId: item.catalogItemId },
          pathname: "/create-sale-modal",
        })
      } else {
        router.push({
          params: { catalogItemId: item.catalogItemId },
          pathname: "/catalog-item/[catalogItemId]",
        })
      }
      return
    }
    if (item.type === "service_job") {
      router.push(`/order/${encodeURIComponent(item.orderId)}`)
      return
    }
    router.push("/staff-invite-modal")
  }

  const noMatches =
    canSearch &&
    querySettled &&
    search.isSuccess &&
    !search.isPlaceholderData &&
    !search.isFetching &&
    !search.isError &&
    groupedResults.length === 0

  const searching = canSearch && (!querySettled || search.isFetching)
  return (
    <View
      className={market ? "flex-1 bg-market-canvas" : "flex-1 bg-background"}
    >
      <Frame
        footerHeight={footerHeight}
        showCanvasStatusBar={showCanvasStatusBar}
        onScroll={(event) => {
          const next =
            headerHeight > 0 &&
            Math.max(0, event.nativeEvent.contentOffset.y) >=
              headerHeight - insets.top
          setShowCanvasStatusBar((current) =>
            current === next ? current : next,
          )
          scrollHide.onScroll(event)
        }}
      >
        <Header
          onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
          onClose={() => {
            Keyboard.dismiss()
            if (router.canGoBack()) router.back()
            else router.replace("/dashboard")
          }}
        />
        {isOffline ? (
          <StatusBanner
            icon="Wind"
            message="Global search and Product or Service creation are unavailable until you reconnect."
            title="Search unavailable offline"
            tone="warning"
          />
        ) : null}
        {search.isError && canSearch && querySettled ? (
          <StatusBanner
            actionLabel="Try again"
            icon="AlertCircle"
            message={search.error.message}
            onActionPress={() => {
              if (canSearch && querySettled) void search.refetch()
            }}
            tone="destructive"
          />
        ) : null}
        {!market && filteredActions.length > 0 && !normalizedQuery ? (
          <View>
            <QuickActionRow
              actions={filteredActions
                .slice(0, 3)
                .map((a) => ({ ...a, gold: a.id === "create-order" }))}
            />
            <QuickActionRow
              actions={filteredActions
                .slice(3)
                .map((a) => ({ ...a, gold: false }))}
            />
          </View>
        ) : filteredActions.length > 0 ? (
          <Section title="Quick actions">
            {filteredActions.map((action) => (
              <ActionRow
                key={action.id}
                action={{
                  ...action,
                  onPress: () => {
                    Keyboard.dismiss()
                    action.onPress()
                  },
                }}
              />
            ))}
          </Section>
        ) : null}
        {!market && searching ? (
          <View className="gap-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </View>
        ) : searching ? (
          <Text
            accessibilityLiveRegion="polite"
            className={
              market
                ? "py-2 text-sm font-semibold text-market-muted-ink"
                : "py-2 text-sm font-semibold text-muted-foreground"
            }
          >
            Searching workspace…
          </Text>
        ) : null}
        {!isOffline && normalizedQuery.length < 2 ? (
          <Text
            className={
              market
                ? "text-sm text-market-muted-ink"
                : "text-sm text-muted-foreground"
            }
          >
            Type at least two characters to find workspace records.
          </Text>
        ) : null}
        {!market && groupedResults.length ? (
          <View className="gap-2">
            <Text className="text-xs text-muted-foreground">
              Top 6 matches · filters apply to these results
            </Text>
            <View className="flex-row flex-wrap gap-2">
              <CommerceFilterChip
                active={resultType === "all"}
                label="All"
                onPress={() => setResultType("all")}
              />
              {groupedResults.map((group) => (
                <CommerceFilterChip
                  key={group.type}
                  active={resultType === group.type}
                  label={resultGroupLabel(group.type)}
                  onPress={() => setResultType(group.type)}
                />
              ))}
            </View>
          </View>
        ) : null}
        {groupedResults
          .filter(
            (group) =>
              market || resultType === "all" || group.type === resultType,
          )
          .map((group) => (
            <Section key={group.type} title={resultGroupLabel(group.type)}>
              {group.items.map((item) =>
                !market ? (
                  <ClassicSearchRow
                    key={item.id}
                    item={item}
                    query={normalizedQuery}
                    sell={isSalesRep && item.type === "catalog_item"}
                    onPress={() => openResult(item)}
                  />
                ) : (
                  <ResultRow
                    item={item}
                    key={item.id}
                    onPress={() => openResult(item)}
                  />
                ),
              )}
            </Section>
          ))}
        {noMatches ? (
          <EmptyState
            icon="Search"
            message="Try an order number, customer contact, product, service, or team member."
            title="No results"
          />
        ) : null}
      </Frame>
      <BottomSearchFooter
        accessibilityLabel="Search the workspace"
        alwaysShowSearch
        autoFocus
        hidden={scrollHide.hidden}
        maxLength={160}
        onHeightChange={setFooterHeight}
        onChangeText={(value) => {
          setQuery(value)
          setResultType("all")
        }}
        showDisabledOfflineSearch={!market}
        placeholder={isOffline ? "Reconnect to search" : "Search anything..."}
        totalCount={search.data?.length ?? 0}
        value={query}
        variant={market ? "market-day" : "default"}
      />
    </View>
  )
}
