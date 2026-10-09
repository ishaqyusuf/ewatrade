import type { PrismaClient } from "../../generated/prisma/client"
import { mobileOtpIdentifiersForEmail } from "./mobile-otp-identifier"

/** Counts residual account-profile material without returning personal values. */
export async function getAccountPrivacyProfileInventory(
  db: PrismaClient,
  subjectId: string,
  verifiedContactEmail: string,
) {
  const email = verifiedContactEmail.trim().toLowerCase()
  const profile = await db.user.findUnique({
    where: { id: subjectId },
    select: {
      email: true,
      name: true,
      image: true,
      phone: true,
      firstName: true,
      lastName: true,
      displayName: true,
      avatarUrl: true,
      metadata: true,
      emailVerifiedAt: true,
      phoneVerifiedAt: true,
      isPlatformAdmin: true,
      ageBand: true,
      ageDeclaredAt: true,
    },
  })
  const authAccounts = await db.account.count({ where: { userId: subjectId } })
  const sessions = await db.session.count({ where: { userId: subjectId } })
  const legalAcceptances = await db.legalAcceptance.count({
    where: { userId: subjectId },
  })
  const verificationRows = await db.verification.count({
    where: {
      identifier: { in: mobileOtpIdentifiersForEmail(email) },
    },
  })
  const personalFieldCount = profile
    ? [
        profile.name.trim(),
        profile.image?.trim(),
        profile.phone?.trim(),
        profile.firstName?.trim(),
        profile.lastName?.trim(),
        profile.displayName?.trim(),
        profile.avatarUrl?.trim(),
        profile.metadata,
        profile.emailVerifiedAt,
        profile.phoneVerifiedAt,
        profile.isPlatformAdmin,
        profile.ageBand !== "UNDECLARED",
        profile.ageDeclaredAt,
      ].filter(Boolean).length
    : 0
  return {
    userExists: Boolean(profile),
    originalEmailRemains: profile?.email.trim().toLowerCase() === email,
    personalFieldCount,
    authAccounts,
    sessions,
    legalAcceptances,
    verificationRows,
  }
}
