import { prisma } from "@ewatrade/db"
import { resolveTenantDomain } from "@ewatrade/utils"
import { cookies, headers } from "next/headers"

export type TenantStore = {
  id: string
  slug: string
  name: string
  status: string
  currencyCode: string
}

export type TenantOption = {
  id: string
  name: string
  role: string
  slug: string
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
  tenants: TenantOption[]
  stores: TenantStore[]
  activeStore: TenantStore | null
}

const ACTIVE_TENANT_COOKIE = "ewatrade.active_tenant_slug"
const ACTIVE_STORE_COOKIE = "ewatrade.active_store_id"
const PLATFORM_DOMAIN =
  process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ??
  process.env.PLATFORM_DOMAIN ??
  "ewatrade.com"

function getTenantSlugFromHost(host: string | null) {
  if (!host) return null

  const result = resolveTenantDomain(host, {
    platformDomain: PLATFORM_DOMAIN,
  })

  return result.kind === "tenant" ? result.tenantSlug : null
}

export async function getActiveTenant(
  userId: string,
): Promise<TenantContext | null> {
  const headersList = await headers()
  const cookieStore = await cookies()
  const hostSlug = getTenantSlugFromHost(
    headersList.get("x-forwarded-host") ?? headersList.get("host"),
  )
  const headerSlug = headersList.get("x-tenant-slug") ?? hostSlug
  const cookieSlug = cookieStore.get(ACTIVE_TENANT_COOKIE)?.value
  const requestedSlug = headerSlug ?? cookieSlug
  const activeStoreId = cookieStore.get(ACTIVE_STORE_COOKIE)?.value

  const memberships = await prisma.membership.findMany({
    where: {
      userId,
      status: "ACTIVE",
      tenant: {
        isActive: true,
      },
    },
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
  const membership =
    (requestedSlug
      ? memberships.find((item) => item.tenant.slug === requestedSlug)
      : null) ??
    (headerSlug ? null : memberships[0]) ??
    null

  if (!membership) return null

  const tenants = memberships.map((item) => ({
    id: item.tenant.id,
    name: item.tenant.name,
    role: item.role,
    slug: item.tenant.slug,
  }))
  const stores = membership.tenant.stores.map((store) => ({
    currencyCode: store.currencyCode,
    id: store.id,
    name: store.name,
    slug: store.slug,
    status: store.status,
  }))
  const activeStore =
    stores.find((s) => s.id === activeStoreId) ??
    stores.find((s) => s.status === "ACTIVE") ??
    stores[0] ??
    null

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
    tenants,
    stores,
    activeStore,
  }
}
