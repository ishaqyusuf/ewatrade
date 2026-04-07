import type { LeadCaptureType } from "@ewatrade/db"
import { z } from "zod"

export const earlyAccessSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.email().max(200),
  companyName: z.string().trim().max(160).optional().or(z.literal("")),
  roleTitle: z.string().trim().max(120).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  message: z.string().trim().max(1_000).optional().or(z.literal("")),
})

export const waitlistSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.email().max(200),
})

export function toLeadCapturePayload(
  type: LeadCaptureType,
  payload: z.infer<typeof earlyAccessSchema> | z.infer<typeof waitlistSchema>,
) {
  return {
    type,
    email: payload.email,
    fullName: payload.fullName,
    companyName: "companyName" in payload ? payload.companyName || null : null,
    roleTitle: "roleTitle" in payload ? payload.roleTitle || null : null,
    phone: "phone" in payload ? payload.phone || null : null,
    message: "message" in payload ? payload.message || null : null,
  }
}
