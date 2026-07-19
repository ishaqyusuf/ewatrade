import { addExactDecimals } from "@ewatrade/utils/exact-decimal"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  ServiceJobLineStatus,
} from "../../generated/prisma/enums"

export async function getServiceOperationsReport(
  db: PrismaClient,
  input: {
    from?: Date
    storeId?: string
    tenantId: string
    to?: Date
  },
) {
  const createdAt =
    input.from || input.to ? { gte: input.from, lte: input.to } : undefined
  const [jobs, requests, quotes, notificationIntents, evidenceActions] =
    await Promise.all([
      db.serviceJob.findMany({
        include: {
          commercialOrder: {
            include: {
              lines: {
                include: { snapshot: true },
                where: { kind: "SERVICE" },
              },
            },
          },
          dueCommitments: { where: { supersededAt: null } },
          exceptions: true,
          lines: true,
        },
        where: {
          createdAt,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      }),
      db.serviceRequest.groupBy({
        _count: true,
        by: ["status"],
        where: {
          createdAt,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      }),
      db.serviceQuoteVersion.groupBy({
        _count: true,
        by: ["status"],
        where: {
          createdAt,
          quote: { storeId: input.storeId, tenantId: input.tenantId },
        },
      }),
      db.serviceNotificationIntent.findMany({
        include: { deliveryAttempts: true, manualShares: true },
        where: {
          createdAt,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      }),
      db.serviceEvidenceAuditEvent.groupBy({
        _count: true,
        by: ["action"],
        where: {
          createdAt,
          evidence: { tenantId: input.tenantId },
        },
      }),
    ])

  const now = new Date()
  let serviceRevenueMinor = 0
  let serviceQuantity = "0"
  let completedCycleMilliseconds = 0
  let completedLineCount = 0
  const workload = new Map<string, number>()
  for (const job of jobs) {
    for (const line of job.commercialOrder.lines) {
      serviceRevenueMinor += line.totalMinor
      serviceQuantity = addExactDecimals(
        serviceQuantity,
        line.quantity.toString(),
      )
    }
    if (job.currentAssigneeUserId) {
      workload.set(
        job.currentAssigneeUserId,
        (workload.get(job.currentAssigneeUserId) ?? 0) +
          job.lines.filter(
            (line) =>
              line.status !== ServiceJobLineStatus.COMPLETED &&
              line.status !== ServiceJobLineStatus.CANCELLED,
          ).length,
      )
    }
    for (const line of job.lines) {
      if (line.completedAt) {
        completedCycleMilliseconds +=
          line.completedAt.getTime() - line.createdAt.getTime()
        completedLineCount += 1
      }
    }
  }
  const incomplete = jobs.flatMap((job) =>
    job.lines.filter(
      (line) =>
        line.status !== ServiceJobLineStatus.COMPLETED &&
        line.status !== ServiceJobLineStatus.CANCELLED,
    ),
  )
  return {
    commercial: {
      immutableServiceQuantity: serviceQuantity,
      serviceRevenueMinor,
    },
    communications: {
      deliveryAttempts: notificationIntents.reduce(
        (count, intent) => count + intent.deliveryAttempts.length,
        0,
      ),
      intents: notificationIntents.length,
      manualShares: notificationIntents.reduce(
        (count, intent) => count + intent.manualShares.length,
        0,
      ),
      providerFailures: notificationIntents.reduce(
        (count, intent) =>
          count +
          intent.deliveryAttempts.filter((attempt) => attempt.status === "FAILED")
            .length,
        0,
      ),
    },
    evidenceActions,
    requestFunnel: requests,
    quoteFunnel: quotes,
    work: {
      averageCompletedCycleMilliseconds:
        completedLineCount > 0
          ? Math.round(completedCycleMilliseconds / completedLineCount)
          : null,
      blocked: incomplete.filter(
        (line) => line.status === ServiceJobLineStatus.BLOCKED,
      ).length,
      cancelled: jobs.reduce(
        (count, job) =>
          count +
          job.lines.filter(
            (line) => line.status === ServiceJobLineStatus.CANCELLED,
          ).length,
        0,
      ),
      completed: completedLineCount,
      exceptions: jobs.reduce(
        (count, job) => count + job.exceptions.length,
        0,
      ),
      overdueJobs: jobs.filter(
        (job) =>
          job.dueCommitments[0]?.promisedAt &&
          job.dueCommitments[0].promisedAt < now &&
          job.lines.some(
            (line) =>
              line.status !== ServiceJobLineStatus.COMPLETED &&
              line.status !== ServiceJobLineStatus.CANCELLED,
          ),
      ).length,
      ready: incomplete.filter(
        (line) => line.status === ServiceJobLineStatus.READY_FOR_HANDOFF,
      ).length,
      rework: jobs.filter((job) => Boolean(job.reworkOfJobId)).length,
      wip: incomplete.length,
      workload: [...workload].map(([assigneeUserId, activeLines]) => ({
        activeLines,
        assigneeUserId,
      })),
    },
  }
}

export async function exportServiceOperationsAudit(
  db: PrismaClient,
  input: { storeId?: string; tenantId: string },
) {
  const events = await db.serviceWorkEvent.findMany({
    include: {
      serviceJob: { include: { commercialOrder: true } },
      serviceJobLine: {
        include: { commercialOrderLine: { include: { snapshot: true } } },
      },
    },
    orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }],
    where: {
      serviceJob: { storeId: input.storeId },
      tenantId: input.tenantId,
    },
  })
  return events.map((event) => ({
    actorUserId: event.actorUserId,
    allocatedQuantity:
      event.serviceJobLine?.allocatedQuantity.toString() ?? null,
    catalogItemName:
      event.serviceJobLine?.commercialOrderLine.snapshot?.catalogItemName ?? null,
    createdAt: event.createdAt.toISOString(),
    effectiveAt: event.effectiveAt.toISOString(),
    eventId: event.id,
    eventType: event.type,
    fromStatus: event.fromStatus,
    offeringName:
      event.serviceJobLine?.commercialOrderLine.snapshot?.offeringName ?? null,
    orderNumber: event.serviceJob.commercialOrder.orderNumber,
    reason: event.reason,
    source: event.source,
    toStatus: event.toStatus,
  }))
}
