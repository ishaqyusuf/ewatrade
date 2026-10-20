"use client"
import {
  inventoryDate,
  inventoryLabel,
} from "@/components/tables/inventory-ledger/format"
import { formatInventoryQuantity } from "@/lib/inventory-view"
import { useTRPC } from "@/trpc/client"
import { Button, Sheet } from "@ewatrade/ui"
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
  if (query.isPending) return <output>Loading stock operation…</output>
  if (query.isError)
    return (
      <div role="alert" className="grid gap-3">
        <p>This stock operation is unavailable in the selected Store.</p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    )
  const data = query.data
  if (!data) return <p>Operation is no longer available.</p>
  return (
    <div className="grid gap-6">
      <dl className="grid gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Operation ID</dt>
          <dd className="break-all">{data.id}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Effective (UTC)</dt>
          <dd>{inventoryDate(data.effectiveAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Reason</dt>
          <dd>{data.reason || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Categories</dt>
          <dd>{data.categories.map((c) => c.name).join(", ") || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Source</dt>
          <dd>{inventoryLabel(data.source)}</dd>
        </div>
      </dl>
      <section className="grid gap-3">
        <h3 className="font-medium">Stock movements</h3>
        {data.movements.map((m) => (
          <div
            key={m.id}
            className="grid gap-1 border border-border p-4 text-sm"
          >
            <p className="font-medium">
              {m.productName} · {m.variantName}
            </p>
            <p className="text-muted-foreground">{m.storeName}</p>
            <p>
              {formatInventoryQuantity(m.enteredQuantity)}{" "}
              {m.enteredInventoryUnitName}
            </p>
            <p className="text-muted-foreground">
              On hand: {formatInventoryQuantity(m.previousOnHandQuantity)} →{" "}
              {formatInventoryQuantity(m.resultingOnHandQuantity)}
            </p>
          </div>
        ))}
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
          title={inventoryLabel(record.type)}
          description="Recorded operation and its individual stock movements."
        >
          <Audit key={record.id} operationId={record.id} storeId={storeId} />
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
