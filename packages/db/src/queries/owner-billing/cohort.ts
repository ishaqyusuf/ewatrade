/** Persisted on new paid-launch signups; never retroactively rewrites grants. */
export const OWNER_BILLING_POLICY_VERSION = "owner-subscriptions-v1"

export function isOwnerBillingCohort(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    return false
  const retailOps = (metadata as Record<string, unknown>).retailOps
  return Boolean(
    retailOps &&
      typeof retailOps === "object" &&
      !Array.isArray(retailOps) &&
      (retailOps as Record<string, unknown>).billingPolicy ===
        OWNER_BILLING_POLICY_VERSION,
  )
}
