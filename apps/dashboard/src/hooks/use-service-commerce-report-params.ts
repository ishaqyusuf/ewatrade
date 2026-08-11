import { useQueryStates } from "nuqs"
import {
  createLoader,
  parseAsIsoDate,
  parseAsString,
  parseAsStringEnum,
} from "nuqs/server"

export const SERVICE_COMMERCE_REPORT_DETAILS = [
  "lifecycle",
  "catalog",
  "reliability",
  "media",
  "costs",
] as const

export type ServiceCommerceReportDetail =
  (typeof SERVICE_COMMERCE_REPORT_DETAILS)[number]

const serviceCommerceReportParams = {
  detail: parseAsStringEnum([...SERVICE_COMMERCE_REPORT_DETAILS]),
  from: parseAsIsoDate,
  store: parseAsString,
  to: parseAsIsoDate,
}

export type ServiceCommerceReportRange = {
  from: Date
  to: Date
}

function startOfNextUtcDay(value: Date) {
  return new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate() + 1,
    ),
  )
}

/** The default includes the current UTC day and uses an exclusive end. */
export function getServiceCommerceReportDefaultRange(
  now = new Date(),
): ServiceCommerceReportRange {
  const to = startOfNextUtcDay(now)

  return {
    from: new Date(to.getTime() - 30 * 24 * 60 * 60 * 1_000),
    to,
  }
}

export function resolveServiceCommerceReportRange(
  params: { from: Date | null; to: Date | null },
  now = new Date(),
): ServiceCommerceReportRange {
  if (
    params.from &&
    params.to &&
    Number.isFinite(params.from.getTime()) &&
    Number.isFinite(params.to.getTime()) &&
    params.to > params.from &&
    params.to.getTime() - params.from.getTime() <= 366 * 24 * 60 * 60 * 1_000
  ) {
    return { from: params.from, to: params.to }
  }

  return getServiceCommerceReportDefaultRange(now)
}

export function useServiceCommerceReportParams() {
  const [params, setParams] = useQueryStates(serviceCommerceReportParams)

  return {
    detail: params.detail,
    from: params.from,
    setDetail: (detail: ServiceCommerceReportDetail | null) =>
      setParams({ detail }),
    setScope: (scope: {
      from: Date
      store: string | null
      to: Date
    }) => setParams(scope),
    store: params.store,
    to: params.to,
  }
}

export const loadServiceCommerceReportParams = createLoader(
  serviceCommerceReportParams,
)
