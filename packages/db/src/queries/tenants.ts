import { readBusinessProfileKeyFromStoreMetadata } from "@ewatrade/utils"
import type {
  MembershipRole,
  QaDataClassification,
  StoreStatus,
  TenantMode,
  TenantType,
} from "../../generated/prisma/client"
import type { RetailOpsPlanId } from "./retail-ops-subscription-plans"
import { resolveRetailOpsPlanId } from "./retail-ops-subscriptions"
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
    staffAccessMode?: "LEGACY" | "SCOPED"
    catalogEditor?: boolean
  }
  tenant: {
    id: string
    slug: string
    name: string
    type: TenantType
    enabledModes: TenantMode[]
    currencyCode: string
    dataClassification: QaDataClassification
    timezone: string
    qaPurgeStartedAt: Date | null
    /** Resolved for plan feature gates; absent only in hand-built contexts. */
    retailOpsPlanId?: RetailOpsPlanId
  }
  staffAccess?: {
    businessRole: MembershipRole
    status: string
    mode: "LEGACY" | "SCOPED"
    catalogEditor: boolean
    assignments: Array<{
      storeId: string
      role: "CASHIER" | "OPERATOR" | "MANAGER"
      status: string
    }>
  }
  stores: TenantStore[]
  activeStore: TenantStore | null
}

export async function getActiveTenantForUser(
  db: DbClient,
  input: {
    storeId?: string | null
    userId: string
    tenantSlug?: string | null
  },
): Promise<TenantContext | null> {
  const tenantSlug = input.tenantSlug?.trim() || undefined
  const storeId = input.storeId?.trim() || undefined

  const membership = await db.membership.findFirst({
    where: {
      userId: input.userId,
      status: "ACTIVE",
      tenant: { isActive: true, ...(tenantSlug ? { slug: tenantSlug } : {}) },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      tenantId: true,
      staffAccessMode: true,
      catalogEditor: true,
      staffStoreAssignments: {
        where: { status: "ACTIVE", store: { status: "ACTIVE" } },
        select: { storeId: true, role: true, status: true },
      },
      retailOpsStaffProfile: { select: { defaultStoreId: true } },
      tenant: {
        select: {
          id: true,
          slug: true,
          name: true,
          type: true,
          enabledModes: true,
          currencyCode: true,
          dataClassification: true,
          timezone: true,
          qaPurgeStartedAt: true,
          metadata: true,
          subscription: {
            select: {
              plan: { select: { key: true } },
              provider: true,
              status: true,
              billingSubscriptionId: true,
              currentPeriodEndsAt: true,
            },
          },
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

  const scoped =
    membership.staffAccessMode === "SCOPED" &&
    !["OWNER", "ADMIN"].includes(membership.role)
  const stores = membership.tenant.stores
    .filter(
      (store) =>
        !scoped ||
        (store.status === "ACTIVE" &&
          membership.staffStoreAssignments.some(
            (row) => row.storeId === store.id,
          )),
    )
    .map((store) => ({
      businessProfileKey: readBusinessProfileKeyFromStoreMetadata(
        store.metadata,
      ),
      currencyCode: store.currencyCode,
      id: store.id,
      name: store.name,
      slug: store.slug,
      status: store.status,
    }))
  const activeStore =
    (storeId
      ? stores.find(
          (store) => store.id === storeId && store.status === "ACTIVE",
        )
      : null) ??
    stores.find(
      (store) =>
        store.id === membership.retailOpsStaffProfile?.defaultStoreId &&
        store.status === "ACTIVE",
    ) ??
    stores.find((store) => store.status === "ACTIVE") ??
    stores[0] ??
    null

  if (scoped && storeId && !stores.some((store) => store.id === storeId))
    return null
  return {
    staffAccess: {
      businessRole: membership.role,
      status: "ACTIVE",
      mode: membership.staffAccessMode,
      catalogEditor: membership.catalogEditor,
      assignments: membership.staffStoreAssignments,
    },
    membership: {
      id: membership.id,
      role: scoped
        ? (membership.staffStoreAssignments.find(
            (row) => row.storeId === activeStore?.id,
          )?.role ?? membership.role)
        : membership.role,
      staffAccessMode: membership.staffAccessMode,
      catalogEditor:
        membership.catalogEditor &&
        membership.staffStoreAssignments.some((row) => row.role === "MANAGER"),
      tenantId: membership.tenantId,
    },
    tenant: {
      id: membership.tenant.id,
      slug: membership.tenant.slug,
      name: membership.tenant.name,
      type: membership.tenant.type,
      enabledModes: membership.tenant.enabledModes,
      currencyCode: membership.tenant.currencyCode,
      dataClassification: membership.tenant.dataClassification,
      timezone: membership.tenant.timezone,
      qaPurgeStartedAt: membership.tenant.qaPurgeStartedAt,
      retailOpsPlanId: resolveRetailOpsPlanId({
        metadata: membership.tenant.metadata,
        subscription: membership.tenant.subscription,
      }),
    },
    stores,
    activeStore,
  }
}

/** Current actor-owned business choices and Store access in one joined read. No cross-request cache. */
export async function listActiveWorkspaceMemberships(
  db: DbClient,
  userId: string,
) {
  const rows = await db.membership.findMany({
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
      status: true,
      tenantId: true,
      staffAccessMode: true,
      catalogEditor: true,
      retailOpsStaffProfile: { select: { defaultStoreId: true } },
      staffStoreAssignments: {
        where: { status: "ACTIVE", store: { status: "ACTIVE" } },
        select: {
          storeId: true,
          role: true,
          status: true,
          revision: true,
          tenantId: true,
          store: { select: { tenantId: true, status: true } },
        },
      },
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
  return rows.map((row) => ({
    ...row,
    staffStoreAssignments: row.staffStoreAssignments
      .filter(
        (assignment) =>
          assignment.tenantId === row.tenantId &&
          assignment.store.tenantId === row.tenantId &&
          assignment.status === "ACTIVE" &&
          assignment.store.status === "ACTIVE",
      )
      .map(({ storeId, role, status, revision }) => ({
        storeId,
        role,
        status,
        revision,
      })),
  }))
}
