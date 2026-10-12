"use client"
import {
  assistantObjectParams,
  closedAssistantObjectParams,
} from "@/hooks/use-assistant-receipt"
import type {
  CashCountTarget,
  DayCloseTarget,
} from "@ewatrade/assistant/general/contracts"
import { Button } from "@ewatrade/ui"
import { useQueryStates } from "nuqs"
export function OpenAssistantFinanceReview({
  target,
}: { target: CashCountTarget | DayCloseTarget }) {
  const [, setParams] = useQueryStates(assistantObjectParams, {
    history: "push",
    shallow: true,
  })
  return (
    <Button
      variant="outline"
      onClick={() =>
        void setParams(
          target.kind === "finance_cash_count"
            ? {
                ...closedAssistantObjectParams,
                assistantCashCount: target.countId,
                assistantCashBook: target.bookId,
                assistantDayCloseBook: null,
                assistantDayCloseThrough: null,
              }
            : {
                ...closedAssistantObjectParams,
                assistantCashCount: null,
                assistantCashBook: null,
                assistantDayCloseBook: target.bookId,
                assistantDayCloseThrough: target.through,
              },
        )
      }
    >
      {target.kind === "finance_cash_count"
        ? "Open original cash count"
        : "Open day-close review"}
    </Button>
  )
}
