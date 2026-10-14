import { Prisma } from "../../generated/prisma/client"

/** Use only in the caller's transaction. Share lock orders delayed writers before a request enters PROCESSING. */
export async function accountPrivacyPrivateWritesAllowed(
  tx: Prisma.TransactionClient,
  subjectId: string,
) {
  if (
    process.env.ACCOUNT_PRIVACY_PRIVATE_ASSISTANT_PROCESSING_ENABLED !== "true"
  )
    return true
  const rows = await tx.$queryRaw<{ status: string }[]>(
    Prisma.sql`SELECT "status" FROM "AccountPrivacyRequest" WHERE "requestKey"=${`account-deletion:${subjectId}`} FOR SHARE`,
  )
  return !rows.some(
    (row) => row.status === "PROCESSING" || row.status === "COMPLETED",
  )
}
