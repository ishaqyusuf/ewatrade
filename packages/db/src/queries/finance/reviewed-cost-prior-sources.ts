import type { Prisma } from "../../../generated/prisma/client"
import type { FinanceActor } from "./access"
import {
  type ReviewedCostBookContext,
  readReviewedCostBook,
} from "./reviewed-cost-book-context"
import type { discoverReviewedCostSourcesInTransaction } from "./reviewed-cost-discovery"
import type { readReviewedCostPhysicalHistoryInTransaction } from "./reviewed-cost-history"
import { auditPriorCostReviewTopology } from "./reviewed-cost-prior-topology"
import { FinanceError } from "./rules"

export const priorReviewInclude = {
  _count: {
    select: {
      allocations: true,
      evidence: true,
      poolSnapshots: true,
      journals: true,
    },
  },
} satisfies Prisma.FinanceInventoryCostReviewInclude
export type PriorCostReviewSnapshot = {
  reviews: Prisma.FinanceInventoryCostReviewGetPayload<{
    include: typeof priorReviewInclude
  }>[]
  allocations: Prisma.FinanceInventoryCostReviewAllocationGetPayload<
    Record<string, never>
  >[]
  poolSnapshots: Prisma.FinanceInventoryCostReviewPoolGetPayload<
    Record<string, never>
  >[]
  evidence: Prisma.FinanceInventoryCostReviewEvidenceGetPayload<
    Record<string, never>
  >[]
  journals: Prisma.FinanceInventoryCostReviewJournalGetPayload<
    Record<string, never>
  >[]
}
function complete(
  expected: string[],
  actual: Array<{ id: string }>,
  label: string,
) {
  if (
    actual.length !== expected.length ||
    new Set(actual.map((x) => x.id)).size !== actual.length ||
    actual.some((x) => !expected.includes(x.id))
  )
    throw new FinanceError(
      "CONFLICT",
      `Prior review ${label} differs from complete discovered scope.`,
    )
}
/** Complete bounded immutable prior facts under the held Book; topology alone grants no monetary authority. */
export async function readPriorCostReviewSources(
  tx: Prisma.TransactionClient,
  input: FinanceActor & { bookId: string; through: Date },
  discovery: Awaited<
    ReturnType<typeof discoverReviewedCostSourcesInTransaction>
  >,
  physical: Awaited<
    ReturnType<typeof readReviewedCostPhysicalHistoryInTransaction>
  >,
  context?: ReviewedCostBookContext,
) {
  const pointerIds = physical.balances.flatMap((b) =>
    b.snapshot.pool?.lastCostReviewSnapshotId
      ? [b.snapshot.pool.lastCostReviewSnapshotId]
      : [],
  )
  if (
    !discovery.reviewAllocationIds.length &&
    !pointerIds.length &&
    !discovery.priorReviewIds?.length &&
    !discovery.priorReviewPoolSnapshotIds?.length
  )
    return null
  const book = await readReviewedCostBook(tx, input, context)
  if (
    discovery.reviewAllocationIds.length > 4096 ||
    (discovery.priorReviewIds?.length ?? 0) > 4096 ||
    (discovery.priorReviewPoolSnapshotIds?.length ?? 0) > 4096 ||
    pointerIds.length > 128 ||
    new Set(pointerIds).size !== pointerIds.length
  )
    throw new FinanceError(
      "CONFLICT",
      "Prior review scope exceeds complete supported bounds.",
    )
  const allocations = await tx.financeInventoryCostReviewAllocation.findMany({
    where: { id: { in: discovery.reviewAllocationIds } },
    orderBy: { id: "asc" },
    take: 4097,
  })
  complete(discovery.reviewAllocationIds, allocations, "allocations")
  const reviewIds = new Set([
    ...allocations.map((a) => a.reviewId),
    ...(discovery.priorReviewIds ?? []),
  ])
  const pointerSnapshots = pointerIds.length
    ? await tx.financeInventoryCostReviewPool.findMany({
        where: { id: { in: pointerIds } },
        orderBy: { id: "asc" },
        take: 129,
      })
    : []
  complete(pointerIds, pointerSnapshots, "pool pointers")
  for (const p of pointerSnapshots) reviewIds.add(p.reviewId)
  const ids = [...reviewIds].sort()
  if (ids.length > 4096)
    throw new FinanceError(
      "CONFLICT",
      "Prior review header closure exceeds supported bounds.",
    )
  const reviews = await tx.financeInventoryCostReview.findMany({
    where: { id: { in: ids } },
    include: priorReviewInclude,
    orderBy: { id: "asc" },
    take: 4097,
  })
  complete(ids, reviews, "headers")
  const poolSnapshots = await tx.financeInventoryCostReviewPool.findMany({
    where: { reviewId: { in: ids } },
    orderBy: { id: "asc" },
    take: 4097,
  })
  const evidence = await tx.financeInventoryCostReviewEvidence.findMany({
    where: { reviewId: { in: ids } },
    orderBy: { id: "asc" },
    take: 4097,
  })
  const journals = await tx.financeInventoryCostReviewJournal.findMany({
    where: { reviewId: { in: ids } },
    orderBy: { id: "asc" },
    take: 4097,
  })
  const snapshot = { reviews, allocations, poolSnapshots, evidence, journals }
  const proof = auditPriorCostReviewTopology({
    snapshot,
    discovery,
    physical,
    book,
    through: input.through,
  })
  return { snapshot, proof }
}
