import { z } from "zod"

const opaqueIdSchema = z.string().trim().min(1).max(191)
const clientOperationIdSchema = z.string().trim().min(8).max(160)

export const storeConversationCustomerAccountAuthInputSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .transform((value) => value.toLowerCase()),
    mode: z.enum(["sign_in", "sign_up"]),
    name: z.string().trim().min(1).max(120).optional(),
    password: z.string().min(8).max(128),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.mode === "sign_up" && !value.name) {
      context.addIssue({
        code: "custom",
        message: "Enter your name.",
        path: ["name"],
      })
    }
  })

export const storeConversationAccountInvitationMilestoneSchema = z.literal(
  "first_released_quote",
)

export const storeConversationAccountInvitationStateSchema = z.enum([
  "dismissed",
  "linked",
  "offered",
])

export const storeConversationAccountInvitationActionSchema = z.enum([
  "dismiss",
  "sign_in",
  "sign_up",
])

export const storeConversationAccountInvitationProjectionSchema = z
  .object({
    actions: z.array(storeConversationAccountInvitationActionSchema).max(3),
    body: z.string().trim().min(1).max(320),
    id: opaqueIdSchema,
    milestone: storeConversationAccountInvitationMilestoneSchema,
    state: storeConversationAccountInvitationStateSchema,
    title: z.string().trim().min(1).max(120),
  })
  .strict()

export const storeConversationAccountInvitationDismissInputSchema = z
  .object({
    clientOperationId: clientOperationIdSchema,
    conversationId: opaqueIdSchema,
    invitationId: opaqueIdSchema,
    messageId: opaqueIdSchema,
    publicToken: z.string().trim().min(32).max(200),
  })
  .strict()

export const storeConversationAccountCandidateListInputSchema = z
  .object({
    cursor: z.string().trim().min(1).max(512).optional(),
    pageSize: z.number().int().min(1).max(50).default(25),
  })
  .strict()

export const storeConversationAccountLinkInputSchema = z
  .object({
    clientOperationId: clientOperationIdSchema,
    confirmed: z.literal(true),
    conversationIds: z
      .array(opaqueIdSchema)
      .min(1)
      .max(25)
      .transform((ids) => [...new Set(ids)].sort()),
  })
  .strict()

export const storeConversationAccountDeviceListInputSchema = z
  .object({})
  .strict()

export const storeConversationAccountDeviceRevokeInputSchema = z
  .object({
    clientOperationId: clientOperationIdSchema,
    confirmed: z.literal(true),
    deviceId: opaqueIdSchema,
  })
  .strict()

export type StoreConversationAccountInvitationMilestone = z.infer<
  typeof storeConversationAccountInvitationMilestoneSchema
>
export type StoreConversationCustomerAccountAuthInput = z.infer<
  typeof storeConversationCustomerAccountAuthInputSchema
>
export type StoreConversationAccountInvitationState = z.infer<
  typeof storeConversationAccountInvitationStateSchema
>
export type StoreConversationAccountInvitationAction = z.infer<
  typeof storeConversationAccountInvitationActionSchema
>
export type StoreConversationAccountInvitationProjection = z.infer<
  typeof storeConversationAccountInvitationProjectionSchema
>
export type StoreConversationAccountInvitationDismissInput = z.infer<
  typeof storeConversationAccountInvitationDismissInputSchema
>
export type StoreConversationAccountCandidateListInput = z.infer<
  typeof storeConversationAccountCandidateListInputSchema
>
export type StoreConversationAccountLinkInput = z.infer<
  typeof storeConversationAccountLinkInputSchema
>
export type StoreConversationAccountDeviceRevokeInput = z.infer<
  typeof storeConversationAccountDeviceRevokeInputSchema
>
