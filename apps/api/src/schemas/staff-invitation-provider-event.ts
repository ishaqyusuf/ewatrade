import { z } from "zod"

const identifier = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-zA-Z0-9_-]+$/)
const digest = z.string().regex(/^[a-f0-9]{64}$/)
const timestamp = z
  .string()
  .max(80)
  .refine((value) => Number.isFinite(new Date(value).getTime()))

/** Strip provider content; only these original delivery facts cross into the DB. */
export const staffInvitationProviderEventSchema = z.object({
  type: z.enum([
    "email.sent",
    "email.delivered",
    "email.bounced",
    "email.failed",
    "email.complained",
    "email.suppressed",
  ]),
  created_at: timestamp,
  data: z.object({
    email_id: z.string().min(1).max(512),
    created_at: timestamp,
    to: z.array(z.string().email().max(320)).length(1),
    tags: z.object({
      category: z.literal("staff_invitation"),
      tenant_id: identifier,
      notification_id: identifier,
      payload_hash: digest,
      destination_digest: digest,
    }),
  }),
})
