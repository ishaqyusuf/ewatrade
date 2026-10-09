import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { catalogAvatarTint } from "@/components/mobile/catalog/catalog-shelf-model"
import type { OfferingRow } from "@/components/mobile/create-sale/create-sale-model"
import type { SaleStepViewProps } from "@/components/mobile/create-sale/create-sale-presentation"
import {
  saleItemsLabel,
  saleUnitCount,
} from "@/components/mobile/create-sale/sale-unit-count"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { saleOfferingTitle } from "@/components/mobile/sale-item-picker"
import { getSaleOfferingStockLabel } from "@/components/mobile/sale-item-picker-model"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { cn } from "@/lib/utils"
import { formatMinorMoney } from "@ewatrade/utils"
import { searchMatch } from "@ewatrade/utils/search-rank"
import { useState } from "react"
import { Text as NativeText, TextInput } from "react-native"
import type { ScrollViewProps } from "react-native"
import { FlatList } from "react-native-css/components/FlatList"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"
import { ClassicSelectedOrderLine } from "./create-sale"

const money = (minor: number, currency: string) =>
  formatMinorMoney(minor, currency).replace(/\.00(?=\D*$)/, "")

type Entry =
  | { type: "label"; key: string; title: string; count: number; first: boolean }
  | {
      type: "line"
      key: string
      lineId: string
      offering: OfferingRow
      quantity: string
      first: boolean
      last: boolean
    }
  | {
      type: "choice"
      key: string
      offering: OfferingRow
      first: boolean
      last: boolean
    }

/**
 * Step 1, owner revision (9 Oct 2026): every sellable item with inline Add and
 * quantity; items in the sale move to the top. Search sits at the bottom with
 * the sale total above it and a round Next button beside it; the total hides
 * while the search is focused so the keyboard leaves room for the list.
 */
