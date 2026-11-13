import type { PrismaClient } from "../../generated/prisma/client"
import { deleteQaTenant } from "./qa-maintenance"
import type { DbClient } from "./types"

/**
 * Oversight's per-tester view of QA data in this environment, and deletion
 * scoped to one tester. Only QA-classified tenants are ever read or deleted;
 * LIVE tenants are outside every query here.
 */

export type QaOfficeBusiness = {
  id: string
  name: string
  slug: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  staff: number
  stores: number
  products: number
  orders: number
  customers: number
}

export type QaOfficeTester = { qa: string; businesses: QaOfficeBusiness[] }

const qaDomainPattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+test$/

export function isQaOfficeDomain(value: string) {
  return value.length <= 253 && qaDomainPattern.test(value)
}

function countBy(rows: Array<{ tenantId: string; _count: { _all: number } }>) {
  return new Map(rows.map((row) => [row.tenantId, row._count._all]))
}

export async function listQaOfficeData(
  db: DbClient,
): Promise<{ testers: QaOfficeTester[] }> {
  const tenants = await db.tenant.findMany({
    where: {
      dataClassification: "QA",
      qaPurgeStartedAt: null,
      qaSourceDomain: { not: null },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      qaSourceDomain: true,
    },
  })
  const tenantIds = tenants.map((tenant) => tenant.id)
  const scope = { tenantId: { in: tenantIds } }
  const [staff, stores, products, orders, customers] = tenantIds.length
    ? await Promise.all([
        db.membership.groupBy({
          by: ["tenantId"],
          where: { ...scope, role: { not: "OWNER" }, status: "ACTIVE" },
          _count: { _all: true },
        }),
        db.store.groupBy({
          by: ["tenantId"],
          where: scope,
          _count: { _all: true },
        }),
        db.catalogItem.groupBy({
          by: ["tenantId"],
          where: { ...scope, systemRole: null, archivedAt: null },
          _count: { _all: true },
        }),
        db.commercialOrder.groupBy({
          by: ["tenantId"],
          where: scope,
          _count: { _all: true },
        }),
        db.customer.groupBy({
          by: ["tenantId"],
          where: scope,
          _count: { _all: true },
        }),
      ]).then((groups) => groups.map(countBy))
    : [new Map(), new Map(), new Map(), new Map(), new Map()]

  const testers = new Map<string, QaOfficeBusiness[]>()
  for (const { qaSourceDomain, ...tenant } of tenants) {
    if (!qaSourceDomain) continue
    const list = testers.get(qaSourceDomain) ?? []
    list.push({
      ...tenant,
      staff: staff.get(tenant.id) ?? 0,
      stores: stores.get(tenant.id) ?? 0,
      products: products.get(tenant.id) ?? 0,
      orders: orders.get(tenant.id) ?? 0,
      customers: customers.get(tenant.id) ?? 0,
    })
    testers.set(qaSourceDomain, list)
  }
  return {
    testers: [...testers].map(([qa, businesses]) => ({ qa, businesses })),
  }
}

export class QaOfficePurgeError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "CONFLICT",
    message: string,
  ) {
    super(message)
    this.name = "QaOfficePurgeError"
  }
}

export type QaOfficePurgeResult = {
  runId: string
  status: "COMPLETED" | "PARTIALLY_COMPLETED" | "FAILED"
  deleted: Array<{ id: string; name: string }>
  failed: Array<{ id: string; name: string; reason: string }>
  accountsDeleted: number
}

function blockerFor(tenant: {
  subscription: {
    provider: string
    status: string
    billingSubscriptionId: string | null
  } | null
  domainOrders: Array<{ id: string }>
}) {
  if (
    tenant.subscription &&
    tenant.subscription.provider !== "NONE" &&
    ["ACTIVE", "PAST_DUE"].includes(tenant.subscription.status) &&
    tenant.subscription.billingSubscriptionId
  )
    return "live_subscription"
  if (tenant.domainOrders.length) return "purchased_domain"
  return null
}

