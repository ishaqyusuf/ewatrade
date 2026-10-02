import { randomBytes } from "node:crypto"

import { z } from "zod"

export const EARLY_ACCESS_ONBOARDING_KIND = "early_access"
export const EARLY_ACCESS_REQUEST_KIND = "early_access_request"
export const EARLY_ACCESS_VERIFICATION_KIND = "early_access_verification"

const DEFAULT_ACCESS_LINK_TTL_DAYS = 7
const ACCESS_TOKEN_BYTES = 32

export const earlyAccessOnboardingFormDataSchema = z.object({
  accessUrl: z.string().url(),
  approvedAt: z.string().datetime(),
  emailVerifiedAt: z.string().datetime().optional(),
  companyName: z.string().nullable().optional(),
  email: z.string().email(),
  fullName: z.string().trim().min(1),
  kind: z.literal(EARLY_ACCESS_ONBOARDING_KIND),
  leadId: z.string().trim().min(1),
  phone: z.string().nullable().optional(),
  requestedAt: z.string().datetime(),
  roleTitle: z.string().nullable().optional(),
})

export type EarlyAccessOnboardingFormData = z.infer<
  typeof earlyAccessOnboardingFormDataSchema
>

export function generateEarlyAccessToken() {
  return `ea_${randomBytes(ACCESS_TOKEN_BYTES).toString("base64url")}`
}

export function generateEarlyAccessRequestToken() {
  return `ear_${randomBytes(ACCESS_TOKEN_BYTES).toString("base64url")}`
}

export function getEarlyAccessRequestExpiresAt(now = new Date()) {
  return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
}

// Hosted bearer links must never inherit an untrusted request host.
export function getEarlyAccessOrigin(requestUrl: string) {
  const configured = process.env.NEXT_PUBLIC_MARKETING_URL?.trim()
  const hosted =
    process.env.NODE_ENV === "production" ||
    process.env.APP_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  if (hosted && !configured)
    throw new Error("Marketing email origin is not configured.")
  const url = new URL(configured || requestUrl)
  if (
    url.username ||
    url.password ||
    (hosted && url.protocol !== "https:") ||
    !["https:", "http:"].includes(url.protocol)
  )
    throw new Error("Marketing email origin is invalid.")
  return url.origin
}

export function buildEarlyAccessApprovalUrl(input: {
  requestUrl: string
  token: string
  continueToSetup?: boolean
}) {
  const url = new URL(
    "/api/early-access/approve",
    getEarlyAccessOrigin(input.requestUrl),
  )
  url.searchParams.set("token", input.token)
  if (input.continueToSetup) url.searchParams.set("continue", "1")
  return url.toString()
}

function getAccessLinkTtlDays() {
  const parsed = Number.parseInt(
    process.env.EARLY_ACCESS_LINK_TTL_DAYS ?? "",
    10,
  )

  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_ACCESS_LINK_TTL_DAYS
}

export function getEarlyAccessExpiresAt(now = new Date()) {
  return new Date(now.getTime() + getAccessLinkTtlDays() * 24 * 60 * 60 * 1000)
}

export function buildEarlyAccessSignupUrl(input: {
  requestUrl: string
  token: string
}) {
  const baseUrl = getEarlyAccessOrigin(input.requestUrl)
  const url = new URL("/signup", baseUrl)

  url.searchParams.set("access_token", input.token)

  return url.toString()
}

export function parseEarlyAccessOnboardingFormData(value: unknown) {
  const result = earlyAccessOnboardingFormDataSchema.safeParse(value)

  return result.success ? result.data : null
}

export function splitLeadFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  const [firstName, ...rest] = parts

  return {
    firstName: firstName ?? "",
    lastName: rest.join(" "),
  }
}
