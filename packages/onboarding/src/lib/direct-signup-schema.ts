import { isBusinessProfileKey } from "@ewatrade/utils"
import { z } from "zod"
import {
  normalizeInternationalPhone,
  phoneCountry,
} from "./international-phone"

// Client-safe: shared by the signup start forms and the start handler.
const directSignupFields = z
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
    phoneCountry: z
      .string()
      .toUpperCase()
      .refine(
        (value) => Boolean(phoneCountry(value)),
        "Select a phone country.",
      )
      .optional(),
    phone: z.string().trim().max(40).optional().or(z.literal("")),
    businessProfileKey: z
      .string()
      .trim()
      .max(120)
      .refine(isBusinessProfileKey, "Select a supported business profile.")
      .optional(),
  })
  .strict()

// Older native clients can still omit phone. Country-aware callers validate
// the number on the server using the same rules as the web form.
export const directSignupSchema = directSignupFields
  .superRefine((value, ctx) => {
    if (
      value.phoneCountry &&
      !normalizeInternationalPhone(value.phone ?? "", value.phoneCountry)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["phone"],
        message: "Enter a valid phone number for the selected country.",
      })
    }
  })
  .transform((value) => ({
    ...value,
    phone: value.phoneCountry
      ? (normalizeInternationalPhone(value.phone ?? "", value.phoneCountry) ??
        "")
      : value.phone,
  }))

export const websiteSignupSchema = directSignupFields
  .omit({ businessProfileKey: true })
  .extend({
    phoneCountry: z
      .string()
      .toUpperCase()
      .refine(
        (value) => Boolean(phoneCountry(value)),
        "Select a phone country.",
      ),
    phone: z.string().min(1, "Enter your phone number.").max(40),
  })
  .superRefine((value, ctx) => {
    if (
      value.phoneCountry &&
      !normalizeInternationalPhone(value.phone, value.phoneCountry)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["phone"],
        message: "Enter a valid phone number for the selected country.",
      })
    }
  })

export type DirectSignupInput = z.input<typeof directSignupSchema>

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
