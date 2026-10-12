import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import {
  CustomerOverviewContent,
  commercialOrderHref,
} from "@/components/mobile/commerce"
import { CreateSaleCustomerSheet } from "@/components/mobile/create-sale-customer-sheet"
import type { CustomerBookFilter } from "@/components/mobile/customer-book-presentation-model"
import { EmptyState } from "@/components/mobile/empty-state"
import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import { StatusBanner } from "@/components/mobile/status-banner"
import { RevealItem, useFirstReveal } from "@/components/ui/motion"
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { Toast } from "@/components/ui/toast"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useBottomSearchScroll } from "@/hooks/use-bottom-search-scroll"
import { shouldFetchNextListPage } from "@/lib/list-pagination"
import { useBusinessStore } from "@/store/businessStore"
import { COUNTRIES, DEFAULT_COUNTRY_CODE } from "@ewatrade/utils/countries"
import { VariableContextProvider } from "nativewind"
import { useEffect, useMemo, useRef, useState } from "react"
import { FlatList } from "react-native-css/components/FlatList"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ActionButton } from "../action-button"
import {
  ClassicCustomerBookFilter,
  ClassicCustomerBookHeader,
  ClassicCustomerBookRow,
} from "../appearances/classic/customer-book-screen"
import { MobileWorkflowChrome } from "../appearances/workflow-chrome"
import { ListCreateFab } from "../list-create-fab"
import { getListCreateFabFooterOffset } from "../list-create-fab-model"
import { SearchFold, useSearchFold } from "../search-fold"
import type { WorkflowModalChromeProps } from "../workflow-modal-screen"
import { CustomerOpenOrders } from "./customer-open-orders"
import { type CustomerBookProps, useCustomerBook } from "./use-customer-book"
export function CustomerBookChrome(props: WorkflowModalChromeProps) {
  return <MobileWorkflowChrome {...props} />
}
export function activeCustomerFilterLabel(filter: CustomerBookFilter) {
  if (filter === "pending") return "Waiting to sync"
  if (filter === "synced") return "Synced"
  if (filter === "none") return "No orders yet"
  return "All"
}
const CLASSIC_FILTERS = ["all", "pending", "none"] as const

