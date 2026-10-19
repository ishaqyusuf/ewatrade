import { z } from "zod"

export const whatsAppLinkLifetimeMs = 5 * 60_000
export const whatsAppGrantIdleMs = 7 * 24 * 60 * 60_000
export const whatsAppGrantLifetimeMs = 30 * 24 * 60 * 60_000
export const whatsAppFreshSessionMs = 10 * 60_000
export const whatsAppLinkCodeSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/)

/** Only an explicit, purpose-bound command can claim a channel identity. */
export function parseWhatsAppLinkMessage(text: string | undefined) {
  const match = text
    ?.trim()
    .match(/^connect to ewatrade: ([A-Za-z0-9_-]{43})$/i)
  return match ? (match[1] ?? null) : null
}

export function whatsAppConnectUrl(phone: string, code: string) {
  if (!/^[1-9]\d{7,14}$/.test(phone))
    throw new Error("WhatsApp destination unavailable.")
  return `https://wa.me/${phone}?text=${encodeURIComponent(`Connect to EwaTrade: ${whatsAppLinkCodeSchema.parse(code)}`)}`
}

export function maskWhatsAppSender(senderId: string) {
  if (!/^[1-9]\d{7,14}$/.test(senderId)) return "Unknown number"
  return `+${"•".repeat(senderId.length - 4)}${senderId.slice(-4)}`
}

/** OTPs sent back to the platform are neither linking proof nor model input. */
export function isWhatsAppVerificationCode(text: string | undefined) {
  return /^\d{6}$/.test(text?.trim() ?? "")
}

export const whatsAppLinkIdSchema = z.string().min(1).max(128)
export const whatsAppConfirmLinkSchema = z
  .object({
    linkId: whatsAppLinkIdSchema,
    expectedRevision: z.number().int().positive(),
  })
  .strict()

const generation = z.number().int().positive().max(2_147_483_647)
export const whatsAppScopePageSchema = z
  .object({
    identityId: whatsAppLinkIdSchema,
    cursor: whatsAppLinkIdSchema.optional(),
  })
  .strict()
export const whatsAppStorePageSchema = whatsAppScopePageSchema.extend({
  grantId: whatsAppLinkIdSchema,
})
export const whatsAppChatPageSchema = whatsAppStorePageSchema.extend({
  storeId: whatsAppLinkIdSchema,
})
export const whatsAppScopeSelectionSchema = z
  .object({
    identityId: whatsAppLinkIdSchema,
    grantId: whatsAppLinkIdSchema,
    storeId: whatsAppLinkIdSchema,
    requestId: z.string().uuid(),
    expectedIdentityGeneration: generation,
    expectedGrantGeneration: generation,
    expectedSelectionGeneration: generation,
    action: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("new") }).strict(),
      z
        .object({
          kind: z.literal("resume"),
          conversationId: whatsAppLinkIdSchema,
          purpose: z.enum(["GENERAL", "SETUP", "PRODUCT_CREATE"]),
        })
        .strict(),
    ]),
  })
  .strict()
export type WhatsAppScopeSelection = z.infer<
  typeof whatsAppScopeSelectionSchema
>
