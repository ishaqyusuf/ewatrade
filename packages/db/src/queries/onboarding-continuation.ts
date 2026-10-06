import { z } from "zod"
import type { DbClient } from "./types"

// Browser and native clients resume the same approved session. Credentials and
// legal acceptance are deliberately absent from the resumable form snapshot.
export const onboardingDraftSchema = z
  .object({
    step: z.enum(["businessType", "profile", "business", "account"]).optional(),
    addressLine1: z.string().trim().max(240).optional(),
    city: z.string().trim().max(120).optional(),
    countryCode: z.string().trim().max(5).optional(),
    region: z.string().trim().max(120).optional(),
    phone: z.string().trim().max(40).optional(),
    businessProfileKey: z.string().trim().max(120).optional(),
    currencyCode: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    operatingModel: z.string().trim().max(80).optional(),
    orderChannels: z.array(z.string().max(80)).max(10).optional(),
    otherBusinessDescription: z.string().trim().max(240).optional(),
    teamSize: z.string().trim().max(80).optional(),
  })
  .strict()

export const approvedOnboardingDataSchema = z.object({
  accessUrl: z.string().url(),
  approvedAt: z.string().datetime(),
  emailVerifiedAt: z.string().datetime().optional(),
  companyName: z.string().nullable().optional(),
  email: z.string().email(),
  fullName: z.string().trim().min(1),
  kind: z.literal("early_access"),
  leadId: z.string().trim().min(1),
  phone: z.string().nullable().optional(),
  requestedAt: z.string().datetime(),
  roleTitle: z.string().nullable().optional(),
  draft: onboardingDraftSchema.optional(),
})

export type OnboardingDraft = z.infer<typeof onboardingDraftSchema>

export class OnboardingContinuationError extends Error {
  constructor(
    readonly code:
      | "APPROVAL_REQUIRED"
      | "INVALID"
      | "EXPIRED"
      | "USED"
      | "IDENTITY"
      | "UNVERIFIED"
      | "CONFLICT",
  ) {
    super(
      {
        APPROVAL_REQUIRED: "Open your approved setup email to continue signup.",
        INVALID: "This setup link is invalid. Request a new setup link.",
        EXPIRED: "This setup link has expired. Request a new setup link.",
        USED: "This setup is already complete. Sign in to your account.",
        IDENTITY: "Use the approved email and business name for this setup.",
        UNVERIFIED: "Verify the approved email before completing setup.",
        CONFLICT:
          "Setup changed while you were continuing. Open the link again.",
      }[code],
    )
    this.name = "OnboardingContinuationError"
  }
}

export async function readApprovedOnboarding(db: DbClient, token: string) {
  if (!/^ea_[A-Za-z0-9_-]{43}$/.test(token))
    throw new OnboardingContinuationError("INVALID")
  const session = await db.onboardingSession.findUnique({ where: { token } })
  const parsed = approvedOnboardingDataSchema.safeParse(session?.formData)
  if (!session || !parsed.success)
    throw new OnboardingContinuationError("INVALID")
  if (session.completed) throw new OnboardingContinuationError("USED")
  if (session.expiresAt <= new Date())
    throw new OnboardingContinuationError("EXPIRED")
  return { session, data: parsed.data }
}

// Run in a transaction. The email capability is purpose-bound to one approved
// recipient; replay may resume that still-open setup, never create a new one.
export async function verifyApprovedOnboardingEmail(
  db: DbClient,
  token: string,
) {
  if (!/^ear_[A-Za-z0-9_-]{43}$/.test(token))
    throw new OnboardingContinuationError("INVALID")
  const verification = await db.onboardingSession.findUnique({
    where: { token },
  })
  const parsed = z
    .object({
      kind: z.literal("early_access_verification"),
      accessToken: z.string(),
      email: z.string().email(),
    })
    .safeParse(verification?.formData)
  if (!verification || !parsed.success)
    throw new OnboardingContinuationError("INVALID")
  if (verification.expiresAt <= new Date())
    throw new OnboardingContinuationError("EXPIRED")
  const { session, data } = await readApprovedOnboarding(
    db,
    parsed.data.accessToken,
  )
  if (data.email !== parsed.data.email)
    throw new OnboardingContinuationError("IDENTITY")
  if (!data.emailVerifiedAt) {
    const changed = await db.onboardingSession.updateMany({
      where: {
        id: session.id,
        completed: false,
        expiresAt: { gt: new Date() },
        formData: { equals: JSON.parse(JSON.stringify(session.formData)) },
      },
      data: {
        formData: { ...data, emailVerifiedAt: new Date().toISOString() },
      },
    })
    if (changed.count !== 1) throw new OnboardingContinuationError("CONFLICT")
  }
  await db.onboardingSession.updateMany({
    where: { id: verification.id, completed: false },
    data: { completed: true },
  })
  return { accessToken: session.token }
}

export async function saveApprovedOnboardingDraft(
  db: DbClient,
  input: { token: string; draft: z.infer<typeof onboardingDraftSchema> },
) {
  const patch = onboardingDraftSchema.parse(input.draft)
  const { session, data } = await readApprovedOnboarding(db, input.token)
  // Clients expose different permitted fields. Omission is not deletion: a
  // native city edit must retain country/region captured by the browser.
  // Empty strings/arrays remain explicit clears; undefined is an omission.
  const draft = {
    ...data.draft,
    ...Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    ),
  }
  // Compare the JSON snapshot too: verification or another device's edits must
  // never be overwritten by a stale draft read. Prisma updateMany is atomic.
  const changed = await db.onboardingSession.updateMany({
    where: {
      id: session.id,
      completed: false,
      expiresAt: { gt: new Date() },
      formData: { equals: JSON.parse(JSON.stringify(session.formData)) },
    },
    data: { formData: { ...data, draft } },
  })
  if (changed.count !== 1) throw new OnboardingContinuationError("CONFLICT")
}

// Call inside the same transaction that creates the account and workspace.
// A later failure rolls back consumption; web/native races have one winner.
export async function consumeApprovedOnboarding(
  db: DbClient,
  input: { token: string; email: string; businessName: string },
) {
  const { session, data } = await readApprovedOnboarding(db, input.token)
  if (
    data.email.trim().toLowerCase() !== input.email.trim().toLowerCase() ||
    data.companyName?.trim().toLowerCase() !==
      input.businessName.trim().toLowerCase()
  )
    throw new OnboardingContinuationError("IDENTITY")
  if (!data.emailVerifiedAt) throw new OnboardingContinuationError("UNVERIFIED")
  const changed = await db.onboardingSession.updateMany({
    where: {
      id: session.id,
      completed: false,
      expiresAt: { gt: new Date() },
      formData: { equals: JSON.parse(JSON.stringify(session.formData)) },
    },
    data: { completed: true },
  })
  if (changed.count !== 1) throw new OnboardingContinuationError("CONFLICT")
  return data
}
