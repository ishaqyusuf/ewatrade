import type { PrismaClient } from "../../../generated/prisma/client"
import { Prisma } from "../../../generated/prisma/client"
import { runInOwnTransaction } from "../own-transaction"
import {
  CatalogAiError,
  loadCatalogAiPolicy,
  lockCatalogAiPolicy,
} from "./policy"

export async function catalogAiAnalytics(db: PrismaClient) {
  const from = new Date(Date.now() - 30 * 86_400_000)
  const { policy } = await loadCatalogAiPolicy(db)
  const [summary] = await db.$queryRaw<
    Array<{
      deliveredImages: number
      completedRequests: number
      failedRequests: number
      uncertainRequests: number
      reservedImages: number
      providerCostMicros: bigint
      unknownCostRequests: number
      p50: number | null
      p95: number | null
    }>
  >(Prisma.sql`
    SELECT COUNT(*) FILTER(WHERE "state"='DELIVERED' AND "deliveredAt">=${from})::int AS "deliveredImages",
    COUNT(*) FILTER(WHERE "state" IN ('DELIVERED','FAILED') AND "completedAt">=${from})::int AS "completedRequests",
    COUNT(*) FILTER(WHERE "state"='FAILED' AND "completedAt">=${from})::int AS "failedRequests",
    COUNT(*) FILTER(WHERE "state"='UNCERTAIN')::int AS "uncertainRequests",
    COUNT(*) FILTER(WHERE "state" IN ('QUEUED','DISPATCHING','UNCERTAIN','PENDING_REVIEW'))::int AS "reservedImages",
    COALESCE(SUM("costMicros") FILTER(WHERE "createdAt">=${from}),0)::bigint AS "providerCostMicros",
    COUNT(*) FILTER(WHERE "costMicros" IS NULL AND "dispatchedAt" IS NOT NULL)::int AS "unknownCostRequests",
    percentile_cont(0.5) WITHIN GROUP(ORDER BY EXTRACT(EPOCH FROM ("completedAt"-"dispatchedAt"))*1000) FILTER(WHERE "completedAt">=${from} AND "dispatchedAt" IS NOT NULL) AS p50,
    percentile_cont(0.95) WITHIN GROUP(ORDER BY EXTRACT(EPOCH FROM ("completedAt"-"dispatchedAt"))*1000) FILTER(WHERE "completedAt">=${from} AND "dispatchedAt" IS NOT NULL) AS p95
    FROM "CatalogAiImageJob"
  `)
  const daily = await db.$queryRaw<
    Array<{ date: string; delivered: number; costMicros: bigint }>
  >(Prisma.sql`
    SELECT to_char("createdAt" AT TIME ZONE 'UTC','YYYY-MM-DD') AS date,
    COUNT(*) FILTER(WHERE "state"='DELIVERED')::int AS delivered,COALESCE(SUM("costMicros"),0)::bigint AS "costMicros"
    FROM "CatalogAiImageJob" WHERE "createdAt">=${from} GROUP BY 1 ORDER BY 1
  `)
  const [costs] = await db.$queryRaw<
    Array<{ cost: bigint; unknown: number }>
  >`SELECT COALESCE(SUM("costMicros"),0)::bigint AS cost, COUNT(*) FILTER(WHERE "costMicros" IS NULL)::int AS unknown FROM "CatalogAiProviderCost" WHERE "createdAt">=${from} OR "costMicros" IS NULL`
  const costDays = await db.$queryRaw<
    Array<{ date: string; costMicros: bigint }>
  >`SELECT to_char("createdAt" AT TIME ZONE 'UTC','YYYY-MM-DD') AS date, COALESCE(SUM("costMicros"),0)::bigint AS "costMicros" FROM "CatalogAiProviderCost" WHERE "createdAt">=${from} GROUP BY 1 ORDER BY 1`
  const dates = [
    ...new Set([
      ...daily.map((row) => row.date),
      ...costDays.map((row) => row.date),
    ]),
  ].sort()
  return {
    schemaVersion: 1 as const,
    periodDays: 30 as const,
    deliveredImages: summary?.deliveredImages ?? 0,
    completedRequests: summary?.completedRequests ?? 0,
    failedRequests: summary?.failedRequests ?? 0,
    uncertainRequests: summary?.uncertainRequests ?? 0,
    reservedImages: summary?.reservedImages ?? 0,
    providerCostMicros: Number(costs?.cost ?? 0n),
    unknownCostRequests: costs?.unknown ?? 0,
    latencyMs: { p50: summary?.p50 ?? null, p95: summary?.p95 ?? null },
    daily: dates.map((date) => ({
      date,
      delivered: daily.find((row) => row.date === date)?.delivered ?? 0,
      costMicros: Number(
        costDays.find((row) => row.date === date)?.costMicros ?? 0n,
      ),
    })),
    balance: {
      status: policy.balanceSnapshot
        ? ("manual" as const)
        : ("unavailable" as const),
      snapshot: policy.balanceSnapshot,
    },
    forecast: {
      status: "no_data" as const,
      reason:
        "A verified prepaid balance and complete account-wide OpenAI costs and liabilities are required. Catalog generation costs alone cannot establish account runway.",
    },
  }
}
/** Manual outcome reconciliation releases an unknown customer reservation only
 * with a scoped office audit. It never repeats a provider call or invents output. */
export async function reconcileCatalogAiRequest(
  db: PrismaClient,
  input: {
    id: string
    commandId: string
    actorId: string
    reason: string
    costMicros: number
  },
) {
  return runInOwnTransaction(db, async (tx) => {
    await lockCatalogAiPolicy(tx)
    const job = await tx.catalogAiImageJob.findUnique({
      where: { id: input.id },
    })
    const cost = await tx.catalogAiProviderCost.findUnique({
      where: { id: input.id },
    })
    if (!cost) throw new CatalogAiError("NOT_FOUND", "Request not found.")
    const receipt = {
      commandId: input.commandId,
      actorId: input.actorId,
      reason: input.reason,
      costMicros: input.costMicros,
    }
    if (cost.reconciliation) {
      if (
        JSON.stringify(cost.reconciliation, Object.keys(receipt).sort()) !==
        JSON.stringify(receipt, Object.keys(receipt).sort())
      )
        throw new CatalogAiError("CONFLICT", "Request already reconciled.")
      return { id: input.id, state: job?.state ?? "RECONCILED" }
    }
    if (
      job &&
      job.state !== "UNCERTAIN" &&
      !(job.state === "FAILED" && job.costMicros === null)
    )
      throw new CatalogAiError(
        "CONFLICT",
        "Only an uncertain outcome or unknown failed-attempt cost can be reconciled.",
      )
    await tx.catalogAiProviderCost.update({
      where: { id: input.id },
      data: { costMicros: input.costMicros, reconciliation: receipt },
    })
    if (job)
      await tx.catalogAiImageJob.update({
        where: { id: job.id },
        data: {
          state: "FAILED",
          costMicros: input.costMicros,
          reconciliation: receipt,
          completedAt: new Date(),
          failureCode: "RECONCILED_NO_DELIVERABLE",
        },
      })
    return { id: input.id, state: "FAILED" }
  })
}
