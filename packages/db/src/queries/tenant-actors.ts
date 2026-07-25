import type { PrismaClient } from "../../generated/prisma/client"

export type TenantActorSummary = {
  email: string
  id: string
  name: string
  role: string | null
}

export async function loadTenantActors(
  db: PrismaClient,
  input: {
    tenantId: string
    userIds: string[]
  },
) {
  const userIds = [...new Set(input.userIds.filter(Boolean))]
  if (userIds.length === 0) return new Map<string, TenantActorSummary>()

  const users = await db.user.findMany({
    select: {
      displayName: true,
      email: true,
      id: true,
      memberships: {
        select: { role: true },
        take: 1,
        where: { tenantId: input.tenantId },
      },
      name: true,
    },
    where: {
      id: { in: userIds },
      memberships: { some: { tenantId: input.tenantId } },
    },
  })

  return new Map(
    users.map((user) => [
      user.id,
      {
        email: user.email,
        id: user.id,
        name: user.displayName?.trim() || user.name.trim() || user.email,
        role: user.memberships[0]?.role ?? null,
      },
    ]),
  )
}
