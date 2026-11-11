import { z } from "zod"

export const WHATSAPP_DELIVERY_JOB_ID = "assistant.whatsapp.delivery"
export const WHATSAPP_DELIVERY_LEASE_MS = 60_000
export const WHATSAPP_DELIVERY_REQUEST_MS = 20_000
export const WHATSAPP_DELIVERY_MAX_ATTEMPTS = 3
export const WHATSAPP_DELIVERY_RETRY_MS = 30_000
export const TELEGRAM_DELIVERY_JOB_ID = "assistant.telegram.delivery"
export const TELEGRAM_DELIVERY_MAX_ATTEMPTS = 3
export const assistantChannelDeliveryJobSchema = z
  .object({ outboxId: z.string().min(1).max(128) })
  .strict()
export const whatsAppDeliveryJobSchema = assistantChannelDeliveryJobSchema
export type AssistantChannelDeliveryJob = z.infer<
  typeof assistantChannelDeliveryJobSchema
>
export type WhatsAppDeliveryJob = z.infer<typeof whatsAppDeliveryJobSchema>
export const assistantChannelDeliveryResultSchema = z
  .object({
    status: z.enum([
      "idle",
      "busy",
      "disabled",
      "cancelled",
      "expired",
      "sent",
      "failed",
      "unknown",
    ]),
    nextOutboxId: z.string().min(1).max(128).optional(),
  })
  .strict()
export const whatsAppDeliveryResultSchema = assistantChannelDeliveryResultSchema
export type AssistantChannelDeliveryResult = z.infer<
  typeof assistantChannelDeliveryResultSchema
>
export type WhatsAppDeliveryResult = z.infer<
  typeof whatsAppDeliveryResultSchema
>
export const whatsAppAssistantCallbackSchema = z
  .string()
  .regex(
    /^ewa-wa-v1:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  )