export function ClassicSaleItems({
  model,
  actionsHeight,
  onActionsHeightChange: setActionsHeight,
}: SaleStepViewProps) {
  const colors = useColors()
  const [searchFocused, setSearchFocused] = useState(false)
  const {
    itemKind,
    isOffline,
    error,
    paymentMethod,
    selectedLines,
    selectedRows,
    selectedCustomer,
    setFocusedQuantityId,
    totalMinor,
    currencyCode,
    updateQuantity,
    removeOffering,
    addOffering,
    proceedToCustomer,
    canUndoQuickFill,
    fillDraft,
    undoFill,
    choicesLoading,
    choicesError,
    retryChoices,
    allRows,
    productSearch,
    setProductSearch,
    fetchNextChoices,
  } = model
  const search = productSearch.trim()
  const matches = (offering: OfferingRow) =>
    !search ||
    (searchMatch(search, [
      { text: offering.itemName },
      { text: offering.displayName, weight: 0.9 },
      { text: offering.offeringName, weight: 0.9 },
      { text: offering.unitName, weight: 0.8 },
    ])?.coverage ?? 0) >= 0.5
  const lines = selectedLines.filter(
    (line): line is typeof line & { offering: OfferingRow } =>
      Boolean(line.offering) && matches(line.offering as OfferingRow),
  )
  const inSale = new Set(selectedLines.map((line) => line.offering?.id))
  const choices = allRows.filter((row) => !inSale.has(row.id))
  const entries: Entry[] = []
  if (lines.length) {
    entries.push({
      type: "label",
      key: "label:sale",
      title: "IN THIS SALE",
      count: lines.length,
      first: true,
    })
    lines.forEach((line, index) =>
      entries.push({
        type: "line",
        key: line.id,
        lineId: line.id,
        offering: line.offering,
        quantity: line.quantity,
        first: index === 0,
        last: index === lines.length - 1,
      }),
    )
  }
  if (choices.length) {
    entries.push({
      type: "label",
      key: "label:more",
      title: lines.length ? "MORE ITEMS" : "ALL ITEMS",
      count: choices.length,
      first: !lines.length,
    })
    choices.forEach((offering, index) =>
      entries.push({
        type: "choice",
        key: offering.id,
        offering,
        first: index === 0,
        last: index === choices.length - 1,
      }),
    )
  }
  const canContinue = selectedRows.length > 0 && !model.actionsLocked
  const unitCount = saleUnitCount(selectedRows.map((row) => row.quantity))

  return (
    <View className="flex-1">
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
        data={entries}
        keyExtractor={(entry) => entry.key}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        onEndReached={fetchNextChoices}
        onEndReachedThreshold={0.35}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View className="gap-3 pb-1">
            {isOffline ? (
              <StatusBanner
                icon="Wind"
                message="Pending sync. Items, prices and stock must be checked before confirmation."
                title="Offline order"
                tone="warning"
              />
            ) : null}
            {error ? (
              <StatusBanner
                icon="AlertCircle"
                message={error}
                title="Check selected items"
                tone="destructive"
              />
            ) : null}
            {choicesError ? (
              <StatusBanner
                title="Catalog could not refresh"
                message={choicesError}
                tone="warning"
                actionLabel={isOffline ? undefined : "Try again"}
                onActionPress={isOffline ? undefined : retryChoices}
              />
            ) : null}
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
        }
        ListEmptyComponent={
          <View className="items-center gap-1.5 rounded-[20px] border border-dashed border-border px-4 py-6">
            <Icon
              className="size-[22px] text-muted-foreground"
              name={search ? "Search" : "ReceiptText"}
            />
            <Text className="text-center text-sm font-bold text-foreground">
              {choicesLoading
                ? "Loading Catalog"
                : search
                  ? `No items match “${productSearch.trim()}”`
                  : "Nothing to sell yet"}
            </Text>
            <Text className="text-center text-xs text-muted-foreground">
              {choicesLoading
                ? "Loading available products and services."
                : search
                  ? "Check the spelling, or search by unit."
                  : "Items need a selling price and available stock in this store. Ask an owner to check the catalog."}
            </Text>
          </View>
        }
        renderItem={({ item: entry }) =>
          entry.type === "label" ? (
            <View
              className={cn(
                "flex-row items-baseline justify-between pb-2",
                entry.first ? "pt-1" : "pt-[18px]",
              )}
            >
              <Text className="text-xs font-extrabold tracking-[0.3px] text-muted-foreground">
                {entry.title}
              </Text>
              <Text className="text-xs font-extrabold tabular-nums text-muted-foreground">
                {entry.count}
              </Text>
            </View>
          ) : entry.type === "line" ? (
            <ClassicSelectedOrderLine
              disabled={model.actionsLocked}
              offering={entry.offering}
              onQuantityBlur={() =>
                setFocusedQuantityId((current) =>
                  current === entry.lineId ? null : current,
                )
              }
              onQuantityChange={(value) => updateQuantity(entry.lineId, value)}
              onQuantityFocus={() => setFocusedQuantityId(entry.lineId)}
              onRemove={() => removeOffering(entry.lineId)}
              position={{ first: entry.first, last: entry.last }}
              quantity={entry.quantity}
            />
          ) : (
            <SaleChoiceRow
              disabled={model.actionsLocked}
              first={entry.first}
              last={entry.last}
              offering={entry.offering}
              onAdd={() => addOffering(entry.offering)}
            />
          )
        }
      />
      <BottomSearchFooter
        variant="action-bar"
        onHeightChange={setActionsHeight}
        accessibilityLabel="Order actions"
        onChangeText={() => undefined}
        placeholder=""
        searchVisible={false}
        totalCount={0}
        value=""
      >
        <View className="gap-2.5">
          {searchFocused ? null : (
            <View className="flex-row items-end justify-between gap-3">
              <View className="min-w-0 shrink">
                <Text className="text-[11px] font-bold text-muted-foreground">
                  Sale total
                </Text>
                <Text className="text-[12.5px] font-bold text-muted-foreground">
                  {selectedRows.length
                    ? saleItemsLabel(selectedRows.length, unitCount)
                    : "Add the first item"}
                </Text>
              </View>
              <Text className="text-2xl font-extrabold tabular-nums tracking-tight text-foreground">
                {money(totalMinor, currencyCode)}
              </Text>
            </View>
          )}
          <View className="flex-row items-center gap-2.5">
            <View
              style={{
                alignItems: "center",
                backgroundColor: searchFocused ? colors.card : colors.muted,
                borderColor: searchFocused ? colors.primary : "transparent",
                borderRadius: 16,
                borderWidth: 1.5,
                flex: 1,
                flexDirection: "row",
                gap: 8,
                height: 50,
                paddingLeft: 14,
                paddingRight: 8,
              }}
            >
              <Icon
                className="size-[18px] text-muted-foreground"
                name="Search"
              />
              <TextInput
                accessibilityLabel="Search items"
                autoCapitalize="none"
                autoCorrect={false}
                maxFontSizeMultiplier={1.3}
                onBlur={() => setSearchFocused(false)}
                onChangeText={setProductSearch}
                onFocus={() => setSearchFocused(true)}
                placeholder={
                  itemKind === "service" ? "Search services" : "Search items"
                }
                placeholderTextColor={colors.mutedForeground}
                returnKeyType="search"
                selectionColor={colors.primary}
                style={{
                  color: colors.foreground,
                  flex: 1,
                  fontSize: 15,
                  height: "100%",
                  padding: 0,
                }}
                value={productSearch}
              />
              {productSearch ? (
                <Pressable
                  accessibilityLabel="Clear search"
                  accessibilityRole="button"
                  className="size-[30px] items-center justify-center rounded-full bg-border"
                  hitSlop={8}
                  onPress={() => setProductSearch("")}
                >
                  <Icon className="size-[13px] text-foreground" name="X" />
                </Pressable>
              ) : null}
            </View>
            <Pressable
              accessibilityLabel="Next: customer"
              accessibilityRole="button"
              accessibilityState={{ disabled: !canContinue }}
              disabled={!canContinue}
              haptic
              onPress={proceedToCustomer}
              style={{
                alignItems: "center",
                backgroundColor: canContinue ? colors.primary : colors.muted,
                borderRadius: 999,
                height: 52,
                justifyContent: "center",
                width: 52,
              }}
              testID="sale-next-step"
            >
              <Icon
                className="size-[22px]"
                color={
                  canContinue
                    ? colors.primaryForeground
                    : colors.mutedForeground
                }
                name="ChevronRight"
              />
            </Pressable>
          </View>
        </View>
      </BottomSearchFooter>
    </View>
  )
}

