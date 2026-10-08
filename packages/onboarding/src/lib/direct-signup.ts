import { createHash } from "node:crypto"

import { prisma } from "@ewatrade/db"
import { onboardingDraftSchema } from "@ewatrade/db/onboarding-continuation"
import { findBusinessProfile } from "@ewatrade/utils"
import type { DirectSignupInput } from "./direct-signup-schema"
import {
  EARLY_ACCESS_ONBOARDING_KIND,
  buildEarlyAccessSignupUrl,
  generateEarlyAccessToken,
  getEarlyAccessExpiresAt,
  parseEarlyAccessOnboardingFormData,
} from "./early-access-onboarding"
import { EarlyAccessError } from "./early-access-service"

// Direct signup replaces the reviewed early-access request (owner decision,
// 7 October 2026). It issues the same `ea_` setup session immediately, so web
// and native signup keep one gate: no account exists until the session's
// email is verified.

export const DIRECT_SIGNUP_LIMITS = {
  perEmailPerHour: 3,
  perClientPerHour: 10,
}

const HOUR_MS = 60 * 60 * 1000

export function hashSignupClient(clientAddress: string | null) {
  if (!clientAddress) return null
  return createHash("sha256")
    .update(`ewatrade-signup:${clientAddress}`)
    .digest("base64url")
    .slice(0, 32)
}

export function getSignupClientAddress(headers: Headers) {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    null
  )
}

export async function startDirectSignup(
  input: DirectSignupInput,
  options: { clientHash: string | null; now?: Date },
) {
  const now = options.now ?? new Date()
  const email = input.email.trim().toLowerCase()
  const since = new Date(now.getTime() - HOUR_MS)

  const profile = findBusinessProfile(input.businessProfileKey)
  const draft = profile
    ? onboardingDraftSchema.parse({
        businessProfileKey: profile.key,
        operatingModel:
          profile.recommendedItemKinds.length === 1
            ? profile.recommendedItemKinds[0] === "service"
              ? "services"
              : "products"
            : "products_and_services",
        ...(input.phone ? { phone: input.phone } : {}),
      })
    : undefined

  return prisma.$transaction(
    async (tx) => {
      // Serialize overlapping email/client budgets before reading counts. All
      // callers take these locks in the same order, and release on commit.
      const identities = [
        `signup-email:${email}`,
        ...(options.clientHash ? [`signup-client:${options.clientHash}`] : []),
      ].sort()
      for (const identity of identities)
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${identity}, 0))`

      const [existingUser, recentForEmail, recentForClient] = await Promise.all(
        [
          tx.user.findUnique({ where: { email }, select: { id: true } }),
          tx.leadCapture.count({
            where: { type: "SIGNUP", email, createdAt: { gt: since } },
          }),
          options.clientHash
            ? tx.leadCapture.count({
                where: {
                  type: "SIGNUP",
                  createdAt: { gt: since },
                  metadata: {
                    path: ["clientHash"],
                    equals: options.clientHash,
                  },
                },
              })
            : Promise.resolve(0),
        ],
      )
      if (existingUser)
        throw new EarlyAccessError(
          "An account with this email already exists. Sign in instead.",
          409,
        )
      if (
        recentForEmail >= DIRECT_SIGNUP_LIMITS.perEmailPerHour ||
        recentForClient >= DIRECT_SIGNUP_LIMITS.perClientPerHour
      )
        throw new EarlyAccessError(
          "Too many signup attempts. Wait an hour, then try again.",
          429,
        )

      const lead = await tx.leadCapture.create({
        data: {
          type: "SIGNUP",
          email,
          fullName: input.fullName,
          companyName: input.businessName,
          phone: input.phone || null,
          metadata: {
            ...(options.clientHash ? { clientHash: options.clientHash } : {}),
            ...(input.businessProfileKey
              ? { businessProfileKey: input.businessProfileKey }
              : {}),
            source: "direct_signup",
          },
        },
      })
      const token = generateEarlyAccessToken()
      const session = await tx.onboardingSession.create({
        data: {
          token,
          expiresAt: getEarlyAccessExpiresAt(now),
          formData: {
            kind: EARLY_ACCESS_ONBOARDING_KIND,
            approvedAt: now.toISOString(),
            accessUrl: buildEarlyAccessSignupUrl({ requestUrl: "", token }),
            companyName: lead.companyName,
            email,
            fullName: lead.fullName,
            leadId: lead.id,
            phone: lead.phone,
            requestedAt: now.toISOString(),
            ...(draft ? { draft } : {}),
          },
        },
      })
      const data = parseEarlyAccessOnboardingFormData(session.formData)
      if (!data) throw new EarlyAccessError("Signup could not be started.", 503)
      return { session, data }
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}
