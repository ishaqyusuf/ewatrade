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
    // Only the signature-verified provider adapter supplies this structured input.
    // It is never ordinary model text, an approval or a caller-selected scope.
    flowResponse: z
      .discriminatedUnion("status", [
        z.object({ status: z.literal("invalid") }).strict(),
        z
          .object({
            status: z.literal("valid"),
            flowToken: z.string().regex(/^[A-Za-z0-9:_-]{16,512}$/),
            data: z.record(z.string().max(128), z.unknown()),
          })
          .strict(),
      ])
      .optional(),
  })
  .strict()
  .refine(
    (value) =>
      !value.flowResponse ||
      (value.type === "interactive" &&
        !value.text &&
        !value.quickActionId &&
        !value.media &&
        JSON.stringify(value.flowResponse).length <= 32768),
  )
  .refine((value) => {
    if (value.type === "text") return Boolean(value.text?.trim())
    if (value.type === "interactive")
      return Boolean(value.quickActionId || value.flowResponse)
    if (value.type === "media") return Boolean(value.media)
    return true
  })
export type WhatsAppIngressInput = z.infer<typeof whatsAppIngressSchema>
