import {
  type StaffAccess,
  canStaffAccessStore,
  canStaffPerform,
} from "@ewatrade/auth/store-access"
import { prisma } from "@ewatrade/db"
import { readStaffStoreAccess } from "@ewatrade/db/staff-store-access"
import {
  type BusinessOnboardingFacts,
  readBusinessOnboardingFactsFromStoreMetadata,
  resolveTenantDomain,
} from "@ewatrade/utils"
import { cookies, headers } from "next/headers"
import { cache } from "react"

export type TenantStore = {
  businessOnboarding?: BusinessOnboardingFacts | null
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
    staffAccessMode?: "LEGACY" | "SCOPED"
    catalogEditor?: boolean
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
  staffAccess?: StaffAccess
  tenants: TenantOption[]
  stores: TenantStore[]
  storeSelectionNeedsRepair?: boolean
  inventoryScope?: "all" | "store"
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

export const getActiveTenant = cache(
  async (userId: string): Promise<TenantContext | null> => {
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
                metadata: true,
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
    const fresh = await readStaffStoreAccess(
      prisma,
      membership.id,
      membership.tenantId,
    )
    if (!fresh) return null
    const staffAccess: StaffAccess = {
      businessRole: fresh.role,
      status: fresh.status,
      mode: fresh.staffAccessMode,
      catalogEditor: fresh.catalogEditor,
      assignments: fresh.staffStoreAssignments,
    }
    const scoped =
      staffAccess.mode === "SCOPED" &&
      !["OWNER", "ADMIN"].includes(staffAccess.businessRole)
    const stores = membership.tenant.stores
      .filter((store) => canStaffAccessStore(staffAccess, store.id))
      .map((store) => ({
        businessOnboarding: readBusinessOnboardingFactsFromStoreMetadata(
          store.metadata,
        ),
        currencyCode: store.currencyCode,
        id: store.id,
        name: store.name,
        slug: store.slug,
        status: store.status,
      }))
    const activeStore =
      stores.find((s) => s.id === activeStoreId) ??
      stores.find(
        (s) =>
          s.id === fresh.retailOpsStaffProfile?.defaultStoreId &&
          s.status === "ACTIVE",
      ) ??
      stores.find((s) => s.status === "ACTIVE") ??
      stores[0] ??
      null

    return {
      staffAccess,
      membership: {
        id: membership.id,
        role: scoped
          ? (staffAccess.assignments.find(
              (row) => row.storeId === activeStore?.id,
            )?.role ?? fresh.role)
          : fresh.role,
        staffAccessMode: fresh.staffAccessMode,
        catalogEditor: canStaffPerform(staffAccess, "catalog"),
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
      storeSelectionNeedsRepair: Boolean(
        scoped && activeStoreId && activeStoreId !== activeStore?.id,
      ),
      inventoryScope:
        !scoped && cookieStore.get("ewatrade.inventory_scope")?.value === "all"
          ? "all"
          : "store",
    }
  },
)
