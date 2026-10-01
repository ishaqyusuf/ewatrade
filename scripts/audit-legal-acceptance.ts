import { currentEffectiveLegalPublication } from "../packages/utils/src/legal-approval"
import { buildMissingLegalAcceptanceFilter } from "./legal-acceptance-audit"

const publication = currentEffectiveLegalPublication()
if (!publication) {
  console.error(
    "Legal acceptance audit requires an approved, effective publication.",
  )
  process.exitCode = 1
} else {
  const { prisma } = await import("../packages/db/src/client")
  const where = buildMissingLegalAcceptanceFilter(publication)
  try {
    const [count, activeSessionCount, sample] = await prisma.$transaction([
      prisma.user.count({ where }),
      prisma.session.count({
        where: {
          expiresAt: { gt: new Date() },
          user: { is: where },
        },
      }),
      prisma.user.findMany({
        where,
        select: { id: true, createdAt: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 20,
      }),
    ])
    console.log(
      JSON.stringify({
        version: publication.version,
        effectiveDate: publication.effectiveDate,
        missingAcceptanceCount: count,
        activeSessionCount,
        sample,
      }),
    )
    if (count > 0) process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}