export function CustomerBookContent(
  props: CustomerBookProps & {
    /** Lets the route hide its Customers bar while a profile shows its own. */
    onProfileOpenChange?: (open: boolean) => void
  },
) {
  const { profile } = useAuthContext()
  const businessCountry = useBusinessStore(
    (s) => s.businesses.find((b) => b.id === profile?.businessId)?.country,
  )
  const countryCode =
    COUNTRIES.find(
      (c) => c.code === businessCountry || c.name === businessCountry,
    )?.code ?? DEFAULT_COUNTRY_CODE
  const canManageTenant = ["OWNER", "ADMIN"].includes(
    profile?.role?.trim().toUpperCase() ?? "",
  )
  const { initialOrderId } = props
  const {
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
    customers,
    selectedCustomer,
    selectedIsSaved,
    entryNotice,
    entryLoading,
    dismissEntry,
    retryEntry,
    historyComplete,
    visibleCustomers,
    isLoading,
    hasError,
    presentation,
  } = useCustomerBook(props)
  // Green Till confirms a save with a bottom toast.
  const toastedNotice = useRef<string | null>(null)
  useEffect(() => {
    if (!creation.notice) {
      toastedNotice.current = null
      return
    }
    if (toastedNotice.current === creation.notice) return
    toastedNotice.current = creation.notice
    Toast.show(creation.notice, { position: "bottom", type: "success" })
  }, [creation.notice])
  const profileOpen = Boolean(selectedCustomer)
  const { onProfileOpenChange } = props
  useEffect(() => {
    onProfileOpenChange?.(profileOpen)
  }, [onProfileOpenChange, profileOpen])
  const reveal = useFirstReveal(!isLoading)
  const [footerHeight, setFooterHeight] = useState(88)
  const scrollHide = useBottomSearchScroll()
  const searchFold = useSearchFold(search)
  const insets = useSafeAreaInsets()
  const filterCounts = useMemo(
    () => ({
      all: customers.length,
      none: customers.filter(
        (customer) => !customer.orders.length && !customer.pendingOrders.length,
      ).length,
      pending: customers.filter((customer) => customer.pendingOrders.length)
        .length,
      synced: customers.filter((customer) => customer.orders.length).length,
    }),
    [customers],
  )
  const hasMoreCustomers = Boolean(directory.hasNextPage || orders.hasNextPage)
  const returnToOrder = () => {
    if (router.canGoBack()) router.back()
    else router.replace("/dashboard")
  }
  const feedback = (
    <>
      {entryNotice ? (
        <View className="gap-2 px-4 py-2">
          <StatusBanner
            icon="Users"
            title={entryLoading ? "Opening customer" : "Customer entry"}
            message={entryNotice}
          />
          {!entryLoading ? (
            <ActionButton
              icon="RotateCw"
              variant="outline"
              disabled={isOffline}
              onPress={retryEntry}
            >
              Retry customer entry
            </ActionButton>
          ) : null}
          <ActionButton variant="outline" onPress={dismissEntry}>
            Browse customer directory
          </ActionButton>
        </View>
      ) : null}
      {creation.uncertain ? (
        <View className="gap-2 px-4 py-2">
          <StatusBanner
            icon="AlertCircle"
            title="Save not confirmed"
            message="Check the saved directory before creating this contact again. No request has been retried. Choosing an existing saved contact continues without replaying the uncertain write. This recovery is kept only while this workflow is open; if you leave, check the directory before trying again."
            tone="warning"
          />
          <ActionButton
            icon={selectedIsSaved ? "Check" : "Search"}
            variant="outline"
            disabled={isOffline}
            onPress={
              selectedIsSaved
                ? creation.useExistingContact
                : creation.checkDirectory
            }
          >
            {selectedIsSaved ? "Use this saved contact" : "Check directory"}
          </ActionButton>
        </View>
      ) : null}
    </>
  )
  const overview = selectedCustomer ? (
    <CustomerOverviewContent
      headerContent={
        <>
          {feedback}
          <CustomerOpenOrders
            customerId={selectedIsSaved ? selectedCustomer.id : undefined}
            phone={selectedCustomer.phone}
            onOpenOrder={(id) => router.push(commercialOrderHref(id) as never)}
          />
        </>
      }
      onStatement={
        canManageTenant && selectedIsSaved
          ? () =>
              router.push({
                pathname: "/customer-ledger/[customerId]",
                params: { customerId: selectedCustomer.id },
              })
          : undefined
      }
      customer={selectedCustomer}
      historyComplete={historyComplete}
      isOffline={isOffline}
      onBack={
        initialOrderId ? returnToOrder : () => setSelectedCustomerId(null)
      }
      onClose={initialOrderId ? returnToOrder : undefined}
      onCreateOrder={() =>
        router.push({
          params: {
            customerEmail: selectedCustomer.email ?? undefined,
            customerId: selectedCustomer.id,
            customerDirectoryId: selectedIsSaved
              ? selectedCustomer.id
              : undefined,
            customerName: selectedCustomer.name,
            customerPhone: selectedCustomer.phone ?? undefined,
          },
          pathname: "/create-sale-modal",
        })
      }
      onOpenOrder={(orderId) => router.push(commercialOrderHref(orderId))}
      orderLinked={Boolean(initialOrderId)}
    />
  ) : null

  const directoryContent = (
    <VariableContextProvider
      value={{
        "--customer-book-bottom": footerHeight + 24,
      }}
    >
      <View className="flex-1" testID="customer-book-screen">
        <FlatList
          className="flex-1"
          contentContainerClassName="grow px-[18px] pb-[var(--customer-book-bottom)]"
          data={visibleCustomers}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item.id}
          onScroll={scrollHide.onScroll}
          scrollEventThrottle={16}
          ListEmptyComponent={
            isLoading ? (
              <SkeletonGroup accessibilityLabel="Loading customers">
                <View className="gap-3">
                  <Skeleton height={64} />
                  <Skeleton height={64} />
                  <Skeleton height={64} />
                </View>
              </SkeletonGroup>
            ) : (
              <EmptyState
                actionLabel={
                  presentation.showInitialCreateAction
                    ? "Add first customer"
                    : undefined
                }
                actionProps={{
                  accessibilityLabel: "Add first customer",
                  icon: "Plus",
                  onPress: creation.present,
                  testID: "customer-add-first-action",
                }}
                className="flex-1 justify-center px-6 pb-16"
                icon="Users"
                message={
                  search || filter !== "all"
                    ? "Try another search or customer state."
                    : hasError
                      ? "Try again to load the customer directory."
                      : isOffline
                        ? "Reconnect to load the shared customer directory."
                        : "Your saved customers and their order activity will appear here."
                }
                title={
                  search || filter !== "all"
                    ? "No matching customers"
                    : hasError
                      ? "Customers unavailable"
                      : isOffline
                        ? "No cached customers"
                        : "No customers yet"
                }
                variant="flat"
              />
            )
          }
          ListHeaderComponent={
            <View className="gap-4 pb-3">
              {feedback}
              <SearchFold folded={searchFold.folded}>
                <ClassicCustomerBookHeader
                  loadedCount={customers.length}
                  pendingCount={filterCounts.pending}
                  noOrdersCount={filterCounts.none}
                  hasMore={hasMoreCustomers}
                  isLoading={isLoading}
                  hasError={hasError}
                  isOffline={isOffline}
                  search={search}
                />
              </SearchFold>
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
              {presentation.showFilters ? (
                <View className="flex-row flex-wrap gap-2">
                  {CLASSIC_FILTERS.map((value) => (
                    <ClassicCustomerBookFilter
                      active={filter === value}
                      count={filterCounts[value]}
                      key={value}
                      label={activeCustomerFilterLabel(value)}
                      onPress={() => setFilter(value)}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          }
          renderItem={({ item, index }) => (
            <RevealItem index={index} active={reveal}>
              <ClassicCustomerBookRow
                customer={item}
                historyComplete={historyComplete}
                onPress={() => setSelectedCustomerId(item.id)}
                position={{
                  first: index === 0,
                  last: index === visibleCustomers.length - 1,
                }}
              />
            </RevealItem>
          )}
          onEndReached={() => {
            if (isOffline || creation.blocked) return
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
          refreshControl={isOffline ? undefined : <QueryRefreshControl />}
          showsVerticalScrollIndicator={false}
        />
        <ListCreateFab
          accessibilityLabel={
            isOffline
              ? "Add customer, needs a connection"
              : creation.uncertain
                ? "Review unconfirmed save"
                : "Add customer"
          }
          bottomOffset={
            scrollHide.hidden && !search
              ? 0
              : getListCreateFabFooterOffset({
                  bottomInset: insets.bottom,
                  footerHeight,
                })
          }
          disabled={isOffline || creation.locked}
          icon="UserPlus"
          onPress={creation.present}
          testID="customer-add-fab"
          tone="gold"
        />
        <BottomSearchFooter
          alwaysShowSearch
          hidden={scrollHide.hidden}
          localSearch={isOffline}
          maxLength={160}
          onFocusChange={searchFold.onFocusChange}
          onHeightChange={setFooterHeight}
          accessibilityLabel="Search customers"
          onChangeText={setSearch}
          placeholder={
            isOffline ? "Search saved copy" : "Search name, phone or email"
          }
          totalCount={customers.length}
          value={search}
        />
      </View>
    </VariableContextProvider>
  )
  return (
    <View className="flex-1">
      <View
        className="flex-1"
        accessibilityElementsHidden={creation.open}
        importantForAccessibility={
          creation.open ? "no-hide-descendants" : "auto"
        }
      >
        {creation.blocked ? (
          <EmptyState
            icon="Lock"
            title="Customer workspace changed"
            message="Return to the original account and business to continue this customer workflow, or close it and reopen Customers in the current workspace."
          />
        ) : (
          <>{overview ?? directoryContent}</>
        )}
      </View>
      <CreateSaleCustomerSheet
        description="Save them once. They show up in Create sale."
        phoneCountryCode={countryCode}
        disabled={isOffline || creation.locked}
        draft={creation.draft}
        error={creation.error}
        isLoading={creation.isPending}
        onChange={creation.setDraft}
        onSave={() => void creation.save()}
        onDismiss={creation.onDismiss}
        recoveryAction={
          creation.uncertain
            ? {
                label: "Check directory",
                onPress: creation.checkDirectory,
                disabled: isOffline || creation.blocked,
              }
            : undefined
        }
        ref={creation.modal.ref}
      />
    </View>
  )
}
