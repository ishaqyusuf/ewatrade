import { ActionButton } from "@/components/mobile/action-button"
import { EmptyState } from "@/components/mobile/empty-state"
import { FormField } from "@/components/mobile/form-field"
import { StatusBadge } from "@/components/mobile/status-badge"
import { StatusBanner } from "@/components/mobile/status-banner"
import { BottomSheetInputProvider } from "@/components/ui/bottom-sheet-input-context"
import { Icon } from "@/components/ui/icon"
import { Modal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { useBusinessStore } from "@/store/businessStore"
import {
  type RetailOpsCustomer,
  useRetailOpsStore,
} from "@/store/retailOpsStore"
import { useTRPC } from "@/trpc/client"
import {
  BottomSheetFlatList,
  type BottomSheetModal,
} from "@gorhom/bottom-sheet"
import { useQuery } from "@tanstack/react-query"
import { forwardRef, useMemo, useState } from "react"
import { View } from "react-native"

type CustomerBookSheetProps = {
  onComplete?: () => void
}

type ProductionCustomerBookEntry = {
  email: string | null
  id: string
  lastOrder: {
    orderNumber: string
  }
  lastSeenAt: Date | string
  name: string
  orderCount: number
  phone: string | null
}

type CustomerBookRow = {
  detail: string
  email: string | null
  id: string
  lastSeenAt: Date | string
  name: string
  phone: string | null
  source: "local" | "production"
  status?: "pending" | "synced"
  totalOrders: number
}

function formatLastSeen(value: Date | string | undefined) {
  if (!value) return "Recent"

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return "Recent"

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  })
}

function getCustomerRowKey(customer: CustomerBookRow) {
  return (
    customer.email?.trim().toLowerCase() ??
    customer.phone?.trim() ??
    customer.name.trim().toLowerCase()
  )
}

function mapProductionCustomer(
  customer: ProductionCustomerBookEntry,
): CustomerBookRow {
  return {
    detail: `Last order ${customer.lastOrder.orderNumber}`,
    email: customer.email,
    id: `production-${customer.id}`,
    lastSeenAt: customer.lastSeenAt,
    name: customer.name,
    phone: customer.phone,
    source: "production",
    status: "synced",
    totalOrders: customer.orderCount,
  }
}

function mapLocalCustomer(customer: RetailOpsCustomer): CustomerBookRow {
  return {
    detail: customer.remoteId
      ? "Synced with production"
      : "Saved on this device",
    email: null,
    id: `local-${customer.id}`,
    lastSeenAt: customer.lastSeenAt,
    name: customer.name,
    phone: null,
    source: "local",
    status: customer.syncStatus,
    totalOrders: customer.saleCount ?? 1,
  }
}

function CustomerRow({ customer }: { customer: CustomerBookRow }) {
  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text className="font-semibold text-foreground">{customer.name}</Text>
          <Text className="text-sm text-muted-foreground">
            {customer.detail} - {formatLastSeen(customer.lastSeenAt)}
          </Text>
        </View>
        <StatusBadge
          label={`${customer.totalOrders} order${customer.totalOrders === 1 ? "" : "s"}`}
          tone="primary"
        />
      </View>
      {customer.email || customer.phone ? (
        <Text className="text-xs leading-4 text-muted-foreground">
          {[customer.email, customer.phone].filter(Boolean).join(" - ")}
        </Text>
      ) : null}
      {customer.source === "production" ? (
        <StatusBadge
          className="self-start"
          label="Synced customer"
          tone="success"
        />
      ) : null}
      {customer.status === "pending" ? (
        <StatusBadge
          className="self-start"
          icon="Clock"
          label="Pending sync"
          tone="warning"
        />
      ) : null}
    </View>
  )
}

export const CustomerBookSheet = forwardRef<
  BottomSheetModal,
  CustomerBookSheetProps
