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
  stockReadOptions,
  stockReadState,
  useStockField,
  useStockSaveFence,
} from "./general-stock-editor-parts"
import {
  nativeStockBalance,
  nativeStockPackPreview,
  nativeStockScale,
} from "./native-stock-state"
import {
  type NativeStockAction,
  nativeStockTransform,
} from "./native-stock-values"

type Transform = Extract<
  NativeStockAction,
  { action: "stock_package_transform" }
>

/**
 * Only the number of source packs is edited. The preview uses the same exact
 * pack calculation as the review; the review stays final.
 */
export function GeneralStockTransformEditor({
  initial,
  scope,
  disabled,
  onSave,
}: StockEditorProps<Transform>) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const read = (balanceSourceId: string) =>
    mountOwnedRead(
      trpc.inventory.balanceSource.queryOptions(
        { storeId: scope.storeId, balanceSourceId },
        stockReadOptions,
      ),
      mount,
    )
  const sourceQuery = useQuery(read(initial.sourceBalanceSourceId))
  const targetQuery = useQuery(read(initial.targetBalanceSourceId))
  const sourceRead = freshShownRead(sourceQuery)
  const targetRead = freshShownRead(targetQuery)
  const state = stockReadState([sourceRead.state, targetRead.state])
  const source =
    sourceRead.state === "ready"
      ? nativeStockBalance(sourceRead.data, {
          storeId: scope.storeId,
          balanceSourceId: initial.sourceBalanceSourceId,
        })
      : null
  const target =
    targetRead.state === "ready"
      ? nativeStockBalance(targetRead.data, {
          storeId: scope.storeId,
          balanceSourceId: initial.targetBalanceSourceId,
        })
      : null
  const blocked =
    state !== "ready"
      ? null
      : !source || !target
        ? "A pack balance is unavailable in the current Store. Ask in chat for a fresh draft."
        : source.kind !== "PACKAGED_STOCK" ||
            target.kind !== "PACKAGED_STOCK" ||
            source.productId !== target.productId ||
            source.variantId !== target.variantId ||
            source.configurationVersionId !== target.configurationVersionId ||
            source.balanceSourceId === target.balanceSourceId
          ? "These balances are no longer two pack sizes of the same item setup."
          : null
  const busy = disabled || state !== "ready" || Boolean(blocked)
  const [sourceQuantity, setSourceQuantity, sourceQuantityLive] = useStockField(
    initial.sourceQuantity,
  )
  const [reason, setReason, reasonLive] = useStockField(initial.reason)
  const [error, setError] = useState<string | null>(null)
  const sourceScale = source ? nativeStockScale(source) : undefined
  const targetScale = target ? nativeStockScale(target) : undefined
  const typedPacks = sourceQuantity.trim()
  const preview =
    source &&
    target &&
    sourceScale !== undefined &&
    targetScale !== undefined &&
    /^\d{1,12}(\.\d{1,6})?$/.test(typedPacks) &&
    /[1-9]/.test(typedPacks)
      ? nativeStockPackPreview({
          sourceQuantity: typedPacks,
          sourceFactor: source.inventoryUnitFactor,
          sourceScale,
          targetFactor: target.inventoryUnitFactor,
          targetScale,
          sourceUnitName: source.inventoryUnitName,
          targetUnitName: target.inventoryUnitName,
        })
      : null

  const fence = useStockSaveFence(!busy)
  function save() {
    const sourceQuantity = sourceQuantityLive.current
    const reason = reasonLive.current
    if (busy) return
    const result = nativeStockTransform(
      initial,
      { sourceQuantity, reason },
      { scale: sourceScale },
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
      intro="Enter how many source packs to open. The review shows exactly what they become and both balances before you confirm. Record any loss separately."
      fixedNote="Both pack sizes stay as reviewed. Ask in chat to repack something else."
      error={error}
      saveDisabled={busy}
      onSave={fence(save)}
    >
      {state !== "ready" ? (
        <StockReadNotice
          state={state}
          checking="Checking both pack balances…"
          refused="A pack balance can't be read with your current Store access."
          retryLabel="Retry pack balances"
          disabled={disabled}
          onRetry={() => {
            void sourceQuery.refetch()
            void targetQuery.refetch()
          }}
        />
      ) : blocked ? (
        <StockBlocked>{blocked}</StockBlocked>
      ) : source && target ? (
        <>
          <StockSourceCard
            label="Open these packs"
            balance={source}
            unit={{ name: source.inventoryUnitName, scale: sourceScale }}
            checkedAt={sourceQuery.dataUpdatedAt}
          />
          <StockSourceCard
            label="Into this pack size"
            balance={target}
            unit={{ name: target.inventoryUnitName, scale: targetScale }}
            checkedAt={targetQuery.dataUpdatedAt}
          />
          <StockQuantityField
            label="Source packs to repack"
            value={sourceQuantity}
            scale={sourceScale}
            editable={!busy}
            onChange={(value) => {
              setSourceQuantity(value)
              setError(null)
            }}
          />
          <StockCard>
            {preview?.ok ? (
              <StockFact
                title="Estimated result (the review is final)"
                value={`${preview.value.sourceQuantity} ${source.inventoryUnitName} → ${preview.value.targetQuantity} ${target.inventoryUnitName}`}
              />
            ) : (
              <Text className="text-sm text-muted-foreground">
                {preview && !preview.ok
                  ? preview.refused
                  : "Enter how many source packs to open to see what they become."}
              </Text>
            )}
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
      ) : null}
    </StockSheet>
  )
}
