import type { Prisma } from "../../../generated/prisma/client"
import type { FinanceActor } from "./access"
import { assembleReviewedCostTrace } from "./reviewed-cost-assembly"
import { ReviewedCostBookContext } from "./reviewed-cost-book-context"
import { readReviewedCommerceCostPostingsInTransaction } from "./reviewed-cost-commerce-postings"
import { selectReferencedReviewedCostPostings } from "./reviewed-cost-original-postings"
import { assertReviewedCostOwnerBindings } from "./reviewed-cost-owner-bindings"
import {
  assertReviewedCostOriginalOwnersUnchanged,
  coordinateReviewedCostOriginalOwners,
} from "./reviewed-cost-owner-fence"
import { readReviewedCostOwningSourcesInTransaction } from "./reviewed-cost-owners"
import { readPriorCostReviewJournalFactsInTransaction } from "./reviewed-cost-prior-journal-reader"
import { readPriorCostReviewSources } from "./reviewed-cost-prior-sources"
import {
  assertReviewedCostReturnFenceUnchanged,
  readReviewedCostReturnFence,
} from "./reviewed-cost-return-fence"
import { readReviewedReturnCostPostingsInTransaction } from "./reviewed-cost-return-postings"
import { readReviewedShortagePostingInputsInTransaction } from "./reviewed-cost-shortage-posting-reader"
import { readReviewedCostConnectedHistoryInTransaction } from "./reviewed-cost-snapshot"
import { FinanceError, financePayloadHash } from "./rules"

/** Repository-owned graph only. No public graph input or monetary write authority. */
export async function readReviewedCostSourceAssemblyInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceActor & {
    bookId: string
    balanceSourceIds: string[]
    through: Date
  },
) {
  const context = await ReviewedCostBookContext.acquire(tx, input)
  const connected = await readReviewedCostConnectedHistoryInTransaction(
    tx,
    input,
    {
      coordinate: async (discovery) => ({
        operations: await coordinateReviewedCostOriginalOwners(tx, discovery),
        returns: await readReviewedCostReturnFence(tx, discovery.orderLineIds),
      }),
      revalidateReturns: async (discovery, returns, fence) => {
        const current = await readReviewedCostReturnFence(
          tx,
          discovery.orderLineIds,
        )
        assertReviewedCostReturnFenceUnchanged(fence.returns, current)
        return returns
      },
      prove: async (discovery, returns, fence) => {
        await assertReviewedCostOriginalOwnersUnchanged(
          tx,
          discovery,
          fence.operations,
        )
        return readReviewedCostOwningSourcesInTransaction(
          tx,
          input,
          discovery,
          returns,
          context,
        )
      },
    },
    context,
  )
  const owners = connected.owningSources
  if (!owners)
    throw new FinanceError(
      "CONFLICT",
      "Original owning-source snapshot is missing.",
    )
  assertReviewedCostOwnerBindings(connected.physical, owners)
  const priorSources = await readPriorCostReviewSources(
    tx,
    input,
    connected.discovery,
    connected.physical,
    context,
  )
  const priorReviews = priorSources
    ? {
        ...priorSources,
        journalFacts: await readPriorCostReviewJournalFactsInTransaction(
          tx,
          input,
          priorSources.snapshot,
          context,
          [
            ...selectReferencedReviewedCostPostings(
              input,
              priorSources.snapshot,
              owners.originalPostings ?? [],
            ),
            ...(await readReviewedShortagePostingInputsInTransaction(
              tx,
              input,
              context,
              priorSources.snapshot,
              owners.originalShortages ?? [],
            )),
            ...(await readReviewedCommerceCostPostingsInTransaction(
              tx,
              input,
              context,
              priorSources.snapshot,
              connected.returns,
            )),
            ...(await readReviewedReturnCostPostingsInTransaction(
              tx,
              input,
              context,
              priorSources.snapshot,
              connected.returns,
            )),
          ],
        ),
      }
    : null
  const blockers = [...owners.blockers]
  for (const pool of connected.physical.balances) {
    if (
      pool.snapshot.pool?.lastCostReviewSnapshotId &&
      !blockers.some(
        (row) =>
          row.code === "PRIOR_REVIEW_PENDING" &&
          row.sourceId === pool.snapshot.pool?.lastCostReviewSnapshotId,
      )
    )
      blockers.push({
        code: "PRIOR_REVIEW_PENDING",
        sourceId: pool.snapshot.pool.lastCostReviewSnapshotId,
      })
  }
  const assembly =
    blockers.length === 0
      ? assembleReviewedCostTrace({
          physical: connected.physical,
          returns: connected.returns,
          semantics: owners.semantics,
        })
      : null
  return {
    scope: "REPOSITORY_ORIGINAL_SOURCE_ASSEMBLY" as const,
    canAssemble: assembly !== null,
    blockers,
    assembly,
    ...(priorReviews ? { priorReviews } : {}),
    sourceSnapshotHash: financePayloadHash({
      algorithmVersion: priorReviews
        ? "repository-original-source-assembly-prior-source-postings-v6"
        : "repository-original-source-assembly-v1",
      connected,
      blockers,
      assembly,
      ...(priorReviews ? { priorReviews } : {}),
    }),
    // Physical/source semantics grant no fiscal, evidence or posting authority.
    requiresClassificationProof: true as const,
    requiresMonetaryProof: true as const,
    requiresPostedJournalProof: true as const,
    requiresPriorReviewProof: true as const,
    requiresConfirmationProof: true as const,
  }
}
