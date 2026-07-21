import type {
  MembershipRole,
  StoreStatus,
  TenantMode,
  TenantType,
} from "../../generated/prisma/client"
import { readBusinessProfileKeyFromStoreMetadata } from "@ewatrade/utils"
import type { DbClient } from "./types"

export type TenantStore = {
  businessProfileKey: string | null
  id: string
  slug: string
  name: string
  status: StoreStatus
  currencyCode: string
}

export type TenantContext = {
  membership: {
    id: string
    role: MembershipRole
    tenantId: string
  }
  tenant: {
    id: string
    slug: string
    name: string
    type: TenantType
    enabledModes: TenantMode[]
    currencyCode: string
    timezone: string
  }
  stores: TenantStore[]
  activeStore: TenantStore | null
}

export async function getActiveTenantForUser(
  db: DbClient,
  input: { userId: string; tenantSlug?: string | null },
): Promise<TenantContext | null> {
  const tenantSlug = input.tenantSlug?.trim() || undefined

  const membership = await db.membership.findFirst({
    where: {
      userId: input.userId,
      status: "ACTIVE",
      ...(tenantSlug ? { tenant: { slug: tenantSlug } } : {}),
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
              metadata: true,
            },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  })

  if (!membership) return null

  const stores = membership.tenant.stores.map((store) => ({
    businessProfileKey: readBusinessProfileKeyFromStoreMetadata(store.metadata),
    currencyCode: store.currencyCode,
    id: store.id,
    name: store.name,
    slug: store.slug,
    status: store.status,
  }))
  const activeStore =
    stores.find((store) => store.status === "ACTIVE") ?? stores[0] ?? null

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
