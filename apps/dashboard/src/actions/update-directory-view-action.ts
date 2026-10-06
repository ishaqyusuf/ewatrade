"use server"

import { getServerSession } from "@/lib/session"
import { getActiveTenant } from "@/lib/tenant"
import { getTableSettingsScope } from "@/utils/columns"
import {
  directoryViewInputSchema,
  getDirectoryViewCookie,
} from "@/utils/directory-view-settings"
import { cookies } from "next/headers"
import type { z } from "zod"

export async function updateDirectoryViewAction(
  input: z.infer<typeof directoryViewInputSchema>,
) {
  const parsed = directoryViewInputSchema.safeParse(input)
  if (!parsed.success) return { error: "Invalid view preference." }
  const session = await getServerSession()
  const ctx = session ? await getActiveTenant(session.user.id) : null
  if (!session || !ctx)
    return { error: "Sign in to save your view preference." }
  const scope = getTableSettingsScope(session.user.id, ctx.tenant.id)
  if (scope !== parsed.data.scope)
    return {
      error: "Your active business changed. Refresh before saving this view.",
    }
  ;(await cookies()).set(
    getDirectoryViewCookie(parsed.data.pageId, scope),
    parsed.data.view,
    {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    },
  )
  return { error: null }
}
