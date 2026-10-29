"use client"

import { useQueryStates } from "nuqs"
import { type ServiceSheetMode, serviceWorkParams } from "./service-work-params"
import type {
  SERVICE_DUE_FILTERS,
  SERVICE_PRIORITY_FILTERS,
  SERVICE_STAGE_FILTERS,
  ServiceWorkFilters,
} from "./use-service-work-filter-params"

export {
  SERVICE_SHEET_MODES,
  type ServiceSheetMode,
} from "./service-work-params"

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
      serviceTab?: "work" | "requests" | null
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
    tab: params.serviceTab,
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
              serviceStage: null,
              serviceAssignee: null,
              serviceDue: null,
              servicePriority: null,
              serviceQuery: null,
            }
          : {
              serviceStage: values.stage,
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
