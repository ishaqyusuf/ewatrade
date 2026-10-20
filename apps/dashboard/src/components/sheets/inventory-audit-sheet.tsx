"use client"
import {
  stockChangeLabel,
  stockDate,
  stockSourceLabel,
} from "@/lib/inventory-labels"
import {
  formatInventoryQuantity,
  formatStockQuantity,
} from "@/lib/inventory-view"
import { useTRPC } from "@/trpc/client"
import { Button, Sheet } from "@ewatrade/ui"
import { compareExactDecimals } from "@ewatrade/utils/exact-decimal"
import { useQuery } from "@tanstack/react-query"
import { SheetFrame } from "./sheet-frame"
function Audit({
  operationId,
  storeId,
}: { operationId: string; storeId?: string }) {
  const trpc = useTRPC()
  const query = useQuery(
    trpc.inventory.operationAudit.queryOptions(
      { operationId, storeId },
      { retry: false },
    ),
  )
  if (query.isPending) return <output>Loading this change…</output>
  if (query.isError)
    return (
      <div role="alert" className="grid gap-3">
        <p>This change couldn’t be loaded for this store.</p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    )
  const data = query.data
  if (!data) return <p>This change is no longer available.</p>
  const reasons = data.categories.map((c) => c.name).join(", ")
  return (
    <div className="grid gap-6">
      <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">When</dt>
        <dd>{stockDate(data.effectiveAt)}</dd>
        {reasons ? (
          <>
            <dt className="text-muted-foreground">Reason</dt>
            <dd>{reasons}</dd>
          </>
        ) : null}
        {data.reason ? (
          <>
            <dt className="text-muted-foreground">Note</dt>
            <dd>{data.reason}</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">Recorded from</dt>
        <dd>{stockSourceLabel(data.source)}</dd>
      </dl>
      <section className="grid gap-3">
        <h3 className="font-medium">What changed</h3>
        {data.movements.map((m) => {
          const up =
            compareExactDecimals(
              m.resultingOnHandQuantity,
              m.previousOnHandQuantity,
            ) >= 0
          const sameUnit = compareExactDecimals(m.unitFactorSnapshot, "1") === 0
          return (
            <div
              key={m.id}
              className="grid gap-1 border border-border p-4 text-sm"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-medium">
                  {m.variantName && m.variantName !== m.productName
                    ? `${m.productName} · ${m.variantName}`
                    : m.productName}
                </p>
                <p
                  className={
                    up
                      ? "font-semibold tabular-nums text-primary"
                      : "font-semibold tabular-nums text-destructive"
                  }
                >
                  {up ? "+" : "−"}
                  {formatStockQuantity(
                    m.enteredQuantity,
                    m.enteredInventoryUnitName,
                  )}
                </p>
              </div>
              <p className="text-muted-foreground">
                {m.storeName} · in stock{" "}
                {formatInventoryQuantity(m.previousOnHandQuantity)} →{" "}
                {sameUnit
                  ? formatStockQuantity(
                      m.resultingOnHandQuantity,
                      m.enteredInventoryUnitName,
                    )
                  : formatInventoryQuantity(m.resultingOnHandQuantity)}
              </p>
            </div>
          )
        })}
      </section>
    </div>
  )
}
export function InventoryAuditSheet({
  record,
  storeId,
  onClose,
}: {
  record: { id: string; type: string } | null
  storeId?: string
  onClose: () => void
}) {
  return (
    <Sheet
      open={Boolean(record)}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      {record ? (
        <SheetFrame
          title={
            record.type === "Stock operation"
              ? "Stock change"
              : stockChangeLabel(record.type)
          }
          description="What changed, by how much, and why."
        >
          <Audit key={record.id} operationId={record.id} storeId={storeId} />
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
