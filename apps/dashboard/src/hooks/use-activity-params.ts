"use client"

import { useQueryStates } from "nuqs"
import { parseAsString } from "nuqs/server"
import {
  type ActivityFilters,
  activityFilterParams,
  hasActivityFilters,
  toActivityFilters,
} from "./use-activity-filter-params"

const activitySheetParams = { activityEvent: parseAsString }

/** Activity list filters; any change restarts the cursor from page one. */
export function useActivityFilterParams() {
  const [params, setParams] = useQueryStates(activityFilterParams)
  const filter = toActivityFilters(params)
  return {
    filter,
    hasFilters: hasActivityFilters(filter),
    setFilter: (values: Partial<ActivityFilters> | null) =>
      setParams(
        values === null
          ? {
              activityQuery: null,
              activityCategories: null,
              activityTypes: null,
              activityPerson: null,
              activityStores: null,
              activityRange: null,
              activityFrom: null,
              activityTo: null,
            }
          : {
              ...("query" in values
                ? { activityQuery: values.query || null }
                : {}),
              ...("categories" in values
                ? {
                    activityCategories: values.categories?.length
                      ? values.categories
                      : null,
                  }
                : {}),
              ...("types" in values
                ? {
                    activityTypes: values.types?.length ? values.types : null,
                  }
                : {}),
              ...("person" in values
                ? { activityPerson: values.person || null }
                : {}),
              ...("storeIds" in values
                ? {
                    activityStores: values.storeIds?.length
                      ? values.storeIds
                      : null,
                  }
                : {}),
              ...("range" in values
                ? {
                    activityRange:
                      values.range && values.range !== "last7"
                        ? values.range
                        : null,
                    activityFrom:
                      values.range === "custom" ? (values.from ?? null) : null,
                    activityTo:
                      values.range === "custom" ? (values.to ?? null) : null,
                  }
                : {}),
            },
      ),
  }
}

/**
 * The open Activity detail. Independent of assistantObjectParams so assistant
 * answer targets keep working; Back closes the sheet and keeps list filters.
 */
export function useActivityParams() {
  const [{ activityEvent }, setParams] = useQueryStates(activitySheetParams, {
    history: "push",
  })
  const key = activityEvent?.trim().slice(0, 160) || null
  return {
    isOpen: key !== null,
    eventKey: key,
    open: (eventKey: string) => setParams({ activityEvent: eventKey }),
    close: () => setParams({ activityEvent: null }),
  }
}
