import type {
  BusinessNotificationMethod,
  BusinessNotificationPreferenceValue,
} from "./contracts"

export type BusinessDeliveryEligibility = {
  method: BusinessNotificationMethod
  supported: boolean
  policyAllowed: boolean
  subscriptionAllowed: boolean
  defaultEnabled: boolean
  preference: BusinessNotificationPreferenceValue
  activeMembership: boolean
  sameTenant: boolean
  domainAuthorized: boolean
  relationshipMatches: boolean
  channelReady: boolean
}

export type BusinessDeliveryDecision =
  | { allowed: true }
  | {
      allowed: false
      reason:
        | "unsupported"
        | "policy_disabled"
        | "subscription_disabled"
        | "inactive_membership"
        | "foreign_tenant"
        | "domain_access_denied"
        | "relationship_mismatch"
        | "preference_disabled"
        | "channel_unavailable"
    }

/** The caller resolves each authority fact freshly; preference never grants access. */
export function resolveBusinessDelivery(
  input: BusinessDeliveryEligibility,
): BusinessDeliveryDecision {
  if (!input.sameTenant) return { allowed: false, reason: "foreign_tenant" }
  if (!input.activeMembership)
    return { allowed: false, reason: "inactive_membership" }
  if (!input.domainAuthorized)
    return { allowed: false, reason: "domain_access_denied" }
  if (!input.relationshipMatches)
    return { allowed: false, reason: "relationship_mismatch" }
  if (!input.supported) return { allowed: false, reason: "unsupported" }
  if (!input.policyAllowed) return { allowed: false, reason: "policy_disabled" }
  if (!input.subscriptionAllowed)
    return { allowed: false, reason: "subscription_disabled" }
  const enabled =
    input.preference === "on" ||
    (input.preference === "inherit" && input.defaultEnabled)
  if (!enabled) return { allowed: false, reason: "preference_disabled" }
  if (!input.channelReady)
    return { allowed: false, reason: "channel_unavailable" }
  return { allowed: true }
}
