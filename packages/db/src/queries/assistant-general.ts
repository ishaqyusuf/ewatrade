import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
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
const firstQuestion = {
  where: { role: "user" },
  orderBy: { sequence: "asc" },
  take: 1,
  select: { parts: true },
} as const
/** First text of a stored message, as a short chat title. */
function firstText(parts: unknown) {
  if (!Array.isArray(parts)) return null
  for (const part of parts) {
    if (
      part &&
      typeof part === "object" &&
      "type" in part &&
      part.type === "text" &&
      "text" in part &&
      typeof part.text === "string" &&
      part.text.trim()
    ) {
      const text = part.text.trim().replace(/\s+/g, " ")
      return text.length > 60 ? `${text.slice(0, 59)}…` : text
    }
  }
  return null
}
export async function readGeneralConversation(
  db: DbClient,
  scope: AssistantScope,
  id: string,
) {
  const row = await db.assistantConversation.findFirst({
    where: { ...generalConversationWhere(scope), id },
    select: { id: true, updatedAt: true, messages: firstQuestion },
  })
  if (!row) return null
  const { messages, ...conversation } = row
  return { ...conversation, title: firstText(messages[0]?.parts) }
}
/** Chats are named by their first question; empty chats keep no title. */
export async function listGeneralConversations(
  db: DbClient,
  scope: AssistantScope,
) {
  const rows = await db.assistantConversation.findMany({
    where: generalConversationWhere(scope),
    orderBy: { updatedAt: "desc" },
    take: 30,
    select: { id: true, updatedAt: true, messages: firstQuestion },
  })
  return rows.map(({ messages, ...row }) => ({
    ...row,
    title: firstText(messages[0]?.parts),
  }))
}
export function startGeneralConversation(db: DbClient, scope: AssistantScope) {
  return db.assistantConversation.create({
    data: { ...generalConversationWhere(scope), title: "New chat" },
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
/** Drafts still waiting for review in any of the user's chats, newest first. */
export function readPendingGeneralProposals(
  db: DbClient,
  scope: AssistantScope,
  now = new Date(),
) {
  return db.assistantActionProposal.findMany({
    where: {
      ...generalProposalWhere(scope),
      status: "PENDING",
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      conversationId: true,
      payload: true,
      expiresAt: true,
      conversation: { select: { title: true } },
    },
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
    expectedFixedPriceMinor?: number
    enteredTotalMinor?: number
    expectedConfigurationVersionId?: string
  }>,
  currencyCode = "NGN",
) {
  const money = (minor: number) =>
    formatFinanceMoney(String(minor), currencyCode)
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
    if (!offering || !["FIXED", "ORDER_TOTAL"].includes(offering.pricingPolicy))
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
      policy:
        offering.pricingPolicy === "ORDER_TOTAL" ? "order_total" : "fixed",
      kind: offering.kind === "PRODUCT_UNIT" ? "product_unit" : "service",
      fixedPriceMinor: offering.fixedPriceMinor,
    })
    totalMinor += price.totalMinor
    lines.push(
      price.unitPriceMinor === null
        ? `${offering.catalogItem.name} · ${offering.name} · quantity ${line.quantity} · entered item total ${money(price.totalMinor)}`
        : `${offering.catalogItem.name} · ${offering.name} · ${line.quantity} × ${money(price.unitPriceMinor)} = ${money(price.totalMinor)}`,
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
