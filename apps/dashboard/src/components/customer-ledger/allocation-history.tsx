"use client"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { formatLedgerDate } from "./types"
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
        {expanded ? "Hide history" : "History"}
      </Button>
      {expanded ? (
        <div className="grid gap-3 border-l border-border pl-4">
          {query.isPending ? (
            <output aria-busy="true">Loading history…</output>
          ) : query.isError ? (
            <div role="alert">
              <p>Couldn’t load the history. Try again.</p>
              <Button onClick={() => void query.refetch()}>Try again</Button>
            </div>
          ) : (
            <>
              <p className="text-sm">
                Used on{" "}
                {formatLedgerDate(query.data.allocation.createdAt, true)}
              </p>
              {query.data.reconciliationRequired ? (
                <p role="alert">
                  This history doesn’t add up. Someone in Finance needs to check
                  it.
                </p>
              ) : null}
              {query.data.releases.map((release) => (
                <article key={release.id} className="grid gap-1 text-sm">
                  <p>
                    Taken back ·{" "}
                    {formatFinanceMoney(
                      release.amountMinor,
                      account.currencyCode,
                    )}
                  </p>
                  <p>{release.reason}</p>
                  <p className="break-words text-muted-foreground">
                    {formatLedgerDate(release.createdAt, true)}
                  </p>
                  {release.orderSettlementReversal ? (
                    <p>Part of an Order correction</p>
                  ) : null}
                </article>
              ))}
              {!query.data.releases.length ? (
                <p className="text-sm">Nothing was taken back.</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={cursors.length === 1 || query.isFetching}
                  onClick={() => setCursors((v) => v.slice(0, -1))}
                >
                  Back
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
                  Show more
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
