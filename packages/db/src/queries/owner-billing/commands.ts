import {
  type OwnerBillingAccount,
  type OwnerBillingEnvironment,
  OwnerBillingPolicyError,
  type OwnerBillingSubscription,
  type OwnerBusinessCoverage,
  assertBillingOwner,
  decideOwnerBusinessEnrollment,
  projectOwnerBusinessAccess,
} from "./policy"

export interface OwnerBillingTransaction {
  getAccount(accountId: string): Promise<OwnerBillingAccount | null>
  getSubscription(accountId: string): Promise<OwnerBillingSubscription | null>
  listCoverage(accountId: string): Promise<OwnerBusinessCoverage[]>
  getCoverage(tenantId: string): Promise<OwnerBusinessCoverage | null>
  /** Recheck active User, OWNER Membership and active Tenant under the lock. */
  getOwnedTenantIds(ownerUserId: string, tenantIds: string[]): Promise<string[]>
  /** Unique active Tenant binding; preserve enrollment history on later removal. */
  enrollCoverage(coverage: OwnerBusinessCoverage): Promise<void>
  /** Retain history and all business data; never cancel/transfer the purchase. */
  removeCoverage(accountId: string, tenantId: string): Promise<void>
}

export interface OwnerBillingRepository {
  /**
   * Future durable adapter must atomically lock BOTH the account and Tenant,
   * serialize membership changes, enforce unique active Tenant coverage, and
   * roll back all effects on failure. No Prisma adapter is activated here.
   */
  transaction<T>(
    scope: { accountId: string; tenantId: string },
    work: (tx: OwnerBillingTransaction) => Promise<T>,
  ): Promise<T>
}

type OwnerCoverageCommand = {
  /** Server-resolved account and authenticated actor, never model authority. */
  accountId: string
  actorUserId: string
  tenantId: string
}

async function requireAccount(
  tx: OwnerBillingTransaction,
  input: OwnerCoverageCommand,
) {
  const account = await tx.getAccount(input.accountId)
  if (!account || account.id !== input.accountId)
    throw new OwnerBillingPolicyError("OWNER_REQUIRED")
  assertBillingOwner(account, input.actorUserId)
  return account
}

/** Staged command; no route, assistant tool or live repository calls it yet. */
export function enrollOwnerBusiness(
  repository: OwnerBillingRepository,
  input: OwnerCoverageCommand,
  context: { environment: OwnerBillingEnvironment; now: () => Date },
) {
  return repository.transaction(
    { accountId: input.accountId, tenantId: input.tenantId },
    async (tx) => {
      const account = await requireAccount(tx, input)
      const coverage = await tx.listCoverage(account.id)
      const existingCoverage = await tx.getCoverage(input.tenantId)
      const ownedTenantIds = await tx.getOwnedTenantIds(account.ownerUserId, [
        ...new Set([...coverage.map((row) => row.tenantId), input.tenantId]),
      ])
      const snapshot = {
        account,
        coverage,
        ownedTenantIds,
        subscription: await tx.getSubscription(account.id),
        environment: context.environment,
        now: context.now(),
      }
      const action = decideOwnerBusinessEnrollment(snapshot, {
        ...input,
        existingCoverage,
      })
      if (action === "enroll") {
        const row = {
          accountId: account.id,
          tenantId: input.tenantId,
          enrolledAt: snapshot.now,
        }
        await tx.enrollCoverage(row)
        snapshot.coverage = [...coverage, row]
      }
      return {
        action,
        access: projectOwnerBusinessAccess(snapshot, input.tenantId),
      }
    },
  )
}

/** Removing coverage is an account operation, including after ownership loss. */
export function removeOwnerBusiness(
  repository: OwnerBillingRepository,
  input: OwnerCoverageCommand,
) {
  return repository.transaction(
    { accountId: input.accountId, tenantId: input.tenantId },
    async (tx) => {
      const account = await requireAccount(tx, input)
      const coverage = await tx.getCoverage(input.tenantId)
      if (!coverage) return { action: "unchanged" as const }
      if (
        coverage.tenantId !== input.tenantId ||
        coverage.accountId !== account.id
      )
        throw new OwnerBillingPolicyError("COVERAGE_CONFLICT")
      await tx.removeCoverage(account.id, input.tenantId)
      return { action: "removed" as const }
    },
  )
}
