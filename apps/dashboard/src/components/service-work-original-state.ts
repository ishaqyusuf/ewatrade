import {
  type ServiceWorkOriginalTarget,
  serviceWorkOriginalTargetSchema,
} from "@ewatrade/assistant/general/service-work-original"

export function parseServiceWorkOriginal(raw: string | null) {
  if (raw === null) return null
  try {
    const parsed = serviceWorkOriginalTargetSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
export function serviceWorkOriginalOpenParams(
  target: ServiceWorkOriginalTarget,
) {
  return {
    assistantWorkOriginal: JSON.stringify(
      serviceWorkOriginalTargetSchema.parse(target),
    ),
  }
}
export const serviceWorkOriginalCloseParams = {
  assistantWorkOriginal: null,
} as const

type OriginalIdentity = {
  jobId: string
  currentJob: { jobId: string }
  original: { jobId: string; eventId?: string; recordId?: string }
  kind: string
  source: string
}

/** Every Open and scope change must finish a fresh authorized read before showing facts. */
export function serviceWorkOriginalReadState(
  target: ServiceWorkOriginalTarget,
  scopeKey: string,
  query: {
    isPending: boolean
    isFetching: boolean
    isPaused: boolean
    isError: boolean
    isSuccess: boolean
    isFetchedAfterMount: boolean
    data?: OriginalIdentity
  },
) {
  if (!scopeKey) return "unavailable" as const
  if (query.isPending || query.isFetching || query.isPaused)
    return "loading" as const
  if (query.isError) return "unavailable" as const
  if (!query.isFetchedAfterMount) return "loading" as const
  const record = query.data
  const source =
    target.kind === "service_work"
      ? "ServiceWorkEvent"
      : target.kind === "service_work_note"
        ? "ServiceInternalNote"
        : "ServiceException"
  if (
    !query.isSuccess ||
    !record ||
    record.kind !== target.kind ||
    record.source !== source ||
    record.jobId !== target.jobId ||
    record.original.jobId !== target.jobId ||
    record.currentJob.jobId !== target.jobId ||
    (target.kind === "service_work"
      ? record.original.eventId !== target.eventId
      : record.original.recordId !== target.recordId)
  ) {
    return "unavailable" as const
  }
  return "ready" as const
}
