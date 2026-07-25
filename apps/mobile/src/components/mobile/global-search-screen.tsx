import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { EmptyState } from "@/components/mobile/empty-state"
import { MobileScreen } from "@/components/mobile/screen"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useDebounce } from "@/hooks/use-debounce"
import { canManageMobileOperations, isSalesRepRole } from "@/lib/mobile-roles"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { useMemo, useState } from "react"

type SearchResult = RouterOutputs["search"]["global"][number]

type SearchAction = {
  detail: string
  icon: IconKeys
  id: string
  label: string
  onPress: () => void
}

const GROUP_ORDER: SearchResult["type"][] = [
  "order",
  "customer",
  "catalog_item",
  "service_job",
  "staff",
]

function resultGroupLabel(type: SearchResult["type"]) {
  if (type === "catalog_item") return "Products & services"
  if (type === "service_job") return "Service work"
  return `${type.charAt(0).toUpperCase()}${type.slice(1)}s`
}

function resultAppearance(type: SearchResult["type"]): {
  avatarClassName: string
  icon: IconKeys
} {
  if (type === "order") {
    return { avatarClassName: "bg-primary", icon: "ReceiptText" }
  }
  if (type === "customer") {
    return { avatarClassName: "bg-secondary", icon: "User" }
  }
  if (type === "service_job") {
    return { avatarClassName: "bg-accent", icon: "Wrench" }
  }
  if (type === "staff") {
    return { avatarClassName: "bg-muted", icon: "Users" }
  }
  return { avatarClassName: "bg-muted", icon: "Warehouse" }
}

function SearchRow({
  item,
  onPress,
}: {
  item: SearchResult
  onPress: () => void
}) {
  const appearance = resultAppearance(item.type)

  return (
    <Pressable
      accessibilityLabel={`Open ${item.title}`}
      accessibilityRole="button"
      className="min-h-16 flex-row items-center gap-3 border-b border-border py-3 active:bg-accent"
      haptic
      onPress={onPress}
      transition
    >
      <View
        className={`size-11 items-center justify-center rounded-full ${appearance.avatarClassName}`}
      >
        <Icon className="size-sm text-foreground" name={appearance.icon} />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-extrabold text-foreground" numberOfLines={1}>
          {item.title}
        </Text>
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
          {item.subtitle}
        </Text>
      </View>
      <Icon className="size-sm text-muted-foreground" name="ChevronRight" />
    </Pressable>
  )
}

function ActionRow({ action }: { action: SearchAction }) {
  return (
    <Pressable
      accessibilityHint={action.detail}
      accessibilityLabel={action.label}
      accessibilityRole="button"
      className="min-h-16 flex-row items-center gap-3 border-b border-border py-3 active:bg-accent"
      haptic
      onPress={action.onPress}
      transition
    >
      <View className="size-11 items-center justify-center rounded-full bg-muted">
        <Icon className="size-sm text-primary" name={action.icon} />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-extrabold text-foreground">{action.label}</Text>
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
          {action.detail}
        </Text>
      </View>
      <Icon className="size-sm text-muted-foreground" name="ChevronRight" />
    </Pressable>
  )
}

export function GlobalSearchScreen() {
  const router = useRouter()
  const trpc = useTRPC()
  const { profile } = useAuthContext()
  const isOffline = useOperationalModeStore((state) => state.isOfflineMode)
  const [query, setQuery] = useState("")
  const debouncedQuery = useDebounce(query.trim(), 180)
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
      ...(canManage
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
              onPress: () => router.push("/payments-received-modal" as never),
            },
          ]
        : []),
    ],
    [canManage, router],
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
      GROUP_ORDER.flatMap((type) => {
        const items = (search.data ?? []).filter((item) => item.type === type)
        return items.length ? [{ items, type }] : []
      }),
    [search.data],
  )

  function openResult(item: SearchResult) {
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
          pathname: "/catalog",
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
    debouncedQuery.length >= 2 &&
    !search.isFetching &&
    !search.isError &&
    groupedResults.length === 0 &&
    filteredActions.length === 0

  return (
    <View className="flex-1 bg-background">
      <MobileScreen
        contentClassName="gap-6 pb-40"
        contentContainerStyle={{ paddingBottom: 156 }}
        keyboardBottomOffset={128}
        scroll
      >
        <View className="flex-row items-center gap-3">
          <Pressable
            accessibilityLabel="Close global search"
            accessibilityRole="button"
            className="size-11 items-center justify-center rounded-full bg-card active:bg-accent"
            haptic
            onPress={() => router.back()}
          >
            <Icon className="size-base text-foreground" name="ArrowLeft" />
          </Pressable>
          <View className="min-w-0 flex-1">
            <Text className="text-3xl font-extrabold tracking-tight text-foreground">
              Search
            </Text>
            <Text className="text-sm text-muted-foreground">
              Orders, customers, catalog, services, and staff
            </Text>
          </View>
        </View>

        {isOffline ? (
          <StatusBanner
            icon="Wind"
            message="Global search needs a connection. Creation shortcuts remain available."
            title="Search unavailable offline"
            tone="warning"
          />
        ) : null}
        {search.isError ? (
          <StatusBanner
            actionLabel="Try again"
            icon="AlertCircle"
            message={search.error.message}
            onActionPress={() => void search.refetch()}
            tone="destructive"
          />
        ) : null}

        {filteredActions.length > 0 ? (
          <View className="gap-2">
            <Text className="text-lg font-extrabold text-foreground">
              Quick actions
            </Text>
            <View className="border-y border-border">
              {filteredActions.map((action) => (
                <ActionRow action={action} key={action.id} />
              ))}
            </View>
          </View>
        ) : null}

        {search.isFetching ? (
          <Text className="py-2 text-sm font-semibold text-muted-foreground">
            Searching workspace…
          </Text>
        ) : null}

        {groupedResults.map((group) => (
          <View className="gap-2" key={group.type}>
            <Text className="text-lg font-extrabold text-foreground">
              {resultGroupLabel(group.type)}
            </Text>
            <View className="border-y border-border">
              {group.items.map((item) => (
                <SearchRow
                  item={item}
                  key={item.id}
                  onPress={() => openResult(item)}
                />
              ))}
            </View>
          </View>
        ))}

        {noMatches ? (
          <EmptyState
            icon="Search"
            message="Try an order number, customer contact, product, service, or team member."
            title="No results"
          />
        ) : null}
      </MobileScreen>

      <BottomSearchFooter
        accessibilityLabel="Search the workspace"
        alwaysShowSearch
        autoFocus
        onChangeText={setQuery}
        placeholder="Search anything..."
        totalCount={search.data?.length ?? 0}
        value={query}
      />
    </View>
  )
}
