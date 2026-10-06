"use server"

import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"

/** Re-read the authenticated dashboard scope before a manager finance review/write. */
export async function readFinanceCloseScope() {
  const session = await getServerSession()
  if (!session) return null
  const tenant = await getActiveTenant(session.user.id)
  if (!tenant) return null
  return {
    actorUserId: session.user.id,
    role: tenant.membership.role,
    tenantId: tenant.tenant.id,
  }
}
