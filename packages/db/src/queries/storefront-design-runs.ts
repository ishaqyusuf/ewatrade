import { Prisma, type SiteDesignRun } from "../../generated/prisma/client"
import { type SiteScope, siteContentHash } from "./storefront-sites"

type Tx = Prisma.TransactionClient
type Scope = SiteScope & { actorUserId: string }
export type StorefrontDesignBudget = {
  maxDailyRuns: number
  maxDailyTokens: number
  reservedTokens: number
}

export function findSiteDesignRequestInTransaction(
  tx: Tx,
  scope: Scope,
  clientRequestId: string,
) {
  return tx.siteDesignRun.findFirst({
    where: {
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      siteId: scope.siteId,
      actorUserId: scope.actorUserId,
      clientRequestId,
    },
  })
}

export function findSiteDesignRunInTransaction(
  tx: Tx,
  scope: SiteScope,
  id: string,
) {
  return tx.siteDesignRun.findFirst({
    where: {
      id,
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      siteId: scope.siteId,
    },
  })
}

export async function lockSiteDesignRunInTransaction(
  tx: Tx,
  scope: SiteScope,
  id: string,
) {
  const locked = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "SiteDesignRun" WHERE "id"=${id} AND "tenantId"=${scope.tenantId} AND "storeId"=${scope.storeId} AND "siteId"=${scope.siteId} FOR UPDATE`,
  )
  return locked.length ? findSiteDesignRunInTransaction(tx, scope, id) : null
}

/** Caller already holds current Site/authority locks. Request replay precedes new billing. */
export async function createSiteDesignRunInTransaction(
  tx: Tx,
  scope: Scope,
  input: {
    clientRequestId: string
    requestHash: string
    baseDraftRevision: number
    brief: Prisma.InputJsonValue
    manifests: Prisma.InputJsonValue
    configuration: Prisma.InputJsonValue
    provider: string
    model: string
    promptVersion: string
    budget: StorefrontDesignBudget
  },
) {
  const existing = await tx.siteDesignRun.findFirst({
    where: {
      siteId: scope.siteId,
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      actorUserId: scope.actorUserId,
      clientRequestId: input.clientRequestId,
    },
  })
  if (existing)
    return existing.requestHash === input.requestHash
      ? { ok: true as const, replayed: true, run: existing }
      : { ok: false as const, reason: "idempotency-conflict" as const }
  const day = new Date().toISOString().slice(0, 10)
  const budgetScopeKey = `storefront-design:${scope.tenantId}:${day}`
  await tx.assistantBudget.upsert({
    where: { scopeKey: budgetScopeKey },
    create: {
      scopeKey: budgetScopeKey,
      windowStartedAt: new Date(`${day}T00:00:00.000Z`),
    },
    update: {},
  })
  const [budget] = await tx.$queryRaw<
    Array<{ requests: number; tokens: number }>
  >(
    Prisma.sql`SELECT "requests","tokens" FROM "AssistantBudget" WHERE "scopeKey"=${budgetScopeKey} FOR UPDATE`,
  )
  if (
    !budget ||
    budget.requests >= input.budget.maxDailyRuns ||
    budget.tokens + input.budget.reservedTokens > input.budget.maxDailyTokens
  )
    return { ok: false as const, reason: "budget-exhausted" as const }
  await tx.assistantBudget.update({
    where: { scopeKey: budgetScopeKey },
    data: {
      requests: { increment: 1 },
      tokens: { increment: input.budget.reservedTokens },
    },
  })
  const run = await tx.siteDesignRun.create({
    data: {
      ...scope,
      clientRequestId: input.clientRequestId,
      requestHash: input.requestHash,
      baseDraftRevision: input.baseDraftRevision,
      brief: input.brief,
      manifests: input.manifests,
      configuration: input.configuration,
      inputHash: siteContentHash({
        brief: input.brief,
        manifests: input.manifests,
        configuration: input.configuration,
      }),
      provider: input.provider,
      model: input.model,
      promptVersion: input.promptVersion,
      budgetScopeKey,
      reservedTokens: input.budget.reservedTokens,
    },
  })
  return { ok: true as const, replayed: false, run }
}

/** Settlement and usage receipt are atomic under the run lock. Unknown provider outcomes retain reservation. */
export async function settleSiteDesignUsageInTransaction(
  tx: Tx,
  run: SiteDesignRun,
  tokens: number | null,
  outcome: string,
) {
  if (run.usageSettledAt) return
  if (tokens === null && run.providerStartedAt) return
  const actualTokens = tokens ?? 0
  if (
    !Number.isSafeInteger(actualTokens) ||
    actualTokens < 0 ||
    actualTokens > 1_000_000
  )
    throw new Error("Invalid design usage receipt")
  const changed = await tx.assistantBudget.updateMany({
    where: {
      scopeKey: run.budgetScopeKey,
      tokens: { gte: run.reservedTokens },
    },
    data: { tokens: { increment: actualTokens - run.reservedTokens } },
  })
  if (changed.count !== 1)
    throw new Error("Design budget reservation is inconsistent")
  await tx.assistantUsageEvent.create({
    data: {
      tenantId: run.tenantId,
      actorUserId: run.actorUserId,
      provider: run.provider,
      model: run.model,
      requestClass: "storefront-design",
      totalTokens: actualTokens,
      durationMs: run.durationMs,
      outcome,
    },
  })
  await tx.siteDesignRun.update({
    where: { id: run.id },
    data: { actualTokens, usageSettledAt: new Date() },
  })
}

export async function cancelSiteDesignRunInTransaction(
  tx: Tx,
  scope: SiteScope,
  id: string,
) {
  const run = await lockSiteDesignRunInTransaction(tx, scope, id)
  if (!run || run.acceptedAt) return null
  if (run.status === "CANCELLED") return run
  await settleSiteDesignUsageInTransaction(
    tx,
    run,
    run.actualTokens,
    run.providerStartedAt
      ? "cancelled-after-provider"
      : "cancelled-before-provider",
  )
  return tx.siteDesignRun.update({
    where: { id: run.id },
    data: {
      status: "CANCELLED",
      completedAt: new Date(),
      ...(!run.providerStartedAt ? { leaseToken: null, leaseUntil: null } : {}),
    },
  })
}

export function listSiteDesignRunsInTransaction(tx: Tx, scope: SiteScope) {
  return tx.siteDesignRun.findMany({
    omit: { brief: true, manifests: true, configuration: true, output: true },
    where: {
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      siteId: scope.siteId,
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  })
}

/** Caller holds authority → Site → run locks and saved the ordinary draft in this transaction. */
export async function markSiteDesignAcceptedInTransaction(
  tx: Tx,
  scope: Scope,
  input: { runId: string; directionId: string; draftRevision: number },
) {
  const changed = await tx.siteDesignRun.updateMany({
    where: {
      id: input.runId,
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      siteId: scope.siteId,
      status: "READY",
      acceptedAt: null,
    },
    data: {
      acceptedDirectionId: input.directionId,
      acceptedById: scope.actorUserId,
      acceptedDraftRevision: input.draftRevision,
      acceptedAt: new Date(),
    },
  })
  if (changed.count !== 1)
    throw new Error("The design acceptance fence changed")
}
