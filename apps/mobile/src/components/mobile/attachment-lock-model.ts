import {
  RETAIL_OPS_PLANS,
  type RetailOpsPlanId,
} from "@/lib/retail-ops-subscription"

export type AttachmentEntitlement =
  /** The plan hasn't been read freshly yet (never assumed Free). */
  | { status: "checking" }
  /** The read failed or named an unknown plan: stay conservative. */
  | { status: "unknown" }
  | { status: "allowed" }
  | { status: "locked"; canSeePlans: boolean }

/**
 * Attachment access from a fresh, owner-bound plan read. The plan id comes
 * from the server's own resolution (the same one that enforces uploads); an
 * unknown id never falls back to a default plan.
 */
export function attachmentEntitlementFrom({
  fresh,
  failed,
  ownerMatches,
  planId,
  role,
}: {
  fresh: boolean
  failed: boolean
  ownerMatches: boolean
  planId: RetailOpsPlanId | string | null | undefined
  role: string | undefined
}): AttachmentEntitlement {
  if (failed) return { status: "unknown" }
  if (!fresh || !ownerMatches) return { status: "checking" }
  const plan = RETAIL_OPS_PLANS.find((candidate) => candidate.id === planId)
  if (!plan) return { status: "unknown" }
  if (plan.features.includes("attachments")) return { status: "allowed" }
  const normalized = role?.toUpperCase()
  return {
    status: "locked",
    canSeePlans: normalized === "OWNER" || normalized === "ADMIN",
  }
}
