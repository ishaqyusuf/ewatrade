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

/**
 * Report tabs. Drilldown sections keep their names so earlier `?detail=` links
 * still open the same section; Conversations and Stores have no drilldown.
 */
export const SERVICE_COMMERCE_REPORT_SECTIONS = [
  "lifecycle",
  "conversations",
  "catalog",
  "reliability",
  "media",
  "costs",
  "stores",
] as const

export type ServiceCommerceReportSection =
  (typeof SERVICE_COMMERCE_REPORT_SECTIONS)[number]

export function isServiceCommerceReportSection(
  value: unknown,
): value is ServiceCommerceReportSection {
  return SERVICE_COMMERCE_REPORT_SECTIONS.some((section) => section === value)
}

export function isServiceCommerceReportDetail(
  section: ServiceCommerceReportSection,
): section is ServiceCommerceReportDetail {
  return SERVICE_COMMERCE_REPORT_DETAILS.some((detail) => detail === section)
}

const serviceCommerceReportParams = {
  detail: parseAsStringEnum([...SERVICE_COMMERCE_REPORT_SECTIONS]),
  from: parseAsIsoDate,
  store: parseAsString,
  to: parseAsIsoDate,
}

export type ServiceCommerceReportRange = {
  from: Date
  to: Date
}

/**
 * Report filters are user navigation, so they intentionally create a browser
 * history entry.  Callers should keep draft-form synchronization local rather
 * than writing it through this helper.
 */
export function withServiceCommerceReportUserNavigation<T>(
  setParams: (values: T, options: { history: "push" }) => unknown,
) {
  return (values: T) => setParams(values, { history: "push" })
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
  const setUserParams = withServiceCommerceReportUserNavigation(setParams)

  return {
    from: params.from,
    /** Lifecycle is the default tab and is kept out of the URL. */
    section: params.detail ?? "lifecycle",
    setSection: (section: ServiceCommerceReportSection) =>
      setUserParams({ detail: section === "lifecycle" ? null : section }),
    setScope: (scope: {
      from: Date
      store: string | null
      to: Date
    }) => setUserParams(scope),
    store: params.store,
    to: params.to,
  }
}

export const loadServiceCommerceReportParams = createLoader(
  serviceCommerceReportParams,
)
