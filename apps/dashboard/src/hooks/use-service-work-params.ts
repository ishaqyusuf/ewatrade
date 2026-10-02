"use client"

import { useQueryStates } from "nuqs"
import { parseAsString, parseAsStringEnum } from "nuqs/server"
import {
  type SERVICE_DUE_FILTERS,
  type SERVICE_PRIORITY_FILTERS,
  type ServiceWorkFilters,
  serviceWorkFilterParams,
} from "./use-service-work-filter-params"

export const SERVICE_SHEET_MODES = [
  "intake",
  "job",
  "quote",
  "request",
  "settings",
] as const

export type ServiceSheetMode = (typeof SERVICE_SHEET_MODES)[number]

const serviceWorkParams = {
  jobId: parseAsString,
  requestId: parseAsString,
  serviceSheet: parseAsStringEnum([...SERVICE_SHEET_MODES]),
  ...serviceWorkFilterParams,
}

export function useServiceWorkParams() {
  const [params, updateParams] = useQueryStates(serviceWorkParams)
  const filter: ServiceWorkFilters = {
    assigneeUserId: params.serviceAssignee,
    due: params.serviceDue,
    priority: params.servicePriority,
    query: params.serviceQuery,
  }

  function setParams(
    values: {
      jobId?: string | null
      requestId?: string | null
      serviceQuery?: string | null
      serviceAssignee?: string | null
      serviceDue?: (typeof SERVICE_DUE_FILTERS)[number] | null
      servicePriority?: (typeof SERVICE_PRIORITY_FILTERS)[number] | null
      serviceSheet?: ServiceSheetMode | null
    } | null,
  ) {
    return updateParams(
      values ?? { jobId: null, requestId: null, serviceSheet: null },
      { history: "replace", scroll: false },
    )
  }

  return {
    jobId: params.jobId,
    query: params.serviceQuery ?? "",
    requestId: params.requestId,
    filter,
    hasFilters: Boolean(
      filter.query?.trim() ||
        filter.assigneeUserId ||
        (filter.due && filter.due !== "all") ||
        filter.priority,
    ),
    setFilter: (values: Partial<ServiceWorkFilters> | null) =>
      updateParams(
        values === null
          ? {
              serviceAssignee: null,
              serviceDue: null,
              servicePriority: null,
              serviceQuery: null,
            }
          : {
              serviceAssignee: values.assigneeUserId,
              serviceDue: values.due,
              servicePriority: values.priority,
              serviceQuery: values.query,
            },
      ),
    setParams,
    sheet: params.serviceSheet,
  }
}
