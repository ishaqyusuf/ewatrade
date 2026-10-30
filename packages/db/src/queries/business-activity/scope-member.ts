import {
  type Membership,
  Prisma,
  type StaffStoreAssignment,
  type SubscriptionPlan,
  type Tenant,
  type TenantSubscription,
} from "../../../generated/prisma/client"

type ScopeSubscription = Pick<
  TenantSubscription,
  "provider" | "status" | "billingSubscriptionId" | "currentPeriodEndsAt"
> & { plan: Pick<SubscriptionPlan, "key"> }

type ScopeMemberRow = Pick<
  Membership,
  "id" | "role" | "staffAccessMode" | "staffAccessRevision"
> & {
  active: boolean
  timezone: string
  metadata: Tenant["metadata"]
  assignments: Pick<StaffStoreAssignment, "storeId" | "role">[]
  subscriptionId: string | null
  planKey: string | null
  provider: TenantSubscription["provider"] | null
  subscriptionStatus: TenantSubscription["status"] | null
  billingSubscriptionId: string | null
  currentPeriodEndsAt: Date | null
}

/** Uses the caller's existing transaction and retains its Membership row lock. */
export async function getActivityScopeMember(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  input: { tenantId: string; viewerUserId: string },
) {
  const rows = await tx.$queryRaw<ScopeMemberRow[]>(Prisma.sql`
    SELECT m.id, m.role::text AS role, m."staffAccessMode"::text AS "staffAccessMode",
      m."staffAccessRevision", (m.status='ACTIVE' AND t."isActive") AS active,
      t.timezone, t.metadata,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('storeId',g."storeId",'role',g.role))
        FROM "StaffStoreAssignment" g JOIN "Store" s ON s.id=g."storeId" AND s."tenantId"=g."tenantId"
        WHERE g."membershipId"=m.id AND g."tenantId"=m."tenantId"
          AND g.status='ACTIVE' AND s.status='ACTIVE'
      ),'[]'::jsonb) AS assignments,
      sub.id AS "subscriptionId", p.key AS "planKey", sub.provider::text AS provider,
      sub.status::text AS "subscriptionStatus", sub."billingSubscriptionId", sub."currentPeriodEndsAt"
    FROM "Membership" m JOIN "Tenant" t ON t.id=m."tenantId"
    LEFT JOIN "TenantSubscription" sub ON sub."tenantId"=t.id
    LEFT JOIN "SubscriptionPlan" p ON p.id=sub."planId"
    WHERE m."tenantId"=${input.tenantId} AND m."userId"=${input.viewerUserId}
    FOR SHARE OF m
  `)
  const row = rows[0]
  if (!row?.active) return null
  let subscription: ScopeSubscription | null = null
  if (row.subscriptionId !== null) {
    if (
      row.planKey === null ||
      row.provider === null ||
      row.subscriptionStatus === null
    )
      throw new Error("Activity subscription facts are unavailable.")
    subscription = {
      plan: { key: row.planKey },
      provider: row.provider,
      status: row.subscriptionStatus,
      billingSubscriptionId: row.billingSubscriptionId,
      currentPeriodEndsAt: row.currentPeriodEndsAt,
    }
  }
  return {
    id: row.id,
    role: row.role,
    staffAccessMode: row.staffAccessMode,
    staffAccessRevision: row.staffAccessRevision,
    tenant: { timezone: row.timezone, metadata: row.metadata, subscription },
    staffStoreAssignments: row.assignments,
  }
}
