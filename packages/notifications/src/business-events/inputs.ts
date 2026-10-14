import { z } from "zod"
import { businessEventTypeSchema } from "./contracts"

const id = z.string().trim().min(1).max(160)
const cursor = z.string().min(1).max(4096).optional()
const limit = z.number().int().min(1).max(100).default(25)
const iso = z.iso.datetime({ offset: true })
const revision = z.number().int().nonnegative()
const methods = z.object({ inApp: z.boolean(), email: z.boolean() }).strict()
const preference = z.enum(["inherit", "on", "off"])

export const businessActivityGetInput = z.object({ key: id }).strict()
export const businessActivityFiltersInput = z
  .object({
    actorQuery: z.string().trim().min(1).max(160).optional(),
    actorCursor: cursor,
  })
  .strict()

export const businessNotificationListInput = z
  .object({
    state: z.enum(["unread", "read", "archived", "all"]).default("unread"),
    types: z.array(businessEventTypeSchema).min(1).max(100).optional(),
    cursor,
    direction: z.literal("forward").optional(),
    limit,
  })
  .strict()
export const businessNotificationReceiptInput = z
  .object({ receiptIds: z.array(id).min(1).max(100) })
  .strict()
export const businessNotificationMarkAllInput = z
  .object({ through: iso })
  .strict()
export const businessNotificationPreferenceInput = z
  .object({
    type: businessEventTypeSchema,
    preference: z.object({ inApp: preference, email: preference }).strict(),
  })
  .strict()

export const businessNotificationPolicyInput = z
  .object({
    type: businessEventTypeSchema,
    allowed: methods,
    defaults: methods,
    recipientRoles: z.array(z.string().min(1).max(80)).max(7),
    expectedRevision: revision,
  })
  .strict()
  .superRefine((input, ctx) => {
    if (
      (input.defaults.inApp && !input.allowed.inApp) ||
      (input.defaults.email && !input.allowed.email)
    )
      ctx.addIssue({
        code: "custom",
        path: ["defaults"],
        message: "Default delivery cannot exceed allowed methods.",
      })
  })

export const businessNotificationScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("business") }).strict(),
  z.object({ kind: z.literal("accessible_stores") }).strict(),
  z
    .object({
      kind: z.literal("stores"),
      storeIds: z.array(id).min(1).max(100),
    })
    .strict(),
])
export const businessNotificationSubscriptionsInput = z
  .object({
    membershipId: id.optional(),
    cursor,
    direction: z.literal("forward").optional(),
    limit,
  })
  .strict()
export const businessNotificationSubscriptionInput = z
  .object({
    membershipId: id,
    type: businessEventTypeSchema,
    scope: businessNotificationScopeSchema,
    allowed: methods,
    enabled: z.boolean(),
    expectedRevision: revision,
  })
  .strict()

export type BusinessNotificationListInput = z.input<
  typeof businessNotificationListInput
>
export type BusinessNotificationReceiptInput = z.input<
  typeof businessNotificationReceiptInput
>
export type BusinessNotificationMarkAllInput = z.input<
  typeof businessNotificationMarkAllInput
>
export type BusinessNotificationPreferenceInput = z.input<
  typeof businessNotificationPreferenceInput
>
export type BusinessNotificationPolicyInput = z.input<
  typeof businessNotificationPolicyInput
>
export type BusinessNotificationSubscriptionsInput = z.input<
  typeof businessNotificationSubscriptionsInput
>
export type BusinessNotificationSubscriptionInput = z.input<
  typeof businessNotificationSubscriptionInput
>
