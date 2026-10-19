"use client"

import {
  assistantManualMessageCloseParams,
  assistantManualMessageOpenParams,
  parseAssistantManualMessage,
} from "@/components/assistant-manual-message-state"
import type { ServiceManualMessageTarget } from "@ewatrade/assistant/general/service-message-read"
import { parseAsString, useQueryStates } from "nuqs"
import {
  assistantObjectParams,
  closedAssistantObjectParams,
} from "./use-assistant-receipt"

const manualMessageParams = {
  ...assistantObjectParams,
  assistantManualMessage: parseAsString,
}

export function useAssistantManualMessageParams() {
  const [{ assistantManualMessage }, setParams] = useQueryStates(
    manualMessageParams,
    { history: "push", shallow: true },
  )
  return {
    isOpen: assistantManualMessage !== null,
    target: parseAssistantManualMessage(assistantManualMessage),
    open: (target: ServiceManualMessageTarget) =>
      setParams({
        ...closedAssistantObjectParams,
        ...assistantManualMessageOpenParams(target),
      }),
    close: () => setParams(assistantManualMessageCloseParams),
  }
}
