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
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { Toast } from "@/components/ui/toast"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useBottomSearchScroll } from "@/hooks/use-bottom-search-scroll"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import { shouldFetchNextListPage } from "@/lib/list-pagination"
import { useBusinessStore } from "@/store/businessStore"
import { COUNTRIES, DEFAULT_COUNTRY_CODE } from "@ewatrade/utils/countries"
import { VariableContextProvider } from "nativewind"
import { useEffect, useMemo, useRef, useState } from "react"
import { FlatList } from "react-native-css/components/FlatList"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ActionButton, MarketDayActionButton } from "../action-button"
import {
  ClassicCustomerBookFilter,
  ClassicCustomerBookHeader,
  ClassicCustomerBookRow,
} from "../appearances/classic/customer-book-screen"
import {
  MarketDayCustomerBookFilter,
  MarketDayCustomerBookHeader,
  MarketDayCustomerBookRow,
} from "../appearances/market-day/customer-book-screen"
import { MobileWorkflowChrome } from "../appearances/workflow-chrome"
import { ListCreateFab } from "../list-create-fab"
import type { WorkflowModalChromeProps } from "../workflow-modal-screen"
import { CustomerOpenOrders } from "./customer-open-orders"
import { type CustomerBookProps, useCustomerBook } from "./use-customer-book"
export function CustomerBookChrome(props: WorkflowModalChromeProps) {
  return <MobileWorkflowChrome {...props} screen="customers" />
}
export function activeCustomerFilterLabel(
  filter: CustomerBookFilter,
  market = true,
) {
  if (filter === "pending") return market ? "Pending sync" : "Waiting to sync"
  if (filter === "synced") return "Synced"
  if (filter === "none") return "No orders yet"
  return "All"
}
const MARKET_FILTERS = ["all", "synced", "pending"] as const
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
  const market = useMobileDesign("customers") === "market-day"
  const Header = market
    ? MarketDayCustomerBookHeader
    : ClassicCustomerBookHeader
  const Row = market ? MarketDayCustomerBookRow : ClassicCustomerBookRow
  const Filter = market
    ? MarketDayCustomerBookFilter
    : ClassicCustomerBookFilter
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
    customerCount,
    directoryCount,
    customers,
    pendingCustomerCount,
    showSearch,
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
  const searchVisible = market || showSearch
  // Green Till confirms a save with a bottom toast instead of a banner.
  const toastedNotice = useRef<string | null>(null)
  useEffect(() => {
    if (!creation.notice) {
      toastedNotice.current = null
      return
    }
    if (market || toastedNotice.current === creation.notice) return
    toastedNotice.current = creation.notice
    Toast.show(creation.notice, { position: "bottom", type: "success" })
  }, [creation.notice, market])
  const profileOpen = Boolean(selectedCustomer)
  const { onProfileOpenChange } = props
  useEffect(() => {
    onProfileOpenChange?.(profileOpen)
  }, [onProfileOpenChange, profileOpen])
  const reveal = useFirstReveal(!isLoading)
  const [footerHeight, setFooterHeight] = useState(88)
  const scrollHide = useBottomSearchScroll()
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
      {creation.notice && market ? (
        <View className="px-4 py-2">
          <StatusBanner
            icon="CheckCircle2"
            title="Customer directory"
            message={creation.notice}
            tone="success"
          />
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
          {market && canManageTenant && selectedIsSaved && selectedCustomer ? (
            <View className="px-4 pb-3">
              <ActionButton
                variant="outline"
                onPress={() =>
                  router.push({
                    pathname: "/customer-ledger/[customerId]",
                    params: { customerId: selectedCustomer.id },
                  })
                }
              >
                Statement and payments
              </ActionButton>
            </View>
          ) : null}
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
      appearance={market ? "market-day" : "classic"}
      customer={selectedCustomer}
      historyComplete={historyComplete}
      isOffline={isOffline}
      historyNotice={
        isOffline
          ? "Showing cached history. Reconnect to load current orders."
          : orders.isError
            ? "Some history could not be loaded. Return to the directory to retry."
            : search.trim()
              ? "Search-filtered history. Loaded amounts are not final customer totals."
              : "Only loaded history is shown; totals may change as more orders arrive."
      }
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
        "--customer-book-bottom":
          (market && searchVisible) || !market ? footerHeight + 24 : 24,
      }}
    >
      <View
        className={market ? "flex-1 bg-market-canvas" : "flex-1"}
        testID="customer-book-screen"
      >
        <FlatList
          className="flex-1"
          contentContainerClassName={
            market
              ? "grow gap-2 px-[18px] pb-[var(--customer-book-bottom)]"
              : "grow px-[18px] pb-[var(--customer-book-bottom)]"
          }
          data={visibleCustomers}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item.id}
          onScroll={market ? undefined : scrollHide.onScroll}
          scrollEventThrottle={16}
          ListEmptyComponent={
            isLoading && !market ? (
              <View className="gap-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </View>
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
                  isLoading
                    ? "Loading customers."
                    : search || filter !== "all"
                      ? "Try another search or customer state."
                      : hasError
                        ? "Try again to load the customer directory."
                        : isOffline
                          ? "Reconnect to load the shared customer directory."
                          : "Your saved customers and their order activity will appear here."
                }
                title={
                  isLoading
                    ? "Loading customers"
                    : search || filter !== "all"
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
              <Header
                loadedCount={customers.length}
                pendingCount={
                  market ? pendingCustomerCount : filterCounts.pending
                }
                noOrdersCount={filterCounts.none}
                hasMore={hasMoreCustomers}
                isLoading={isLoading}
                hasError={hasError}
                isOffline={isOffline}
                search={search}
              />
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
                  {(market ? MARKET_FILTERS : CLASSIC_FILTERS).map((value) => (
                    <Filter
                      active={filter === value}
                      count={market ? undefined : filterCounts[value]}
                      key={value}
                      label={activeCustomerFilterLabel(value, market)}
                      onPress={() => setFilter(value)}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          }
          renderItem={({ item, index }) => (
            <RevealItem index={index} active={reveal}>
              <Row
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
        {market && searchVisible ? (
          <BottomSearchFooter
            alwaysShowSearch
            variant={market ? "market-day" : "default"}
            localSearch={isOffline}
            maxLength={160}
            onHeightChange={setFooterHeight}
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
          >
            {market ? (
              <MarketDayActionButton
                icon="UserPlus"
                tone="palm"
                disabled={isOffline}
                onPress={creation.present}
              >
                {creation.uncertain
                  ? "Review unconfirmed save"
                  : "Add customer"}
              </MarketDayActionButton>
            ) : null}
          </BottomSearchFooter>
        ) : null}
        {!market ? (
          <>
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
                  : Math.max(
                      0,
                      footerHeight + 14 - Math.max(insets.bottom + 16, 24),
                    )
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
              variant="action-bar"
              localSearch={isOffline}
              maxLength={160}
              onHeightChange={setFooterHeight}
              accessibilityLabel="Search customers"
              onChangeText={setSearch}
              placeholder={
                isOffline ? "Search saved copy" : "Search name, phone or email"
              }
              totalCount={customers.length}
              value={search}
            />
          </>
        ) : null}
      </View>
    </VariableContextProvider>
  )
  return (
    <View className={market ? "flex-1 bg-market-canvas" : "flex-1"}>
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
        headline="A familiar face, saved."
        description={
          market ? undefined : "Save them once. They show up in Create sale."
        }
        phoneCountryCode={market ? undefined : countryCode}
        appearance={market ? "market-day" : "classic"}
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