>(({ onComplete }, ref) => {
  const trpc = useTRPC()
  const activeBusinessId = useBusinessStore((state) => state.activeBusinessId)
  const isOfflineMode = useRetailOpsStore((state) => state.isOfflineMode)
  const allCustomers = useRetailOpsStore((state) => state.customers)
  const customers = useMemo(
    () =>
      allCustomers.filter(
        (customer) =>
          !activeBusinessId ||
          (customer.businessId ?? activeBusinessId) === activeBusinessId,
      ),
    [activeBusinessId, allCustomers],
  )
  const [query, setQuery] = useState("")
  const normalizedQuery = query.trim()
  const productionCustomersQuery = useQuery(
    trpc.retailOps.customerBook.queryOptions(
      {
        limit: 50,
        search: normalizedQuery || undefined,
      },
      {
        enabled: !isOfflineMode,
        retry: false,
      },
    ),
  )
  const localRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    const localCustomers = normalizedQuery
      ? customers.filter((customer) =>
          customer.name.toLowerCase().includes(normalizedQuery),
        )
      : customers

    return localCustomers.map(mapLocalCustomer)
  }, [customers, query])
  const productionRows = useMemo(
    () =>
      (
        (productionCustomersQuery.data ?? []) as ProductionCustomerBookEntry[]
      ).map(mapProductionCustomer),
    [productionCustomersQuery.data],
  )
  const visibleCustomers = useMemo(() => {
    if (isOfflineMode || productionCustomersQuery.isError) return localRows

    const seen = new Set(productionRows.map(getCustomerRowKey))
    const mergedRows = [...productionRows]

    for (const localRow of localRows) {
      const key = getCustomerRowKey(localRow)

      if (!seen.has(key)) {
        seen.add(key)
        mergedRows.push(localRow)
      }
    }

    return mergedRows
  }, [
    isOfflineMode,
    localRows,
    productionCustomersQuery.isError,
    productionRows,
  ])
  const sourceLabel = isOfflineMode
    ? "Local"
    : productionCustomersQuery.isError
      ? "Local fallback"
      : productionCustomersQuery.isFetching
        ? "Refreshing"
        : "Online"
  const sourceDetail = isOfflineMode
    ? "Showing customers saved on this device until sync reconnects."
    : productionCustomersQuery.isError
      ? "Production customer book is unavailable, so local customers are shown."
      : productionCustomersQuery.isFetching
        ? "Refreshing production customers."
        : "Production customer book includes sales and shared-link requests."

  return (
    <Modal
      enableDynamicSizing
      ref={ref}
      snapPoints={["84%"]}
      title="Customer book"
    >
      <BottomSheetInputProvider>
        <BottomSheetFlatList<CustomerBookRow>
          contentContainerStyle={{ paddingBottom: 240 }}
          data={visibleCustomers}
          keyExtractor={(customer) => customer.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <EmptyState
              className="mx-5"
              icon="Users"
              message="New customers appear here after a sale or shared-link request."
              title="No customers found"
            />
          }
          ListFooterComponent={
            <View className="px-5 pt-3 pb-6">
              <ActionButton onPress={onComplete} variant="outline">
                Done
              </ActionButton>
            </View>
          }
          ListHeaderComponent={
            <View className="gap-5 px-5 pt-1 pb-4">
              <View className="gap-3">
                <View className="h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                  <Icon className="size-base text-primary" name="Users" />
                </View>
                <View className="gap-2">
                  <Text className="text-xl font-bold text-foreground">
                    Customer book
                  </Text>
                  <Text className="text-sm leading-5 text-muted-foreground">
                    Repeat customers are saved from sales and shared product
                    links.
                  </Text>
                </View>
              </View>

              <StatusBanner
                icon={sourceLabel === "Online" ? "CircleCheck" : "Clock"}
                message={sourceDetail}
                title={`Customer source: ${sourceLabel}`}
                tone={sourceLabel === "Online" ? "success" : "warning"}
              />

              <FormField
                autoCapitalize="words"
                label="Find customer"
                onChangeText={setQuery}
                placeholder="Search by name or email"
                value={query}
              />
            </View>
          }
          renderItem={({ item }) => (
            <View className="px-5 pb-3">
              <CustomerRow customer={item} />
            </View>
          )}
        />
      </BottomSheetInputProvider>
    </Modal>
  )
})

CustomerBookSheet.displayName = "CustomerBookSheet"
