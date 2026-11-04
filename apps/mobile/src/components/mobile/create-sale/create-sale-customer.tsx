import { ActionButton } from "@/components/mobile/action-button"
import { ClassicCustomerSuggestionRow } from "@/components/mobile/appearances/classic/create-sale"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { HeroCard } from "@/components/mobile/green-till/hero-card"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { useBottomSearchScroll } from "@/hooks/use-bottom-search-scroll"
import { useColorScheme } from "@/hooks/use-color"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { shouldFetchNextListPage } from "@/lib/list-pagination"
import { formatMinorMoney } from "@ewatrade/utils"
import { useRef } from "react"
import { View } from "react-native"
import { Text as NativeText } from "react-native"
import { FlatList } from "react-native-css/components/FlatList"
import {
  ClassicBuyerRail,
  ClassicSelectedBuyer,
} from "../appearances/classic/create-sale-buyer"
import { customerFromSuggestion } from "./create-sale-model"
import type { SaleStepViewProps } from "./create-sale-presentation"
import { openContactsSettings } from "./phone-contact-picker"
import { SaleContactNumberSheet } from "./sale-contact-number-sheet"
import { useSaleContactPick } from "./use-sale-contact-pick"

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
  const latest = useRef(model)
  latest.current = model
  const contactPick = useSaleContactPick({
    customers: model.loadedCustomers,
    isLocked: () => latest.current.actionsLocked,
    isOffline,
    onMatch: (customer) => latest.current.selectCustomer(customer, false),
    onNew: ({ name, phone }) => {
      latest.current.setCustomerDraft({ email: "", name, phone })
      latest.current.presentCustomerSheet()
    },
  })
  const contactNotice = contactPick.notice
  // The match note stays only while that customer is still the buyer.
  const showContactNotice =
    contactNotice?.kind === "match"
      ? model.selectedCustomer?.id === contactNotice.customer.id
      : Boolean(contactNotice)
  const heroPalette = GREEN_TILL_THEME[useColorScheme().colorScheme]
  const scrollHide = useBottomSearchScroll()

  return (
    <View className="flex-1">
      <SaleContactNumberSheet
        choice={contactPick.numberChoice}
        onChoose={(phone) => void contactPick.chooseNumber(phone)}
        onClose={contactPick.closeNumberChoice}
      />
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
                      fontSize: 16,
                      lineHeight: 22,
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
                onContacts={
                  contactPick.available && !model.actionsLocked
                    ? () => void contactPick.pick()
                    : undefined
                }
                onNew={presentCustomerSheet}
                onSelect={(customer) => selectCustomer(customer, false)}
                selectedId={model.selectedCustomer?.id ?? null}
              />
              {customerSearch ? (
                <Text className="pt-2 text-xs font-extrabold tracking-[0.3px] text-muted-foreground">
                  SEARCH RESULTS
                </Text>
              ) : (
                <>
                  {showContactNotice && contactNotice ? (
                    <View className="pt-2">
                      {contactNotice.kind === "match" ? (
                        <StatusBanner
                          icon="Info"
                          message={`${contactNotice.contactName || "This contact"} in your contacts is saved as ${contactNotice.customer.name}.`}
                          title="Already a customer"
                          tone="success"
                        />
                      ) : contactNotice.kind === "denied" ? (
                        <StatusBanner
                          icon="Lock"
                          message="Allow Contacts for this app in Settings to pick a customer from your phone."
                          title="Contacts access is off"
                          tone="warning"
                          actionLabel="Open settings"
                          onActionPress={openContactsSettings}
                        />
                      ) : (
                        <StatusBanner
                          icon="AlertCircle"
                          message="Your contacts could not be opened. Try again, or add the customer with New."
                          tone="warning"
                          actionLabel="Try again"
                          onActionPress={() => void contactPick.pick()}
                        />
                      )}
                    </View>
                  ) : null}
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
        accessibilityLabel="Search all customers"
        onChangeText={setCustomerSearch}
        placeholder="Search all customers"
        alwaysShowSearch
        localSearch
        maxLength={160}
        totalCount={0}
        value={customerSearch}
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
