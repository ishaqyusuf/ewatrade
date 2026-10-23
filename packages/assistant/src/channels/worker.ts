import { z } from "zod"

export const WHATSAPP_TURN_LEASE_MS = 180_000
export const WHATSAPP_TURN_RETRY_MS = 30_000
export const WHATSAPP_TURN_MAX_ATTEMPTS = 4
export const WHATSAPP_TURN_JOB_ID = "assistant.whatsapp.turn"
export const whatsAppTurnJobSchema = z
  .object({ ingressId: z.string().min(1).max(128) })
  .strict()
export type WhatsAppTurnJob = z.infer<typeof whatsAppTurnJobSchema>
export const whatsAppTurnResultSchema = z
  .object({
    status: z.enum([
      "idle",
      "busy",
      "disabled",
      "completed",
      "failed",
      "cancelled",
      "expired",
      "retry",
    ]),
    nextIngressId: z.string().min(1).max(128).optional(),
    /** Completed identity-control receipt only; never a merchant/outbox authorization. */
    disconnectedControlId: z.string().min(1).max(128).optional(),
  })
  .strict()
export type WhatsAppTurnResult = z.infer<typeof whatsAppTurnResultSchema>
