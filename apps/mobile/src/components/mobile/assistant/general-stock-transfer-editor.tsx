import { Text } from "@/components/ui/text"
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
  StockCard,
  type StockEditorProps,
  StockFact,
  StockQuantityField,
  StockReadNotice,
  StockReasonField,
  StockSheet,
  StockSourceCard,
  stockCheckedAt,
  stockReadOptions,
  useStockField,
  useStockSaveFence,
} from "./general-stock-editor-parts"
import {
  nativeStockBalance,
  nativeStockScale,
  nativeStockTransferGate,
} from "./native-stock-state"
import {
  type NativeStockAction,
  nativeStockReasonOnly,
  nativeStockTransferQuantity,
} from "./native-stock-values"

type Dispatch = Extract<
  NativeStockAction,
  { action: "stock_transfer_dispatch" }
>
type Transition = Extract<
  NativeStockAction,
  { action: "stock_transfer_receive" | "stock_transfer_cancel" }
>

/** Dispatch from the active source Store. The destination stays fixed. */
export function GeneralStockDispatchEditor({
  initial,
  scope,
  disabled,
  onSave,
}: StockEditorProps<Dispatch>) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const query = useQuery(
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
  const read = freshShownRead(query)
  const balance =
    read.state === "ready"
      ? nativeStockBalance(read.data, {
          storeId: scope.storeId,
          balanceSourceId: initial.sourceBalanceSourceId,
        })
      : null
  const destination =
    initial.targetStoreId === scope.storeId
      ? undefined
      : scope.stores.find((store) => store.id === initial.targetStoreId)
  const blocked =
    read.state !== "ready"
      ? null
      : !balance
        ? "The source stock is unavailable in the current Store. Switch to the source Store or ask in chat for a fresh draft."
        : balance.custodyType !== "STORE"
          ? "Only Store stock can be sent to another Store."
          : !destination
            ? "The destination Store is unavailable with your current access."
            : null
  const busy = disabled || read.state !== "ready" || Boolean(blocked)
  const [quantity, setQuantity, quantityLive] = useStockField(initial.quantity)
  const [reason, setReason, reasonLive] = useStockField(initial.reason)
  const [error, setError] = useState<string | null>(null)

  const fence = useStockSaveFence(!busy)
  function save() {
    const quantity = quantityLive.current
    const reason = reasonLive.current
    if (busy || !balance) return
    const result = nativeStockTransferQuantity(
      initial,
      { quantity, reason },
      { scale: nativeStockScale(balance) },
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
      intro="Update the quantity to send, then review the source stock and destination before confirming. Receipt is a separate step."
      fixedNote="The source stock and destination Store stay as reviewed. Ask in chat to change them."
      error={error}
      saveDisabled={busy}
      onSave={fence(save)}
    >
      {read.state !== "ready" ? (
        <StockReadNotice
          state={read.state}
          checking="Checking the source stock…"
          refused="The source stock can't be read with your current Store access."
          retryLabel="Retry source stock"
          disabled={disabled}
          onRetry={() => void query.refetch()}
        />
      ) : blocked ? (
        <StockBlocked>{blocked}</StockBlocked>
      ) : balance && destination ? (
        <>
          <StockSourceCard
            label="Fixed source"
            balance={balance}
            unit={{
              name: balance.inventoryUnitName,
              scale: nativeStockScale(balance),
            }}
            checkedAt={query.dataUpdatedAt}
          >
            <Text className="text-sm text-foreground">
              Route: {balance.storeName} → {destination.name}
            </Text>
          </StockSourceCard>
          <StockQuantityField
            label="Quantity to send"
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

/**
 * Receipt is confirmed in the destination Store and cancellation in the
 * source Store, only while stock is in transit.
 */
export function GeneralStockTransitionEditor({
  initial,
  scope,
  disabled,
  onSave,
}: StockEditorProps<Transition>) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const query = useQuery(
    mountOwnedRead(
      trpc.inventory.transferReview.queryOptions(
        { transferId: initial.transferId, storeId: scope.storeId },
        stockReadOptions,
      ),
      mount,
    ),
  )
  const read = freshShownRead(query)
  const transfer =
    read.state === "ready" && read.data.id === initial.transferId
      ? read.data
      : null
  const gate = transfer
    ? nativeStockTransferGate(transfer, initial.action, scope.storeId)
    : null
  const receive = initial.action === "stock_transfer_receive"
  const blocked =
    read.state !== "ready"
      ? null
      : !transfer
        ? "This transfer is unavailable in the current Store."
        : gate === "not_in_transit" || !transfer.transit
          ? "Nothing is in transit on this transfer any more."
          : gate === "wrong_store"
            ? receive
              ? `Receipt is recorded in the destination Store. Switch to ${transfer.targetStore.name} to edit this draft.`
              : `Cancellation is recorded in the source Store. Switch to ${transfer.sourceStore.name} to edit this draft.`
            : null
  const busy = disabled || read.state !== "ready" || Boolean(blocked)
  const scale = transfer
    ? nativeStockScale({
        inventoryUnitTransactionScale: transfer.transactionScale,
      })
    : undefined
  const [quantity, setQuantity, quantityLive] = useStockField(
    initial.action === "stock_transfer_receive" ? initial.quantity : "",
  )
  const [reason, setReason, reasonLive] = useStockField(initial.reason)
  const [error, setError] = useState<string | null>(null)

  const fence = useStockSaveFence(!busy)
  function save() {
    const quantity = quantityLive.current
    const reason = reasonLive.current
    if (busy) return
    const result =
      initial.action === "stock_transfer_receive"
        ? nativeStockTransferQuantity(
            initial,
            { quantity, reason },
            {
              scale,
              max: transfer?.transit
                ? {
                    quantity: transfer.transit.quantity,
                    unitName: transfer.unitName,
                  }
                : undefined,
            },
          )
        : nativeStockReasonOnly(initial, { reason })
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
        receive
          ? "Enter the quantity that actually arrived. Any outstanding quantity stays in transit."
          : "Cancellation returns all remaining transit stock to the source Store. Earlier receipts remain recorded."
      }
      fixedNote="The transfer stays as reviewed. Ask in chat to choose another transfer."
      error={error}
      saveDisabled={busy}
      onSave={fence(save)}
    >
      {read.state !== "ready" ? (
        <StockReadNotice
          state={read.state}
          checking="Checking the transfer…"
          refused="This transfer can't be read from the current Store."
          retryLabel="Retry transfer"
          disabled={disabled}
          onRetry={() => void query.refetch()}
        />
      ) : blocked ? (
        <StockBlocked>{blocked}</StockBlocked>
      ) : transfer?.transit ? (
        <>
          <StockCard>
            <Text className="text-xs text-muted-foreground">
              Fixed transfer · fresh read · checked{" "}
              {stockCheckedAt(query.dataUpdatedAt)}
            </Text>
            <Text className="text-lg font-bold text-foreground">
              {transfer.productName}
              {transfer.variantName ? ` · ${transfer.variantName}` : ""}
            </Text>
            <Text className="text-sm text-foreground">
              {transfer.sourceStore.name} → {transfer.targetStore.name}
            </Text>
            <StockFact
              title="In transit"
              value={`${transfer.transit.quantity} ${transfer.unitName} of ${transfer.dispatchedQuantity} dispatched`}
            />
            <StockFact
              title="Reserved in transit"
              value={transfer.transit.reserved}
            />
          </StockCard>
          {receive ? (
            <StockQuantityField
              label="Quantity received"
              value={quantity}
              scale={scale}
              editable={!busy}
              helper={`Up to ${transfer.transit.quantity} ${transfer.unitName}; exact quantity.`}
              onChange={(value) => {
                setQuantity(value)
                setError(null)
              }}
            />
          ) : (
            <Text className="text-sm text-foreground">
              Returns {transfer.transit.quantity} {transfer.unitName} to{" "}
              {transfer.sourceStore.name}.
            </Text>
          )}
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
