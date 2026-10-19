"use client"

import {
  assistantServiceRequestCloseParams,
  assistantServiceRequestOpenParams,
  parseAssistantServiceRequest,
} from "@/components/assistant-service-request-state"
import type { ServiceRequestTarget } from "@ewatrade/assistant/general/service-request-read"
import { parseAsString, useQueryStates } from "nuqs"
import {
  assistantObjectParams,
  closedAssistantObjectParams,
} from "./use-assistant-receipt"

const serviceRequestParams = {
  ...assistantObjectParams,
  assistantServiceRequest: parseAsString,
}

export function useAssistantServiceRequestParams() {
  const [{ assistantServiceRequest }, setParams] = useQueryStates(
    serviceRequestParams,
    { history: "push", shallow: true },
  )
  return {
    isOpen: assistantServiceRequest !== null,
    target: parseAssistantServiceRequest(assistantServiceRequest),
    open: (target: ServiceRequestTarget) =>
      setParams({
        ...closedAssistantObjectParams,
        ...assistantServiceRequestOpenParams(target),
      }),
    close: () => setParams(assistantServiceRequestCloseParams),
  }
}
