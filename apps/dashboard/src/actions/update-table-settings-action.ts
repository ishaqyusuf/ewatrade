"use server"

import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { getTableSettingsCookie, getTableSettingsScope } from "@/utils/columns"
import { tableIds, tableSettingsSchema } from "@/utils/table-settings"
import { cookies } from "next/headers"
import { z } from "zod"

const inputSchema = z
  .object({
    tableId: z.enum(tableIds),
    scope: z.string().regex(/^[a-f0-9]{24}$/),
    settings: tableSettingsSchema,
  })
  .strict()

export async function updateTableSettingsAction(
  input: z.infer<typeof inputSchema>,
) {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid table settings." }
  const session = await getServerSession()
  const ctx = session ? await getActiveTenant(session.user.id) : null
  if (!session || !ctx) return { error: "Sign in to save your table layout." }
  const scope = getTableSettingsScope(session.user.id, ctx.tenant.id)
  if (scope !== parsed.data.scope)
    return {
      error: "Your active business changed. Refresh before saving this layout.",
    }
  const value = JSON.stringify(parsed.data.settings)
  if (encodeURIComponent(value).length > 3500)
    return { error: "This table layout is too large to save." }
  ;(await cookies()).set(
    getTableSettingsCookie(parsed.data.tableId, scope),
    value,
    {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    },
  )
  return { error: null }
}
