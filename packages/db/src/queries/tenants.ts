import type {
  MembershipRole,
  QaDataClassification,
  StoreStatus,
  TenantMode,
  TenantType,
} from "../../generated/prisma/client"
import type { RetailOpsPlanId } from "./retail-ops-subscription-plans"
import {
  projectTenantContext,
  tenantContextMembershipSelect,
} from "./tenant-context-membership"
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
    select: tenantContextMembershipSelect,
  })

  return projectTenantContext(membership, storeId)
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
