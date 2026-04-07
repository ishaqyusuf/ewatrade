import { prisma } from "@ewatrade/db"
import { headers } from "next/headers"

export type TenantStore = {
  id: string
  slug: string
  name: string
  status: string
  currencyCode: string
}

export type TenantContext = {
  membership: {
    id: string
    role: string
    tenantId: string
  }
  tenant: {
    id: string
    slug: string
    name: string
    type: string
    enabledModes: string[]
    currencyCode: string
    timezone: string
  }
  stores: TenantStore[]
  activeStore: TenantStore | null
}

export async function getActiveTenant(
  userId: string,
): Promise<TenantContext | null> {
  const headersList = await headers()
  const slug = headersList.get("x-tenant-slug")

  // In dev (localhost), slug may be absent — find the user's first active tenant
  const whereClause = slug
    ? { userId, status: "ACTIVE" as const, tenant: { slug } }
    : { userId, status: "ACTIVE" as const }

  const membership = await prisma.membership.findFirst({
    where: whereClause,
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      tenantId: true,
      tenant: {
        select: {
          id: true,
          slug: true,
          name: true,
          type: true,
          enabledModes: true,
          currencyCode: true,
          timezone: true,
          stores: {
            where: { status: { not: "ARCHIVED" } },
            select: {
              id: true,
              slug: true,
              name: true,
              status: true,
              currencyCode: true,
            },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  })

  if (!membership) return null

  const stores = membership.tenant.stores
  const activeStore =
    stores.find((s) => s.status === "ACTIVE") ?? stores[0] ?? null

  return {
    membership: {
      id: membership.id,
      role: membership.role,
      tenantId: membership.tenantId,
    },
    tenant: {
      id: membership.tenant.id,
      slug: membership.tenant.slug,
      name: membership.tenant.name,
      type: membership.tenant.type,
      enabledModes: membership.tenant.enabledModes,
      currencyCode: membership.tenant.currencyCode,
      timezone: membership.tenant.timezone,
    },
    stores,
    activeStore,
  }
}
