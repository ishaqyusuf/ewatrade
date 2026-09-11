import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { shouldFetchNextListPage } from "@/lib/list-pagination"
import { customerFromSuggestion } from "./create-sale-model"
import { FlatList } from "react-native-css/components/FlatList"
import { View } from "react-native"
import type { SaleStepViewProps } from "./create-sale-presentation"
import { useSalePresentation } from "./use-sale-presentation"

export function CreateSaleCustomerStep({
  model,
  appearance,
  onActionsHeightChange: setActionsHeight,
}: SaleStepViewProps) {
  const {
    market,
    tone,
    SaleStageHeader,
    CustomerActionRow,
    CustomerSuggestionRow,
  } = useSalePresentation(appearance)
  const {
    isOffline,
    setError,
    setStep,
    customers,
    customersLoading,
    retryCustomers,
    loadedCustomers,
    customerSearch,
    setCustomerSearch,
    showCustomerSearch,
    selectCustomer,
    presentCustomerSheet,
    recentOrders,
    customerDirectory,
    customerCount,
    directoryCustomerCount,
  } = model

  return (
    <View className={tone("flex-1")}>
      <FlatList
        contentContainerClassName="grow px-2 pb-[var(--sale-customer-bottom)]"
        data={customers}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        keyExtractor={(customer) => customer.id}
        ListEmptyComponent={
          customersLoading ? (
            <Text
              className={tone(
                "py-10 text-center text-sm text-muted-foreground",
              )}
            >
              Loading recent customers.
            </Text>
          ) : customerSearch &&
            !recentOrders.isError &&
            !customerDirectory.isError ? (
            <Text
              className={tone(
                "py-10 text-center text-sm text-muted-foreground",
              )}
            >
              No customer matches this search. Create a customer above to use
              these details.
            </Text>
          ) : null
        }
        ListHeaderComponent={
          <View className={tone("px-2")}>
            <SaleStageHeader
              current={2}
              description="Select a recent customer, add a new contact, or continue as a guest."
              onBack={() => {
                setError(null)
                setStep("items")
              }}
              title="Select customer"
            />
            {recentOrders.isError ? (
              <View className={tone("pb-4")}>
                <StatusBanner
                  icon="AlertCircle"
                  message="Recent customers could not be loaded. You can still create a customer or continue as a guest."
                  tone="warning"
                  actionLabel={isOffline ? undefined : "Try again"}
                  onActionPress={isOffline ? undefined : retryCustomers}
                />
              </View>
            ) : null}
            {customerDirectory.isError ? (
              <StatusBanner
                icon="AlertCircle"
                message={customerDirectory.error.message}
                title="Saved customers unavailable"
                tone="warning"
                actionLabel={isOffline ? undefined : "Try again"}
                onActionPress={isOffline ? undefined : retryCustomers}
              />
            ) : null}
            <CustomerActionRow
              description="Add name and optional contact details"
              icon="UserPlus"
              onPress={presentCustomerSheet}
              title="Create customer"
            />
            <CustomerActionRow
              description="Register this sale as a walk-in order"
              icon="UserX"
              onPress={() => selectCustomer(null)}
              title="Skip · Continue as guest"
            />
            <Text
              className={tone(
                "pb-2 pt-6 text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground",
              )}
            >
              {customerSearch ? "Search results" : "Recent customers"}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <CustomerSuggestionRow
            customer={item}
            onPress={() => selectCustomer(customerFromSuggestion(item))}
          />
        )}
        showsVerticalScrollIndicator={false}
        className={tone("flex-1")}
        onEndReached={() => {
          if (isOffline) return
          if (
            shouldFetchNextListPage({
              hasNextPage: Boolean(recentOrders.hasNextPage),
              isFetchingNextPage: recentOrders.isFetchingNextPage,
            })
          ) {
            void recentOrders.fetchNextPage()
          }
          if (
            shouldFetchNextListPage({
              hasNextPage: Boolean(customerDirectory.hasNextPage),
              isFetchingNextPage: customerDirectory.isFetchingNextPage,
            })
          ) {
            void customerDirectory.fetchNextPage()
          }
        }}
        onEndReachedThreshold={0.35}
        ListFooterComponent={
          recentOrders.isFetchingNextPage ||
          customerDirectory.isFetchingNextPage ? (
            <Text
              className={tone(
                "py-5 text-center text-xs font-semibold text-muted-foreground",
              )}
            >
              Loading more customers…
            </Text>
          ) : null
        }
      />
      {showCustomerSearch ? (
        <BottomSearchFooter
          variant={market ? "market-day" : "default"}
          alwaysShowSearch={Boolean(customerSearch)}
          maxLength={160}
          onHeightChange={setActionsHeight}
          accessibilityLabel="Search customer, phone, or email"
          onChangeText={setCustomerSearch}
          placeholder="Search customer, phone, or email"
          totalCount={Math.max(
            (customerCount.data ?? 0) + (directoryCustomerCount.data ?? 0),
            loadedCustomers.length,
          )}
          value={customerSearch}
        />
      ) : null}
    </View>
  )
}