function SaleChoiceRow({
  disabled,
  first,
  last,
  offering,
  onAdd,
}: {
  disabled: boolean
  first: boolean
  last: boolean
  offering: OfferingRow
  onAdd: () => void
}) {
  const largeText = useLargeTextLayout()
  const colors = useColors()
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const tint = catalogAvatarTint(
    offering.itemName,
    offering.kind === "service" ? "service" : "product",
  )
  const blocked = Boolean(offering.disabledReason)
  const stock = getSaleOfferingStockLabel({
    availableQuantity: offering.availableQuantity,
    kind: offering.kind,
    unitName: offering.unitName ?? offering.offeringName,
  })
  return (
    <View
      className={cn(
        "bg-card px-3.5",
        first && "rounded-t-[20px]",
        last && "rounded-b-[20px]",
      )}
    >
      <View
        className={cn(
          "min-h-[62px] gap-2.5 py-3",
          !largeText && "flex-row items-center",
          !last && "border-b border-border",
          blocked && "opacity-60",
        )}
      >
        <View
          style={{
            alignItems: "center",
            backgroundColor: palette[tint],
            borderRadius: 13,
            height: 42,
            justifyContent: "center",
            width: 42,
          }}
        >
          <NativeText
            maxFontSizeMultiplier={1.3}
            style={{
              color: palette[`${tint}Foreground`],
              fontSize: 16,
              fontWeight: "800",
            }}
          >
            {Array.from(offering.itemName.trim())[0]?.toUpperCase() ?? "?"}
          </NativeText>
        </View>
        <View className="min-w-0 flex-1">
          <Text
            numberOfLines={largeText ? undefined : 1}
            className="text-sm font-bold text-foreground"
          >
            {saleOfferingTitle(offering)}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {[
              offering.fixedPriceMinor === null
                ? "No price"
                : money(offering.fixedPriceMinor, offering.currencyCode),
              blocked ? null : stock,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
        {blocked ? (
          <View
            style={{
              backgroundColor: palette.rose,
              borderRadius: 999,
              justifyContent: "center",
              minHeight: 20,
              paddingHorizontal: 8,
            }}
          >
            <NativeText
              style={{
                color: palette.roseForeground,
                fontSize: 10.5,
                fontWeight: "700",
                includeFontPadding: false,
              }}
            >
              {offering.disabledReason}
            </NativeText>
          </View>
        ) : (
          <Pressable
            accessibilityLabel={`Add ${offering.displayName}`}
            accessibilityRole="button"
            disabled={disabled}
            haptic
            onPress={onAdd}
            style={{
              alignItems: "center",
              backgroundColor: colors.accent,
              borderRadius: 11,
              flexDirection: "row",
              gap: 4,
              height: 36,
              paddingHorizontal: 14,
            }}
          >
            <Icon
              className="size-[15px]"
              color={colors.accentForeground}
              name="Plus"
            />
            <NativeText
              style={{
                color: colors.accentForeground,
                fontSize: 13,
                fontWeight: "800",
              }}
            >
              Add
            </NativeText>
          </Pressable>
        )}
      </View>
    </View>
  )
}
