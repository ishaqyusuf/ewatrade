import "server-only"

import { createHash } from "node:crypto"
import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { cookies } from "next/headers"
import {
  type TableId,
  type TableSettings,
  getDefaultTableSettings,
  tableSettingsSchema,
} from "./table-settings"

export function getTableSettingsScope(
  userId: string,
  tenantId: string,
): string {
  return createHash("sha256")
    .update(JSON.stringify([userId, tenantId]))
    .digest("hex")
    .slice(0, 24)
}

export function getTableSettingsCookie(
  tableId: TableId,
  scope: string,
): string {
  return `table-settings-${scope}-${tableId}`
}

export async function getInitialTableSettings(
  tableId: TableId,
  identity?: { userId: string; tenantId: string },
): Promise<TableSettings> {
  let owner = identity
  if (!owner) {
    const session = await getServerSession()
    const ctx = session ? await getActiveTenant(session.user.id) : null
    if (!session || !ctx) return getDefaultTableSettings()
    owner = { userId: session.user.id, tenantId: ctx.tenant.id }
  }
  const scope = getTableSettingsScope(owner.userId, owner.tenantId)
  const value = (await cookies()).get(
    getTableSettingsCookie(tableId, scope),
  )?.value
  if (value && value.length <= 3500) {
    try {
      const saved = tableSettingsSchema.safeParse(JSON.parse(value))
      if (saved.success) return { ...saved.data, scope }
    } catch {}
  }
  return { ...getDefaultTableSettings(), scope }
}
