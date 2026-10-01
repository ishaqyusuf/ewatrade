import { z } from "zod"

export const requestAccountDeletionSchema = z
  .object({
    confirmation: z.literal("DELETE MY ACCOUNT"),
  })
  .strict()

export const externalDeletionEmailSchema = z
  .object({
    email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  })
  .strict()

export const externalDeletionVerifySchema = externalDeletionEmailSchema
  .extend({
    code: z.string().regex(/^\d{6}$/),
  })
  .strict()

export const acceptLegalDocumentsSchema = z
  .object({
    version: z.string().min(1).max(80),
    surface: z.enum(["mobile", "web"]),
    acceptedTerms: z.literal(true),
    acknowledgedPrivacyNotice: z.literal(true),
  })
  .strict()
