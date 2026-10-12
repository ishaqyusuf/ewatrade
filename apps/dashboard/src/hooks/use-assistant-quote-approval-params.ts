"use client"

import {
  assistantQuoteApprovalCloseParams,
  assistantQuoteApprovalOpenParams,
  parseAssistantQuoteApproval,
} from "@/components/assistant-quote-approval-state"
import type { QuoteApprovalTarget } from "@ewatrade/assistant/general/quote-reads"
import { parseAsString, useQueryStates } from "nuqs"
import {
  assistantObjectParams,
  closedAssistantObjectParams,
} from "./use-assistant-receipt"

const quoteApprovalParams = {
  ...assistantObjectParams,
  assistantQuoteApproval: parseAsString,
}

export function useAssistantQuoteApprovalParams() {
  const [{ assistantQuoteApproval }, setParams] = useQueryStates(
    quoteApprovalParams,
    {
      history: "push",
      shallow: true,
    },
  )
  return {
    isOpen: assistantQuoteApproval !== null,
    target: parseAssistantQuoteApproval(assistantQuoteApproval),
    open: (target: QuoteApprovalTarget) =>
      setParams({
        ...closedAssistantObjectParams,
        ...assistantQuoteApprovalOpenParams(target),
      }),
    close: () => setParams(assistantQuoteApprovalCloseParams),
  }
}
