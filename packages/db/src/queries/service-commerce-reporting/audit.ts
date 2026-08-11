import {
  SERVICE_COMMERCE_REPORT_RATE_LIMIT_MAX_READS,
  SERVICE_COMMERCE_REPORT_RATE_LIMIT_WINDOW_MILLISECONDS,
  type ServiceCommerceReportDrilldownSection,
} from "@ewatrade/service-commerce"

import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import {
  MembershipStatus,
  ServiceCommerceReportReadDenialReason,
  ServiceCommerceReportReadKind,
  ServiceCommerceReportReadOutcome,
  ServiceCommerceReportReadSource,
  ServiceCommerceReportDrilldownSection as StoredDrilldownSection,
} from "../../../generated/prisma/enums"

const reportManagers = new Set(["OWNER", "ADMIN", "MANAGER"])
const REPORT_READ_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 30_000,
} as const

const storedDrilldownSections = {
  catalog: StoredDrilldownSection.CATALOG,
  costs: StoredDrilldownSection.COSTS,
  lifecycle: StoredDrilldownSection.LIFECYCLE,
  media: StoredDrilldownSection.MEDIA,
  reliability: StoredDrilldownSection.RELIABILITY,
} satisfies Record<
  ServiceCommerceReportDrilldownSection,
  StoredDrilldownSection
>

type ReportReadAccessInput = {
  actorUserId: string
  category?: ServiceCommerceReportDrilldownSection
  end: Date
  kind: "report" | "drilldown"
  now?: Date
  start: Date
  storeId?: string
  tenantId: string
}

type ReportReadDb = PrismaClient | Prisma.TransactionClient

function kindFor(input: ReportReadAccessInput) {
  return input.kind === "report"
    ? ServiceCommerceReportReadKind.REPORT
    : ServiceCommerceReportReadKind.DRILLDOWN
}

function purposeFor(input: ReportReadAccessInput) {
  return input.kind === "report"
    ? "service_commerce_report_read"
    : "service_commerce_report_drilldown_read"
}

async function appendReportReadAudit(
  db: ReportReadDb,
  input: ReportReadAccessInput & {
    denialReason?: ServiceCommerceReportReadDenialReason
    effectiveAt?: Date
    outcome: ServiceCommerceReportReadOutcome
    validatedStoreId?: string
  },
) {
  await db.serviceCommerceReportReadAuditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      denialReason: input.denialReason,
      drilldownSection: input.category
        ? storedDrilldownSections[input.category]
        : undefined,
      effectiveAt: input.effectiveAt,
      kind: kindFor(input),
      outcome: input.outcome,
      purpose: purposeFor(input),
      reportEnd: input.end,
      reportStart: input.start,
      source: ServiceCommerceReportReadSource.SERVICE_COMMERCE_REPORTING,
      storeId: input.validatedStoreId,
      tenantId: input.tenantId,
    },
  })
}

/**
 * Reauthorizes every sensitive aggregate read at the repository boundary and
 * appends safe audit evidence before any report rows are queried or returned.
 * A caller-supplied Store id is never persisted until it is proven to belong
 * to the authenticated Tenant.
 */
export async function authorizeServiceCommerceReportRead(
  db: PrismaClient,
  input: ReportReadAccessInput,
) {
  const decision = await db.$transaction(async (tx) => {
    const membership = await tx.membership.findFirst({
      select: { id: true, role: true },
      where: {
        acceptedAt: { not: null },
        status: MembershipStatus.ACTIVE,
        tenantId: input.tenantId,
        userId: input.actorUserId,
      },
    })
    if (!membership || !reportManagers.has(membership.role)) {
      await appendReportReadAudit(tx, {
        ...input,
        denialReason: ServiceCommerceReportReadDenialReason.ACCESS_FORBIDDEN,
        outcome: ServiceCommerceReportReadOutcome.DENIED,
      })
      return { error: "REPORT_ACCESS_FORBIDDEN" } as const
    }

    const lockedMembership = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "Membership"
      WHERE "id" = ${membership.id}
      FOR UPDATE
    `
    const postLockNow = input.now ?? new Date()
    const currentMembership = lockedMembership[0]
      ? await tx.membership.findFirst({
          select: { id: true, role: true },
          where: {
            acceptedAt: { not: null },
            id: membership.id,
            status: MembershipStatus.ACTIVE,
            tenantId: input.tenantId,
            userId: input.actorUserId,
          },
        })
      : null
    if (!currentMembership || !reportManagers.has(currentMembership.role)) {
      await appendReportReadAudit(tx, {
        ...input,
        denialReason: ServiceCommerceReportReadDenialReason.ACCESS_FORBIDDEN,
        effectiveAt: postLockNow,
        outcome: ServiceCommerceReportReadOutcome.DENIED,
      })
      return { error: "REPORT_ACCESS_FORBIDDEN" } as const
    }

    // Capture the rolling-window boundary only after acquiring the row lock.
    // Omitting an upper bound also ensures a queued caller sees the preceding
    // caller's committed audit even when its request began earlier.
    const recentReadCount = await tx.serviceCommerceReportReadAuditEvent.count({
      where: {
        actorUserId: input.actorUserId,
        effectiveAt: {
          gte: new Date(
            postLockNow.getTime() -
              SERVICE_COMMERCE_REPORT_RATE_LIMIT_WINDOW_MILLISECONDS,
          ),
        },
        tenantId: input.tenantId,
      },
    })
    if (recentReadCount >= SERVICE_COMMERCE_REPORT_RATE_LIMIT_MAX_READS) {
      await appendReportReadAudit(tx, {
        ...input,
        denialReason: ServiceCommerceReportReadDenialReason.RATE_LIMITED,
        effectiveAt: postLockNow,
        outcome: ServiceCommerceReportReadOutcome.DENIED,
      })
      return { error: "REPORT_RATE_LIMITED" } as const
    }

    let validatedStoreId: string | undefined
    if (input.storeId) {
      const store = await tx.store.findFirst({
        select: { id: true },
        where: { id: input.storeId, tenantId: input.tenantId },
      })
      if (!store) {
        await appendReportReadAudit(tx, {
          ...input,
          denialReason: ServiceCommerceReportReadDenialReason.STORE_NOT_FOUND,
          effectiveAt: postLockNow,
          outcome: ServiceCommerceReportReadOutcome.DENIED,
        })
        return { error: "REPORT_STORE_NOT_FOUND" } as const
      }
      validatedStoreId = store.id
    }

    await appendReportReadAudit(tx, {
      ...input,
      effectiveAt: postLockNow,
      outcome: ServiceCommerceReportReadOutcome.ALLOWED,
      validatedStoreId,
    })
    return { storeId: validatedStoreId } as const
  }, REPORT_READ_TRANSACTION_OPTIONS)

  if ("error" in decision) throw new Error(decision.error)
  return { storeId: decision.storeId }
}
