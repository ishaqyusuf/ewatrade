import {
  type LoaderInput,
  createLoader,
  parseAsString,
  parseAsStringEnum,
} from "nuqs/server"

export const SERVICE_DUE_FILTERS = ["all", "overdue", "today"] as const
export const SERVICE_PRIORITY_FILTERS = ["normal", "urgent"] as const
export const SERVICE_STAGE_FILTERS = [
  "all",
  "open",
  "todo",
  "doing",
  "stuck",
  "ready",
  "done",
  "cancelled",
] as const

export const serviceWorkFilterParams = {
  serviceAssignee: parseAsString,
  serviceDue: parseAsStringEnum([...SERVICE_DUE_FILTERS]),
  servicePriority: parseAsStringEnum([...SERVICE_PRIORITY_FILTERS]),
  serviceQuery: parseAsString,
  serviceStage: parseAsStringEnum([...SERVICE_STAGE_FILTERS]),
}

export type ServiceWorkFilters = {
  assigneeUserId: string | null
  due: (typeof SERVICE_DUE_FILTERS)[number] | null
  priority: (typeof SERVICE_PRIORITY_FILTERS)[number] | null
  query: string | null
  stage: (typeof SERVICE_STAGE_FILTERS)[number] | null
}

const loadServiceWorkFilterState = createLoader(serviceWorkFilterParams)

export async function loadServiceWorkFilterParams(
  searchParams: LoaderInput | Promise<LoaderInput>,
): Promise<ServiceWorkFilters> {
  const params = loadServiceWorkFilterState(await searchParams)
  return {
    assigneeUserId: params.serviceAssignee,
    due: params.serviceDue,
    priority: params.servicePriority,
    query: params.serviceQuery,
    stage: params.serviceStage,
  }
}

export function getServiceWorkQueuePageInput(filter: ServiceWorkFilters) {
  return {
    assigneeUserId: filter.assigneeUserId || undefined,
    due: filter.due && filter.due !== "all" ? filter.due : undefined,
    limit: 25,
    priority: filter.priority ?? undefined,
    query: filter.query?.trim().slice(0, 160) || undefined,
    stage: filter.stage ?? "all",
    sort: { field: "createdAt" as const, direction: "desc" as const },
  }
}

/** Same filters as the list, without paging or stage, for the stage tab counts. */
export function getServiceWorkStageCountsInput(filter: ServiceWorkFilters) {
  const {
    cursor: _cursor,
    limit: _limit,
    stage: _stage,
    sort: _sort,
    ...input
  } = {
    ...getServiceWorkQueuePageInput(filter),
    cursor: undefined,
  }
  return input
}
