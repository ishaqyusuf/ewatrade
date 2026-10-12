"use client"
import { AssistantCashCountView } from "@/components/finance/assistant-cash-count-view"
import { assistantFinanceReadState } from "@/components/finance/assistant-finance-read-state"
import { useTRPC } from "@/trpc/client"
import { generalCashCountReadInput } from "@ewatrade/assistant/general/contracts"
import { Button, Sheet } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { parseAsString, useQueryStates } from "nuqs"
import { SheetFrame } from "./sheet-frame"

/** Global object overlay: closing only clears these owned params and keeps the chat mounted. */
export function AssistantCashCountSheet() {
  const [{ assistantCashCount, assistantCashBook }, setParams] = useQueryStates(
    { assistantCashCount: parseAsString, assistantCashBook: parseAsString },
    { history: "push" },
  )
  const trpc = useTRPC()
  const input = generalCashCountReadInput.safeParse({
    bookId: assistantCashBook,
    countId: assistantCashCount,
  })
  const query = useQuery(
    trpc.finance.cashCount.queryOptions(
      input.success ? input.data : { bookId: "", countId: "" },
      {
        enabled: input.success,
        retry: false,
        staleTime: 0,
      },
    ),
  )
  const state = assistantFinanceReadState(input.success, {
    ...query,
    isFetching: query.isFetching || query.isPaused,
  })
  return (
    <Sheet
      open={Boolean(assistantCashCount)}
      onOpenChange={(open) => {
        if (!open)
          void setParams({ assistantCashCount: null, assistantCashBook: null })
      }}
    >
      {assistantCashCount ? (
        <SheetFrame
          title="Original cash count"
          description="A saved physical observation and its original posted basis."
        >
          {state === "invalid" ? (
            <p role="alert">
              This receipt has an invalid Finance Book or count identity. Close
              it and reopen the original saved receipt.
            </p>
          ) : state === "loading" ? (
            <output>Loading cash count…</output>
          ) : query.isError ? (
            <div role="alert" className="grid gap-3">
              <p>{query.error.message}</p>
              <Button variant="outline" onClick={() => void query.refetch()}>
                Try again
              </Button>
            </div>
          ) : query.isSuccess ? (
            <AssistantCashCountView count={query.data} />
          ) : null}
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
