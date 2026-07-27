import { createHash } from "node:crypto"
import type { DbClient } from "./types"

export type QaPurgeCounts = {
  files: number
  fileBytes: number
  memberships: number
  stores: number
  tenants: number
  users: number
}

function configuredQaDomains() {
  const raw = process.env.EMAIL_QA_DOMAIN_ROUTES?.trim()
  if (!raw) return new Set<string>()

  const parsed = JSON.parse(raw) as Record<string, unknown>
  return new Set(Object.keys(parsed).map((domain) => domain.toLowerCase()))
}

export function configuredQaDomainForEmail(email: string) {
  const domain = email.trim().toLowerCase().split("@").pop() ?? ""
  return configuredQaDomains().has(domain) ? domain : null
}

export async function assertQaTenantIdentity(
  db: DbClient,
  input: { email: string; tenantId: string },
) {
  const tenant = await db.tenant.findUnique({
    where: { id: input.tenantId },
    select: { dataClassification: true, qaSourceDomain: true },
  })
  if (!tenant) throw new Error("Tenant not found.")

  const domain = input.email.trim().toLowerCase().split("@").pop() ?? ""
  if (tenant.dataClassification === "QA" && domain !== tenant.qaSourceDomain) {
    throw new Error("Normal identities cannot join a QA tenant.")
  }
  if (tenant.dataClassification === "LIVE" && domain.endsWith(".test")) {
    throw new Error("QA identities cannot join a live tenant.")
  }
}

export async function discoverQaTenantCandidates(db: DbClient) {
  const tenants = await db.tenant.findMany({
    where: { dataClassification: "LIVE", qaPurgeStartedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      users: {
        where: { role: "OWNER", status: "ACTIVE" },
        select: { user: { select: { email: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  return tenants.flatMap((tenant) => {
    const qaSourceDomain = tenant.users
      .map((membership) => configuredQaDomainForEmail(membership.user.email))
      .find(Boolean)

    return qaSourceDomain
      ? [
          {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            qaSourceDomain,
            createdAt: tenant.createdAt,
          },
        ]
      : []
  })
}

export async function adoptQaTenantCandidates(
  db: DbClient,
  tenantIds: string[],
) {
  const candidates = await discoverQaTenantCandidates(db)
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]))
  if (tenantIds.some((tenantId) => !byId.has(tenantId))) {
    throw new Error("A selected tenant no longer qualifies as QA.")
  }

  await db.$transaction(
    tenantIds.map((tenantId) =>
      db.tenant.update({
        where: { id: tenantId, dataClassification: "LIVE" },
        data: {
          dataClassification: "QA",
          qaMarkedAt: new Date(),
          qaSourceDomain: byId.get(tenantId)?.qaSourceDomain,
        },
      }),
    ),
  )

  return { adoptedCount: tenantIds.length }
}

export async function previewQaPurge(db: DbClient) {
  const tenants = await db.tenant.findMany({
    where: { dataClassification: "QA" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      qaSourceDomain: true,
      updatedAt: true,
      subscription: {
        select: {
          provider: true,
          status: true,
          billingSubscriptionId: true,
        },
      },
      domainOrders: {
        where: {
          OR: [{ paidAt: { not: null } }, { registeredAt: { not: null } }],
        },
        select: { id: true },
      },
    },
  })
  const tenantIds = tenants.map((tenant) => tenant.id)
  const [memberships, stores, users] = tenantIds.length
    ? await Promise.all([
        db.membership.count({ where: { tenantId: { in: tenantIds } } }),
        db.store.count({ where: { tenantId: { in: tenantIds } } }),
        db.user.count({
          where: { memberships: { some: { tenantId: { in: tenantIds } } } },
        }),
      ])
    : [0, 0, 0]
  const blockers = tenants.flatMap((tenant) => {
    const entries: Array<{
      category: "live_subscription" | "purchased_domain"
      tenantId: string
      tenantName: string
    }> = []
    if (
      tenant.subscription?.provider !== "NONE" &&
      ["ACTIVE", "PAST_DUE"].includes(tenant.subscription?.status ?? "") &&
      tenant.subscription?.billingSubscriptionId
    ) {
      entries.push({
        category: "live_subscription",
        tenantId: tenant.id,
        tenantName: tenant.name,
      })
    }
    if (tenant.domainOrders.length > 0) {
      entries.push({
        category: "purchased_domain",
        tenantId: tenant.id,
        tenantName: tenant.name,
      })
    }
    return entries
  })
  const fingerprint = createHash("sha256")
    .update(
      tenants
        .map((tenant) => `${tenant.id}:${tenant.updatedAt.toISOString()}`)
        .join("|"),
    )
    .digest("hex")

  return {
    blockers,
    counts: {
      files: 0,
      fileBytes: 0,
      memberships,
      stores,
      tenants: tenants.length,
      users,
    } satisfies QaPurgeCounts,
    fingerprint,
    tenants: tenants.map(
      ({
        domainOrders: _domains,
        subscription: _subscription,
        updatedAt: _updatedAt,
        ...tenant
      }) => tenant,
    ),
  }
}

export async function createQaPurgeRun(db: DbClient, actorUserId: string) {
  return db.qaPurgeRun.create({
    data: {
      activeKey: "global",
      requestedByUserId: actorUserId,
      status: "QUEUED",
    },
  })
}

export async function getQaPurgeRun(db: DbClient, id: string) {
  return db.qaPurgeRun.findUnique({ where: { id } })
}

export async function beginQaPurge(db: DbClient, runId: string) {
  const preview = await previewQaPurge(db)
  if (preview.blockers.length) {
    await db.qaPurgeRun.update({
      where: { id: runId, status: "QUEUED" },
      data: {
        activeKey: null,
        completedAt: new Date(),
        errorCategory: "live_provider_resource",
        status: "BLOCKED",
      },
    })
    throw new Error("Live provider resources block QA deletion.")
  }

  const startedAt = new Date()
  await db.$transaction([
    db.qaPurgeRun.update({
      where: { id: runId, status: "QUEUED" },
      data: { startedAt, status: "RUNNING" },
    }),
    db.tenant.updateMany({
      where: { id: { in: preview.tenants.map((tenant) => tenant.id) } },
      data: { qaPurgeStartedAt: startedAt },
    }),
  ])
  return preview
}

export async function deleteQaTenant(db: DbClient, tenantId: string) {
  const userIds = (
    await db.membership.findMany({
      where: { tenantId },
      select: { userId: true },
    })
  ).map((membership) => membership.userId)

  await db.tenant.delete({
    where: {
      id: tenantId,
      dataClassification: "QA",
      qaPurgeStartedAt: { not: null },
    },
  })
  await db.user.deleteMany({
    where: {
      id: { in: userIds },
      memberships: { none: {} },
      isPlatformAdmin: false,
    },
  })
}

export async function finishQaPurge(
  db: DbClient,
  input: {
    counts: QaPurgeCounts
    errorCategory?: string
    runId: string
    status: "COMPLETED" | "FAILED" | "PARTIALLY_COMPLETED"
  },
) {
  return db.qaPurgeRun.update({
    where: { id: input.runId },
    data: {
      activeKey: null,
      completedAt: new Date(),
      deletedCounts: input.counts,
      errorCategory: input.errorCategory,
      status: input.status,
    },
  })
}
