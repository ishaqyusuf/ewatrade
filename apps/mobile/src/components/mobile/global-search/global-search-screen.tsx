import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { EmptyState } from "@/components/mobile/empty-state"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
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
import {
  SEARCH_GROUP_ORDER,
  resultGroupLabel,
  type SearchAction,
  type SearchResult,
} from "./search-presentation"
import {
  ClassicSearchFrame,
  ClassicSearchHeader,
  ClassicSearchSection,
  ClassicSearchRow,
  ClassicSearchActionRow,
} from "@/components/mobile/appearances/classic/global-search-screen"
import {
  MarketDaySearchFrame,
  MarketDaySearchHeader,
  MarketDaySearchSection,
  MarketDaySearchRow,
  MarketDaySearchActionRow,
} from "@/components/mobile/appearances/market-day/global-search-screen"

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
  useEffect(() => {
    setHeaderHeight(0)
    setShowCanvasStatusBar(false)
  }, [market])
  const trpc = useTRPC()
  const { profile } = useAuthContext()
  const isOffline = useOperationalModeStore((state) => state.isOfflineMode)
  const [query, setQuery] = useState("")
  const normalizedQuery = query.trim()
  const debouncedQuery = useDebounce(normalizedQuery, 180)
  const canSearch = !isOffline && normalizedQuery.length >= 2
  const querySettled = debouncedQuery === normalizedQuery
  useEffect(() => {
    if (isOffline && query) setQuery("")
  }, [isOffline, query])
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
    if (!normalized) return actions
    return actions.filter((action) =>
      `${action.label} ${action.detail}`.toLowerCase().includes(normalized),
    )
  }, [actions, query])
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
    groupedResults.length === 0 &&
    filteredActions.length === 0

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
      </Frame>
      <BottomSearchFooter
        accessibilityLabel="Search the workspace"
        alwaysShowSearch
        autoFocus
        maxLength={160}
        onHeightChange={setFooterHeight}
        onChangeText={setQuery}
        placeholder="Search anything..."
        totalCount={search.data?.length ?? 0}
        value={query}
        variant={market ? "market-day" : "default"}
      />
    </View>
  )
}
