import type { Prisma } from "../../generated/prisma/client"

/** Caller holds the existing Book first; absence of a Book still serializes retries. */
export async function lockCatalogCommandInTransaction(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; clientOperationId: string },
) {
  const identity = JSON.stringify([
    "catalog-command",
    input.tenantId,
    input.clientOperationId,
  ])
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${identity}, 0))
  `
}
