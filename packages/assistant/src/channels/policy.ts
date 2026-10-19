import type { Capability } from "../capabilities/types"

type Environment = Record<string, string | undefined>
/** Independent Tenant enrollment; a User pilot or consent grant cannot enroll a business. */
export function assistantWhatsAppPilotTenantIds(
  env: Environment = process.env,
) {
  return [
    ...new Set(
      (env.ASSISTANT_WHATSAPP_PILOT_TENANT_IDS ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0 && id.length <= 128),
    ),
  ]
}
export function isAssistantWhatsAppPilotTenant(
  tenantId: string,
  env: Environment = process.env,
) {
  return Boolean(
    tenantId && assistantWhatsAppPilotTenantIds(env).includes(tenantId),
  )
}
/** Configuration shape only; returns no credentials and grants no channel or merchant authority. */
export function assistantWhatsAppConfigurationValid(
  env: Environment = process.env,
): boolean {
  const token = env.WHATSAPP_OTP_ACCESS_TOKEN?.trim()
  const phone = env.WHATSAPP_OTP_PHONE_NUMBER_ID?.trim()
  const display = env.ASSISTANT_WHATSAPP_DISPLAY_NUMBER?.trim().replace(
    /^\+/,
    "",
  )
  return Boolean(
    token &&
      phone &&
      /^\d+$/.test(phone) &&
      display &&
      /^[1-9]\d{7,14}$/.test(display),
  )
}

export function whatsAppChannelPolicy(env: Environment = process.env) {
  return {
    reads: env.ASSISTANT_WHATSAPP_READS_ENABLED === "true",
    writes: env.ASSISTANT_WHATSAPP_WRITES_ENABLED === "true",
    media: env.ASSISTANT_WHATSAPP_MEDIA_ENABLED === "true",
    localSource: env.APP_ENV === "local" && env.NODE_ENV !== "production",
  }
}
/** Compatibility and rollout are independent of canonical role/scope/Book authority. */
export function whatsAppCapabilityEnabled(
  capability: Capability,
  env: Environment = process.env,
) {
  const policy = whatsAppChannelPolicy(env)
  if (
    !capability.clients.includes("whatsapp") ||
    !capability.whatsapp ||
    capability.whatsapp.mode !== "native" ||
    !["source", "pilot", "enabled"].includes(capability.rollout) ||
    capability.whatsapp.rollout === "planned" ||
    !(capability.mode === "read" ? policy.reads : policy.writes)
  )
    return false
  return (
    capability.whatsapp.rollout === "pilot" ||
    capability.whatsapp.rollout === "enabled" ||
    (capability.whatsapp.rollout === "source" && policy.localSource)
  )
}
/** Stable policy evidence; source-test/doc edits do not invalidate saved replies. */
export function whatsAppCapabilityPolicyStamp(
  manifest: readonly Capability[],
  env: Environment = process.env,
) {
  return {
    version: "whatsapp-policy-v1",
    ...whatsAppChannelPolicy(env),
    capabilities: manifest
      .filter((capability) => capability.clients.includes("whatsapp"))
      .map((capability) => ({
        id: capability.id,
        mode: capability.mode,
        rollout: capability.rollout,
        whatsapp: capability.whatsapp ?? null,
      }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  }
}
export const WHATSAPP_TRANSPORT_LIMITS = {
  MINUTE: {
    user: { ingress: 20, deliveryAttempts: 60 },
    tenant: { ingress: 100, deliveryAttempts: 300 },
  },
  DAY: {
    user: { ingress: 200, deliveryAttempts: 2000 },
    tenant: { ingress: 1000, deliveryAttempts: 10000 },
  },
} as const
export const WHATSAPP_USAGE_RETENTION_AFTER_WINDOW_MS = 60 * 60_000
