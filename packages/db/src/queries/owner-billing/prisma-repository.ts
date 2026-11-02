import { Prisma, type PrismaClient } from "../../../generated/prisma/client"
import type { DbClient } from "../types"
import type {
  OwnerBillingRepository,
  OwnerBillingTransaction,
} from "./commands"
import {
  type OwnerBillingAccount,
  type OwnerBillingEnvironment,
  OwnerBillingPolicyError,
  type OwnerBillingProvider,
  type OwnerBillingSubscription,
  type OwnerBusinessCoverage,
  projectOwnerBusinessAccess,
} from "./policy"

/**
 * Owner-wide billing stays off until the reviewed cutover. Both the explicit
 * switch and a valid store environment are required; anything else is "off".
 */
export function ownerBillingRuntime(
  env: Record<string, string | undefined> = process.env,
): { environment: OwnerBillingEnvironment } | null {
  const environment = env.STORE_BILLING_ENVIRONMENT
  if (env.OWNER_BILLING_ENABLED !== "true") return null
  if (environment !== "production" && environment !== "sandbox") return null
  return { environment }
}

// Every owner billing transaction locks in this order: account, then Tenant.
// ReadCommitted is deliberate: each read after the locks sees committed state,
// where a Serializable snapshot taken before a lock wait would be stale.
const OWNER_BILLING_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 10_000,
  timeout: 30_000,
} as const

export async function lockOwnerBillingAccount(
  tx: Prisma.TransactionClient,
  accountId: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`owner-billing-account:${accountId}`}, 0))`
}

async function lockOwnerBillingTenant(
  tx: Prisma.TransactionClient,
  tenantId: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`owner-billing-tenant:${tenantId}`}, 0))`
}

export function runOwnerBillingTransaction<T>(
  db: PrismaClient,
  accountId: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return db.$transaction(
    async (tx) => {
      await lockOwnerBillingAccount(tx, accountId)
      return work(tx)
    },
    { ...OWNER_BILLING_TRANSACTION_OPTIONS },
  )
}

const PAID_PLAN_IDS = new Set(["starter", "growth", "pro"])

export function toOwnerBillingProvider(provider: string): OwnerBillingProvider {
  if (provider === "APP_STORE") return "app_store"
  if (provider === "PLAY_STORE") return "play_store"
  throw new OwnerBillingPolicyError("INVALID_STATE")
}

export function toDurableBillingProvider(provider: OwnerBillingProvider) {
  return provider === "app_store"
    ? ("APP_STORE" as const)
    : ("PLAY_STORE" as const)
}

function toOwnerEnvironment(environment: string): OwnerBillingEnvironment {
  if (environment === "production" || environment === "sandbox")
    return environment
  throw new OwnerBillingPolicyError("INVALID_STATE")
}

export function mapOwnerBillingSubscription(row: {
  accountId: string
  provider: string
  environment: string
  purchaseDigest: string
  planId: string
  status: string
  currentPeriodEndsAt: Date
}): OwnerBillingSubscription {
  if (!PAID_PLAN_IDS.has(row.planId))
    throw new OwnerBillingPolicyError("INVALID_STATE")
  return {
    accountId: row.accountId,
    provider: toOwnerBillingProvider(row.provider),
    environment: toOwnerEnvironment(row.environment),
    purchaseDigest: row.purchaseDigest,
    planId: row.planId as OwnerBillingSubscription["planId"],
    status: row.status as OwnerBillingSubscription["status"],
    currentPeriodEndsAt: row.currentPeriodEndsAt,
  }
}

const subscriptionSelect = {
  accountId: true,
  provider: true,
  environment: true,
  purchaseDigest: true,
  planId: true,
  status: true,
  currentPeriodEndsAt: true,
} satisfies Prisma.OwnerBillingSubscriptionSelect

async function readAccount(
  db: DbClient,
  accountId: string,
  lockOwner: boolean,
): Promise<OwnerBillingAccount | null> {
  const account = await db.ownerBillingAccount.findUnique({
    where: { id: accountId },
    select: { id: true, ownerUserId: true },
  })
  if (!account) return null
  // The owner row is shared-locked so a concurrent account removal waits.
  const owner = lockOwner
    ? await db.$queryRaw<
        { id: string }[]
      >`SELECT "id" FROM "User" WHERE "id" = ${account.ownerUserId} FOR SHARE`
    : await db.user.findMany({
        where: { id: account.ownerUserId },
        select: { id: true },
      })
  return {
    id: account.id,
    ownerUserId: account.ownerUserId,
    ownerIsActive: owner.length === 1,
  }
}

async function readSubscription(db: DbClient, accountId: string) {
  const row = await db.ownerBillingSubscription.findUnique({
    where: { accountId },
    select: subscriptionSelect,
  })
  return row ? mapOwnerBillingSubscription(row) : null
}

async function readCoverage(db: DbClient, accountId: string) {
  const rows = await db.ownerBusinessCoverage.findMany({
    where: { accountId, activeTenantId: { not: null } },
    select: { accountId: true, tenantId: true, enrolledAt: true },
  })
  return rows satisfies OwnerBusinessCoverage[]
}

