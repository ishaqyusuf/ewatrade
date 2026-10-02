import { Prisma } from "../../../generated/prisma/client"
import type { discoverReviewedCostSourcesInTransaction } from "./reviewed-cost-discovery"
import { FinanceError, financePayloadHash } from "./rules"

type Discovery = Awaited<
  ReturnType<typeof discoverReviewedCostSourcesInTransaction>
>
type FenceRow = { id: string; facts: Prisma.JsonValue }

/** Book and owning Orders are already held; never append these locks after stock. */
export async function coordinateReviewedCostOriginalOwners(
  tx: Prisma.TransactionClient,
  discovery: Discovery,
) {
  if (
    discovery.operationIds.length > 4096 ||
    new Set(discovery.operationIds).size !== discovery.operationIds.length
  )
    throw new FinanceError(
      "CONFLICT",
      "Original owning operations exceed the complete supported scope.",
    )
  if (!discovery.operationIds.length) return [] as FenceRow[]
  const rows = await tx.$queryRaw<FenceRow[]>`
    SELECT op.id, to_jsonb(op) AS facts FROM "StockOperation" op
    WHERE op.id IN (${Prisma.join(discovery.operationIds)})
    ORDER BY op.id FOR SHARE
  `
  if (
    financePayloadHash(rows.map((row) => row.id).sort()) !==
    financePayloadHash([...discovery.operationIds].sort())
  )
    throw new FinanceError(
      "CONFLICT",
      "Original owning operation scope changed before stock coordination.",
    )
  return rows
}

/** Verify the complete original row stamp; existing source writers serialize on Book. */
export async function assertReviewedCostOriginalOwnersUnchanged(
  tx: Prisma.TransactionClient,
  discovery: Discovery,
  before: FenceRow[],
) {
  const rows = discovery.operationIds.length
    ? await tx.$queryRaw<FenceRow[]>`
    SELECT op.id, to_jsonb(op) AS facts FROM "StockOperation" op
    WHERE op.id IN (${Prisma.join(discovery.operationIds)})
    ORDER BY op.id
  `
    : []
  if (financePayloadHash(before) !== financePayloadHash(rows))
    throw new FinanceError(
      "CONFLICT",
      "Original owning-source facts changed; retry the whole snapshot.",
    )
}
