import { isBusinessProfileKey } from "@ewatrade/utils"
import { z } from "zod"

// Client-safe: shared by the signup start forms and the start handler.
export const directSignupSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Enter your full name.")
      .max(120, "Use 120 characters or fewer."),
    email: z.email("Enter a valid email address.").max(200),
    businessName: z
      .string()
      .trim()
      .min(2, "Enter your business name.")
      .max(120, "Use 120 characters or fewer."),
    phone: z.string().trim().max(40).optional().or(z.literal("")),
    businessProfileKey: z
      .string()
      .trim()
      .max(120)
      .refine(isBusinessProfileKey, "Select a supported business profile.")
      .optional(),
  })
  .strict()

export type DirectSignupInput = z.infer<typeof directSignupSchema>

export type DirectSignupStartResponse = {
  accessToken: string
  expiresAt: string
  message: string
  qaPreview?: {
    emailSent?: boolean
    stage?: "approval" | "verification"
    accessUrl: string
    emailHtml: string
    expiresAt: string
  }
}