/**
 * Deletes one tester's QA businesses (all of them, or the listed ones) and,
 * when everything for the tester is gone, the tester's QA-domain accounts.
 * Synchronous: a tester has a handful of businesses, and each delete runs in
 * its own bounded transaction (see deleteQaTenant).
 */
export async function purgeQaTester(
  db: PrismaClient,
  input: { qa: string; tenantIds?: string[]; requestedBy: string },
  deleteTenant: typeof deleteQaTenant = deleteQaTenant,
): Promise<QaOfficePurgeResult> {
  if (!isQaOfficeDomain(input.qa))
    throw new QaOfficePurgeError("NOT_FOUND", "Unknown QA tester.")
  const wanted = input.tenantIds ? [...new Set(input.tenantIds)] : null
  const tenants = await db.tenant.findMany({
    where: {
      dataClassification: "QA",
      qaSourceDomain: input.qa,
      qaPurgeStartedAt: null,
      ...(wanted ? { id: { in: wanted } } : {}),
    },
    select: {
      id: true,
      name: true,
      subscription: {
        select: { provider: true, status: true, billingSubscriptionId: true },
      },
      domainOrders: {
        where: {
          OR: [{ paidAt: { not: null } }, { registeredAt: { not: null } }],
        },
        select: { id: true },
      },
    },
  })
  if (wanted && tenants.length !== wanted.length)
    throw new QaOfficePurgeError(
      "NOT_FOUND",
      "A selected business is not one of this tester's QA businesses.",
    )

  const startedAt = new Date()
  let runId: string
  try {
    runId = (
      await db.qaPurgeRun.create({
        data: {
          activeKey: `tester:${input.qa}`,
          requestedByUserId: input.requestedBy,
          startedAt,
          status: "RUNNING",
        },
        select: { id: true },
      })
    ).id
  } catch {
    throw new QaOfficePurgeError(
      "CONFLICT",
      "A deletion is already running for this tester.",
    )
  }

  const deleted: QaOfficePurgeResult["deleted"] = []
  const failed: QaOfficePurgeResult["failed"] = []
  const deletable = tenants.filter((tenant) => {
    const blocker = blockerFor(tenant)
    if (blocker)
      failed.push({ id: tenant.id, name: tenant.name, reason: blocker })
    return !blocker
  })
  if (deletable.length)
    await db.tenant.updateMany({
      where: {
        id: { in: deletable.map((tenant) => tenant.id) },
        dataClassification: "QA",
      },
      data: { qaPurgeStartedAt: startedAt },
    })
  for (const tenant of deletable) {
    try {
      await deleteTenant(db, tenant.id)
      deleted.push({ id: tenant.id, name: tenant.name })
    } catch (error) {
      failed.push({
        id: tenant.id,
        name: tenant.name,
        reason:
          error instanceof Error && error.message.startsWith("Catalog provider")
            ? "catalog_provider_assets"
            : "delete_failed",
      })
      // Keep an undeleted business usable instead of hidden mid-purge.
      await db.tenant.updateMany({
        where: { id: tenant.id, dataClassification: "QA" },
        data: { qaPurgeStartedAt: null },
      })
    }
  }

  let accountsDeleted = 0
  if (!wanted && !failed.length) {
    // Accounts that only ever belonged to this tester's QA namespace.
    accountsDeleted = (
      await db.user.deleteMany({
        where: {
          email: { endsWith: `@${input.qa}` },
          memberships: { none: {} },
          isPlatformAdmin: false,
        },
      })
    ).count
  }

  const status = !failed.length
    ? "COMPLETED"
    : deleted.length
      ? "PARTIALLY_COMPLETED"
      : "FAILED"
  await db.qaPurgeRun.update({
    where: { id: runId },
    data: {
      activeKey: null,
      completedAt: new Date(),
      deletedCounts: { tenants: deleted.length, users: accountsDeleted },
      errorCategory: failed[0]?.reason,
      status,
    },
  })
  return { runId, status, deleted, failed, accountsDeleted }
}
