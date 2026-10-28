"use client"
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs"
import { REFUND_STATUSES } from "./refund-model"

/**
 * The open refund request, the list filter and "new request" live in the
 * URL. Bank details never do: a new request's details stay in the form's
 * memory, and saved ones are only read from the authorized detail query.
 */
export function useRefundParams() {
  const [params, setParams] = useQueryStates(
    {
      refundRequest: parseAsString,
      refundStatus: parseAsStringLiteral(REFUND_STATUSES),
      refundAction: parseAsStringLiteral(["new"] as const),
    },
    { history: "push" },
  )
  return {
    ...params,
    setParams,
    open: (requestId: string) =>
      setParams({ refundRequest: requestId, refundAction: null }),
    startRequest: () => setParams({ refundRequest: null, refundAction: "new" }),
    close: () => setParams({ refundRequest: null, refundAction: null }),
  }
}
