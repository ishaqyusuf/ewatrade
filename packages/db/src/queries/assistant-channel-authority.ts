import { isAccountPrivacyAccessBlocked } from "./account-privacy-access"
import { isLegalSignupSessionBlocked } from "./legal-session-access"
import { getCustomerAccountAgeStatus } from "./store-conversation-age-authority"
import { getActiveTenantForUser } from "./tenants"
import type { DbClient } from "./types"

export type AssistantChannelScope = {
  userId: string
  tenantId: string
  storeId: string
  membershipId: string
}

export async function readAssistantChannelScope(
  db: DbClient,
  scope: AssistantChannelScope,
  allowsTenant: (tenantId: string) => boolean = () => true,
) {
  const tenant = await db.tenant.findUnique({
    where: { id: scope.tenantId },
    select: { slug: true },
  })
  if (!tenant || !allowsTenant(scope.tenantId)) return null
  const context = await getActiveTenantForUser(db, {
    userId: scope.userId,
    tenantSlug: tenant.slug,
    storeId: scope.storeId,
  })
  if (
    !context ||
    context.tenant.id !== scope.tenantId ||
    context.membership.id !== scope.membershipId ||
    context.activeStore?.id !== scope.storeId ||
    context.activeStore.status !== "ACTIVE" ||
    context.tenant.qaPurgeStartedAt ||
    context.staffAccess?.status !== "ACTIVE" ||
    !["OWNER", "ADMIN", "MANAGER", "CASHIER", "OPERATOR"].includes(
      context.membership.role,
    )
  )
    return null
  if (
    !(await getCustomerAccountAgeStatus(db, scope.userId)).eligible ||
    (await isAccountPrivacyAccessBlocked(db, scope.userId)) ||
    (await isLegalSignupSessionBlocked(db, scope.userId))
  )
    return null
  return context
}
