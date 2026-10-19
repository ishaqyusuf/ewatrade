import {
  findRetailOpsPlan,
  isRetailOpsPlanId,
  planHasFeature,
} from "@ewatrade/db/subscription-plans"

export type AttachmentContext = {
  actorUserId: string
  tenant: { id: string; retailOpsPlanId?: string | null }
  membership: { id: string; role: string }
  activeStore: { id: string } | null
}

export function attachmentScope(context: AttachmentContext | undefined) {
  if (!context?.actorUserId || !context.activeStore) return null
  return JSON.stringify([
    context.actorUserId,
    context.tenant.id,
    context.membership.id,
    context.activeStore.id,
  ])
}

export type AttachmentAccess = {
  status: "allowed" | "free" | "unknown" | "stale"
  canReviewPlan: boolean
}

/** Every media boundary uses a fresh server read, fenced to its original UI. */
export async function checkAttachmentAccess({
  read,
  scope,
  active,
}: {
  read: () => Promise<AttachmentContext>
  scope: string | null
  active: () => boolean
}): Promise<AttachmentAccess> {
  const denied = { status: "unknown", canReviewPlan: false } as const
  if (!active()) return { ...denied, status: "stale" }
  if (!scope) return denied
  try {
    const context = await read()
    if (!active() || attachmentScope(context) !== scope)
      return { ...denied, status: "stale" }
    const id = context.tenant.retailOpsPlanId
    if (!isRetailOpsPlanId(id)) return denied
    const plan = findRetailOpsPlan(id)
    if (!plan) return denied
    return {
      status: planHasFeature(plan, "attachments") ? "allowed" : "free",
      canReviewPlan: ["OWNER", "ADMIN"].includes(context.membership.role),
    }
  } catch {
    return active() ? denied : { ...denied, status: "stale" }
  }
}
