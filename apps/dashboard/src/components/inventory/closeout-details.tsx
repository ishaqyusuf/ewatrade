"use client"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"

export function CloseoutDetails({
  storeId,
  closeoutId,
}: { storeId: string; closeoutId: string }) {
  const trpc = useTRPC()
  const query = useQuery(
    trpc.inventory.closeoutReview.queryOptions(
      { storeId, closeoutId },
      { staleTime: 0 },
    ),
  )
  if (query.isPending)
    return <output aria-live="polite">Loading saved closeout…</output>
  if (query.isError)
    return (
      <div role="alert" className="grid gap-3">
        <p>{query.error.message}</p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    )
  const closeout = query.data
  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <p className="text-sm font-medium">
          {closeout.status === "DRAFT"
            ? "Draft declarations"
            : closeout.status === "FINALIZED"
              ? "Finalized closeout"
              : "Cancelled closeout"}
        </p>
        <p className="text-sm text-muted-foreground">{closeout.reason}</p>
        <p className="text-xs text-muted-foreground break-all">
          {closeout.custodyType === "STAFF" ? "Staff" : "Session"} custody ·{" "}
          {closeout.custodyReferenceId}
        </p>
        <p className="text-xs text-muted-foreground break-all">
          Closeout {closeout.id}
        </p>
      </div>
      {closeout.status === "DRAFT" ? (
        <output className="rounded-md border p-3 text-sm">
          {closeout.canFinalize
            ? "Declarations are current. Ask the assistant to review this closeout for finalization. A separate confirmation applies the stock adjustment."
            : "These declarations cannot currently be finalized. Review the stock and reservation differences below; saved declarations are never changed automatically."}
        </output>
      ) : null}
      {closeout.finalizedAt ? (
        <p className="text-sm text-muted-foreground">
          Finalized {new Date(closeout.finalizedAt).toLocaleString()}. The
          original declarations below are retained.
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">
        This reconciles custody stock. It does not close a financial period.
      </p>
      {!closeout.lines.length ? (
        <p>No declarations were recorded.</p>
      ) : (
        closeout.lines.map((line) => (
          <section key={line.id} className="grid gap-3 rounded-md border p-4">
            <h3 className="font-medium">
              {line.productName} · {line.variantName}
            </h3>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt>System at declaration</dt>
              <dd>
                {line.expectedQuantity} {line.unitName}
              </dd>
              <dt>Declared</dt>
              <dd>
                {line.declaredQuantity} {line.unitName}
              </dd>
              <dt>Signed variance</dt>
              <dd>
                {line.varianceQuantity} {line.unitName}
              </dd>
              <dt>Current on hand</dt>
              <dd>
                {line.currentQuantity} {line.unitName}
              </dd>
              <dt>Currently reserved</dt>
              <dd>
                {line.reservedQuantity} {line.unitName}
              </dd>
            </dl>
            {closeout.status === "DRAFT" && !line.stockCurrent ? (
              <p className="text-sm text-destructive">
                Stock changed since this declaration. Record fresh observations
                before finalization.
              </p>
            ) : null}
            {closeout.status === "DRAFT" && !line.preservesReservations ? (
              <p className="text-sm text-destructive">
                Declared stock is below reserved stock. Resolve the reservation
                conflict before finalization.
              </p>
            ) : null}
          </section>
        ))
      )}
      <Button
        variant="outline"
        disabled={query.isFetching}
        onClick={() => void query.refetch()}
      >
        Refresh closeout
      </Button>
    </div>
  )
}
