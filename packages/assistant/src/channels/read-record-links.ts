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
      const url = new URL("/sales", origin)
      url.searchParams.set("catalogDetail", parsed.data.catalogItemId)
      return {
        href: url.href,
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
