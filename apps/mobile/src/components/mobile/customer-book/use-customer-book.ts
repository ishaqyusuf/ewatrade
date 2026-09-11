import {
  buildCommerceCustomers,
  findCustomerByOrderId,
} from "@/components/mobile/commerce"
import {
  type CustomerBookFilter,
  getCustomerBookPresentation,
} from "@/components/mobile/customer-book-presentation-model"
import { useAuthContext } from "@/hooks/use-auth"
import { canManageMobileOperations, isSalesRepRole } from "@/lib/mobile-roles"
import { useCustomerCreate } from "./use-customer-create"
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
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
export type CustomerBookProps = {
  createOnOpen?: boolean
  initialCustomerId?: string
  initialCustomerName?: string
  initialOrderId?: string
}
export function useCustomerBook({
  createOnOpen = false,
  initialCustomerId,
  initialCustomerName,
  initialOrderId,
}: CustomerBookProps) {
  const router = useRouter()
  const trpc = useTRPC()
  const { profile } = useAuthContext()
  const isOffline = useOperationalModeStore((state) => state.isOfflineMode)
  const allCommands = useOfflineCommandStore((state) => state.commands)
  const [filter, setFilter] = useState<CustomerBookFilter>("all")
  const [search, setSearch] = useState(
    (initialCustomerName ?? "").slice(0, 160),
  )
  const deferredSearch = useDeferredValue(search)
  const [selection, setSelection] = useState<{
    id: string
    orderId?: string
    pendingId?: string
    directoryId?: string
  } | null>(null)
  const selectedCustomerId = selection?.id ?? null
  const createOnOpenApplied = useRef(false)
  const initialSelectionApplied = useRef(false)
  const [entryDismissed, setEntryDismissed] = useState(false)
  const scope =
    profile?.id && profile.businessId
      ? JSON.stringify([profile.id, profile.businessId])
      : null
  const creation = useCustomerCreate({
    scope,
    canOperate:
      canManageMobileOperations(profile?.role) || isSalesRepRole(profile?.role),
    isOffline,
    onCheckDirectory: (name) => {
      setSelection(null)
      setEntryDismissed(true)
      setFilter("all")
      setSearch(name)
    },
  })
  const lookupCustomerId =
    selection?.directoryId ?? (!entryDismissed ? initialCustomerId : undefined)
  const lookupOrderId = selection?.orderId ?? initialOrderId
  const orders = useInfiniteQuery(
    trpc.orders.listPage.infiniteQueryOptions(
      {
        limit: LIST_PAGE_SIZE,
        query: isOffline ? undefined : deferredSearch || undefined,
        queryMode: "customer",
      },
      {
        enabled: !creation.blocked && !isOffline,
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
        enabled: !creation.blocked && !isOffline,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        retry: false,
      },
    ),
  )
  const customerCount = useQuery(
    trpc.orders.customerCount.queryOptions(undefined, {
      enabled: !creation.blocked && !isOffline,
      retry: false,
    }),
  )
  const directoryCount = useQuery(
    trpc.customers.count.queryOptions(undefined, {
      enabled: !creation.blocked && !isOffline,
      retry: false,
    }),
  )
  const initialOrder = useQuery(
    trpc.orders.get.queryOptions(
      { orderId: lookupOrderId ?? "" },
      {
        enabled: !creation.blocked && !isOffline && Boolean(lookupOrderId),
        retry: false,
      },
    ),
  )
  const customerLookup = useQuery(
    trpc.customers.getById.queryOptions(
      { customerId: lookupCustomerId ?? "" },
      {
        enabled: !creation.blocked && !isOffline && Boolean(lookupCustomerId),
        retry: false,
      },
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
    if (!initialOrder.data || initialOrder.data.id !== lookupOrderId)
      return pageOrders
    return [
      initialOrder.data,
      ...pageOrders.filter((order) => order.id !== initialOrder.data.id),
    ]
  }, [initialOrder.data, lookupOrderId, orders.data?.pages])
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
  const directoryProfile = useMemo(() => {
    if (!customerLookup.data || customerLookup.data.id !== lookupCustomerId)
      return null
    // Only the explicitly requested directory row supplies this profile. Other
    // same-name directory rows must not replace its identity in the projection.
    return (
      buildCommerceCustomers(loadedOrders, pendingOrders, [
        customerLookup.data,
      ]).find((customer) => customer.id === lookupCustomerId) ?? null
    )
  }, [customerLookup.data, lookupCustomerId, loadedOrders, pendingOrders])
  const setSelectedCustomerId = useCallback(
    (id: string | null) => {
      const customer =
        customers.find((candidate) => candidate.id === id) ??
        (directoryProfile?.id === id ? directoryProfile : undefined)
      setEntryDismissed(true)
      setSelection(
        id
          ? {
              id,
              directoryId:
                directoryCustomers.some((candidate) => candidate.id === id) ||
                customerLookup.data?.id === id
                  ? id
                  : undefined,
              orderId: customer?.orders[0]?.id,
              pendingId: customer?.pendingOrders[0]?.clientCommandId,
            }
          : null,
      )
    },
    [customers, directoryProfile, directoryCustomers, customerLookup.data?.id],
  )
  const showSearch =
    Boolean(search) ||
    shouldShowListSearch(
      Math.max(
        (customerCount.data ?? 0) + (directoryCount.data ?? 0),
        customers.length,
      ) + pendingCustomerCount,
    )

  useEffect(() => {
    if (
      initialSelectionApplied.current ||
      entryDismissed ||
      creation.blocked ||
      (!initialOrderId && !initialCustomerId)
    ) {
      return
    }
    if (initialCustomerId && customerLookup.isPending && !isOffline) return
    const customer =
      directoryProfile ??
      customers.find((candidate) => candidate.id === initialCustomerId) ??
      findCustomerByOrderId(customers, initialOrderId)
    if (!customer) return
    initialSelectionApplied.current = true
    setSelectedCustomerId(customer.id)
  }, [
    customers,
    initialCustomerId,
    initialOrderId,
    directoryProfile,
    customerLookup.isPending,
    isOffline,
    entryDismissed,
    creation.blocked,
    setSelectedCustomerId,
  ])

  useEffect(() => {
    if (!createOnOpen || createOnOpenApplied.current || creation.blocked) return
    createOnOpenApplied.current = true
    creation.present()
  }, [createOnOpen, creation.blocked, creation.present])

  const selectedCustomer =
    (selectedCustomerId === lookupCustomerId ? directoryProfile : null) ??
    customers.find((customer) => customer.id === selectedCustomerId) ??
    (selection
      ? customers.find(
          (customer) =>
            customer.orders.some((order) => order.id === selection.orderId) ||
            customer.pendingOrders.some(
              (order) => order.clientCommandId === selection.pendingId,
            ),
        )
      : null) ??
    null
  useEffect(() => {
    if (
      !selection ||
      !selectedCustomer ||
      creation.blocked ||
      selection.directoryId === selectedCustomer.id ||
      !directoryCustomers.some(
        (customer) => customer.id === selectedCustomer.id,
      )
    )
      return
    setSelection((previous) =>
      previous && previous.id === selection.id
        ? {
            ...previous,
            id: selectedCustomer.id,
            directoryId: selectedCustomer.id,
          }
        : previous,
    )
  }, [selection, selectedCustomer, directoryCustomers, creation.blocked])
  const entryRequested =
    Boolean(initialCustomerId || initialOrderId) &&
    !initialSelectionApplied.current &&
    !entryDismissed
  const entryQuery = initialCustomerId ? customerLookup : initialOrder
  const entryLoading =
    entryRequested &&
    !isOffline &&
    !entryQuery.isError &&
    (entryQuery.isPending || entryQuery.isFetching)
  const entryNotice = !entryRequested
    ? null
    : entryLoading
      ? "Loading the requested customer independently of directory search."
      : isOffline
        ? "This customer's entry is not cached. Reconnect to load it, or browse cached contacts."
        : entryQuery.isError
          ? "The requested customer could not be loaded. It may be unavailable or the connection may have failed."
          : "No customer contact is available for this entry. You can browse the directory instead."
  const historyComplete =
    !isOffline &&
    !orders.isPending &&
    !orders.isFetching &&
    !orders.isError &&
    !orders.hasNextPage &&
    !search.trim() &&
    !deferredSearch.trim()

  useEffect(() => {
    if (
      !selectedCustomerId ||
      creation.blocked ||
      isOffline ||
      orders.isError ||
      !shouldFetchNextListPage({
        hasNextPage: Boolean(orders.hasNextPage),
        isFetchingNextPage: orders.isFetchingNextPage,
      })
    ) {
      return
    }
    void orders.fetchNextPage()
  }, [
    creation.blocked,
    isOffline,
    orders.fetchNextPage,
    orders.hasNextPage,
    orders.isError,
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
  const isLoading = (orders.isPending || directory.isPending) && !isOffline
  const hasError = orders.isError || directory.isError
  const presentation = getCustomerBookPresentation({
    customerCount: customers.length,
    filter,
    hasError,
    isLoading,
    isOffline,
    search,
  })

  return {
    router,
    isOffline,
    filter,
    setFilter,
    creation,
    search,
    setSearch,
    setSelectedCustomerId,
    orders,
    directory,
    customerCount,
    directoryCount,
    customers,
    pendingCustomerCount,
    showSearch,
    selectedCustomer,
    selectedIsSaved: Boolean(
      selectedCustomer &&
        ((selectedCustomer.id === customerLookup.data?.id &&
          !customerLookup.isError) ||
          directoryCustomers.some(
            (customer) => customer.id === selectedCustomer.id,
          )),
    ),
    entryNotice,
    entryLoading,
    dismissEntry: () => setEntryDismissed(true),
    retryEntry: () => {
      if (creation.blocked || isOffline) return
      if (initialCustomerId) void customerLookup.refetch()
      else if (initialOrderId) void initialOrder.refetch()
    },
    historyComplete,
    visibleCustomers,
    isLoading,
    hasError,
    presentation,
  }
}
