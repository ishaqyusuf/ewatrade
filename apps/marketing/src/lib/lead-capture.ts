import type { LeadCaptureType } from "@ewatrade/db"
import { z } from "zod"

export const businessSizeOptions = [
  "solo",
  "2_to_10",
  "11_to_50",
  "51_plus",
] as const
export const recordSystemOptions = [
  "paper",
  "spreadsheets",
  "software",
  "mixed",
  "starting",
] as const
export const launchTimelineOptions = [
  "as_soon_as_possible",
  "within_30_days",
  "within_3_months",
  "exploring",
] as const
export const setupNeedOptions = [
  "catalog",
  "inventory",
  "sales",
  "services",
  "customers",
  "finance",
  "storefront",
] as const

export const earlyAccessSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.email().max(200),
  companyName: z.string().trim().min(2).max(120),
  businessSize: z.enum(businessSizeOptions),
  recordSystem: z.enum(recordSystemOptions),
  launchTimeline: z.enum(launchTimelineOptions),
  setupNeeds: z
    .array(z.enum(setupNeedOptions))
    .min(1)
    .max(setupNeedOptions.length),
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
