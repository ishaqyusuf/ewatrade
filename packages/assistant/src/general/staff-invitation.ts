import { z } from "zod"

const id = z.string().trim().min(1).max(128)
const role = z.enum(["CASHIER", "OPERATOR", "MANAGER"])
export const generalStaffInvitationIntent = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("INVITE"),
      invite: z
        .object({
          email: z
            .string()
            .trim()
            .email()
            .max(254)
            .transform((value) => value.toLowerCase()),
          name: z.string().trim().min(1).max(120).optional(),
          assignments: z
            .array(z.object({ storeId: id, role }).strict())
            .min(1)
            .max(100),
          defaultStoreId: id,
          catalogEditor: z.boolean(),
        })
        .strict()
        .refine(
          (value) =>
            new Set(value.assignments.map((row) => row.storeId)).size ===
              value.assignments.length &&
            value.assignments.some(
              (row) => row.storeId === value.defaultStoreId,
            ),
          "Choose each Store once and an assigned starting Store.",
        )
        .refine(
          (value) =>
            !value.catalogEditor ||
            value.assignments.some((row) => row.role === "MANAGER"),
          "Catalog editing requires a Manager assignment.",
        ),
    })
    .strict(),
  z
    .object({
      kind: z.literal("RESEND"),
      invitationId: id,
      reason: z.string().trim().min(1).max(500),
    })
    .strict(),
  z
    .object({
      kind: z.literal("REVOKE"),
      invitationId: id,
      reason: z.string().trim().min(1).max(500),
    })
    .strict(),
])
export const staffInvitationAction = z
  .object({
    action: z.literal("staff_invitation"),
    intent: generalStaffInvitationIntent,
  })
  .strict()
export const staffInvitationDraftInstructions =
  " When staff_invitation is available, add staff means invite/onboarding, never direct activation or credentials. Ask naturally for recipient email, optional name, exact accessible Stores and role at each, starting Store and explicit catalog editing choice. Resolve Stores from saved reads; never ask users to type internal IDs or JSON. Show recipient, all Store grants, seat impact and invitation email side effect before confirmation. For resend/revoke, resolve the exact staff member using directory/email and readStaffInvitations; clarify multiple pending records, never invent invitation IDs. Require a reason. Resend replaces the old link without changing grants. Revoke invalidates a pending link and cancels unsent work, but leaves membership INVITED and its seat counted; an already sending email can arrive with an unusable link. Confirmation saves a command and outbox, not proof of delivery. Read the owning command for current saved/queued/sending/unknown/failed/sent/delivered and accepted/expired/revoked states. Never expose acceptance links/tokens, claim an invite activates staff, or retry an uncertain send."
