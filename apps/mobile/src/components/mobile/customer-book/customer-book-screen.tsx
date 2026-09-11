import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import {
  CustomerOverviewContent,
  commercialOrderHref,
} from "@/components/mobile/commerce"
import { CreateSaleCustomerSheet } from "@/components/mobile/create-sale-customer-sheet"
import type { CustomerBookFilter } from "@/components/mobile/customer-book-presentation-model"
import { EmptyState } from "@/components/mobile/empty-state"
import { ListCreateFab } from "@/components/mobile/list-create-fab"
import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { shouldFetchNextListPage } from "@/lib/list-pagination"
import { FlatList } from "react-native-css/components/FlatList"
import { VariableContextProvider } from "nativewind"
import { useState } from "react"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import { ActionButton, MarketDayActionButton } from "../action-button"
import { MobileWorkflowChrome } from "../appearances/workflow-chrome"
import type { WorkflowModalChromeProps } from "../workflow-modal-screen"
import {
  ClassicCustomerBookHeader,
  ClassicCustomerBookRow,
  ClassicCustomerBookFilter,
} from "../appearances/classic/customer-book-screen"
import {
  MarketDayCustomerBookHeader,
  MarketDayCustomerBookRow,
  MarketDayCustomerBookFilter,
} from "../appearances/market-day/customer-book-screen"
import { useCustomerBook, type CustomerBookProps } from "./use-customer-book"
export function CustomerBookChrome(props: WorkflowModalChromeProps) {
  return <MobileWorkflowChrome {...props} screen="customers" />
}
export function activeCustomerFilterLabel(filter: CustomerBookFilter) {
  if (filter === "pending") return "Pending sync"
  if (filter === "synced") return "Synced"
  return "All"
}

export function CustomerBookContent(props: CustomerBookProps) {
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
  const [footerHeight, setFooterHeight] = useState(88)
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
      {creation.notice ? (
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
      headerContent={feedback}
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
        "--customer-book-bottom": searchVisible ? footerHeight + 24 : 24,
      }}
    >
      <View
        className={market ? "flex-1 bg-market-canvas" : "flex-1"}
        testID="customer-book-screen"
      >
        <FlatList
          className="flex-1"
          contentContainerClassName="grow px-2 pb-[var(--customer-book-bottom)]"
          data={visibleCustomers}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
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
          }
          ListHeaderComponent={
            <View className="gap-4 px-2 pb-3">
              {feedback}
              <Header
                loadedCount={customers.length}
                pendingCount={pendingCustomerCount}
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
                  {(["all", "synced", "pending"] as const).map((value) => (
                    <Filter
                      active={filter === value}
                      key={value}
                      label={activeCustomerFilterLabel(value)}
                      onPress={() => setFilter(value)}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <Row
              customer={item}
              historyComplete={historyComplete}
              onPress={() => setSelectedCustomerId(item.id)}
            />
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
        {searchVisible ? (
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
        {!market && presentation.showStandardCreateFab ? (
          <ListCreateFab
            accessibilityLabel="Add customer"
            bottomOffset={showSearch ? footerHeight : 0}
            onPress={creation.present}
            testID="customer-add-fab"
          />
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
