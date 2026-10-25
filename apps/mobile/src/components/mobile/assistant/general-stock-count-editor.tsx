import { Text } from "@/components/ui/text"
import { useTRPC } from "@/trpc/client"
import {
  freshShownRead,
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import { useQueries, useQuery } from "@tanstack/react-query"
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
  nativeStockCountCreate,
  nativeStockReasonOnly,
} from "./native-stock-values"

type CountCreate = Extract<NativeStockAction, { action: "stock_count_create" }>
type CountFinalize = Extract<
  NativeStockAction,
  { action: "stock_count_finalize" }
>

/** Physical observations, zero included. Sources and units stay fixed. */
export function GeneralStockCountCreateEditor({
  initial,
  scope,
  disabled,
  onSave,
}: StockEditorProps<CountCreate>) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const balanceQueries = useQueries({
    queries: initial.lines.map((line) =>
      mountOwnedRead(
        trpc.inventory.balanceSource.queryOptions(
          { storeId: scope.storeId, balanceSourceId: line.balanceSourceId },
          stockReadOptions,
        ),
        mount,
      ),
    ),
  })
  const balanceReads = balanceQueries.map((query) => freshShownRead(query))
  const balances = balanceReads.map((read, index) =>
    read.state === "ready"
      ? nativeStockBalance(read.data, {
          storeId: scope.storeId,
          balanceSourceId: initial.lines[index]?.balanceSourceId ?? "",
        })
      : null,
  )
  const balancesState = stockReadState(balanceReads.map((read) => read.state))
  const balancesReady = balancesState === "ready" && balances.every(Boolean)
  const productIds = balancesReady
    ? [...new Set(balances.map((row) => row?.productId ?? ""))]
    : []
  const unitQueries = useQueries({
    queries: productIds.map((productId) =>
      mountOwnedRead(
        trpc.catalog.listUnitConfigurations.queryOptions(
          { productId },
          stockReadOptions,
        ),
        mount,
      ),
    ),
  })
  const unitReads = unitQueries.map((query) => freshShownRead(query))
  const state =
    balancesState === "ready" && balancesReady
      ? stockReadState(unitReads.map((read) => read.state))
      : balancesState
  const units = initial.lines.map((line, index) => {
    const balance = balances[index]
    const read = unitReads[productIds.indexOf(balance?.productId ?? "")]
    return line.entries.map((entry) =>
      balance && read?.state === "ready"
        ? nativeStockEnteredUnit(
            read.data,
            balance,
            entry.enteredInventoryUnitId,
          )
        : null,
    )
  })
  const blocked =
    state !== "ready"
      ? null
      : !balancesReady
        ? "A counted stock source is unavailable in the current Store. Ask in chat for a fresh count."
        : units.some((line) => line.some((unit) => !unit))
          ? "A counted unit is no longer part of its item's current unit setup. Ask in chat for a fresh count."
          : null
  const busy = disabled || state !== "ready" || Boolean(blocked)

  const [quantities, setQuantities, quantitiesLive] = useStockField(
    initial.lines.map((line) =>
      line.entries.map((entry) => entry.enteredQuantity),
    ),
  )
  const [reason, setReason, reasonLive] = useStockField(initial.reason)
  const [error, setError] = useState<string | null>(null)

  const fence = useStockSaveFence(!busy)
  function save() {
    const quantities = quantitiesLive.current
    const reason = reasonLive.current
    if (busy) return
    const result = nativeStockCountCreate(
      initial,
      { quantities, reason },
      units.map((line) => line.map((unit) => unit?.scale)),
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
      intro="Enter what you physically counted, including zero. Saving observations does not adjust stock."
      fixedNote="The stock sources and units stay as shown in the review. Ask in chat to count something else."
      error={error}
      saveDisabled={busy}
      onSave={fence(save)}
    >
      {state !== "ready" ? (
        <StockReadNotice
          state={state}
          checking="Checking the current stock sources and units…"
          refused="A counted stock source can't be read with your current Store access."
          retryLabel="Retry stock sources"
          disabled={disabled}
          onRetry={() => {
            for (const query of [...balanceQueries, ...unitQueries])
              void query.refetch()
          }}
        />
      ) : blocked ? (
        <StockBlocked>{blocked}</StockBlocked>
      ) : (
        <>
          {initial.lines.map((line, lineIndex) => {
            const balance = balances[lineIndex]
            if (!balance) return null
            return (
              <StockCard key={line.balanceSourceId}>
                <Text className="font-medium text-foreground">
                  {balance.productName}
                  {balance.variantName ? ` · ${balance.variantName}` : ""}
                </Text>
                <Text className="text-sm text-muted-foreground">
                  {stockCustodyText(balance.custodyType)} · on hand{" "}
                  {balance.onHandQuantity} {balance.inventoryUnitName} ·
                  reserved {balance.reservedQuantity}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  Fresh read · checked{" "}
                  {stockCheckedAt(
                    balanceQueries[lineIndex]?.dataUpdatedAt ?? 0,
                  )}
                </Text>
                {line.entries.map((entry, entryIndex) => {
                  const unit = units[lineIndex]?.[entryIndex]
                  return (
                    <StockQuantityField
                      key={`${entry.enteredInventoryUnitId}:${entryIndex}`}
                      label={`Counted · ${unit?.name ?? "unit"}`}
                      value={quantities[lineIndex]?.[entryIndex] ?? ""}
                      scale={unit?.scale}
                      editable={!busy}
                      onChange={(value) => {
                        setQuantities((current) =>
                          current.map((row, position) =>
                            position === lineIndex
                              ? row.map((cell, cellPosition) =>
                                  cellPosition === entryIndex ? value : cell,
                                )
                              : row,
                          ),
                        )
                        setError(null)
                      }}
                    />
                  )
                })}
              </StockCard>
            )
          })}
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

/** Finalizing keeps the saved observations; only the reason is edited. */
export function GeneralStockCountFinalizeEditor({
  initial,
  scope,
  disabled,
  onSave,
}: StockEditorProps<CountFinalize>) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const query = useQuery(
    mountOwnedRead(
      trpc.inventory.stockCountReview.queryOptions(
        { stockCountId: initial.stockCountId, storeId: scope.storeId },
        stockReadOptions,
      ),
      mount,
    ),
  )
  const read = freshShownRead(query)
  const count =
    read.state === "ready" &&
    read.data.id === initial.stockCountId &&
    read.data.storeId === scope.storeId
      ? read.data
      : null
  const finalizable = count?.status === "DRAFT" && count.canFinalize
  const [reason, setReason, reasonLive] = useStockField(initial.reason)
  const [error, setError] = useState<string | null>(null)
  const busy = disabled || !finalizable

  const fence = useStockSaveFence(!busy)
  function save() {
    const reason = reasonLive.current
    if (busy) return
    const result = nativeStockReasonOnly(initial, { reason })
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    onSave(result.payload)
  }

  return (
    <StockSheet
      intro="This finalizes the saved observations. To change a quantity, create a fresh count instead."
      error={error}
      saveDisabled={busy}
      onSave={fence(save)}
    >
      {read.state !== "ready" ? (
        <StockReadNotice
          state={read.state}
          checking="Checking the saved stock count…"
          refused="The saved stock count can't be read with your current Store access."
          retryLabel="Retry stock count"
          disabled={disabled}
          onRetry={() => void query.refetch()}
        />
      ) : !count ? (
        <StockBlocked>
          The saved stock count is unavailable in the current Store.
        </StockBlocked>
      ) : !finalizable ? (
        <StockBlocked>
          {count.status === "DRAFT"
            ? "This count is no longer current: stock or units changed since it was saved. Create a fresh count instead."
            : `This count is already ${count.status.toLowerCase()}.`}
        </StockBlocked>
      ) : (
        <>
          <StockCard>
            <Text className="text-xs text-muted-foreground">
              Saved count · fresh read · checked{" "}
              {stockCheckedAt(query.dataUpdatedAt)}
            </Text>
            {count.lines.map((line) => (
              <StockFact
                key={line.id}
                title={`${line.productName}${line.variantName ? ` · ${line.variantName}` : ""}`}
                value={`System ${line.expectedQuantity} · counted ${line.observedQuantity} · variance ${line.varianceQuantity} ${line.unitName}`}
              />
            ))}
          </StockCard>
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
