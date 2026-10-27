import { z } from "zod"

export const paymentNotificationPlanIds = [
  "free",
  "starter",
  "growth",
  "pro",
] as const
export const paymentNotificationChannels = ["email", "whatsapp"] as const
export const paymentNotificationChannelSchema = z.enum(
  paymentNotificationChannels,
)
export type PaymentNotificationChannel = z.infer<
  typeof paymentNotificationChannelSchema
>
export const paymentNotificationChannelPolicySchema = z
  .object({
    enabled: z.boolean(),
    limit: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
  })
  .strict()
const tier = z
  .object({
    email: paymentNotificationChannelPolicySchema,
    whatsapp: paymentNotificationChannelPolicySchema,
  })
  .strict()
export const paymentNotificationTiersSchema = z
  .object({ free: tier, starter: tier, growth: tier, pro: tier })
  .strict()
export const paymentNotificationPolicySchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.number().int().nonnegative(),
    tiers: paymentNotificationTiersSchema,
  })
  .strict()
export const paymentNotificationPolicyWriteSchema = z
  .object({
    commandId: z.string().uuid(),
    expectedRevision: z.number().int().nonnegative(),
    tiers: paymentNotificationTiersSchema,
    reason: z.string().trim().min(10).max(1000),
  })
  .strict()
export type PaymentNotificationPolicy = z.infer<
  typeof paymentNotificationPolicySchema
>
export type PaymentNotificationTiers = PaymentNotificationPolicy["tiers"]
export type PaymentNotificationPolicyWrite = z.infer<
  typeof paymentNotificationPolicyWriteSchema
>
export type PaymentNotificationPlanId =
  (typeof paymentNotificationPlanIds)[number]
export type PaymentNotificationChannelEligibility = {
  available: boolean
  enabled: boolean
  budget:
    | { kind: "limited"; limit: number }
    | { kind: "unlimited"; limit: null }
    | { kind: "unknown"; limit: null }
  used: number | null
  reserved: number | null
  remaining: number | null
  reason:
    | "available"
    | "policy_missing"
    | "policy_invalid"
    | "plan_disabled"
    | "quota_exhausted"
    | "unavailable"
}
export type PaymentReportNotificationEligibility = {
  schemaVersion: 1
  scope: "payment_report"
  policyRevision: number | null
  planId: PaymentNotificationPlanId | null
  period: { startsAt: string; resetsAt: string; timeZone: "UTC" }
  channels: Record<
    PaymentNotificationChannel,
    PaymentNotificationChannelEligibility
  >
}

export function emptyPaymentNotificationPolicy(): PaymentNotificationPolicy {
  const off = () => ({
    email: { enabled: false, limit: 0 },
    whatsapp: { enabled: false, limit: 0 },
  })
  return {
    schemaVersion: 1,
    revision: 0,
    tiers: { free: off(), starter: off(), growth: off(), pro: off() },
  }
}
export function paymentNotificationPeriod(now = new Date()) {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid quota time")
  return {
    startsAt: new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    ).toISOString(),
    resetsAt: new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    ).toISOString(),
    timeZone: "UTC" as const,
  }
}
export function paymentNotificationChannelEligibility(input: {
  policy: PaymentNotificationPolicy | null
  planId: PaymentNotificationPlanId | null
  channel: PaymentNotificationChannel
  used: number | null
  reserved: number | null
  unavailableReason?: "policy_missing" | "policy_invalid" | "unavailable"
}): PaymentNotificationChannelEligibility {
  const config =
    input.policy && input.planId
      ? input.policy.tiers[input.planId][input.channel]
      : null
  const validUsage =
    typeof input.used === "number" &&
    Number.isSafeInteger(input.used) &&
    input.used >= 0 &&
    typeof input.reserved === "number" &&
    Number.isSafeInteger(input.reserved) &&
    input.reserved >= 0
  if (!config || input.unavailableReason || !validUsage)
    return {
      available: false,
      enabled: false,
      budget: { kind: "unknown", limit: null },
      used: null,
      reserved: null,
      remaining: null,
      reason: input.unavailableReason ?? "unavailable",
    }
  const used = input.used as number
  const reserved = input.reserved as number
  const remaining =
    config.limit === null ? null : Math.max(0, config.limit - used - reserved)
  const reason = !config.enabled
    ? "plan_disabled"
    : remaining === 0
      ? "quota_exhausted"
      : "available"
  return {
    available: reason === "available",
    enabled: config.enabled,
    budget:
      config.limit === null
        ? { kind: "unlimited", limit: null }
        : { kind: "limited", limit: config.limit },
    used,
    reserved,
    remaining,
    reason,
  }
}
/** A cap change is visible even when both versions are enabled or already exhausted. */
export function paymentNotificationTierChanged(
  before: PaymentNotificationPolicy,
  after: PaymentNotificationPolicy,
  planId: PaymentNotificationPlanId,
) {
  return paymentNotificationChannels.some(
    (c) =>
      before.tiers[planId][c].enabled !== after.tiers[planId][c].enabled ||
      before.tiers[planId][c].limit !== after.tiers[planId][c].limit,
  )
}
