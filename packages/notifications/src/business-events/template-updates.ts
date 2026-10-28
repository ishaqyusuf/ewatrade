export const TEMPLATE_UPDATE_EVENT =
  "settings.storefront_template_update" as const

/** Template notices are email-only and limited to current business managers. */
export function templateUpdateEmailAllowed(input: {
  role: string
  storeId: string
  preference?: string
  policy?: {
    emailAllowed: boolean
    emailDefault: boolean
    recipientRoles: unknown
  } | null
  subscription?: {
    enabled: boolean
    emailAllowed: boolean
    scopeKind: string
    stores: { storeId: string }[]
  } | null
}) {
  if (!["OWNER", "ADMIN"].includes(input.role) || input.preference === "off")
    return false
  if (
    input.policy &&
    (!input.policy.emailAllowed ||
      !Array.isArray(input.policy.recipientRoles) ||
      !input.policy.recipientRoles.includes(input.role))
  )
    return false
  const subscription = input.subscription
  if (
    subscription &&
    (!subscription.enabled ||
      !subscription.emailAllowed ||
      (subscription.scopeKind !== "business" &&
        subscription.scopeKind !== "accessible_stores" &&
        !(
          subscription.scopeKind === "stores" &&
          subscription.stores.some((store) => store.storeId === input.storeId)
        )))
  )
    return false
  return input.preference === "on" || (input.policy?.emailDefault ?? true)
}
