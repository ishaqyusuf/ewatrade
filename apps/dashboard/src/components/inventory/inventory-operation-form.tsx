"use client"

import { useInventoryParams } from "@/hooks/use-inventory-params"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { useState } from "react"

type StoreSummary = { currencyCode: string; id: string; name: string }

const field =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"

export function InventoryOperationForm({
  store,
}: {
  store: StoreSummary
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { operation, setParams } = useInventoryParams()
  const { data: balances } = useSuspenseQuery(
    trpc.inventory.balanceReport.queryOptions(
      { includeCompatibleTotals: true, storeId: store.id },
      { retry: false },
    ),
  )
  const storesQuery = useQuery(trpc.tenant.stores.queryOptions())
  const assigneesQuery = useQuery(trpc.services.assignees.queryOptions())
  const rows = balances.rows
  const [sourceId, setSourceId] = useState("")
  const [targetId, setTargetId] = useState("")
  const [quantity, setQuantity] = useState("")
  const [targetQuantity, setTargetQuantity] = useState("")
  const [direction, setDirection] = useState<"increase" | "decrease">(
    "increase",
  )
  const [reason, setReason] = useState("")
  const [targetCustodyType, setTargetCustodyType] = useState<"staff" | "store">(
    "staff",
  )
  const [targetCustodyReferenceId, setTargetCustodyReferenceId] = useState("")
  const [targetStoreId, setTargetStoreId] = useState("")
  const [error, setError] = useState<string | null>(null)
  const selected = rows.find((row) => row.balanceSourceId === sourceId)
  const target = rows.find((row) => row.balanceSourceId === targetId)

  const complete = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: trpc.inventory.balanceReport.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.inventory.operationHistory.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.inventory.transfers.queryKey(),
      }),
    ])
    setParams(null)
  }
  const fail = (failure: { message: string }) => setError(failure.message)
  const operationMutation = useMutation(
    trpc.inventory.postBalanceOperation.mutationOptions({
      onError: fail,
      onSuccess: complete,
    }),
  )
  const transformMutation = useMutation(
    trpc.inventory.transformPackagedStock.mutationOptions({
      onError: fail,
      onSuccess: complete,
    }),
  )
  const finalizeCountMutation = useMutation(
    trpc.inventory.finalizeStockCount.mutationOptions({
      onError: fail,
      onSuccess: complete,
    }),
  )
  const countMutation = useMutation(
    trpc.inventory.createStockCount.mutationOptions({
      onError: fail,
      onSuccess: (count) =>
        finalizeCountMutation.mutate({
          clientOperationId: crypto.randomUUID(),
          reason: reason.trim() || "Confirmed stock count",
          schemaVersion: 1,
          stockCountId: count.id,
        }),
    }),
  )
  const custodyMutation = useMutation(
    trpc.inventory.moveCustody.mutationOptions({
      onError: fail,
      onSuccess: complete,
    }),
  )
  const transferMutation = useMutation(
    trpc.inventory.dispatchTransfer.mutationOptions({
      onError: fail,
      onSuccess: complete,
    }),
  )

  function submit() {
    if (!operation || !selected || !quantity.trim() || !reason.trim()) {
      setError("Choose a balance, enter a quantity, and add a reason.")
      return
    }
    if (operation === "transformation") {
      if (!target || !targetQuantity.trim()) {
        setError("Choose the packaged target balance and enter its quantity.")
        return
      }
      transformMutation.mutate({
        clientOperationId: crypto.randomUUID(),
        expectedConfigurationVersionId: selected.configurationVersionId,
        reason: reason.trim(),
        schemaVersion: 1,
        source: "dashboard_inventory",
        sourceBalanceRevision: selected.revision,
        sourceBalanceSourceId: selected.balanceSourceId,
        sourceQuantity: quantity.trim(),
        storeId: store.id,
        targetBalanceRevision: target.revision,
        targetBalanceSourceId: target.balanceSourceId,
        targetQuantity: targetQuantity.trim(),
      })
      return
    }
    if (operation === "custody") {
      if (targetCustodyType === "staff" && !targetCustodyReferenceId) {
        setError("Choose the team member receiving custody.")
        return
      }
      custodyMutation.mutate({
        clientOperationId: crypto.randomUUID(),
        expectedSourceRevision: selected.revision,
        quantity: quantity.trim(),
        reason: reason.trim(),
        schemaVersion: 1,
        source: "dashboard_inventory",
        sourceBalanceSourceId: selected.balanceSourceId,
        targetCustodyReferenceId:
          targetCustodyType === "store" ? "" : targetCustodyReferenceId,
        targetCustodyType,
      })
      return
    }
    if (operation === "transfer") {
      if (!targetStoreId) {
        setError("Choose a different target Store.")
        return
      }
      transferMutation.mutate({
        clientOperationId: crypto.randomUUID(),
        clientTransferId: crypto.randomUUID(),
        expectedSourceRevision: selected.revision,
        quantity: quantity.trim(),
        reason: reason.trim(),
        schemaVersion: 1,
        source: "dashboard_inventory",
        sourceBalanceSourceId: selected.balanceSourceId,
        targetStoreId,
      })
      return
    }
    if (operation === "count") {
      countMutation.mutate({
        actorNote: reason.trim(),
        clientOperationId: crypto.randomUUID(),
        lines: [
          {
            balanceSourceId: selected.balanceSourceId,
            entries: [
              {
                enteredInventoryUnitId: selected.inventoryUnitId,
                enteredQuantity: quantity.trim(),
              },
            ],
            expectedRevision: selected.revision,
          },
        ],
        schemaVersion: 1,
        storeId: store.id,
      })
      return
    }
    operationMutation.mutate({
      balanceSourceId: selected.balanceSourceId,
      clientOperationId: crypto.randomUUID(),
      direction: operation === "receipt" ? "increase" : direction,
      enteredInventoryUnitId: selected.inventoryUnitId,
      enteredQuantity: quantity.trim(),
      expectedBalanceRevision: selected.revision,
      expectedConfigurationVersionId: selected.configurationVersionId,
      reason: reason.trim(),
      schemaVersion: 1,
      source: "dashboard_inventory",
      storeId: store.id,
      type: operation,
    })
  }

  const pending =
    operationMutation.isPending ||
    transformMutation.isPending ||
    countMutation.isPending ||
    finalizeCountMutation.isPending ||
    custodyMutation.isPending ||
    transferMutation.isPending

  return (
    <div className="grid gap-4">
      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      <label className="grid gap-1.5 text-sm">
        <span className="font-medium">Balance source</span>
        <select
          className={field}
          value={sourceId}
          onChange={(event) => setSourceId(event.target.value)}
        >
          <option value="">Choose balance</option>
          {rows.map((row) => (
            <option key={row.balanceSourceId} value={row.balanceSourceId}>
              {row.productName} · {row.variantName} · {row.inventoryUnitName} (
              {row.onHandQuantity})
            </option>
          ))}
        </select>
      </label>
      {operation === "adjustment" ? (
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Direction</span>
          <select
            className={field}
            value={direction}
            onChange={(event) =>
              setDirection(event.target.value as typeof direction)
            }
          >
            <option value="increase">Increase</option>
            <option value="decrease">Decrease</option>
          </select>
        </label>
      ) : null}
      {operation === "custody" ? (
        <>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Move to</span>
            <select
              className={field}
              value={targetCustodyType}
              onChange={(event) =>
                setTargetCustodyType(
                  event.target.value as typeof targetCustodyType,
                )
              }
            >
              <option value="staff">Team member</option>
              <option value="store">Central Store custody</option>
            </select>
          </label>
          {targetCustodyType === "staff" ? (
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Team member</span>
              <select
                className={field}
                value={targetCustodyReferenceId}
                onChange={(event) =>
                  setTargetCustodyReferenceId(event.target.value)
                }
              >
                <option value="">Choose team member</option>
                {assigneesQuery.data?.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </>
      ) : null}
      {operation === "transfer" ? (
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Target Store</span>
          <select
            className={field}
            value={targetStoreId}
            onChange={(event) => setTargetStoreId(event.target.value)}
          >
            <option value="">Choose Store</option>
            {storesQuery.data
              ?.filter((candidate) => candidate.id !== store.id)
              .map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
          </select>
        </label>
      ) : null}
      <label className="grid gap-1.5 text-sm">
        <span className="font-medium">
          {operation === "count" ? "Observed quantity" : "Quantity"}
        </span>
        <input
          className={field}
          inputMode="decimal"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
      </label>
      {operation === "transformation" ? (
        <>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Target packaged balance</span>
            <select
              className={field}
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
            >
              <option value="">Choose target</option>
              {rows
                .filter(
                  (row) =>
                    row.balanceSourceId !== sourceId &&
                    row.kind === "PACKAGED_STOCK",
                )
                .map((row) => (
                  <option key={row.balanceSourceId} value={row.balanceSourceId}>
                    {row.productName} · {row.variantName} ·{" "}
                    {row.inventoryUnitName}
                  </option>
                ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Target quantity</span>
            <input
              className={field}
              inputMode="decimal"
              value={targetQuantity}
              onChange={(event) => setTargetQuantity(event.target.value)}
            />
          </label>
        </>
      ) : null}
      <label className="grid gap-1.5 text-sm">
        <span className="font-medium">Reason</span>
        <textarea
          className={`${field} min-h-24 py-2`}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <Button disabled={pending} onClick={submit}>
        {pending ? "Posting…" : "Review and confirm"}
      </Button>
    </div>
  )
}
