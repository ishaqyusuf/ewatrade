import { z } from "zod"

/**
 * Record a message the staff member has ALREADY shared with a Service Job's
 * customer themselves (in person, or from their own phone or email). Nothing
 * is sent. The recipient always comes from the Job's Order, so no recipient,
 * Store or tenant is ever drafted.
 */
export const serviceMessageShareAction = z
  .object({
    action: z.literal("service_message_share"),
    jobId: z.string().trim().min(1).max(128),
    channel: z.enum(["manual", "sms", "whatsapp"]),
    message: z.string().trim().min(1).max(1_000),
    reason: z.string().trim().min(1).max(500).optional(),
    alreadyShared: z.literal(true),
  })
  .strict()
export type ServiceMessageShare = z.infer<typeof serviceMessageShareAction>
