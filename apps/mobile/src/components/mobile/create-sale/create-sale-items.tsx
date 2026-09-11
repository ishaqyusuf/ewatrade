import { ActionButton } from "@/components/mobile/action-button"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { EmptyState } from "@/components/mobile/empty-state"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { cn } from "@/lib/utils"
import { formatMinorMoney } from "@ewatrade/utils"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import { FlatList } from "react-native-css/components/FlatList"
import { View } from "react-native"
import type { ScrollViewProps } from "react-native"
import type { SaleStepViewProps } from "./create-sale-presentation"
import { useSalePresentation } from "./use-sale-presentation"

export function CreateSaleItems({
  model,
  appearance,
  actionsHeight,
  onActionsHeightChange: setActionsHeight,
}: SaleStepViewProps) {
  const {
    market,
    palette,
    tone,
    largeText,
    SaleStageHeader,
    SelectedOrderLine,
  } = useSalePresentation(appearance)
  const {
    itemKind,
    isOffline,
    error,
    paymentMethod,
    selectedLines,
    selectedRows,
    selectedCustomer,
    focusedQuantityId,
    setFocusedQuantityId,
    totalMinor,
    currencyCode,
    updateQuantity,
    removeOffering,
    openItemPicker,
    proceedToCustomer,
    canUndoQuickFill,
    fillDraft,
    undoFill,
    choicesLoading,
    choicesError,
    retryChoices,
  } = model
  const itemsHeader = (
    <View>
      <SaleStageHeader
        current={1}
        description="Build the order one item at a time, then enter the quantity for each selection."
        title={itemKind === "service" ? "New service order" : "New order"}
      />
      {isOffline ? (
        <View className={tone("pb-4")}>
          <StatusBanner
            icon="Wind"
            message="The order will be provisional until its Offering, price, configuration, and balance snapshots are accepted during sync."
            title="Offline order"
            tone="warning"
          />
        </View>
      ) : null}
      {error ? (
        <View className={tone("pb-4")}>
          <StatusBanner
            icon="AlertCircle"
            message={error}
            title="Check selected items"
            tone="destructive"
          />
        </View>
      ) : null}
      {choicesError ? (
        <View className="pb-4">
          <StatusBanner
            title="Catalog could not refresh"
            message={choicesError}
            tone="warning"
            actionLabel={isOffline ? undefined : "Try again"}
            onActionPress={isOffline ? undefined : retryChoices}
          />
        </View>
      ) : null}
      <View className={tone("pb-4")}>
        <QaQuickFillButton
          canUndo={canUndoQuickFill}
          formId="mobile.order.create"
          isDirty={
            selectedLines.length > 0 ||
            Boolean(selectedCustomer) ||
            paymentMethod !== "cash"
          }
          onFill={fillDraft}
          onUndo={undoFill}
        />
      </View>
    </View>
  )

  return (
    <View className={tone("flex-1")}>
      <FlatList
        contentContainerClassName="grow px-4 pb-[var(--sale-items-bottom)]"
        renderScrollComponent={(props: ScrollViewProps) => (
          <KeyboardAwareScrollView
            {...props}
            bottomOffset={actionsHeight + 12}
            extraKeyboardSpace={0}
            disableScrollOnKeyboardHide
          />
        )}
        data={selectedLines}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        keyExtractor={(line) => line.id}
        ListEmptyComponent={
          <View className={tone("flex-1 justify-center pb-24")}>
            <EmptyState
              className={tone("bg-transparent")}
              icon="ReceiptText"
              message={
                choicesLoading
                  ? "Loading available products and services."
                  : itemKind === "service"
                    ? "Tap the + button to add a service."
                    : "Tap the + button to add a product or service."
              }
              title={choicesLoading ? "Loading Catalog" : "No items added yet"}
            />
          </View>
        }
        ListHeaderComponent={itemsHeader}
        renderItem={({ item }) => (
          <SelectedOrderLine
            disabled={model.actionsLocked}
            offering={item.offering}
            onQuantityBlur={() =>
              setFocusedQuantityId((current) =>
                current === item.id ? null : current,
              )
            }
            onQuantityChange={(value) => updateQuantity(item.id, value)}
            onQuantityFocus={() => setFocusedQuantityId(item.id)}
            onRemove={() => removeOffering(item.id)}
            quantity={item.quantity}
          />
        )}
        showsVerticalScrollIndicator={false}
        className={tone("flex-1")}
      />

      {focusedQuantityId === null ? (
        <View
          pointerEvents="box-none"
          className={tone(
            "absolute right-4 bottom-[var(--sale-fab-bottom)] z-30",
          )}
        >
          <Pressable
            accessibilityLabel={
              itemKind === "service" ? "Add service" : "Add product or service"
            }
            accessibilityRole="button"
            accessibilityState={{
              disabled: choicesLoading || model.actionsLocked,
            }}
            className={tone(
              "h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg active:bg-primary/90",
            )}
            disabled={choicesLoading || model.actionsLocked}
            haptic
            onPress={openItemPicker}
            testID="sale-add-item-fab"
            transition
          >
            <Icon
              className={tone("size-base text-primary-foreground")}
              name="Plus"
            />
          </Pressable>
        </View>
      ) : null}

      {selectedRows.length > 0 ? (
        <BottomSearchFooter
          variant={market ? "market-day" : "default"}
          onHeightChange={setActionsHeight}
          accessibilityLabel="Order actions"
          onChangeText={() => undefined}
          placeholder=""
          searchVisible={false}
          totalCount={0}
          value=""
        >
          <View
            className={cn(
              "gap-3",
              largeText ? "flex-col" : "flex-row items-center",
            )}
          >
            <View className={tone("min-w-[104px] gap-0.5")}>
              <Text
                className={tone(
                  "text-[10px] font-bold uppercase tracking-[1px] text-muted-foreground",
                )}
              >
                Total · {selectedRows.length} selected
              </Text>
              <Text className={tone("text-xl font-extrabold text-foreground")}>
                {formatMinorMoney(totalMinor, currencyCode)}
              </Text>
            </View>
            <ActionButton
              disabled={model.actionsLocked}
              foregroundColor={market ? palette.onPalm : undefined}
              className={cn(
                largeText ? "w-full" : "w-auto flex-1",
                market && "bg-market-palm active:bg-market-hero-pressed",
              )}
              onPress={proceedToCustomer}
              trailingIcon="ArrowRight"
            >
              Proceed
            </ActionButton>
          </View>
        </BottomSearchFooter>
      ) : null}
    </View>
  )
}
