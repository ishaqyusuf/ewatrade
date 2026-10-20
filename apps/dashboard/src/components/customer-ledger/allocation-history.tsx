"use client"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import type { LedgerAccount } from "./types"

export function AllocationHistory({
  account,
  allocationId,
}: { account: LedgerAccount; allocationId: string }) {
  const trpc = useTRPC()
  const [expanded, setExpanded] = useState(false)
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined])
  const query = useQuery(
    trpc.customerLedger.allocationHistory.queryOptions(
      {
        accountId: account.id,
        allocationId,
        expectedRevision: account.revision,
        afterSequence: cursors.at(-1),
        limit: 20,
      },
      { enabled: expanded, retry: false },
    ),
  )
  return (
    <div className="grid gap-3">
      <Button
        variant="ghost"
        className="w-fit"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? "Hide" : "View"} allocation history
      </Button>
      {expanded ? (
        <div className="grid gap-3 border-l border-border pl-4">
          {query.isPending ? (
            <output aria-busy="true">Loading correction history…</output>
          ) : query.isError ? (
            <div role="alert">
              <p>{query.error.message}</p>
              <Button onClick={() => void query.refetch()}>Try again</Button>
            </div>
          ) : (
            <>
              <p className="text-sm">
                Applied by {query.data.allocation.actorUserId} ·{" "}
                {new Date(query.data.allocation.createdAt).toISOString()}
              </p>
              {query.data.reconciliationRequired ? (
                <p role="alert">Release totals require reconciliation.</p>
              ) : null}
              {query.data.releases.map((release) => (
                <article key={release.id} className="grid gap-1 text-sm">
                  <p>
                    Release #{release.sequence} ·{" "}
                    {formatFinanceMoney(
                      release.amountMinor,
                      account.currencyCode,
                    )}
                  </p>
                  <p>{release.reason}</p>
                  <p className="break-words text-muted-foreground">
                    Recorded by {release.actorUserId} ·{" "}
                    {new Date(release.createdAt).toISOString()}
                  </p>
                  {release.orderSettlementReversal ? (
                    <p>
                      Order settlement correction:{" "}
                      {release.orderSettlementReversal.orderId}
                    </p>
                  ) : null}
                </article>
              ))}
              {!query.data.releases.length ? (
                <p className="text-sm">No releases on this page.</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={cursors.length === 1 || query.isFetching}
                  onClick={() => setCursors((v) => v.slice(0, -1))}
                >
                  Previous releases
                </Button>
                <Button
                  variant="outline"
                  disabled={!query.data.nextCursor || query.isFetching}
                  onClick={() =>
                    setCursors((v) => [
                      ...v,
                      query.data?.nextCursor ?? undefined,
                    ])
                  }
                >
                  More releases
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
