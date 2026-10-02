import {
  currentEffectiveLegalPublication,
  isLegalTestingEnvironment,
  legalPublicationEffectiveAt,
} from "@ewatrade/utils/legal-approval"
import type { DbClient } from "./types"

type EffectivePublication = NonNullable<
  ReturnType<typeof currentEffectiveLegalPublication>
>

export async function isLegalSignupSessionBlockedForPublication(
  db: DbClient,
  userId: string,
  publication: EffectivePublication,
) {
  const effectiveAt = legalPublicationEffectiveAt(publication)
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { createdAt: true },
  })
  if (!user) return true
  if (user.createdAt < effectiveAt) return false
  const acceptance = await db.legalAcceptance.findUnique({
    where: {
      userId_version: { userId, version: publication.version },
    },
    select: { documentHash: true },
  })
  return acceptance?.documentHash !== publication.documentHash
}

export async function isLegalSignupSessionBlocked(
  db: DbClient,
  userId: string,
) {
  if (isLegalTestingEnvironment()) return false
  if (
    process.env.APP_ENV !== "production" &&
    process.env.NODE_ENV !== "production"
  )
    return false
  const publication = currentEffectiveLegalPublication()
  if (!publication) return false
  return isLegalSignupSessionBlockedForPublication(db, userId, publication)
}
