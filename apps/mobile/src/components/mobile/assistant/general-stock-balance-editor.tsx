import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useTRPC } from "@/trpc/client"
import {
  freshShownRead,
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import { getCurrencySymbol } from "@ewatrade/utils"
import type { StockCategoryDraft } from "@ewatrade/utils/inventory-categories"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { FormField } from "../form-field"
import { StockCategoriesInput } from "../stock-intake/stock-categories-input"
import {
  StockBlocked,
  StockChoice,
  type StockEditorProps,
  StockQuantityField,
  StockReadNotice,
  StockReasonField,
  StockSheet,
  StockSourceCard,
  stockReadOptions,
  stockReadState,
  useStockField,
  useStockSaveFence,
} from "./general-stock-editor-parts"
import {
  nativeStockBalance,
  nativeStockEnteredUnit,
} from "./native-stock-state"
import {
  type NativeStockAction,
  nativeStockAdjust,
  nativeStockCostInput,
  nativeStockReceive,
} from "./native-stock-values"

type Receive = Extract<NativeStockAction, { action: "stock_receive" }>
type Adjust = Extract<NativeStockAction, { action: "stock_adjust" }>

/** Receive and adjust: the balance and entered unit stay as drafted. */
export function GeneralStockBalanceEditor({
  initial,
  scope,
  currencyCode,
  disabled,
  onSave,
}: StockEditorProps<Receive | Adjust>) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const balanceQuery = useQuery(
    mountOwnedRead(
      trpc.inventory.balanceSource.queryOptions(
        { storeId: scope.storeId, balanceSourceId: initial.balanceSourceId },
        stockReadOptions,
      ),
      mount,
    ),
  )
  const balanceRead = freshShownRead(balanceQuery)
  const balance =
    balanceRead.state === "ready"
      ? nativeStockBalance(balanceRead.data, {
          storeId: scope.storeId,
          balanceSourceId: initial.balanceSourceId,
        })
      : null
  const unitsQuery = useQuery(
    mountOwnedRead(
      trpc.catalog.listUnitConfigurations.queryOptions(
        { productId: balance?.productId ?? "" },
        { ...stockReadOptions, enabled: Boolean(balance) },
      ),
      mount,
    ),
  )
  const unitsRead = freshShownRead(unitsQuery)
  const unit =
    balance && unitsRead.state === "ready"
      ? nativeStockEnteredUnit(
          unitsRead.data,
          balance,
          initial.enteredInventoryUnitId,
        )
      : null
  const state = stockReadState([
    balanceRead.state,
    balanceRead.state === "ready" && !balance ? "ready" : unitsRead.state,
  ])
  const blocked =
    state !== "ready"
      ? null
      : !balance
        ? "This stock source is unavailable in the current Store. Ask in chat for a fresh draft."
        : balance.custodyType !== "STORE"
          ? "This stock is not in Store custody, so it can't be received or adjusted here."
          : !unit
            ? "The drafted unit is no longer part of this item's current unit setup. Ask in chat for a fresh draft."
            : null
  const ready = state === "ready" && !blocked && balance && unit
  const busy = disabled || !ready

  const [quantity, setQuantity, quantityLive] = useStockField(
    initial.enteredQuantity,
  )
  const [effectiveAt, setEffectiveAt, effectiveAtLive] = useStockField(
    initial.effectiveAt ?? "",
  )
  const [reason, setReason, reasonLive] = useStockField(initial.reason)
  const [categories, setCategories, categoriesLive] = useStockField<
    StockCategoryDraft[]
  >(initial.categories?.map(({ name }) => ({ name })) ?? [])
  const [pendingCategory, setPendingCategory, pendingCategoryLive] =
    useStockField("")
  const [source, setSource, sourceLive] = useStockField(
    initial.action === "stock_receive" ? initial.source : "",
  )
  const [supplier, setSupplier, supplierLive] = useStockField(
    initial.action === "stock_receive" ? (initial.supplierName ?? "") : "",
  )
  const [unitCost, setUnitCost, unitCostLive] = useStockField(
    initial.action === "stock_receive"
      ? nativeStockCostInput(initial.unitCostMinor)
      : "",
  )
  const [direction, setDirection, directionLive] = useStockField(
    initial.action === "stock_adjust" ? initial.direction : "increase",
  )
  const [purpose, setPurpose, purposeLive] = useStockField(
    initial.action === "stock_adjust" ? initial.purpose : "adjustment",
  )
  const [error, setError] = useState<string | null>(null)
  const edit =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value)
      setError(null)
    }

  const fence = useStockSaveFence(!busy)
  function save() {
    const quantity = quantityLive.current
    const effectiveAt = effectiveAtLive.current
    const reason = reasonLive.current
    const categories = categoriesLive.current
    const pendingCategory = pendingCategoryLive.current
    const source = sourceLive.current
    const supplier = supplierLive.current
    const unitCost = unitCostLive.current
    const direction = directionLive.current
    const purpose = purposeLive.current
    if (busy || !unit) return
    const result =
      initial.action === "stock_receive"
        ? nativeStockReceive(
            initial,
            {
              quantity,
              source,
              supplier,
              unitCost,
              categories,
              pendingCategory,
              effectiveAt,
              reason,
            },
            { scale: unit.scale },
          )
        : nativeStockAdjust(
            initial,
            {
              quantity,
              direction,
              purpose,
              categories,
              pendingCategory,
              effectiveAt,
              reason,
            },
            { scale: unit.scale },
          )
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    onSave(result.payload)
  }

  const receive = initial.action === "stock_receive"
  return (
    <StockSheet
      intro={
        receive
          ? "Uses the stock source and unit shown in the review. Save changes to review the conversion and new balance again."
          : "Update the adjustment details, then review the resulting stock and cost before confirming."
      }
      fixedNote="The stock source and unit stay as reviewed. Ask in chat to change them."
      error={error}
      saveDisabled={busy}
      onSave={fence(save)}
    >
      {state !== "ready" ? (
        <StockReadNotice
          state={state}
          checking="Checking the current stock source and unit…"
          refused="This stock source can't be read with your current Store access."
          retryLabel="Retry stock source"
          disabled={disabled}
          onRetry={() => {
            void balanceQuery.refetch()
            if (balance) void unitsQuery.refetch()
          }}
        />
      ) : blocked ? (
        <StockBlocked>{blocked}</StockBlocked>
      ) : ready ? (
        <>
          <StockSourceCard
            label="Fixed stock source"
            balance={balance}
            unit={unit}
            checkedAt={balanceQuery.dataUpdatedAt}
          />
          {receive ? null : (
            <View
              className="gap-2"
              accessibilityRole="radiogroup"
              accessibilityLabel="Adjustment purpose"
            >
              <StockChoice
                label="Adjustment"
                selected={purpose === "adjustment"}
                disabled={busy}
                onPress={() => edit(setPurpose)("adjustment")}
              />
              <StockChoice
                label="Waste or loss (always removes stock)"
                selected={purpose === "waste"}
                disabled={busy}
                onPress={() => {
                  edit(setPurpose)("waste")
                  setDirection("decrease")
                }}
              />
            </View>
          )}
          {receive || purpose === "waste" ? null : (
            <View
              className="gap-2"
              accessibilityRole="radiogroup"
              accessibilityLabel="Direction"
            >
              <StockChoice
                label="Add stock"
                selected={direction === "increase"}
                disabled={busy}
                onPress={() => edit(setDirection)("increase")}
              />
              <StockChoice
                label="Remove stock"
                selected={direction === "decrease"}
                disabled={busy}
                onPress={() => edit(setDirection)("decrease")}
              />
            </View>
          )}
          <StockQuantityField
            label={receive ? "Quantity received" : "Quantity"}
            value={quantity}
            scale={unit.scale}
            editable={!busy}
            onChange={edit(setQuantity)}
          />
          {receive ? (
            <>
              <FormField
                label="Source or delivery reference"
                value={source}
                editable={!busy}
                maxLength={80}
                onChangeText={edit(setSource)}
              />
              <FormField
                label="Supplier name (optional)"
                value={supplier}
                editable={!busy}
                maxLength={160}
                helper="Saved as receipt text, sharing 500 characters with the reason. Supplier accounts, purchases and payments are separate."
                onChangeText={edit(setSupplier)}
              />
            </>
          ) : null}
          <StockCategoriesInput
            value={categories}
            input={pendingCategory}
            disabled={busy}
            onChange={edit(setCategories)}
            onInputChange={edit(setPendingCategory)}
          />
          {receive ? null : (
            <Text className="text-xs text-muted-foreground">
              Adjustments need at least one category.
            </Text>
          )}
          <FormField
            label="Effective time (UTC, optional)"
            value={effectiveAt}
            editable={!busy}
            maxLength={40}
            autoCapitalize="characters"
            placeholder="2026-10-15T09:00:00Z"
            helper="An exact UTC time with seconds, ending in Z. Clear it and the new review sets the time."
            onChangeText={edit(setEffectiveAt)}
          />
          {receive ? (
            // Raw text on purpose: the shared money field normalizes and
            // truncates input, but an exact cost must be validated as typed.
            <FormField
              label="Reported cost per entered unit (optional)"
              value={unitCost}
              editable={!busy}
              keyboardType="decimal-pad"
              leadingText={getCurrencySymbol(currencyCode)}
              maxLength={20}
              helper="Leave blank when unknown; 0 means it cost nothing. This records a cost snapshot, not a purchase or payment."
              onChangeText={edit(setUnitCost)}
            />
          ) : null}
          <StockReasonField
            value={reason}
            editable={!busy}
            onChange={edit(setReason)}
          />
        </>
      ) : null}
    </StockSheet>
  )
}
