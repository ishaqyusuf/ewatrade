export type QaSessionAccessClass =
  | "authenticated_global"
  | "platform_admin"
  | "tenant_scoped"

export type QaSessionScope = {
  membershipId: string
  storeId: string
  tenantId: string
}

export function isQaDerivedSessionAllowed(
  accessClass: QaSessionAccessClass,
  hasQaScope: boolean,
) {
  return !hasQaScope || accessClass === "tenant_scoped"
}

/** A derived session's own Membership, live only while its QA Tenant and Store are. */
export function qaScopedMembershipWhere(userId: string, scope: QaSessionScope) {
  return {
    id: scope.membershipId,
    userId,
    status: "ACTIVE" as const,
    tenant: {
      id: scope.tenantId,
      dataClassification: "QA" as const,
      isActive: true,
      qaPurgeStartedAt: null,
      stores: { some: { id: scope.storeId, status: "ACTIVE" as const } },
    },
  }
}
