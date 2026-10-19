import { canAccessAdminTabs } from "@/lib/admin-navigation"
import { canEditMobileCatalog, normalizeMobileRole } from "@/lib/mobile-roles"
import {
  type BusinessReportTarget,
  businessReportTargetSchema,
} from "@ewatrade/assistant/general/business-report-target"
import type { BusinessReport } from "@ewatrade/db/business-reporting"
import { z } from "zod"

// A valid 8192-character cursor may expand sixfold when JSON escaped.
const MAX_TARGET_LENGTH = 65_536

export function readNativeBusinessReportTarget(
  raw: unknown,
): BusinessReportTarget | null {
  if (typeof raw !== "string" || raw.length > MAX_TARGET_LENGTH) return null
  try {
    const parsed = businessReportTargetSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function targetObject(raw: unknown): BusinessReportTarget | null {
  try {
    const serialized = JSON.stringify(raw)
    return readNativeBusinessReportTarget(serialized)
  } catch {
    return null
  }
}

/** Navigation carries original filters, never permission or a selected scope. */
export function nativeBusinessReportRoute(raw: unknown) {
  const target = targetObject(raw)
  return target
    ? {
        pathname: "/business-report-modal" as const,
        params: { target: JSON.stringify(target) },
      }
    : null
}

export function nativeBusinessReportPage(
  target: BusinessReportTarget,
  cursor?: string,
): BusinessReportTarget | null {
  const parsed = targetObject(target)
  if (!parsed) return null
  const request = parsed.request
  if (request.report !== "item_sales" && request.report !== "customer_debt")
    return null
  const { cursor: _previous, ...filters } = request.filters
  return targetObject({
    ...parsed,
    request: {
      report: request.report,
      filters: { ...filters, ...(cursor === undefined ? {} : { cursor }) },
    },
  })
}

/** Mirror canonical origin freshness; the protected reader still authorizes. */
export function nativeBusinessReportScopeMatches(
  target: BusinessReportTarget,
  current: {
    actorUserId?: string
    tenantId?: string
    storeId?: string | null
  },
  expectedActorUserId?: string,
): boolean {
  const parsed = targetObject(target)
  if (
    !parsed ||
    !current.actorUserId ||
    !current.tenantId ||
    (expectedActorUserId !== undefined &&
      expectedActorUserId !== current.actorUserId) ||
    parsed.origin.tenantId !== current.tenantId
  )
    return false
  const storeReport = ["item_sales", "payment_collections", "stock"].includes(
    parsed.request.report,
  )
  return storeReport
    ? Boolean(
        parsed.origin.storeId && parsed.origin.storeId === current.storeId,
      )
    : parsed.origin.storeId === null
}

function sameInstant(actual: string, expected: string) {
  const instant = Date.parse(actual)
  return Number.isFinite(instant) && instant === Date.parse(expected)
}

/** Check only typed echoes. Supplier/Book/sequence identity is not echoed by DTO. */
export function nativeBusinessReportResultMatches(
  target: BusinessReportTarget,
  report: BusinessReport,
): boolean {
  const parsed = targetObject(target)
  if (!parsed || !report || report.report !== parsed.request.report)
    return false
  const request = parsed.request
  switch (request.report) {
    case "stock":
      return report.currencyCode === null && report.period === null
    case "customer_debt":
      return (
        report.currencyCode === request.filters.currencyCode &&
        report.period === null
      )
    case "supplier_aging":
      return (
        typeof report.currencyCode === "string" &&
        /^[A-Z]{3}$/.test(report.currencyCode) &&
        report.period === null
      )
    case "posted_profit":
      return Boolean(
        typeof report.currencyCode === "string" &&
          /^[A-Z]{3}$/.test(report.currencyCode) &&
          report.period &&
          report.period.end === "inclusive" &&
          report.period.timezone === "UTC" &&
          sameInstant(report.period.from, request.filters.from) &&
          sameInstant(report.period.to, request.filters.through),
      )
    case "item_sales":
    case "payment_collections":
      return Boolean(
        report.currencyCode === request.filters.currencyCode &&
          report.period &&
          report.period.end === "exclusive" &&
          report.period.timezone === request.filters.timezone &&
          sameInstant(report.period.from, request.filters.from) &&
          sameInstant(report.period.to, request.filters.before),
      )
  }
}

const originalTarget = z
  .object({
    kind: z.enum(["customer", "catalog_item"]),
    id: z.string().trim().min(1).max(160),
  })
  .strict()

export function nativeBusinessReportOriginalRoute(
  rowtarget: unknown,
  profile?: {
    role?: string
    staffAccessMode?: string
    catalogEditor?: boolean
  } | null,
) {
  const parsed = originalTarget.safeParse(rowtarget)
  if (!parsed.success || !profile) return null
  const accessible =
    parsed.data.kind === "catalog_item"
      ? canAccessAdminTabs(profile.role) || canEditMobileCatalog(profile)
      : ["OWNER", "ADMIN"].includes(normalizeMobileRole(profile.role))
  if (!accessible) return null
  return parsed.data.kind === "catalog_item"
    ? {
        pathname: "/catalog-item/[catalogItemId]" as const,
        params: { catalogItemId: parsed.data.id },
      }
    : {
        pathname: "/customer-ledger/[customerId]" as const,
        params: { customerId: parsed.data.id },
      }
}
