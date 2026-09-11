import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"

export type WorkJob = RouterOutputs["services"]["queuePage"]["items"][number]
export type CatalogItem = RouterOutputs["catalog"]["listItems"][number]
export type PendingEvidence = {
  assetReference: string
  capturedAt: Date
  clientEvidenceId: string
  label: string
  mediaType: "photo" | "video"
  purpose: "intake_condition" | "progress"
  uploadStatus: "local"
}

export function textLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ")
}

export function statusTone(summary: WorkJob["summary"]) {
  if (summary === "blocked") return "warning" as const
  if (summary === "ready_for_handoff" || summary === "partially_ready")
    return "primary" as const
  return "muted" as const
}

export function actions(status: WorkJob["lines"][number]["status"]) {
  if (status === "QUEUED")
    return ["in_progress", "ready_for_handoff", "blocked"] as const
  if (status === "IN_PROGRESS") return ["ready_for_handoff", "blocked"] as const
  if (status === "BLOCKED") return ["in_progress", "cancelled"] as const
  if (status === "READY_FOR_HANDOFF") return ["in_progress"] as const
  return [] as const
}

export function actionLabel(action: ReturnType<typeof actions>[number]) {
  if (action === "in_progress") return "Start work"
  if (action === "ready_for_handoff") return "Mark ready"
  if (action === "blocked") return "Block"
  return "Cancel"
}

export function offeringDisplayName(itemName: string, variantName: string) {
  const normalizedItemName = itemName.trim().toLocaleLowerCase()
  const normalizedVariantName = variantName.trim().toLocaleLowerCase()

  if (
    normalizedVariantName === normalizedItemName ||
    normalizedVariantName.startsWith(`${normalizedItemName} ·`)
  ) {
    return variantName
  }

  return `${itemName} · ${variantName}`
}

export function serviceOfferings(items: CatalogItem[]) {
  return items.flatMap((item) =>
    item.variants.flatMap((variant) =>
      variant.offerings
        .filter(
          (offering) =>
            offering.kind === "service" && offering.status === "active",
        )
        .map((offering) => ({
          ...offering,
          displayName:
            item.variants.length > 1
              ? offeringDisplayName(item.name, variant.name)
              : item.name,
        })),
    ),
  )
}

export type ServiceJobsProps = { onCreateOrder?: () => void }
