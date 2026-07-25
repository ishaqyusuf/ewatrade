import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import {
  CommerceCustomerRow,
  CommerceFilterChip,
  CustomerOverviewContent,
  buildCommerceCustomers,
  commercialOrderHref,
  findCustomerByOrderId,
} from "@/components/mobile/commerce"
import {
  CreateSaleCustomerSheet,
  type SaleCustomerDraft,
} from "@/components/mobile/create-sale-customer-sheet"
import { EmptyState } from "@/components/mobile/empty-state"
import { ListCreateFab } from "@/components/mobile/list-create-fab"
import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import { StatusBanner } from "@/components/mobile/status-banner"
import { useModal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import {
  LIST_PAGE_SIZE,
  shouldFetchNextListPage,
  shouldShowListSearch,
} from "@/lib/list-pagination"
import {
  activeBusinessOfflineCommands,
  useOfflineCommandStore,
} from "@/store/offlineCommandStore"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { FlatList } from "react-native"

type CustomerFilter = "all" | "pending" | "synced"

export function activeCustomerFilterLabel(filter: CustomerFilter) {
  if (filter === "pending") return "Pending sync"
  if (filter === "synced") return "Synced"
  return "All"
}

export function CustomerBookContent({
  createOnOpen = false,
  initialCustomerId,
  initialCustomerName,
  initialOrderId,
}: {
  createOnOpen?: boolean
  initialCustomerId?: string
  initialCustomerName?: string
  initialOrderId?: string
}) {
  const router = useRouter()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const createCustomerModal = useModal()
  const { profile } = useAuthContext()
  const isOffline = useOperationalModeStore((state) => state.isOfflineMode)
  const allCommands = useOfflineCommandStore((state) => state.commands)
  const [filter, setFilter] = useState<CustomerFilter>("all")
  const [customerDraft, setCustomerDraft] = useState<SaleCustomerDraft>({
    email: "",
    name: "",
    phone: "",
  })
  const [customerDraftError, setCustomerDraftError] = useState<string | null>(
    null,
  )
  const [search, setSearch] = useState(initialCustomerName ?? "")
  const deferredSearch = useDeferredValue(search)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null,
  )
  const createOnOpenApplied = useRef(false)
  const initialSelectionApplied = useRef(false)
  const orders = useInfiniteQuery(
    trpc.orders.listPage.infiniteQueryOptions(
      {
        limit: LIST_PAGE_SIZE,
        query: isOffline ? undefined : deferredSearch || undefined,
        queryMode: "customer",
      },
      {
        enabled: !isOffline,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        retry: false,
      },
    ),
  )
  const directory = useInfiniteQuery(
    trpc.customers.listPage.infiniteQueryOptions(
      {
        limit: LIST_PAGE_SIZE,
        query: isOffline ? undefined : deferredSearch || undefined,
      },
      {
        enabled: !isOffline,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        retry: false,
      },
    ),
  )
  const customerCount = useQuery(
    trpc.orders.customerCount.queryOptions(undefined, {
      enabled: !isOffline,
      retry: false,
    }),
  )
  const directoryCount = useQuery(
    trpc.customers.count.queryOptions(undefined, {
      enabled: !isOffline,
      retry: false,
    }),
  )
  const createCustomer = useMutation(
    trpc.customers.create.mutationOptions({
      onError: (error) => setCustomerDraftError(error.message),
      onSuccess: async () => {
        setCustomerDraft({ email: "", name: "", phone: "" })
        setCustomerDraftError(null)
        createCustomerModal.dismiss()
        await Promise.all([
          queryClient.invalidateQueries(trpc.customers.count.queryFilter()),
          queryClient.invalidateQueries(trpc.customers.listPage.queryFilter()),
          queryClient.invalidateQueries(
            trpc.tenant.featureAvailability.queryFilter(),
          ),
        ])
      },
    }),
  )
  const initialOrder = useQuery(
    trpc.orders.get.queryOptions(
      { orderId: initialOrderId ?? "" },
      { enabled: !isOffline && Boolean(initialOrderId), retry: false },
    ),
  )
  const pendingOrders = useMemo(
    () =>
      activeBusinessOfflineCommands(allCommands, profile?.businessId).flatMap(
        (command) =>
          (command.localStatus === "pending" ||
            command.localStatus === "approval") &&
          command.payload.kind === "commercial_order" &&
          (command.payload.customerName ||
            command.payload.customerPhone ||
            command.payload.customerEmail)
            ? [
                {
                  clientCommandId: command.clientCommandId,
                  createdAtClient: new Date(
                    command.createdAtClient as unknown as string | Date,
                  ),
                  customerEmail: command.payload.customerEmail,
                  customerName: command.payload.customerName,
                  customerPhone: command.payload.customerPhone,
                  lineCount: command.payload.lines.length,
                },
              ]
            : [],
      ),
    [allCommands, profile?.businessId],
  )
  const loadedOrders = useMemo(() => {
    const pageOrders = orders.data?.pages.flatMap((page) => page.items) ?? []
    if (!initialOrder.data) return pageOrders
    return [
      initialOrder.data,
      ...pageOrders.filter((order) => order.id !== initialOrder.data.id),
    ]
  }, [initialOrder.data, orders.data?.pages])
  const directoryCustomers = useMemo(
    () => directory.data?.pages.flatMap((page) => page.items) ?? [],
    [directory.data?.pages],
  )
  const customers = useMemo(
    () =>
      buildCommerceCustomers(loadedOrders, pendingOrders, directoryCustomers),
    [directoryCustomers, loadedOrders, pendingOrders],
  )
  const pendingCustomerCount = useMemo(
    () => buildCommerceCustomers([], pendingOrders).length,
    [pendingOrders],
  )
  const showSearch = shouldShowListSearch(
    Math.max(
      (customerCount.data ?? 0) + (directoryCount.data ?? 0),
      customers.length,
    ) + pendingCustomerCount,
  )

  useEffect(() => {
    if (
      initialSelectionApplied.current ||
      (!initialOrderId && !initialCustomerId)
    ) {
      return
    }
    const customer =
      customers.find((candidate) => candidate.id === initialCustomerId) ??
      findCustomerByOrderId(customers, initialOrderId)
    if (!customer) return
    initialSelectionApplied.current = true
    setSelectedCustomerId(customer.id)
  }, [customers, initialCustomerId, initialOrderId])

  useEffect(() => {
    if (!createOnOpen || createOnOpenApplied.current) return
    createOnOpenApplied.current = true
    setCustomerDraftError(null)
    const timer = setTimeout(createCustomerModal.present, 120)
    return () => clearTimeout(timer)
  }, [createCustomerModal.present, createOnOpen])

  const selectedCustomer =
    customers.find((customer) => customer.id === selectedCustomerId) ?? null
  const historyComplete = isOffline || !orders.hasNextPage

  function saveCustomer() {
    const name = customerDraft.name.trim()
    const email = customerDraft.email.trim()
    const phone = customerDraft.phone.trim()

    if (isOffline) {
      setCustomerDraftError(
        "Reconnect to save a customer to the shared directory.",
      )
      return
    }
    if (!name) {
      setCustomerDraftError("Enter the customer name.")
      return
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setCustomerDraftError("Enter a valid email address.")
      return
    }

    setCustomerDraftError(null)
    createCustomer.mutate({
      email: email || undefined,
      name,
      phone: phone || undefined,
    })
  }

  useEffect(() => {
    if (
      !selectedCustomerId ||
      isOffline ||
      !shouldFetchNextListPage({
        hasNextPage: Boolean(orders.hasNextPage),
        isFetchingNextPage: orders.isFetchingNextPage,
      })
    ) {
      return
    }
    void orders.fetchNextPage()
  }, [
    isOffline,
    orders.fetchNextPage,
    orders.hasNextPage,
    orders.isFetchingNextPage,
    selectedCustomerId,
  ])

  const visibleCustomers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return customers.filter((customer) => {
      if (filter === "pending" && customer.pendingOrders.length === 0) {
        return false
      }
      if (filter === "synced" && customer.orders.length === 0) return false
      if (
        isOffline &&
        normalizedSearch &&
        !`${customer.name} ${customer.phone ?? ""} ${customer.email ?? ""}`
          .toLowerCase()
          .includes(normalizedSearch)
      ) {
        return false
      }
      return true
    })
  }, [customers, filter, isOffline, search])

  if (selectedCustomer) {
    return (
      <CustomerOverviewContent
        customer={selectedCustomer}
        historyComplete={historyComplete}
        onBack={() => setSelectedCustomerId(null)}
        onCreateOrder={() =>
          router.push({
            params: {
              customerEmail: selectedCustomer.email ?? undefined,
              customerId: selectedCustomer.id,
              customerName: selectedCustomer.name,
              customerPhone: selectedCustomer.phone ?? undefined,
            },
            pathname: "/create-sale-modal",
          })
        }
        onOpenOrder={(orderId) => router.push(commercialOrderHref(orderId))}
      />
    )
  }

  return (
    <View className="flex-1" testID="customer-book-screen">
      <FlatList
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: showSearch ? 112 : 24,
          paddingHorizontal: 16,
        }}
        data={visibleCustomers}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <EmptyState
            className="m-4 flex-1 justify-center"
            icon="Users"
            message={
              (orders.isPending || directory.isPending) && !isOffline
                ? "Loading customers."
                : search || filter !== "all"
                  ? "Try another search or customer state."
                  : "Add a customer now, then select them when you create an order."
            }
            title={
              (orders.isPending || directory.isPending) && !isOffline
                ? "Loading customers"
                : search || filter !== "all"
                  ? "No matching customers"
                  : "No customers"
            }
          />
        }
        ListHeaderComponent={
          <View className="gap-4 pb-3">
            <Text className="text-sm leading-5 text-muted-foreground">
              Saved customers and customer activity from Commercial Orders.
            </Text>
            {isOffline ? (
              <StatusBanner
                icon="Wind"
                message="Showing cached customers and device-only Orders pending sync."
                title="Offline mode"
                tone="warning"
              />
            ) : null}
            {orders.isError ? (
              <StatusBanner
                actionLabel="Try again"
                icon="AlertCircle"
                message={orders.error.message}
                onActionPress={() => void orders.refetch()}
                tone="destructive"
              />
            ) : null}
            {directory.isError ? (
              <StatusBanner
                actionLabel="Try again"
                icon="AlertCircle"
                message={directory.error.message}
                onActionPress={() => void directory.refetch()}
                tone="destructive"
              />
            ) : null}
            <View className="flex-row flex-wrap gap-2">
              {(["all", "synced", "pending"] as const).map((value) => (
                <CommerceFilterChip
                  active={filter === value}
                  key={value}
                  label={activeCustomerFilterLabel(value)}
                  onPress={() => setFilter(value)}
                />
              ))}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <CommerceCustomerRow
            customer={item}
            historyComplete={!orders.hasNextPage}
            onPress={() => setSelectedCustomerId(item.id)}
          />
        )}
        onEndReached={() => {
          if (
            filter !== "pending" &&
            shouldFetchNextListPage({
              hasNextPage: Boolean(orders.hasNextPage),
              isFetchingNextPage: orders.isFetchingNextPage,
            })
          ) {
            void orders.fetchNextPage()
          }
          if (
            filter !== "pending" &&
            shouldFetchNextListPage({
              hasNextPage: Boolean(directory.hasNextPage),
              isFetchingNextPage: directory.isFetchingNextPage,
            })
          ) {
            void directory.fetchNextPage()
          }
        }}
        onEndReachedThreshold={0.35}
        ListFooterComponent={
          orders.isFetchingNextPage || directory.isFetchingNextPage ? (
            <Text className="py-5 text-center text-xs font-semibold text-muted-foreground">
              Loading more customers…
            </Text>
          ) : null
        }
        refreshControl={<QueryRefreshControl />}
        showsVerticalScrollIndicator={false}
      />
      {showSearch ? (
        <BottomSearchFooter
          accessibilityLabel="Search customers"
          onChangeText={setSearch}
          placeholder="Search name, phone, or email"
          totalCount={
            Math.max(
              (customerCount.data ?? 0) + (directoryCount.data ?? 0),
              customers.length,
            ) + pendingCustomerCount
          }
          value={search}
        />
      ) : null}
      <ListCreateFab
        accessibilityLabel="Add customer"
        bottomOffset={showSearch ? 88 : 0}
        onPress={() => {
          setCustomerDraftError(null)
          createCustomerModal.present()
        }}
        testID="customer-add-fab"
      />
      <CreateSaleCustomerSheet
        disabled={isOffline}
        draft={customerDraft}
        error={customerDraftError}
        isLoading={createCustomer.isPending}
        onChange={setCustomerDraft}
        onSave={saveCustomer}
        ref={createCustomerModal.ref}
      />
    </View>
  )
}
