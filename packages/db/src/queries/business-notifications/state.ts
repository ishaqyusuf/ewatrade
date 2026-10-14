import {
  type BusinessEventType,
  type BusinessNotificationPolicyView,
  type BusinessNotificationPreferenceValue,
  businessEventCatalog,
  hasBusinessEventHandler,
} from "@ewatrade/notifications/business-events"
import {
  type BusinessNotificationPolicy,
  Prisma,
} from "../../../generated/prisma/client"
import { BusinessActivityError } from "../business-activity/errors"
import {
  type BusinessActivityScope,
  type BusinessActivityViewer,
  businessActivityScope,
  businessActivityScopeSql,
} from "../business-activity/scope"

// Producer/privacy/concurrency acceptance must release types here explicitly.
// Handler presence or historical rows alone never activate delivery.
export const activeBusinessNotificationTypes: readonly BusinessEventType[] = []
export function notificationCatalog() {
  const available: Partial<Record<BusinessEventType, "recorded">> = {}
  for (const type of activeBusinessNotificationTypes)
    available[type] = "recorded"
  return businessEventCatalog(available)
}
export function notificationTypeSupported(type: BusinessEventType) {
  return (
    activeBusinessNotificationTypes.includes(type) &&
    hasBusinessEventHandler(type)
  )
}
export function policyView(
  type: BusinessEventType,
  policy?: BusinessNotificationPolicy | null,
): BusinessNotificationPolicyView {
  return {
    type,
    allowed: { inApp: policy?.inAppAllowed ?? false, email: false },
    defaults: { inApp: policy?.inAppDefault ?? false, email: false },
    recipientRoles: Array.isArray(policy?.recipientRoles)
      ? policy.recipientRoles.filter(
          (role): role is string => typeof role === "string",
        )
      : [],
    revision: policy?.revision ?? 0,
  }
}
export function preferenceValue(
  value: string | undefined,
): BusinessNotificationPreferenceValue {
  return value === "on" || value === "off" ? value : "inherit"
}
export async function notificationMember(
  tx: Prisma.TransactionClient,
  viewer: BusinessActivityViewer,
) {
  await tx.$queryRaw`SELECT id FROM "Membership" WHERE "tenantId"=${viewer.tenantId} AND "userId"=${viewer.viewerUserId} FOR SHARE`
  const member = await tx.membership.findFirst({
    where: {
      tenantId: viewer.tenantId,
      userId: viewer.viewerUserId,
      status: "ACTIVE",
      tenant: { isActive: true },
    },
    select: { id: true, role: true },
  })
  if (!member)
    throw new BusinessActivityError(
      "FORBIDDEN",
      "Active business membership is required.",
    )
  return member
}
export async function notificationScope(
  tx: Prisma.TransactionClient,
  viewer: BusinessActivityViewer,
) {
  const member = await notificationMember(tx, viewer)
  if (
    !["OWNER", "ADMIN", "MANAGER", "CASHIER", "OPERATOR"].includes(member.role)
  )
    return { member, scope: null }
  try {
    return { member, scope: await businessActivityScope(tx, viewer) }
  } catch (error) {
    if (error instanceof BusinessActivityError && error.code === "FORBIDDEN")
      return { member, scope: null }
    throw error
  }
}
export async function notificationAdminScope(
  tx: Prisma.TransactionClient,
  viewer: BusinessActivityViewer,
) {
  const scope = await businessActivityScope(tx, viewer)
  if (!scope.manages)
    throw new BusinessActivityError(
      "FORBIDDEN",
      "Only Owner or Admin can configure business alerts.",
    )
  return scope
}

/** Both fanout and every inbox read repeat the current policy and record authority. */
export function eligibleNotificationEventSql(
  scope: BusinessActivityScope,
): Prisma.Sql {
  if (!activeBusinessNotificationTypes.length) return Prisma.sql`false`
  return Prisma.sql`${businessActivityScopeSql(scope)}
    AND e.type IN (${Prisma.join(activeBusinessNotificationTypes)})
    AND ${notificationAudienceSql(Prisma.sql`${scope.membershipId}`, Prisma.sql`${scope.role}`)}`
}

/** SQL references are internal code-owned fragments, never arbitrary API input. */
export function notificationAudienceSql(
  membershipId: Prisma.Sql,
  role: Prisma.Sql,
) {
  return Prisma.sql`EXISTS (SELECT 1 FROM "BusinessNotificationPolicy" np
      LEFT JOIN "BusinessNotificationSubscription" ns ON ns."tenantId"=np."tenantId" AND ns.type=np.type AND ns."membershipId"=${membershipId}
      LEFT JOIN "BusinessNotificationPreference" pref ON pref."tenantId"=np."tenantId" AND pref.type=np.type AND pref."membershipId"=${membershipId}
      WHERE np."tenantId"=e."tenantId" AND np.type=e.type AND np."inAppAllowed"
        AND (CASE WHEN ns.id IS NOT NULL THEN ns.enabled AND ns."inAppAllowed" ELSE np."recipientRoles" ? ${role} END)
        AND (COALESCE(pref."inApp",'inherit')='on' OR (COALESCE(pref."inApp",'inherit')='inherit' AND np."inAppDefault"))
        AND (ns.id IS NULL OR ns."scopeKind" IN ('business','accessible_stores') OR
          (ns."scopeKind"='stores' AND EXISTS (SELECT 1 FROM "BusinessNotificationSubscriptionStore" ss
            JOIN "BusinessActivityStoreScope" es ON es."tenantId"=ss."tenantId" AND es."storeId"=ss."storeId"
            WHERE ss."tenantId"=e."tenantId" AND ss."subscriptionId"=ns.id AND es."eventId"=e.id))))`
}
