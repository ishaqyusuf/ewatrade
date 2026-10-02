import type { Prisma } from "../../../generated/prisma/client"
import type { FinanceActor } from "./access"
import type { ReviewedCostBookContext } from "./reviewed-cost-book-context"
import { discoverReviewedCostSourcesInTransaction } from "./reviewed-cost-discovery"
import { readReviewedCostPhysicalHistoryInTransaction } from "./reviewed-cost-history"
import { readReviewedCostReturnsInTransaction } from "./reviewed-cost-returns"
import {
  assertUnchangedReviewedCostDiscovery,
  auditReviewedCostConnectedSnapshot,
} from "./reviewed-cost-snapshot-rules"

type Discovery = Awaited<
  ReturnType<typeof discoverReviewedCostSourcesInTransaction>
>
type Returns = Awaited<ReturnType<typeof readReviewedCostReturnsInTransaction>>

/** Private connected history read; other owners and monetary authority need proof. */
export async function readReviewedCostConnectedHistoryInTransaction<
  Fence = undefined,
  Owners = undefined,
>(
  tx: Prisma.TransactionClient,
  input: FinanceActor & {
    bookId: string
    balanceSourceIds: string[]
    through: Date
  },
  ownerReader?: {
    coordinate: (discovery: Discovery, returns: Returns) => Promise<Fence>
    prove: (
      discovery: Discovery,
      returns: Returns,
      fence: Fence,
    ) => Promise<Owners>
    revalidateReturns?: (
      discovery: Discovery,
      returns: Returns,
      fence: Fence,
    ) => Promise<Returns>
  },
  context?: ReviewedCostBookContext,
) {
  const discovery = await discoverReviewedCostSourcesInTransaction(
    tx,
    input,
    context,
  )
  // Acquire all discovered owning Orders before the one complete stock lock set.
  const returns = await readReviewedCostReturnsInTransaction(
    tx,
    {
      ...input,
      orderLineIds: discovery.orderLineIds,
    },
    context,
  )
  // Source coordination is complete before the one stock lock set.
  const fence = await ownerReader?.coordinate(discovery, returns)
  const physical = await readReviewedCostPhysicalHistoryInTransaction(
    tx,
    {
      ...input,
      balanceSourceIds: discovery.balanceSourceIds,
    },
    context,
  )
  const revalidatedDiscovery = await discoverReviewedCostSourcesInTransaction(
    tx,
    input,
    context,
  )
  // Reject expansion before any further source read; never append stock/Order locks.
  assertUnchangedReviewedCostDiscovery(discovery, revalidatedDiscovery)
  // Revalidate full return facts; only the retained Order locks may be reacquired.
  const revalidatedReturns =
    ownerReader?.revalidateReturns && fence !== undefined
      ? await ownerReader.revalidateReturns(discovery, returns, fence)
      : await readReviewedCostReturnsInTransaction(
          tx,
          {
            ...input,
            orderLineIds: discovery.orderLineIds,
            expectedOrderIds: [
              ...new Set(returns.snapshot.lines.map((line) => line.orderId)),
            ],
          },
          context,
        )
  const owningSources =
    ownerReader && fence !== undefined
      ? await ownerReader.prove(discovery, revalidatedReturns, fence)
      : undefined
  const connected = auditReviewedCostConnectedSnapshot({
    discovery,
    physical,
    returns,
    revalidatedDiscovery,
    revalidatedReturns,
  })
  return { ...connected, owningSources, ownerCoordination: fence }
}
