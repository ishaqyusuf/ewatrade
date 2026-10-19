import { z } from "zod"
import { whatsAppMediaSchema } from "./media"

export const WHATSAPP_INGRESS_RETENTION_MS = 24 * 60 * 60_000
export const WHATSAPP_INGRESS_CLOCK_SKEW_MS = 5 * 60_000

/** Normalized verified provider data only; never a caller-selected actor or scope. */
export const whatsAppIngressSchema = z
  .object({
    phoneNumberId: z.string().regex(/^\d{5,32}$/),
    senderId: z.string().regex(/^\d{7,32}$/),
    providerMessageId: z.string().min(1).max(256),
    timestamp: z.string().regex(/^\d{1,12}$/),
    type: z.enum(["text", "interactive", "media", "unsupported"]),
    text: z.string().max(8000).optional(),
    quickActionId: z.string().min(1).max(256).optional(),
    replyToMessageId: z.string().min(1).max(256).optional(),
    media: whatsAppMediaSchema.optional(),
  })
  .strict()
  .refine((value) => {
    if (value.type === "text") return Boolean(value.text?.trim())
    if (value.type === "interactive") return Boolean(value.quickActionId)
    if (value.type === "media") return Boolean(value.media)
    return true
  })
export type WhatsAppIngressInput = z.infer<typeof whatsAppIngressSchema>
