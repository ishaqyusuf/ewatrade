import { prisma } from "@ewatrade/db"
import { z } from "zod"
import {
  EARLY_ACCESS_ONBOARDING_KIND,
  EARLY_ACCESS_REQUEST_KIND,
  EARLY_ACCESS_VERIFICATION_KIND,
  buildEarlyAccessSignupUrl,
  generateEarlyAccessToken,
  getEarlyAccessExpiresAt,
  parseEarlyAccessOnboardingFormData,
} from "./early-access-onboarding"

const requestDataSchema = z.object({
  kind: z.literal(EARLY_ACCESS_REQUEST_KIND),
  leadId: z.string(),
  requestedAt: z.string().datetime(),
  approvedToken: z.string().optional(),
})
const verificationDataSchema = z.object({
  kind: z.literal(EARLY_ACCESS_VERIFICATION_KIND),
  accessToken: z.string(),
  email: z.email(),
})

export class EarlyAccessError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export async function approveEarlyAccess(token: string, requestUrl: string) {
  return prisma.$transaction(
    async (tx) => {
      const request = await tx.onboardingSession.findUnique({
        where: { token },
      })
      const data = requestDataSchema.safeParse(request?.formData)
      if (!request || !data.success)
        throw new EarlyAccessError("This approval link is invalid.", 404)
      if (request.expiresAt <= new Date())
        throw new EarlyAccessError("This approval link has expired.", 410)
      const lead = await tx.leadCapture.findUnique({
        where: { id: data.data.leadId },
      })
      if (!lead || lead.type !== "EARLY_ACCESS")
        throw new EarlyAccessError("This request is unavailable.", 404)
      if (request.completed) {
        const session = data.data.approvedToken
          ? await tx.onboardingSession.findUnique({
              where: { token: data.data.approvedToken },
            })
          : null
        if (!session || !parseEarlyAccessOnboardingFormData(session.formData))
          throw new EarlyAccessError(
            "This approval has already been used.",
            410,
          )
        if (session.completed || session.expiresAt <= new Date())
          throw new EarlyAccessError(
            "This setup link has expired or has already been used. Request access again.",
            410,
          )
        return { lead, session }
      }
      const approvedAt = new Date()
      const accessToken = generateEarlyAccessToken()
      const claimed = await tx.onboardingSession.updateMany({
        where: {
          id: request.id,
          completed: false,
          expiresAt: { gt: approvedAt },
        },
        data: {
          completed: true,
          formData: {
            ...data.data,
            approvedAt: approvedAt.toISOString(),
            approvedToken: accessToken,
          },
        },
      })
      if (claimed.count !== 1)
        throw new EarlyAccessError(
          "Another approval is in progress. Open this link again.",
          409,
        )
      const session = await tx.onboardingSession.create({
        data: {
          token: accessToken,
          expiresAt: getEarlyAccessExpiresAt(approvedAt),
          formData: {
            kind: EARLY_ACCESS_ONBOARDING_KIND,
            approvedAt: approvedAt.toISOString(),
            accessUrl: buildEarlyAccessSignupUrl({
              requestUrl,
              token: accessToken,
            }),
            companyName: lead.companyName,
            email: lead.email,
            fullName: lead.fullName,
            leadId: lead.id,
            phone: lead.phone,
            roleTitle: lead.roleTitle,
            requestedAt: data.data.requestedAt,
          },
        },
      })
      return { lead, session }
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}

export async function requireApprovedSession(token: string) {
  const session = await prisma.onboardingSession.findUnique({
    where: { token },
  })
  const data = parseEarlyAccessOnboardingFormData(session?.formData)
  if (!session || !data)
    throw new EarlyAccessError("This approved setup link is invalid.", 404)
  if (session.completed || session.expiresAt <= new Date())
    throw new EarlyAccessError(
      "This setup link has expired or has already been used.",
      410,
    )
  return { session, data }
}

export async function verifyEarlyAccessEmail(token: string) {
  return prisma.$transaction(
    async (tx) => {
      const verification = await tx.onboardingSession.findUnique({
        where: { token },
      })
      const parsed = verificationDataSchema.safeParse(verification?.formData)
      if (!verification || !parsed.success)
        throw new EarlyAccessError("This verification link is invalid.", 404)
      if (verification.expiresAt <= new Date())
        throw new EarlyAccessError(
          "This verification link has expired. Send a new verification email.",
          410,
        )
      const session = await tx.onboardingSession.findUnique({
        where: { token: parsed.data.accessToken },
      })
      const data = parseEarlyAccessOnboardingFormData(session?.formData)
      if (
        !session ||
        !data ||
        session.completed ||
        session.expiresAt <= new Date() ||
        data.email !== parsed.data.email
      )
        throw new EarlyAccessError(
          "This setup link has expired or has already been used.",
          410,
        )
      if (!data.emailVerifiedAt) {
        const updated = await tx.onboardingSession.updateMany({
          where: {
            id: session.id,
            completed: false,
            formData: { equals: JSON.parse(JSON.stringify(session.formData)) },
            expiresAt: { gt: new Date() },
          },
          data: {
            formData: { ...data, emailVerifiedAt: new Date().toISOString() },
          },
        })
        if (updated.count !== 1)
          throw new EarlyAccessError(
            "Setup changed while verifying. Open the verification link again.",
            409,
          )
      }
      await tx.onboardingSession.updateMany({
        where: { id: verification.id, completed: false },
        data: { completed: true },
      })
      return buildEarlyAccessSignupUrl({ requestUrl: "", token: session.token })
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}
