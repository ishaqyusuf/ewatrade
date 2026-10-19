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
import { nativeStockBalance, nativeStockScale } from "./native-stock-state"
import {
  type NativeStockAction,
  nativeStockCloseoutCreate,
  nativeStockReasonOnly,
} from "./native-stock-values"

type CloseoutCreate = Extract<
  NativeStockAction,
  { action: "inventory_closeout_create" }
>
type CloseoutFinalize = Extract<
  NativeStockAction,
  { action: "inventory_closeout_finalize" }
>
const custodyType = { staff: "STAFF", session: "SESSION" } as const

/**
 * Custody declarations, zero included. This is a stock custody closeout,
 * not a financial period close. Custody and sources stay fixed.
 */
export function GeneralStockCloseoutCreateEditor({
  initial,
  scope,
  disabled,
  onSave,
}: StockEditorProps<CloseoutCreate>) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const queries = useQueries({
    queries: initial.declarations.map((line) =>
      mountOwnedRead(
        trpc.inventory.balanceSource.queryOptions(
          { storeId: scope.storeId, balanceSourceId: line.balanceSourceId },
          stockReadOptions,
        ),
        mount,
      ),
    ),
  })
  const reads = queries.map((query) => freshShownRead(query))
  const balances = reads.map((read, index) =>
    read.state === "ready"
      ? nativeStockBalance(read.data, {
          storeId: scope.storeId,
          balanceSourceId: initial.declarations[index]?.balanceSourceId ?? "",
        })
      : null,
  )
  const state = stockReadState(reads.map((read) => read.state))
  const blocked =
    state !== "ready"
      ? null
      : !balances.every(Boolean)
        ? "A declared stock source is unavailable in the current Store. Ask in chat for a fresh closeout."
        : balances.some(
              (row) =>
                row?.custodyType !== custodyType[initial.custodyType] ||
                row.custodyReferenceId !== initial.custodyReferenceId,
            )
          ? "A declared stock source is no longer in this custody. Ask in chat for a fresh closeout."
          : null
  const busy = disabled || state !== "ready" || Boolean(blocked)

  const [quantities, setQuantities, quantitiesLive] = useStockField(
    initial.declarations.map((line) => line.declaredQuantity),
  )
  const [reason, setReason, reasonLive] = useStockField(initial.reason)
  const [error, setError] = useState<string | null>(null)

  const fence = useStockSaveFence(!busy)
  function save() {
    const quantities = quantitiesLive.current
    const reason = reasonLive.current
    if (busy) return
    const result = nativeStockCloseoutCreate(
      initial,
      { quantities, reason },
      balances.map((row) => (row ? nativeStockScale(row) : undefined)),
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
      intro="Enter the physical quantity, including zero, for each source. Saving declarations does not adjust stock; finalizing is a separate step."
      fixedNote="The custody and stock sources stay as reviewed. This is a stock custody closeout, not a financial period close."
      error={error}
      saveDisabled={busy}
      onSave={fence(save)}
    >
      {state !== "ready" ? (
        <StockReadNotice
          state={state}
          checking="Checking the current custody stock…"
          refused="This custody stock can't be read with your current Store access."
          retryLabel="Retry custody stock"
          disabled={disabled}
          onRetry={() => {
            for (const query of queries) void query.refetch()
          }}
        />
      ) : blocked ? (
        <StockBlocked>{blocked}</StockBlocked>
      ) : (
        <>
          <StockCard>
            <Text className="text-xs text-muted-foreground">Fixed custody</Text>
            <Text className="font-medium text-foreground">
              {stockCustodyText(custodyType[initial.custodyType])}
            </Text>
          </StockCard>
          {initial.declarations.map((line, index) => {
            const balance = balances[index]
            if (!balance) return null
            return (
              <StockCard key={line.balanceSourceId}>
                <Text className="font-medium text-foreground">
                  {balance.productName}
                  {balance.variantName ? ` · ${balance.variantName}` : ""}
                </Text>
                <Text className="text-sm text-muted-foreground">
                  Expected {balance.onHandQuantity} {balance.inventoryUnitName}{" "}
                  · reserved {balance.reservedQuantity} · checked{" "}
                  {stockCheckedAt(queries[index]?.dataUpdatedAt ?? 0)}
                </Text>
                <StockQuantityField
                  label={`Declared · ${balance.inventoryUnitName}`}
                  value={quantities[index] ?? ""}
                  scale={nativeStockScale(balance)}
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

/** Finalizing keeps the saved declarations; only the reason is edited. */
export function GeneralStockCloseoutFinalizeEditor({
  initial,
  scope,
  disabled,
  onSave,
}: StockEditorProps<CloseoutFinalize>) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const query = useQuery(
    mountOwnedRead(
      trpc.inventory.closeoutReview.queryOptions(
        { closeoutId: initial.closeoutId, storeId: scope.storeId },
        stockReadOptions,
      ),
      mount,
    ),
  )
  const read = freshShownRead(query)
  const closeout =
    read.state === "ready" &&
    read.data.id === initial.closeoutId &&
    read.data.storeId === scope.storeId
      ? read.data
      : null
  const finalizable = closeout?.status === "DRAFT" && closeout.canFinalize
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
      intro="This finalizes the saved declarations. To change a quantity, save a fresh closeout instead."
      fixedNote="This is a stock custody closeout, not a financial period close."
      error={error}
      saveDisabled={busy}
      onSave={fence(save)}
    >
      {read.state !== "ready" ? (
        <StockReadNotice
          state={read.state}
          checking="Checking the saved closeout…"
          refused="The saved closeout can't be read with your current Store access."
          retryLabel="Retry closeout"
          disabled={disabled}
          onRetry={() => void query.refetch()}
        />
      ) : !closeout ? (
        <StockBlocked>
          The saved closeout is unavailable in the current Store.
        </StockBlocked>
      ) : !finalizable ? (
        <StockBlocked>
          {closeout.status === "DRAFT"
            ? closeout.lines.some((line) => !line.preservesReservations)
              ? "A declaration is below reserved stock, so this closeout can't be finalized. Save a fresh closeout instead."
              : "This closeout is no longer current: stock changed since it was saved. Save a fresh closeout instead."
            : `This closeout is already ${closeout.status.toLowerCase()}.`}
        </StockBlocked>
      ) : (
        <>
          <StockCard>
            <Text className="text-xs text-muted-foreground">
              {stockCustodyText(closeout.custodyType)} · fresh read · checked{" "}
              {stockCheckedAt(query.dataUpdatedAt)}
            </Text>
            {closeout.lines.map((line) => (
              <StockFact
                key={line.id}
                title={`${line.productName}${line.variantName ? ` · ${line.variantName}` : ""}`}
                value={`Expected ${line.expectedQuantity} · declared ${line.declaredQuantity} · variance ${line.varianceQuantity} ${line.unitName}`}
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
