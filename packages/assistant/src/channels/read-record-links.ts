import {
  type ReadRecordOrigin,
  readRecordOriginSchema,
  readRecordTargetSchema,
} from "../general/read-record-target"
import { trustedAssistantAppOrigin } from "./conversation-links"

export type ReadRecordAppLink = {
  href: string
  label: string
  kind: "record" | "directory"
}

/**
 * One saved Product link for every channel. The installed app claims
 * `/open/catalog-item/*` (verified app links); the web dashboard redirects it to
 * the record. Both recheck sign-in, business and Store; the link carries no scope.
 */
export function catalogItemAppHref(
  catalogItemId: string,
  options: { trustedAppOrigin: string },
) {
  const origin = trustedAssistantAppOrigin(options.trustedAppOrigin)
  if (!origin || !catalogItemId) return
  return new URL(
    `/open/catalog-item/${encodeURIComponent(catalogItemId)}`,
    origin,
  ).href
}

/** Existing app routes use the active business/Store; never imply that a link switches them. */
export function readRecordAppLink(
  target: unknown,
  options: { trustedAppOrigin: string; currentScope: ReadRecordOrigin },
): ReadRecordAppLink | undefined {
  const parsed = readRecordTargetSchema.safeParse(target)
  const scope = readRecordOriginSchema.safeParse(options.currentScope)
  const origin = trustedAssistantAppOrigin(options.trustedAppOrigin)
  if (
    !parsed.success ||
    !scope.success ||
    !origin ||
    parsed.data.origin.tenantId !== scope.data.tenantId ||
    parsed.data.origin.storeId !== scope.data.storeId
  )
    return

  switch (parsed.data.kind) {
    case "catalog_item": {
      const href = catalogItemAppHref(parsed.data.catalogItemId, {
        trustedAppOrigin: origin,
      })
      if (!href) return
      return {
        href,
        label: "Open catalog item in EwaTrade",
        kind: "record",
      }
    }
    case "order":
      return {
        href: new URL(
          `/sales/orders/${encodeURIComponent(parsed.data.orderId)}`,
          origin,
        ).href,
        label: "Open saved order in EwaTrade",
        kind: "record",
      }
    case "customer_directory":
      return {
        href: new URL("/customers", origin).href,
        label: "Open customer directory in EwaTrade",
        kind: "directory",
      }
    case "customer": {
      const url = new URL("/customers", origin)
      url.searchParams.set("customerDetail", parsed.data.customerId)
      return {
        href: url.href,
        label: "Open saved customer in EwaTrade",
        kind: "record",
      }
    }
  }
}

/**
 * Planned report capabilities stay in the app. Only reports with one stable,
 * verified dashboard page get a deep link; the rest keep the saved chat link.
 */
const plannedReportPages = {
  "finance.posted_profit.report": {
    path: "/finance/reports",
    label: "Open profit and loss in EwaTrade",
  },
  "sales.collections.report": {
    path: "/finance/reports",
    label: "Open money collected in EwaTrade",
  },
  "customers.debt.report": {
    path: "/customer-ledger",
    label: "Open customer balances in EwaTrade",
  },
  "inventory.stock.report": {
    path: "/inventory",
    label: "Open stock in EwaTrade",
  },
} as const satisfies Record<string, { path: string; label: string }>
export type PlannedReportCapabilityId = keyof typeof plannedReportPages

export const plannedReportAppInstruction =
  "📊 Reports and exports aren't in WhatsApp yet. Open the report in EwaTrade to view or export it."

/** Navigation only: no IDs, filters or credentials. The app rechecks role, Store and plan. */
export function plannedReportAppLink(
  capabilityId: string,
  options: { trustedAppOrigin: string },
): { href: string; label: string; kind: "report" } | undefined {
  const origin = trustedAssistantAppOrigin(options.trustedAppOrigin)
  const page = Object.hasOwn(plannedReportPages, capabilityId)
    ? plannedReportPages[capabilityId as PlannedReportCapabilityId]
    : undefined
  if (!origin || !page) return
  return {
    href: new URL(page.path, origin).href,
    label: page.label,
    kind: "report",
  }
}
