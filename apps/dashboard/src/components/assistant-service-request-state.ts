import {
  type ServiceRequestTarget,
  serviceRequestTargetSchema,
} from "@ewatrade/assistant/general/service-request-read"
import { parseAssistantObjectScope } from "./assistant-manual-message-state"

export function parseAssistantServiceRequest(raw: string | null) {
  if (raw === null) return null
  try {
    const parsed = serviceRequestTargetSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function assistantServiceRequestOpenParams(
  target: ServiceRequestTarget,
) {
  return {
    assistantServiceRequest: JSON.stringify(
      serviceRequestTargetSchema.parse(target),
    ),
  }
}

export const assistantServiceRequestCloseParams = {
  assistantServiceRequest: null,
} as const

type ServiceRequestRecord = {
  actorUserId: string
  tenantId: string
  storeId: string
  request: { id: string }
}

/**
 * Cached facts cannot stand in for a current exact read. Only the exact
 * request from its saved origin, read in the current actor/business/Store
 * after this mount, is shown.
 */
export function assistantServiceRequestReadState(
  target: ServiceRequestTarget,
  scopeKey: string,
  query: {
    isPending: boolean
    isFetching: boolean
    isPaused: boolean
    isError: boolean
    isSuccess: boolean
    isFetchedAfterMount: boolean
    data?: ServiceRequestRecord
  },
) {
  const scope = parseAssistantObjectScope(scopeKey)
  if (
    !scope ||
    target.origin.tenantId !== scope.tenantId ||
    target.origin.storeId !== scope.storeId
  )
    return "unavailable" as const
  if (query.isPending || query.isFetching || query.isPaused)
    return "loading" as const
  if (query.isError) return "unavailable" as const
  if (!query.isFetchedAfterMount) return "loading" as const
  const d = query.data
  if (
    !query.isSuccess ||
    !d ||
    d.actorUserId !== scope.actorUserId ||
    d.tenantId !== scope.tenantId ||
    d.storeId !== scope.storeId ||
    d.request.id !== target.requestId
  )
    return "unavailable" as const
  return "ready" as const
}
