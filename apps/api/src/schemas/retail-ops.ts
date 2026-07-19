import { z } from "zod"

const emailSchema = z.string().trim().toLowerCase().pipe(z.email())

export const retailOpsStoreScopeSchema = z.object({
  storeId: z.string().trim().min(1).optional(),
})

export const retailOpsSubscriptionPlanIdSchema = z.enum([
  "growth",
  "pro",
  "starter",
])

export const retailOpsCreateSubscriptionCheckoutIntentSchema = z.object({
  planId: retailOpsSubscriptionPlanIdSchema,
  surface: z.enum(["dashboard", "mobile", "unknown"]).default("unknown"),
})

export const retailOpsStaffRoleSchema = z.enum([
  "cashier",
  "operator",
  "manager",
])

export const retailOpsStaffListSchema = retailOpsStoreScopeSchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  role: z
    .enum(["admin", "all", "cashier", "manager", "operator", "owner"])
    .default("all"),
  search: z.string().trim().min(1).max(120).optional(),
  status: z
    .enum(["active", "all", "invited", "suspended"])
    .default("all"),
})

export const retailOpsUpdateStaffStatusSchema =
  retailOpsStoreScopeSchema.extend({
    staffUserId: z.string().trim().min(1),
    status: z.enum(["active", "suspended"]),
  })

export const retailOpsCompleteStaffOnboardingSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  tenantSlug: z.string().trim().min(1).max(120).optional(),
})

export const retailOpsResolveStaffInviteTokenSchema = z.object({
  token: z.string().trim().min(20).max(256),
})

export const retailOpsInviteStaffSchema = retailOpsStoreScopeSchema.extend({
  email: emailSchema,
  externalId: z.string().trim().min(1).max(120).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  role: retailOpsStaffRoleSchema.default("cashier"),
})

export type RetailOpsCreateSubscriptionCheckoutIntentInput = z.infer<
  typeof retailOpsCreateSubscriptionCheckoutIntentSchema
>
export type RetailOpsStaffRole = z.infer<typeof retailOpsStaffRoleSchema>
export type RetailOpsStaffListInput = z.infer<typeof retailOpsStaffListSchema>
export type RetailOpsCompleteStaffOnboardingInput = z.infer<
  typeof retailOpsCompleteStaffOnboardingSchema
>
export type RetailOpsResolveStaffInviteTokenInput = z.infer<
  typeof retailOpsResolveStaffInviteTokenSchema
>
