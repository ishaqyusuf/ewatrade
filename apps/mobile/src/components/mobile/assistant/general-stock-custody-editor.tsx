import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useTRPC } from "@/trpc/client"
import {
  freshShownRead,
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
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
  nativeStockCustodyChoices,
  nativeStockCustodyKind,
  nativeStockScale,
} from "./native-stock-state"
import {
  type NativeStockAction,
  nativeStockCustody,
} from "./native-stock-values"

type Custody = Extract<NativeStockAction, { action: "stock_custody_move" }>

/**
 * Store → staff assignment or staff → Store return, as drafted. Only a current
 * Store-eligible identity can be chosen; equal names stay separate choices.
 */
export function GeneralStockCustodyEditor({
  initial,
  scope,
  disabled,
  onSave,
}: StockEditorProps<Custody>) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const assign = initial.target.type === "staff"
  const balanceQuery = useQuery(
    mountOwnedRead(
      trpc.inventory.balanceSource.queryOptions(
        {
          storeId: scope.storeId,
          balanceSourceId: initial.sourceBalanceSourceId,
        },
        stockReadOptions,
      ),
      mount,
    ),
  )
  const staffQuery = useQuery(
    mountOwnedRead(
      trpc.inventory.custodyAssignees.queryOptions(
        { storeId: scope.storeId },
        { ...stockReadOptions, enabled: assign },
      ),
      mount,
    ),
  )
  const balanceRead = freshShownRead(balanceQuery)
  const staffRead = freshShownRead(staffQuery)
  const state = stockReadState(
    assign ? [balanceRead.state, staffRead.state] : [balanceRead.state],
  )
  const balance =
    balanceRead.state === "ready"
      ? nativeStockBalance(balanceRead.data, {
          storeId: scope.storeId,
          balanceSourceId: initial.sourceBalanceSourceId,
        })
      : null
  const choices =
    assign && staffRead.state === "ready"
      ? nativeStockCustodyChoices(staffRead.data, scope.storeId)
      : null
  const kind = balance
    ? nativeStockCustodyKind(
        {
          custodyType: balance.custodyType,
          custodyReferenceId: balance.custodyReferenceId ?? "",
        },
        initial.target,
      )
    : null
  const [userId, setUserId, userIdLive] = useStockField(
    initial.target.type === "staff" ? initial.target.userId : undefined,
  )
  const blocked =
    state !== "ready"
      ? null
      : !balance
        ? "This stock source is unavailable in the current Store. Ask in chat for a fresh draft."
        : !kind || "refused" in kind
          ? ((kind && "refused" in kind ? kind.refused : null) ??
            "This stock can't be moved here.")
          : assign && !choices
            ? "The staff list for this Store is unavailable."
            : null
  const busy = disabled || state !== "ready" || Boolean(blocked)
  const draftedMissing =
    assign &&
    choices &&
    initial.target.type === "staff" &&
    !choices.some(
      (row) => row.id === (initial.target as { userId: string }).userId,
    )
  const [quantity, setQuantity, quantityLive] = useStockField(initial.quantity)
  const [reason, setReason, reasonLive] = useStockField(initial.reason)
  const [error, setError] = useState<string | null>(null)

  const fence = useStockSaveFence(!busy)
  function save() {
    const userId = userIdLive.current
    const quantity = quantityLive.current
    const reason = reasonLive.current
    if (busy || !balance) return
    const result = nativeStockCustody(
      initial,
      { userId, quantity, reason },
      {
        scale: nativeStockScale(balance),
        eligibleUserIds: choices?.map((row) => row.id),
      },
    )
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    onSave(result.payload)
  }

  return (
    <StockSheet
      intro={
        assign
          ? "Choose who takes the stock and how much. The review shows Store stock, reserved and movable quantity before you confirm."
          : "Enter how much returns to the Store. The review shows the staff custody and Store stock before you confirm."
      }
      fixedNote="The stock source and direction stay as reviewed. Ask in chat to change them."
      error={error}
      saveDisabled={busy}
      onSave={fence(save)}
    >
      {state !== "ready" ? (
        <StockReadNotice
          state={state}
          checking="Checking the stock source and eligible staff…"
          refused="The stock source or staff list can't be read with your current Store access."
          retryLabel="Retry custody details"
          disabled={disabled}
          onRetry={() => {
            void balanceQuery.refetch()
            if (assign) void staffQuery.refetch()
          }}
        />
      ) : blocked ? (
        <StockBlocked>{blocked}</StockBlocked>
      ) : balance ? (
        <>
          <StockSourceCard
            label={
              assign
                ? "Fixed source · Store → staff"
                : "Fixed source · staff → Store"
            }
            balance={balance}
            unit={{
              name: balance.inventoryUnitName,
              scale: nativeStockScale(balance),
            }}
            checkedAt={balanceQuery.dataUpdatedAt}
          />
          {assign && choices ? (
            <View
              className="gap-2"
              accessibilityRole="radiogroup"
              accessibilityLabel="Staff member"
            >
              <Text className="text-sm font-medium text-foreground">
                Staff member
              </Text>
              {draftedMissing ? (
                <Text
                  accessibilityRole="alert"
                  className="text-sm text-destructive"
                >
                  The drafted staff member is not eligible in this Store now.
                  Choose someone from the current list.
                </Text>
              ) : null}
              {choices.length ? (
                choices.map((row) => (
                  <StockChoice
                    key={row.id}
                    label={row.label}
                    selected={userId === row.id}
                    disabled={busy}
                    onPress={() => {
                      setUserId(row.id)
                      setError(null)
                    }}
                  />
                ))
              ) : (
                <Text className="text-sm text-muted-foreground">
                  No staff member is eligible for stock in this Store.
                </Text>
              )}
            </View>
          ) : (
            <Text className="text-sm text-foreground">
              Returns to Store stock at {balance.storeName}.
            </Text>
          )}
          <StockQuantityField
            label="Quantity to give or return"
            value={quantity}
            scale={nativeStockScale(balance)}
            editable={!busy}
            onChange={(value) => {
              setQuantity(value)
              setError(null)
            }}
          />
          <StockReasonField
            value={reason}
            editable={!busy}
            onChange={(value) => {
              setReason(value)
              setError(null)
            }}
          />
        </>
      ) : null}
    </StockSheet>
  )
}
