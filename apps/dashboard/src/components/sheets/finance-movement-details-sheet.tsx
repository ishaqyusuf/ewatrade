"use client"
import { useTRPC } from "@/trpc/client"
import { generalMoney } from "@ewatrade/assistant/general/contracts"
import { Button, Sheet } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { parseAsString, useQueryStates } from "nuqs"
import { SheetFrame } from "./sheet-frame"
export function FinanceMovementDetailsSheet() {
  const [{ financeMovement, financeMovementBook }, setParams] = useQueryStates(
    { financeMovement: parseAsString, financeMovementBook: parseAsString },
    { history: "push" },
  )
  const trpc = useTRPC()
  const query = useQuery(
    trpc.finance.moneyMovement.queryOptions(
      { bookId: financeMovementBook ?? "", entryId: financeMovement ?? "" },
      {
        enabled: Boolean(financeMovement && financeMovementBook),
        retry: false,
        staleTime: 0,
      },
    ),
  )
  return (
    <Sheet
      open={Boolean(financeMovement)}
      onOpenChange={(open) => {
        if (!open)
          void setParams({ financeMovement: null, financeMovementBook: null })
      }}
    >
      {financeMovement ? (
        <SheetFrame
          title="Recorded money movement"
          description="Saved bookkeeping entry. No bank transfer is initiated here."
        >
          {!financeMovementBook ? (
            <p role="alert">The Finance Book is missing from this receipt.</p>
          ) : query.isPending ? (
            <output>Loading movement…</output>
          ) : query.isError ? (
            <div role="alert" className="grid gap-3">
              <p>{query.error.message}</p>
              <Button variant="outline" onClick={() => void query.refetch()}>
                Try again
              </Button>
            </div>
          ) : (
            <div className="grid gap-6 text-sm">
              <dl className="grid gap-4">
                {[
                  [
                    "Movement",
                    query.data.sourceKind.toLowerCase().replaceAll("_", " "),
                  ],
                  ["Description", query.data.description],
                  [
                    "Posting date (UTC)",
                    new Date(query.data.effectiveAt).toISOString(),
                  ],
                  [
                    "Recorded at (UTC)",
                    new Date(query.data.recordedAt).toISOString(),
                  ],
                  ["Status", query.data.reversal ? "Reversed" : "Recorded"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="break-words">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="grid gap-3">
                <h3 className="font-medium">Bookkeeping entries</h3>
                {query.data.lines.map((line) => (
                  <div
                    key={line.accountId}
                    className="flex justify-between gap-4 border-b pb-2"
                  >
                    <span>{line.accountName}</span>
                    <span>
                      {BigInt(line.debitMinor) > 0n
                        ? `Debit ${generalMoney(line.debitMinor, query.data.currencyCode)}`
                        : `Credit ${generalMoney(line.creditMinor, query.data.currencyCode)}`}
                    </span>
                  </div>
                ))}
              </div>
              {query.data.reversal ? (
                <p>
                  This movement was reversed: {query.data.reversal.description}
                </p>
              ) : null}
            </div>
          )}
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
