import {
  ClassicSearchActionChips,
  ClassicSearchActionRow,
  ClassicSearchFrame,
  ClassicSearchHeader,
  ClassicSearchHint,
  ClassicSearchNoResults,
  ClassicSearchOffline,
  ClassicSearchResults,
  ClassicSearchRow,
  ClassicSearchScopes,
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
import { AssistantEntry } from "../assistant/assistant-entry"
import { QuickActionRow } from "../green-till/kit"
import { availableSearchActions } from "./search-display"
import {
  SEARCH_GROUP_ORDER,
  type SearchAction,
  type SearchResult,
  resultGroupLabel,
  resultScopeLabel,
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
  const actions = useMemo<(SearchAction & { short: string })[]>(
    () => [
      {
        detail: "Start an order and select sellable items.",
        icon: "PlusCircle",
        id: "create-order",
        label: "Create order",
        short: "New order",
        onPress: () => router.push("/create-sale-modal"),
      },
      ...(canManage
        ? [
            {
              detail: "Add a stock-tracked catalog item.",
              icon: "Warehouse" as const,
              id: "create-product",
              label: "Create product",
              short: "Product",
              onPress: () =>
                router.push("/first-product-setup-modal?kind=product"),
            },
            {
              detail: "Add work that the business can sell.",
              icon: "Wrench" as const,
              id: "create-service",
              label: "Create service",
              short: "Service",
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
        short: "Customer",
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
              short: "Invite staff",
              onPress: () => router.push("/staff-invite-modal"),
            },
            {
              detail: "See every payment, order, and receiver.",
              icon: "CreditCard" as const,
              id: "payments-received",
              label: "Payments received",
              short: "Payments",
              onPress: () => router.push("/payments-received-modal"),
            },
          ]
        : []),
    ],
    [canManage, router],
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

  function closeSearch() {
    Keyboard.dismiss()
    if (router.canGoBack()) router.back()
    else router.replace("/dashboard")
  }
  // Classic keeps every tile; the ones that need a connection dim offline.
  const classicActions = actions
    .filter((action) =>
      normalizedQuery
        ? `${action.label} ${action.detail}`
            .toLowerCase()
            .includes(normalizedQuery.toLowerCase())
        : true,
    )
    .map((action) => ({
      disabled: isOffline && action.id !== "create-order",
      gold: action.id === "create-order",
      icon: action.icon,
      id: action.id,
      label: action.short,
      onPress: () => {
        Keyboard.dismiss()
        action.onPress()
      },
    }))

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
        {market ? (
          <>
            <Header
              onLayout={(event) =>
                setHeaderHeight(event.nativeEvent.layout.height)
              }
              onClose={closeSearch}
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
            {filteredActions.length > 0 ? (
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
            {searching ? (
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
            {groupedResults.map((group) => (
              <Section key={group.type} title={resultGroupLabel(group.type)}>
                {group.items.map((item) => (
                  <ResultRow
                    item={item}
                    key={item.id}
                    onPress={() => openResult(item)}
                  />
                ))}
              </Section>
            ))}
            {noMatches ? (
              <EmptyState
                icon="Search"
                message="Try an order number, customer contact, product, service, or team member."
                title="No results"
              />
            ) : null}
            {normalizedQuery.length >= 2 ? (
              <AssistantEntry query={normalizedQuery} />
            ) : null}
          </>
        ) : (
          <>
            <ClassicSearchHeader
              salesRep={isSalesRep}
              onLayout={(event) =>
                setHeaderHeight(event.nativeEvent.layout.height)
              }
              onClose={closeSearch}
            />
            {isOffline ? <ClassicSearchOffline /> : null}
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
            {isOffline || normalizedQuery.length < 2 ? (
              <>
                <View>
                  <Text
                    accessibilityRole="header"
                    className="text-base font-extrabold tracking-tight text-foreground"
                  >
                    Quick actions
                  </Text>
                  {[classicActions.slice(0, 3), classicActions.slice(3)].map(
                    (row) =>
                      row.length ? (
                        <QuickActionRow key={row[0].id} actions={row} />
                      ) : null,
                  )}
                </View>
                <ClassicSearchHint icon={isOffline ? "Lock" : "Search"}>
                  {isOffline
                    ? "Other actions need a connection."
                    : `Type 2 or more letters to search orders, customers, items${isSalesRep ? " and service work" : ", service work and staff"}.`}
                </ClassicSearchHint>
              </>
            ) : (
              <>
                {searching && !groupedResults.length ? (
                  <View accessibilityLabel="Searching" className="gap-3">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </View>
                ) : null}
                {groupedResults.length > 1 ? (
                  <ClassicSearchScopes
                    active={resultType}
                    groups={groupedResults.map((group) => ({
                      count: group.items.length,
                      label: resultScopeLabel(group.type),
                      type: group.type,
                    }))}
                    onChange={setResultType}
                  />
                ) : null}
                {groupedResults
                  .filter(
                    (group) =>
                      resultType === "all" || group.type === resultType,
                  )
                  .map((group) => (
                    <ClassicSearchSection
                      key={group.type}
                      count={group.items.length}
                      title={resultGroupLabel(group.type)}
                    >
                      <ClassicSearchResults>
                        {group.items.map((item) => (
                          <ClassicSearchRow
                            key={item.id}
                            item={item}
                            query={normalizedQuery}
                            sell={isSalesRep && item.type === "catalog_item"}
                            onPress={() => openResult(item)}
                          />
                        ))}
                      </ClassicSearchResults>
                    </ClassicSearchSection>
                  ))}
                {filteredActions.length ? (
                  <ClassicSearchSection title="Actions">
                    <ClassicSearchActionChips
                      actions={filteredActions.map((action) => ({
                        ...action,
                        gold: action.id === "create-order",
                        onPress: () => {
                          Keyboard.dismiss()
                          action.onPress()
                        },
                      }))}
                    />
                  </ClassicSearchSection>
                ) : null}
                {noMatches && !filteredActions.length ? (
                  <ClassicSearchNoResults
                    query={normalizedQuery}
                    salesRep={isSalesRep}
                    onNewOrder={() => {
                      Keyboard.dismiss()
                      router.push("/create-sale-modal")
                    }}
                    onAddCustomer={() => {
                      Keyboard.dismiss()
                      router.push({
                        params: { create: "true" },
                        pathname: "/customer-book-modal",
                      })
                    }}
                  />
                ) : noMatches ? (
                  <ClassicSearchHint icon="Search">
                    No records match. Showing actions only.
                  </ClassicSearchHint>
                ) : null}
                {groupedResults.some((group) => group.items.length >= 6) ? (
                  <Text className="text-center text-xs text-muted-foreground">
                    Showing the top 6 of each type. Keep typing to narrow.
                  </Text>
                ) : null}
                <AssistantEntry query={normalizedQuery} />
              </>
            )}
          </>
        )}
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
        placeholder={
          market
            ? isOffline
              ? "Reconnect to search"
              : "Search anything..."
            : isOffline
              ? "Search needs a connection"
              : "Search anything"
        }
        totalCount={search.data?.length ?? 0}
        value={query}
        variant={market ? "market-day" : "default"}
      />
    </View>
  )
}
