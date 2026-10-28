"use server"

import { getServerSession } from "@/lib/session"
import { prisma } from "@ewatrade/db"
import { setTemplateUpdateEmailPreference } from "@ewatrade/db/queries"
import { z } from "zod"

export async function setTemplateUpdatePreference(
  tenantId: string,
  enabled: boolean,
) {
  const input = z
    .object({ tenantId: z.string().min(1).max(160), enabled: z.boolean() })
    .parse({ tenantId, enabled })
  const session = await getServerSession()
  if (!session) throw Error("Sign in to manage your email notices.")
  await setTemplateUpdateEmailPreference(prisma, {
    ...input,
    userId: session.user.id,
  })
  return { enabled: input.enabled }
}
