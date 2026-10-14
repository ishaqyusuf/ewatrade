import type { PrismaClient } from "../../../generated/prisma/client"

/** Content-free inventory: optional editor attribution must remain visible to deletion checks. */
export async function customerMessageTemplatePrivacyInventory(
  db: Pick<PrismaClient, "$queryRaw">,
  subjectId: string,
) {
  const rows = await db.$queryRaw<{ customerMessageTemplates: number }[]>`
    SELECT count(*)::int AS "customerMessageTemplates" FROM "CustomerMessageTemplate"
    WHERE "updatedByUserId"=${subjectId}
  `
  const count = rows[0]?.customerMessageTemplates
  if (!Number.isSafeInteger(count) || count === undefined || count < 0)
    throw new Error("Customer message privacy inventory unavailable.")
  return { customerMessageTemplates: count }
}
