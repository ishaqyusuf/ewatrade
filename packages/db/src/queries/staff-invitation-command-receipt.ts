import { z } from "zod"

const id = z.string().min(1).max(160)
const role = z.enum(["CASHIER", "OPERATOR", "MANAGER"])
export const staffInvitationSavedReviewSchema = z
  .object({
    recipient: z
      .object({
        email: z.string().email().max(254),
        name: z.string().max(500).nullable(),
      })
      .strict(),
    membershipBefore: z
      .object({
        role: z.string().max(32),
        status: z.string().max(32),
        accessRevision: z.number().int().min(0),
      })
      .strict()
      .nullable(),
    grants: z
      .object({
        role,
        status: z.literal("INVITED"),
        defaultStoreId: id.nullable(),
        catalogEditor: z.boolean(),
        assignments: z
          .array(
            z
              .object({ storeId: id, storeName: z.string().max(500), role })
              .strict(),
          )
          .max(100),
      })
      .strict(),
    seats: z
      .object({
        used: z.number().int().min(0),
        limit: z.number().int().min(0).nullable(),
        additional: z.number().int().min(0).max(1),
        planName: z.string().max(500),
      })
      .strict()
      .nullable(),
    reason: z.string().max(500).nullable(),
    emailEffect: z.enum(["REQUEST_INVITATION_EMAIL", "CANCEL_UNSENT_WORK"]),
    reviewedAt: z.string().datetime(),
    reviewHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
export const staffInvitationCommandReceiptSchema = z
  .object({
    version: z.literal(1),
    commandId: id,
    kind: z.enum(["INVITE", "RESEND", "REVOKE"]),
    membershipId: id,
    invitationId: id,
    notificationId: id.nullable(),
    status: z.enum(["saved", "revoked"]),
    details: staffInvitationSavedReviewSchema.optional(),
  })
  .strict()
