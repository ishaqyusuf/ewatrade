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
  stockCheckedAt,
  stockCustodyText,
  stockReadOptions,
  useStockField,
  useStockSaveFence,
} from "./general-stock-editor-parts"
import { nativeStockScale } from "./native-stock-state"
import {
  type NativeStockAction,
  nativeStockCorrect,
} from "./native-stock-values"

type Correct = Extract<NativeStockAction, { action: "stock_correct" }>

/**
 * One replacement per original movement. Units, factors and scales come from
 * the saved operation's own snapshots; the server preview decides eligibility.
 */
export function GeneralStockCorrectEditor({
  initial,
  scope,
  disabled,
  onSave,
}: StockEditorProps<Correct>) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const query = useQuery(
    mountOwnedRead(
      trpc.inventory.operationAudit.queryOptions(
        { operationId: initial.targetOperationId, storeId: scope.storeId },
        stockReadOptions,
      ),
      mount,
    ),
  )
  const read = freshShownRead(query)
  const operation =
    read.state === "ready" &&
    read.data?.id === initial.targetOperationId &&
    read.data.storeId === scope.storeId
      ? read.data
      : null
  const movements = operation
    ? initial.corrections.map((entry) =>
        operation.movements.find((row) => row.id === entry.movementId),
      )
    : []
  const complete = Boolean(operation) && movements.every(Boolean)
  const [quantities, setQuantities, quantitiesLive] = useStockField(
    initial.corrections.map((entry) => entry.correctedEnteredQuantity),
  )
  const [reason, setReason, reasonLive] = useStockField(initial.reason)
  const [error, setError] = useState<string | null>(null)
  const busy = disabled || !complete

  const fence = useStockSaveFence(!busy)
  function save() {
    const quantities = quantitiesLive.current
    const reason = reasonLive.current
    if (busy) return
    const result = nativeStockCorrect(
      initial,
      { quantities, reason },
      movements.map((row) =>
        row
          ? nativeStockScale({
              inventoryUnitTransactionScale: row.transactionScaleSnapshot,
            })
          : undefined,
      ),
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
      intro="Update replacement quantities for the original movements. Their units and conversion factors remain as reviewed."
      fixedNote="The original operation stays in history. Ask in chat to correct a different operation."
      error={error}
      saveDisabled={busy}
      onSave={fence(save)}
    >
      {read.state !== "ready" ? (
        <StockReadNotice
          state={read.state}
          checking="Checking the original stock operation…"
          refused="The original stock operation can't be read with your current Store access."
          retryLabel="Retry original operation"
          disabled={disabled}
          onRetry={() => void query.refetch()}
        />
      ) : !operation ? (
        <StockBlocked>
          The original stock operation is unavailable in the current Store.
        </StockBlocked>
      ) : !complete ? (
        <StockBlocked>
          The original operation no longer has every drafted movement. Ask in
          chat for a fresh correction.
        </StockBlocked>
      ) : (
        <>
          <StockCard>
            <Text className="text-xs text-muted-foreground">
              Original operation · fresh read · checked{" "}
              {stockCheckedAt(query.dataUpdatedAt)}
            </Text>
            <StockFact
              title="Type"
              value={operation.type.toLowerCase().replaceAll("_", " ")}
            />
            <StockFact
              title="Original reason"
              value={operation.reason ?? "No reason recorded"}
            />
          </StockCard>
          {movements.map((row, index) =>
            row ? (
              <StockCard key={row.id}>
                <Text className="font-medium text-foreground">
                  {row.productName}
                  {row.variantName ? ` · ${row.variantName}` : ""}
                </Text>
                <Text className="text-sm text-muted-foreground">
                  {stockCustodyText(row.custodyType)} · original{" "}
                  {row.enteredQuantity} {row.enteredInventoryUnitName} · factor{" "}
                  {row.unitFactorSnapshot}
                </Text>
                <StockQuantityField
                  label={`Replacement quantity · ${row.enteredInventoryUnitName}`}
                  value={quantities[index] ?? ""}
                  scale={nativeStockScale({
                    inventoryUnitTransactionScale: row.transactionScaleSnapshot,
                  })}
                  editable={!busy}
                  onChange={(value) => {
                    setQuantities((current) =>
                      current.map((entry, position) =>
                        position === index ? value : entry,
                      ),
                    )
                    setError(null)
                  }}
                />
              </StockCard>
            ) : null,
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
      )}
    </StockSheet>
  )
}
