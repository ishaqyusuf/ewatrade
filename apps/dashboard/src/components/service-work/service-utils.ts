import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"

export type WorkJob = RouterOutputs["services"]["queue"][number]
export type CatalogItem = RouterOutputs["catalog"]["listItems"][number]
export type ServiceRequest = RouterOutputs["serviceAccess"]["requests"][number]

export function formatMoney(value: number | null, currencyCode: string) {
  if (value === null) return "Quote required"
  return new Intl.NumberFormat("en-NG", {
    currency: currencyCode,
    style: "currency",
  }).format(value / 100)
}

export function formatDue(
  value: string | Date | null,
  timeZone = "Africa/Lagos",
) {
  if (!value) return "No promised date"
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeZone,
    timeStyle: "short",
  }).format(new Date(value))
}

export function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ")
}

export function tone(summary: WorkJob["summary"]) {
  if (summary === "blocked") return "bg-amber-50 text-amber-700"
  if (summary === "ready_for_handoff" || summary === "partially_ready") {
    return "bg-violet-50 text-violet-700"
  }
  if (summary === "in_progress") return "bg-blue-50 text-blue-700"
  return "bg-muted text-muted-foreground"
}

export function availableActions(status: WorkJob["lines"][number]["status"]) {
  if (status === "QUEUED") {
    return ["in_progress", "ready_for_handoff", "completed", "blocked"] as const
  }
  if (status === "IN_PROGRESS") {
    return ["ready_for_handoff", "completed", "blocked"] as const
  }
  if (status === "BLOCKED") return ["in_progress", "cancelled"] as const
  if (status === "READY_FOR_HANDOFF") {
    return ["completed", "in_progress"] as const
  }
  return [] as const
}

export function catalogOfferingDisplayName(
  itemName: string,
  variantName: string,
  offeringName: string,
) {
  const parts: string[] = []

  for (const source of [itemName, variantName, offeringName]) {
    for (const rawPart of source.split(/\s+[·|/]\s+/)) {
      const part = rawPart.trim()
      if (!part) continue

      const normalized = part.toLocaleLowerCase()
      if (
        parts.some((existing) => existing.toLocaleLowerCase() === normalized)
      ) {
        continue
      }

      parts.push(part)
    }
  }

  return parts.join(" · ")
}

export function flattenServiceOfferings(items: CatalogItem[], storeId: string) {
  return items.flatMap((item) =>
    item.variants.flatMap((variant) =>
      variant.offerings
        .filter(
          (offering) =>
            offering.kind === "service" &&
            offering.status === "active" &&
            offering.stores.some(
              (availability) =>
                availability.storeId === storeId && availability.isAvailable,
            ),
        )
        .map((offering) => ({
          ...offering,
          displayName: catalogOfferingDisplayName(
            item.name,
            variant.name,
            offering.name,
          ),
        })),
    ),
  )
}