async function readOwnedTenantIds(
  db: DbClient,
  ownerUserId: string,
  tenantIds: string[],
  lock: boolean,
) {
  if (tenantIds.length === 0) return []
  if (!lock) {
    const rows = await db.membership.findMany({
      where: {
        userId: ownerUserId,
        tenantId: { in: tenantIds },
        role: "OWNER",
        status: "ACTIVE",
        tenant: { isActive: true },
      },
      select: { tenantId: true },
    })
    return rows.map((row) => row.tenantId)
  }
  // Shared row locks make a concurrent membership or Tenant change wait until
  // this coverage decision commits, and make this read wait for theirs.
  const rows = await db.$queryRaw<{ tenantId: string }[]>`
    SELECT m."tenantId"
    FROM "Membership" m
    JOIN "Tenant" t ON t."id" = m."tenantId"
    WHERE m."userId" = ${ownerUserId}
      AND m."tenantId" = ANY(${tenantIds}::text[])
      AND m."role" = 'OWNER'
      AND m."status" = 'ACTIVE'
      AND t."isActive" = true
    ORDER BY m."tenantId"
    FOR SHARE OF m, t`
  return rows.map((row) => row.tenantId)
}

function createTransactionPort(
  tx: Prisma.TransactionClient,
  now: () => Date,
): OwnerBillingTransaction {
  const ownerOf = async (accountId: string) => {
    const account = await tx.ownerBillingAccount.findUnique({
      where: { id: accountId },
      select: { ownerUserId: true },
    })
    if (!account) throw new OwnerBillingPolicyError("OWNER_REQUIRED")
    return account.ownerUserId
  }
  return {
    getAccount: (accountId) => readAccount(tx, accountId, true),
    getSubscription: (accountId) => readSubscription(tx, accountId),
    listCoverage: (accountId) => readCoverage(tx, accountId),
    async getCoverage(tenantId) {
      return tx.ownerBusinessCoverage.findUnique({
        where: { activeTenantId: tenantId },
        select: { accountId: true, tenantId: true, enrolledAt: true },
      })
    },
    getOwnedTenantIds: (ownerUserId, tenantIds) =>
      readOwnedTenantIds(tx, ownerUserId, tenantIds, true),
    async enrollCoverage(coverage) {
      // Commands only enroll for the account owner, after assertBillingOwner.
      await tx.ownerBusinessCoverage.create({
        data: {
          accountId: coverage.accountId,
          tenantId: coverage.tenantId,
          activeTenantId: coverage.tenantId,
          enrolledAt: coverage.enrolledAt,
          enrolledByUserId: await ownerOf(coverage.accountId),
        },
      })
    },
    async removeCoverage(accountId, tenantId) {
      const released = await tx.ownerBusinessCoverage.updateMany({
        where: { accountId, activeTenantId: tenantId },
        data: {
          activeTenantId: null,
          releasedAt: now(),
          releasedByUserId: await ownerOf(accountId),
        },
      })
      if (released.count !== 1)
        throw new OwnerBillingPolicyError("COVERAGE_CONFLICT")
    },
  }
}

/** Durable port for enrollOwnerBusiness/removeOwnerBusiness; see commands.ts. */
export function createPrismaOwnerBillingRepository(
  db: PrismaClient,
  options: { now?: () => Date } = {},
): OwnerBillingRepository {
  const now = options.now ?? (() => new Date())
  return {
    transaction(scope, work) {
      return db.$transaction(
        async (tx) => {
          await lockOwnerBillingAccount(tx, scope.accountId)
          await lockOwnerBillingTenant(tx, scope.tenantId)
          return work(createTransactionPort(tx, now))
        },
        { ...OWNER_BILLING_TRANSACTION_OPTIONS },
      )
    },
  }
}

/** Creates the account only when its owner is about to be offered a purchase. */
export function getOrCreateOwnerBillingAccount(
  db: DbClient,
  ownerUserId: string,
) {
  return db.ownerBillingAccount.upsert({
    where: { ownerUserId },
    create: { ownerUserId },
    update: {},
    select: { id: true },
  })
}

export function findOwnerBillingAccount(db: DbClient, ownerUserId: string) {
  return db.ownerBillingAccount.findUnique({
    where: { ownerUserId },
    select: { id: true },
  })
}

/** Unlocked read of one account's current facts for catalog/entitlement readers. */
export async function readOwnerCoverageSnapshot(
  db: DbClient,
  input: {
    accountId: string
    tenantIds?: string[]
    environment: OwnerBillingEnvironment
    now?: Date
  },
) {
  const account = await readAccount(db, input.accountId, false)
  if (!account) return null
  const coverage = await readCoverage(db, account.id)
  return {
    account,
    coverage,
    subscription: await readSubscription(db, account.id),
    ownedTenantIds: await readOwnedTenantIds(
      db,
      account.ownerUserId,
      [
        ...new Set([
          ...coverage.map((row) => row.tenantId),
          ...(input.tenantIds ?? []),
        ]),
      ],
      false,
    ),
    environment: input.environment,
    now: input.now ?? new Date(),
  }
}

/**
 * The plan the owner-wide subscription projects onto one business, or null when
 * the business has no current coverage. A projection only: membership, roles,
 * Store scope and every domain check remain independently required.
 */
export async function getOwnerBusinessAccess(
  db: DbClient,
  input: {
    tenantId: string
    environment: OwnerBillingEnvironment
    now?: Date
  },
) {
  const coverage = await db.ownerBusinessCoverage.findUnique({
    where: { activeTenantId: input.tenantId },
    select: { accountId: true },
  })
  if (!coverage) return null
  const snapshot = await readOwnerCoverageSnapshot(db, {
    accountId: coverage.accountId,
    tenantIds: [input.tenantId],
    environment: input.environment,
    now: input.now,
  })
  return snapshot ? projectOwnerBusinessAccess(snapshot, input.tenantId) : null
}
