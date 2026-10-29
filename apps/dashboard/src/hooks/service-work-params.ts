import { createLoader, parseAsString, parseAsStringEnum } from "nuqs/server"
import { serviceWorkFilterParams } from "./use-service-work-filter-params"

export const SERVICE_SHEET_MODES = [
  "customer_request",
  "intake",
  "job",
  "quote",
  "request",
  "settings",
] as const

export type ServiceSheetMode = (typeof SERVICE_SHEET_MODES)[number]

export const serviceWorkParams = {
  serviceTab: parseAsStringEnum(["work", "requests"]).withDefault("work"),
  jobId: parseAsString,
  /** A step inside the job sheet, e.g. "pay" or "split:<lineId>". */
  jobStep: parseAsString,
  requestId: parseAsString,
  serviceSheet: parseAsStringEnum([...SERVICE_SHEET_MODES]),
  ...serviceWorkFilterParams,
}

export const loadServiceWorkParams = createLoader(serviceWorkParams)
