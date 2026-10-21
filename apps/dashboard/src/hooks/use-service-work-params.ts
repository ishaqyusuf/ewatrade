"use client"

import { useQueryStates } from "nuqs"
import { parseAsString, parseAsStringEnum } from "nuqs/server"
import {
  type SERVICE_DUE_FILTERS,
  type SERVICE_PRIORITY_FILTERS,
  type SERVICE_STAGE_FILTERS,
  type ServiceWorkFilters,
  serviceWorkFilterParams,
} from "./use-service-work-filter-params"

export const SERVICE_SHEET_MODES = [
  "customer_request",
  "intake",
  "job",
  "quote",
  "request",
  "settings",
] as const

export type ServiceSheetMode = (typeof SERVICE_SHEET_MODES)[number]

const serviceWorkParams = {
  jobId: parseAsString,
  /** A step inside the job sheet, e.g. "pay" or "split:<lineId>". */
  jobStep: parseAsString,
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
    stage: params.serviceStage,
  }

  function setParams(
    values: {
      jobId?: string | null
      jobStep?: string | null
      requestId?: string | null
      serviceQuery?: string | null
      serviceAssignee?: string | null
      serviceDue?: (typeof SERVICE_DUE_FILTERS)[number] | null
      servicePriority?: (typeof SERVICE_PRIORITY_FILTERS)[number] | null
      serviceSheet?: ServiceSheetMode | null
      serviceStage?: (typeof SERVICE_STAGE_FILTERS)[number] | null
    } | null,
  ) {
    return updateParams(
      values ?? {
        jobId: null,
        jobStep: null,
        requestId: null,
        serviceSheet: null,
      },
      { history: "replace", scroll: false },
    )
  }

  return {
    jobId: params.jobId,
    jobStep: params.jobStep,
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
