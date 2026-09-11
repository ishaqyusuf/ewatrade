import { z } from "zod"

const opaqueIdSchema = z.string().trim().min(1).max(191)
const clientOperationIdSchema = z.string().trim().min(8).max(160)
const publicTokenSchema = z.string().trim().min(32).max(200)

export const STORE_CONVERSATION_NOTIFICATION_CHANNELS = [
  "push",
  "email",
  "whatsapp",
] as const

export const storeConversationNotificationChannelSchema = z.enum(
  STORE_CONVERSATION_NOTIFICATION_CHANNELS,
)

export const storeConversationNotificationContactChannelSchema = z.enum([
  "email",
  "whatsapp",
])

export const storeConversationNotificationContactRequestInputSchema = z
  .object({
    channel: storeConversationNotificationContactChannelSchema,
    clientOperationId: clientOperationIdSchema,
    consentAccepted: z.literal(true),
    conversationId: opaqueIdSchema,
    destination: z.string().trim().min(3).max(320),
    publicToken: publicTokenSchema,
  })
  .strict()
  .superRefine((input, context) => {
    if (
      input.channel === "email" &&
      !z.string().email().safeParse(input.destination).success
    ) {
      context.addIssue({
        code: "custom",
        message: "Enter a valid email address.",
        path: ["destination"],
      })
    }
    if (
      input.channel === "whatsapp" &&
      !/^\+[1-9]\d{7,14}$/.test(input.destination)
    ) {
      context.addIssue({
        code: "custom",
        message: "Enter a valid international WhatsApp number.",
        path: ["destination"],
      })
    }
  })

export const storeConversationNotificationContactConfirmInputSchema = z
  .object({
    clientOperationId: clientOperationIdSchema,
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/),
    conversationId: opaqueIdSchema,
    publicToken: publicTokenSchema,
    verificationId: opaqueIdSchema,
  })
  .strict()

export const storeConversationNotificationContactRevokeInputSchema = z
  .object({
    clientOperationId: clientOperationIdSchema,
    confirmed: z.literal(true),
    contactId: opaqueIdSchema,
    conversationId: opaqueIdSchema,
    publicToken: publicTokenSchema,
  })
  .strict()

export const storeConversationNotificationContactListInputSchema = z
  .object({
    conversationId: opaqueIdSchema,
    publicToken: publicTokenSchema,
  })
  .strict()

const orderedChannelsSchema = z
  .array(storeConversationNotificationChannelSchema)
  .min(1)
  .max(STORE_CONVERSATION_NOTIFICATION_CHANNELS.length)
  .refine((channels) => new Set(channels).size === channels.length, {
    message: "Notification channels cannot be repeated.",
  })

export const storeConversationAccountNotificationPreferenceInputSchema = z
  .object({
    clientOperationId: clientOperationIdSchema,
    orderedChannels: orderedChannelsSchema,
    reopeningEnabled: z.boolean(),
    unreadEnabled: z.boolean(),
  })
  .strict()

export const storeConversationPushEndpointInputSchema = z.discriminatedUnion(
  "kind",
  [
    z
      .object({
        clientOperationId: clientOperationIdSchema,
        conversationId: opaqueIdSchema,
        expoPushToken: z
          .string()
          .trim()
          .regex(/^ExponentPushToken\[[A-Za-z0-9_-]+\]$/),
        kind: z.literal("native_expo"),
        publicToken: publicTokenSchema,
      })
      .strict(),
    z
      .object({
        auth: z.string().trim().min(16).max(512),
        clientOperationId: clientOperationIdSchema,
        conversationId: opaqueIdSchema,
        endpoint: z.string().url().max(2_048),
        kind: z.literal("web_push"),
        p256dh: z.string().trim().min(16).max(512),
        publicToken: publicTokenSchema,
      })
      .strict(),
  ],
)

export const storeConversationPushEndpointRevokeInputSchema = z
  .object({
    clientOperationId: clientOperationIdSchema,
    confirmed: z.literal(true),
    conversationId: opaqueIdSchema,
    endpointId: opaqueIdSchema,
    publicToken: publicTokenSchema,
  })
  .strict()

export const storeConversationNotifyWhenAvailableInputSchema = z
  .object({
    clientOperationId: clientOperationIdSchema,
    confirmed: z.literal(true),
    conversationId: opaqueIdSchema,
    publicToken: publicTokenSchema,
  })
  .strict()

export type StoreConversationNotificationChannel = z.infer<
  typeof storeConversationNotificationChannelSchema
>
export type StoreConversationNotificationContactRequestInput = z.infer<
  typeof storeConversationNotificationContactRequestInputSchema
>
export type StoreConversationPushEndpointInput = z.infer<
  typeof storeConversationPushEndpointInputSchema
>
