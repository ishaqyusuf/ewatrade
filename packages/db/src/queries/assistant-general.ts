import type { Prisma } from "../../generated/prisma/client"
import type { AssistantScope } from "./assistant"
import type { DbClient } from "./types"
export const generalConversationWhere = (scope: AssistantScope) => ({
  tenantId: scope.tenantId,
  storeId: scope.storeId,
  ownerUserId: scope.userId,
  purpose: "GENERAL" as const,
  status: "ACTIVE" as const,
})
export const generalProposalWhere = (scope: AssistantScope) => ({
  tenantId: scope.tenantId,
  storeId: scope.storeId,
  actorUserId: scope.userId,
  conversation: generalConversationWhere(scope),
})
export function readGeneralConversation(
  db: DbClient,
  scope: AssistantScope,
  id: string,
) {
  return db.assistantConversation.findFirst({
    where: { ...generalConversationWhere(scope), id },
    select: { id: true, title: true, updatedAt: true },
  })
}
export function listGeneralConversations(db: DbClient, scope: AssistantScope) {
  return db.assistantConversation.findMany({
    where: generalConversationWhere(scope),
    orderBy: { updatedAt: "desc" },
    take: 30,
    select: { id: true, title: true, updatedAt: true },
  })
}
export function startGeneralConversation(db: DbClient, scope: AssistantScope) {
  return db.assistantConversation.create({
    data: { ...generalConversationWhere(scope), title: "Ask ẸwáTrade" },
    select: { id: true },
  })
}
export function readGeneralProposals(
  db: DbClient,
  scope: AssistantScope,
  conversationId: string,
) {
  return db.assistantActionProposal.findMany({
    where: { ...generalProposalWhere(scope), conversationId },
    orderBy: { createdAt: "asc" },
    take: 60,
  })
}
export function readGeneralRun(
  db: DbClient,
  scope: AssistantScope,
  runId: string,
) {
  return db.assistantRun.findFirst({
    where: {
      id: runId,
      actorUserId: scope.userId,
      conversation: generalConversationWhere(scope),
    },
    select: { id: true, status: true, errorCode: true, conversationId: true },
  })
}
export async function readGeneralActiveRun(
  db: DbClient,
  scope: AssistantScope,
  conversationId: string,
) {
  // Deadline is 45s. Recovery safely closes abandoned requests, never repeats tools.
  await db.assistantRun.updateMany({
    where: {
      conversationId,
      actorUserId: scope.userId,
      conversation: generalConversationWhere(scope),
      status: "RUNNING",
      startedAt: { lt: new Date(Date.now() - 90_000) },
    },
    data: {
      status: "FAILED",
      errorCode: "TURN_INTERRUPTED",
      completedAt: new Date(),
    },
  })
  return db.assistantRun.findFirst({
    where: {
      conversationId,
      actorUserId: scope.userId,
      status: "RUNNING",
      conversation: generalConversationWhere(scope),
    },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  })
}
export async function lockGeneralMembership(
  tx: Prisma.TransactionClient,
  membershipId: string,
  scope: AssistantScope,
) {
  await tx.$queryRaw`SELECT "id" FROM "Membership" WHERE "id" = ${membershipId} AND "tenantId" = ${scope.tenantId} AND "userId" = ${scope.userId} FOR SHARE`
  await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id" = ${scope.storeId} AND "tenantId" = ${scope.tenantId} FOR SHARE`
}

export async function readGeneralOrderReview(
  db: DbClient,
  scope: AssistantScope,
  input: Array<{
    offeringId: string
    quantity: string
    expectedFixedPriceMinor: number
    expectedConfigurationVersionId?: string
  }>,
) {
  const { resolveCommercialLinePrice } = await import(
    "./commercial-line-pricing"
  )
  const lines: string[] = []
  let totalMinor = 0
  for (const line of input) {
    const offering = await db.sellableOffering.findFirst({
      where: {
        id: line.offeringId,
        tenantId: scope.tenantId,
        status: "ACTIVE",
        storeAvailability: {
          some: { storeId: scope.storeId, isAvailable: true },
        },
      },
      select: {
        name: true,
        fixedPriceMinor: true,
        pricingPolicy: true,
        kind: true,
        catalogItem: { select: { name: true } },
        productUnitOffering: {
          select: {
            inventoryUnit: { select: { configurationVersionId: true } },
          },
        },
      },
    })
    if (!offering || offering.pricingPolicy !== "FIXED")
      throw new Error("Offering unavailable or requires the sale form")
    const configurationId =
      offering.productUnitOffering?.inventoryUnit.configurationVersionId
    if (
      configurationId &&
      line.expectedConfigurationVersionId !== configurationId
    )
      throw new Error(
        "Offering unit configuration changed; review the sale again",
      )
    const price = resolveCommercialLinePrice({
      ...line,
      policy: "fixed",
      kind: offering.kind === "PRODUCT_UNIT" ? "product_unit" : "service",
      fixedPriceMinor: offering.fixedPriceMinor,
    })
    totalMinor += price.totalMinor
    if (price.unitPriceMinor === null)
      throw new Error("Fixed price unavailable")
    lines.push(
      `${offering.catalogItem.name} · ${offering.name} · ${line.quantity} × ${(price.unitPriceMinor / 100).toFixed(2)} = ${(price.totalMinor / 100).toFixed(2)}`,
    )
  }
  if (!Number.isSafeInteger(totalMinor) || totalMinor > 100_000_000)
    throw new Error("Order exceeds supported amount")
  return { lines, totalMinor }
}

/** Preserve the existing Finance-book/customer-account-before-Order lock order. */
export async function lockGeneralPaymentOrder(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; storeId: string; orderId: string },
) {
  const { lockCommerceFinancialOrder } = await import(
    "./customer-ledger/commerce-locks"
  )
  const found = await tx.commercialOrder.findFirst({
    where: {
      id: input.orderId,
      tenantId: input.tenantId,
      storeId: input.storeId,
    },
    select: { id: true },
  })
  if (!found) throw new Error("Order unavailable in current Store")
  return lockCommerceFinancialOrder(tx, input)
}
