import { ActionButton } from "@/components/mobile/action-button"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { catalogAvatarTint } from "@/components/mobile/catalog/catalog-shelf-model"
import { CatalogFreeSaleLines } from "@/components/mobile/create-sale/catalog-free-sale-lines"
import type { OfferingRow } from "@/components/mobile/create-sale/create-sale-model"
import type { SaleStepViewProps } from "@/components/mobile/create-sale/create-sale-presentation"
import {
  saleItemsLabel,
  saleUnitCount,
} from "@/components/mobile/create-sale/sale-unit-count"
import { FloatingSearchCaption } from "@/components/mobile/floating-search-field"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { saleOfferingTitle } from "@/components/mobile/sale-item-picker"
import { getSaleOfferingStockLabel } from "@/components/mobile/sale-item-picker-model"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useBottomSearchScroll } from "@/hooks/use-bottom-search-scroll"
import { useColorScheme, useColors } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import { itemsScrollRestore } from "@/lib/sale-step-motion"
import { cn } from "@/lib/utils"
import { formatMinorMoney } from "@ewatrade/utils"
import { searchMatch } from "@ewatrade/utils/search-rank"
import { useRef } from "react"
import { Text as NativeText } from "react-native"
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
 * quantity; items in the sale move to the top. The floating search sits at the
 * bottom with Proceed beside it and the sale total floating above (hidden while
 * typing); all of it slides away on scroll down.
 */
export function ClassicSaleItems({
  model,
  actionsHeight,
  onActionsHeightChange: setActionsHeight,
  itemsScroll,
}: SaleStepViewProps) {
  // Back to the same place in the list after Customer or Checkout.
  const listRef = useRef<{
    scrollToOffset: (params: { offset: number; animated: boolean }) => void
  } | null>(null)
  const restored = useRef(false)
  const viewport = useRef(0)
  const contentHeight = useRef(0)
  // Try once both sizes are known; either measurement can arrive last.
  const tryRestore = () => {
    if (restored.current || !itemsScroll) return
    if (!(viewport.current > 0) || !(contentHeight.current > 0)) return
    const offset = itemsScrollRestore(
      itemsScroll.current,
      contentHeight.current,
      viewport.current,
    )
    if (offset === null) return
    restored.current = true
    if (offset > 0) listRef.current?.scrollToOffset({ offset, animated: false })
  }
  const largeText = useLargeTextLayout()
  const scrollHide = useBottomSearchScroll()
  const {
    itemKind,
    isOffline,
    error,
    paymentMethod,
    selectedLines,
    selectedRows,
    selectedCustomer,
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
    catalogFreeLines,
    hasSaleLines,
    saleUnits,
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
  const canContinue = hasSaleLines && !model.actionsLocked
  const unitCount = saleUnitCount(saleUnits)
  const saleLineCount = selectedRows.length + catalogFreeLines.length

  return (
    <View className="flex-1">
      <FlatList
        ref={listRef as never}
        contentContainerClassName="grow px-4 pb-[var(--sale-items-bottom)]"
        onLayout={(event) => {
          viewport.current = event.nativeEvent.layout.height
          tryRestore()
        }}
        onContentSizeChange={(_, height) => {
          contentHeight.current = height
          tryRestore()
        }}
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
        // The person scrolling takes over from any pending restore.
        onScrollBeginDrag={() => {
          restored.current = true
        }}
        onScroll={(event) => {
          if (itemsScroll && restored.current)
            itemsScroll.current = event.nativeEvent.contentOffset.y
          scrollHide.onScroll(event)
        }}
        scrollEventThrottle={16}
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
                catalogFreeLines.length > 0 ||
                Boolean(selectedCustomer) ||
                paymentMethod !== "cash"
              }
              onFill={fillDraft}
              onUndo={undoFill}
            />
            {itemKind === "service" ? null : (
              <CatalogFreeSaleLines model={model} />
            )}
          </View>
        }
        ListEmptyComponent={
          catalogFreeLines.length && !search ? null : (
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
                  ? "Loading available goods and services."
                  : search
                    ? "Check the spelling, or search by unit."
                    : itemKind === "service"
                      ? "Items need a selling price and available stock in this store. Ask an owner to check the catalog."
                      : "No catalog yet? Tap “Type a price” to record the sale anyway."}
              </Text>
            </View>
          )
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
              onQuantityChange={(value) => updateQuantity(entry.lineId, value)}
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
        accessibilityLabel={
          itemKind === "service" ? "Search services" : "Search items"
        }
        alwaysShowSearch
        caption={
          <FloatingSearchCaption
            label={
              saleLineCount
                ? saleItemsLabel(saleLineCount, unitCount)
                : "Add the first item"
            }
            value={saleLineCount ? money(totalMinor, currencyCode) : undefined}
          />
        }
        hidden={scrollHide.hidden}
        layout={largeText ? "stacked" : "inline"}
        localSearch
        maxLength={160}
        onChangeText={setProductSearch}
        onHeightChange={setActionsHeight}
        placeholder={
          itemKind === "service" ? "Search services" : "Search items"
        }
        totalCount={0}
        value={productSearch}
      >
        <ActionButton
          accessibilityLabel="Next: customer"
          className={cn(
            largeText
              ? "w-full rounded-full"
              : "min-h-[52px] w-[132px] rounded-full",
            // Floating over the list, so a disabled Proceed stays solid.
            !canContinue && "border border-border bg-card opacity-100",
          )}
          disabled={!canContinue}
          onPress={proceedToCustomer}
          testID="sale-next-step"
          trailingIcon="ArrowRight"
        >
          Proceed
        </ActionButton>
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
                fontSize: 16,
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
                fontSize: 16,
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
