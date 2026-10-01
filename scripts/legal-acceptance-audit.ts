import type { Prisma } from "../packages/db/generated/prisma/client"

export type EffectiveLegalPublication = {
  version: string
  documentHash: string
  effectiveDate: string
}

export function buildMissingLegalAcceptanceFilter(
  publication: EffectiveLegalPublication,
): Prisma.UserWhereInput {
  const effectiveAt = new Date(`${publication.effectiveDate}T00:00:00.000Z`)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(publication.effectiveDate) ||
    Number.isNaN(effectiveAt.getTime()) ||
    effectiveAt.toISOString().slice(0, 10) !== publication.effectiveDate ||
    !publication.version ||
    !/^[a-f0-9]{64}$/.test(publication.documentHash)
  ) {
    throw new Error("An exact effective legal publication is required.")
  }

  return {
    createdAt: { gte: effectiveAt },
    legalAcceptances: {
      none: {
        version: publication.version,
        documentHash: publication.documentHash,
      },
    },
  }
}
