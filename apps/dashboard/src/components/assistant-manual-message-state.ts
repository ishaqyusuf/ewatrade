import {
  type ServiceManualMessageTarget,
  serviceManualMessageTargetSchema,
} from "@ewatrade/assistant/general/service-message-read"

export function parseAssistantManualMessage(raw: string | null) {
  if (raw === null) return null
  try {
    const parsed = serviceManualMessageTargetSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function assistantManualMessageOpenParams(
  target: ServiceManualMessageTarget,
) {
  return {
    assistantManualMessage: JSON.stringify(
      serviceManualMessageTargetSchema.parse(target),
    ),
  }
}

export const assistantManualMessageCloseParams = {
  assistantManualMessage: null,
} as const

/** The identity-only scope key the sheet host derives: [actor, business, Store]. */
export function parseAssistantObjectScope(scopeKey: string) {
  try {
    const value: unknown = JSON.parse(scopeKey)
    if (
      Array.isArray(value) &&
      value.length === 3 &&
      value.every((part) => typeof part === "string" && part.length > 0)
    )
      return {
        actorUserId: value[0] as string,
        tenantId: value[1] as string,
        storeId: value[2] as string,
      }
  } catch {}
  return null
}

type ManualMessageRecord = {
  actorUserId: string
  tenantId: string
  storeId: string
  job: { id: string }
  intent: { id: string; channel: string; status: string; purpose: string }
  share: { id: string }
  kind: string
  sending: string
  delivery: string
}

/**
 * Cached facts cannot stand in for a current exact-tuple read in the current
 * actor/business/Store; only a staff-reported, unsent, unverified completed
 * manual share for the exact Job/message/share is shown.
 */
export function assistantManualMessageReadState(
  target: ServiceManualMessageTarget,
  scopeKey: string,
  query: {
    isPending: boolean
    isFetching: boolean
    isPaused: boolean
    isError: boolean
    isSuccess: boolean
    isFetchedAfterMount: boolean
    data?: ManualMessageRecord
  },
) {
  const scope = parseAssistantObjectScope(scopeKey)
  if (!scope) return "unavailable" as const
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
    d.job.id !== target.jobId ||
    d.intent.id !== target.intentId ||
    d.share.id !== target.shareId ||
    d.kind !== "staff_reported_share" ||
    d.sending !== "none" ||
    d.delivery !== "unverified" ||
    d.intent.channel !== "MANUAL" ||
    d.intent.status !== "COMPLETED" ||
    d.intent.purpose !== "assistant_manual_share"
  )
    return "unavailable" as const
  return "ready" as const
}
