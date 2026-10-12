import { ActionButton } from "@/components/mobile/action-button"
import { ClassicCustomerSuggestionRow } from "@/components/mobile/appearances/classic/create-sale"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { FormField } from "@/components/mobile/form-field"
import { HeroCard } from "@/components/mobile/green-till/hero-card"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { useBottomSearchScroll } from "@/hooks/use-bottom-search-scroll"
import { useColorScheme } from "@/hooks/use-color"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { shouldFetchNextListPage } from "@/lib/list-pagination"
import { formatMinorMoney } from "@ewatrade/utils"
import { View } from "react-native"
import { Text as NativeText } from "react-native"
import { FlatList } from "react-native-css/components/FlatList"
import {
  ClassicBuyerRail,
  ClassicSelectedBuyer,
} from "../appearances/classic/create-sale-buyer"
import { customerFromSuggestion } from "./create-sale-model"
import type { SaleStepViewProps } from "./create-sale-presentation"

export function CreateSaleCustomerStep({
  model,
  onActionsHeightChange: setActionsHeight,
}: SaleStepViewProps) {
  const {
    isOffline,
    customers,
    customersLoading,
    retryCustomers,
    customerSearch,
    setCustomerSearch,
    selectCustomer,
    presentCustomerSheet,
    recentOrders,
    customerDirectory,
  } = model
  const heroPalette = GREEN_TILL_THEME[useColorScheme().colorScheme]
  const scrollHide = useBottomSearchScroll()

  return (
    <View className="flex-1">
      <FlatList
        contentContainerClassName="grow px-2 pb-[var(--sale-customer-bottom)]"
        data={customerSearch ? customers : []}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        keyExtractor={(customer) => customer.id}
        ListEmptyComponent={
          customersLoading ? (
            <Text className="py-10 text-center text-sm text-muted-foreground">
              Loading recent customers.
            </Text>
          ) : customerSearch &&
            !recentOrders.isError &&
            !customerDirectory.isError ? (
            <Text className="py-10 text-center text-sm text-muted-foreground">
              No customer matches this search. Create a customer above to use
              these details.
            </Text>
          ) : null
        }
        ListHeaderComponent={
          <View className="px-2">
            <View className="pb-4">
              <HeroCard
                label="Sale total"
                amount={formatMinorMoney(
                  model.totalMinor,
                  model.currencyCode,
                ).replace(/\.00(?=\D*$)/, "")}
                pill={{
                  label: `${model.selectedRows.length + model.catalogFreeLines.length} ${model.selectedRows.length + model.catalogFreeLines.length === 1 ? "item" : "items"}`,
                  tone: isOffline ? "offline" : "synced",
                }}
                sub={
                  <NativeText
                    numberOfLines={1}
                    style={{
                      color: heroPalette.heroMuted,
                      flexShrink: 1,
                      fontSize: 13,
                      lineHeight: 18,
                    }}
                  >
                    {"Buyer: "}
                    <NativeText
                      style={{
                        color: heroPalette.heroForeground,
                        fontWeight: "800",
                      }}
                    >
                      {model.selectedCustomer?.name ?? "Walk-in"}
                    </NativeText>
                  </NativeText>
                }
              />
            </View>
            {recentOrders.isError ? (
              <View className="pb-4">
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
            <View className="gap-3 pb-2">
              <Text className="text-xs font-extrabold tracking-[0.3px] text-muted-foreground">
                WHO IS BUYING?
              </Text>
              <ClassicBuyerRail
                customers={customers}
                onNew={presentCustomerSheet}
                onSelect={(customer) => selectCustomer(customer, false)}
                selectedId={model.selectedCustomer?.id ?? null}
              />
              <FormField
                accessibilityLabel="Search all customers"
                label="Search all customers"
                leadingIcon="Search"
                placeholder="Search all customers"
                value={customerSearch}
                onChangeText={setCustomerSearch}
                maxLength={160}
                variant="till-search"
              />
              {customerSearch ? (
                <Text className="pt-2 text-xs font-extrabold tracking-[0.3px] text-muted-foreground">
                  SEARCH RESULTS
                </Text>
              ) : (
                <>
                  <Text className="pt-2 text-xs font-extrabold tracking-[0.3px] text-muted-foreground">
                    SELECTED
                  </Text>
                  <ClassicSelectedBuyer customer={model.selectedCustomer} />
                </>
              )}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <ClassicCustomerSuggestionRow
            customer={item}
            onPress={() => selectCustomer(customerFromSuggestion(item), false)}
          />
        )}
        showsVerticalScrollIndicator={false}
        className="flex-1"
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
        onScroll={scrollHide.onScroll}
        scrollEventThrottle={16}
        ListFooterComponent={
          recentOrders.isFetchingNextPage ||
          customerDirectory.isFetchingNextPage ? (
            <Text className="py-5 text-center text-xs font-semibold text-muted-foreground">
              Loading more customers…
            </Text>
          ) : null
        }
      />
      <BottomSearchFooter
        onHeightChange={setActionsHeight}
        accessibilityLabel="Customer actions"
        onChangeText={() => undefined}
        placeholder=""
        searchVisible={false}
        totalCount={0}
        value=""
        variant="action-bar"
      >
        <ActionButton
          disabled={model.actionsLocked}
          onPress={() => selectCustomer(model.selectedCustomer)}
          trailingIcon="ArrowRight"
        >
          Continue with {model.selectedCustomer?.name ?? "walk-in"}
        </ActionButton>
      </BottomSearchFooter>
    </View>
  )
}
