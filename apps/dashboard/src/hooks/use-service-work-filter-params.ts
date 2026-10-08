import { createLoader, parseAsString, parseAsStringEnum } from "nuqs/server"

export const SERVICE_DUE_FILTERS = ["all", "overdue", "today"] as const
export const SERVICE_PRIORITY_FILTERS = ["normal", "urgent"] as const

export const serviceWorkFilterParams = {
  serviceAssignee: parseAsString,
  serviceDue: parseAsStringEnum([...SERVICE_DUE_FILTERS]),
  servicePriority: parseAsStringEnum([...SERVICE_PRIORITY_FILTERS]),
  serviceQuery: parseAsString,
}

export type ServiceWorkFilters = {
  assigneeUserId: string | null
  due: (typeof SERVICE_DUE_FILTERS)[number] | null
  priority: (typeof SERVICE_PRIORITY_FILTERS)[number] | null
  query: string | null
}

const loadServiceWorkFilterState = createLoader(serviceWorkFilterParams)

export async function loadServiceWorkFilterParams(
  searchParams: Parameters<typeof loadServiceWorkFilterState>[0],
): Promise<ServiceWorkFilters> {
  const params = await loadServiceWorkFilterState(searchParams)
  return {
    assigneeUserId: params.serviceAssignee,
    due: params.serviceDue,
    priority: params.servicePriority,
    query: params.serviceQuery,
  }
}

export function getServiceWorkQueuePageInput(filter: ServiceWorkFilters) {
  return {
    assigneeUserId: filter.assigneeUserId || undefined,
    due: filter.due && filter.due !== "all" ? filter.due : undefined,
    limit: 25,
    priority: filter.priority ?? undefined,
    query: filter.query?.trim().slice(0, 160) || undefined,
  }
}
