"use client"

import {
  parseServiceWorkOriginal,
  serviceWorkOriginalCloseParams,
  serviceWorkOriginalOpenParams,
} from "@/components/service-work-original-state"
import type { ServiceWorkOriginalTarget } from "@ewatrade/assistant/general/service-work-original"
import { parseAsString, useQueryStates } from "nuqs"
import {
  assistantObjectParams,
  closedAssistantObjectParams,
} from "./use-assistant-receipt"

const originalParams = {
  ...assistantObjectParams,
  assistantWorkOriginal: parseAsString,
}
export function useServiceWorkOriginalParams() {
  const [{ assistantWorkOriginal }, setParams] = useQueryStates(
    originalParams,
    { history: "push", shallow: true },
  )
  return {
    isOpen: assistantWorkOriginal !== null,
    target: parseServiceWorkOriginal(assistantWorkOriginal),
    open: (target: ServiceWorkOriginalTarget) =>
      setParams({
        ...closedAssistantObjectParams,
        ...serviceWorkOriginalOpenParams(target),
      }),
    close: () => setParams(serviceWorkOriginalCloseParams),
    openCurrentJob: (jobId: string) =>
      setParams({
        ...closedAssistantObjectParams,
        ...serviceWorkOriginalCloseParams,
        jobId,
        serviceSheet: "job",
      }),
  }
}
