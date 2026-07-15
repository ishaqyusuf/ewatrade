import { randomBytes } from "node:crypto"

import { z } from "zod"

export const EARLY_ACCESS_ONBOARDING_KIND = "early_access"

const DEFAULT_ACCESS_LINK_TTL_DAYS = 7
const ACCESS_TOKEN_BYTES = 32

export const earlyAccessOnboardingFormDataSchema = z.object({
  accessUrl: z.string().url(),
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
  const configuredBaseUrl = process.env.NEXT_PUBLIC_MARKETING_URL?.trim()
  const baseUrl = configuredBaseUrl || new URL(input.requestUrl).origin
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
