import { canOperatePos, normalizeRole } from "@ewatrade/auth/roles"
import { OfflineDevicePlatform, OfflineDeviceStatus } from "@ewatrade/db/enums"
import {
  CatalogError,
  getOfflineOperationsPolicy,
  listOfflineConflictReviews,
  replayOfflineCommands,
  reviewOfflineConflict,
  updateOfflineOperationsPolicy,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"

import {
  offlineListConflictsSchema,
  offlineRegisterDeviceSchema,
  offlineReplaySchema,
  offlineReviewConflictSchema,
  offlineSettingsUpdateSchema,
} from "../../schemas/offline"
import { createTRPCRouter, protectedProcedure } from "../init"

function roleCapabilities(role: string) {
  const normalized = normalizeRole(role)
  return {
    operateOrders: Boolean(normalized && canOperatePos(normalized)),
  }
}

function assertCanUseOffline(role: string) {
  const normalized = normalizeRole(role)
  if (!normalized || !canOperatePos(normalized)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to use offline operations.",
    })
  }
}

export function canManageOfflineSettings(role: string) {
  const normalized = normalizeRole(role)
  return normalized === "OWNER" || normalized === "ADMIN"
}

function assertCanManageOfflineSettings(role: string) {
  if (!canManageOfflineSettings(role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only a business owner or admin can change offline settings.",
    })
  }
}

export function canManageOfflineReviews(role: string) {
  const normalized = normalizeRole(role)
  return (
    normalized === "OWNER" || normalized === "ADMIN" || normalized === "MANAGER"
  )
}

function assertCanManageOfflineReviews(role: string) {
  if (!canManageOfflineReviews(role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only business management can review offline records.",
    })
  }
}

export function requiresOfflineApproval(
  role: string,
  approvalRequired: boolean,
) {
  if (!approvalRequired) return false
  const normalized = normalizeRole(role)
  return !(
    normalized === "OWNER" ||
    normalized === "ADMIN" ||
    normalized === "MANAGER"
  )
}

async function requireOfflineOperationsPolicy(
  db: Parameters<typeof getOfflineOperationsPolicy>[0],
  tenantId: string,
) {
  const policy = await getOfflineOperationsPolicy(db, { tenantId })
  if (!policy?.enabled) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Offline operations have been disabled by the business owner.",
    })
  }
  return policy
}

function resolveStoreId(
  stores: Array<{ id: string }>,
  activeStore: { id: string } | null,
  requestedStoreId?: string,
) {
  if (requestedStoreId) {
    if (!stores.some((store) => store.id === requestedStoreId)) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Store not found." })
    }
    return requestedStoreId
  }
  const storeId = activeStore?.id ?? stores[0]?.id
  if (!storeId) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Create a Store before using offline operations.",
    })
  }
  return storeId
}

function platform(value: "android" | "ios" | "unknown" | "web") {
  if (value === "android") return OfflineDevicePlatform.ANDROID
  if (value === "ios") return OfflineDevicePlatform.IOS
  if (value === "web") return OfflineDevicePlatform.WEB
  return OfflineDevicePlatform.UNKNOWN
}

export const offlineRouter = createTRPCRouter({
  settings: protectedProcedure.query(async ({ ctx }) => {
    assertCanUseOffline(ctx.tenantContext.membership.role)
    const policy = await getOfflineOperationsPolicy(ctx.db, {
      tenantId: ctx.tenantContext.tenant.id,
    })
    if (!policy) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Offline settings were not found for this business.",
      })
    }
    return policy
  }),

  updateSettings: protectedProcedure
    .input(offlineSettingsUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageOfflineSettings(ctx.tenantContext.membership.role)
      return updateOfflineOperationsPolicy(ctx.db, {
        approvalRequired: input.approvalRequired,
        enabled: input.enabled,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  conflicts: protectedProcedure
    .input(offlineListConflictsSchema)
    .query(async ({ ctx, input }) => {
      assertCanManageOfflineReviews(ctx.tenantContext.membership.role)
      return listOfflineConflictReviews(ctx.db, {
        storeId: input.storeId,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  registerDevice: protectedProcedure
    .input(offlineRegisterDeviceSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanUseOffline(ctx.tenantContext.membership.role)
      await requireOfflineOperationsPolicy(ctx.db, ctx.tenantContext.tenant.id)
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      const existing = await ctx.db.offlineDevice.findUnique({
        where: {
          tenantId_deviceId: {
            deviceId: input.deviceId,
            tenantId: ctx.tenantContext.tenant.id,
          },
        },
      })
      if (existing?.status === OfflineDeviceStatus.REVOKED) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This offline device has been revoked.",
        })
      }
      return ctx.db.offlineDevice.upsert({
        create: {
          appVersion: input.appVersion,
          deviceId: input.deviceId,
          deviceName: input.deviceName,
          platform: platform(input.platform),
          registeredByUserId: ctx.session.user.id,
          storeId,
          tenantId: ctx.tenantContext.tenant.id,
        },
        update: {
          appVersion: input.appVersion,
          deviceName: input.deviceName,
          lastSeenAt: new Date(),
          platform: platform(input.platform),
          storeId,
        },
        where: {
          tenantId_deviceId: {
            deviceId: input.deviceId,
            tenantId: ctx.tenantContext.tenant.id,
          },
        },
      })
    }),

  replay: protectedProcedure
    .input(offlineReplaySchema)
    .mutation(async ({ ctx, input }) => {
      assertCanUseOffline(ctx.tenantContext.membership.role)
      const policy = await getOfflineOperationsPolicy(ctx.db, {
        tenantId: ctx.tenantContext.tenant.id,
      })
      if (!policy) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Business not found.",
        })
      }
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      try {
        return await replayOfflineCommands(ctx.db, {
          acceptNewCommands: policy.enabled,
          actorUserId: ctx.session.user.id,
          capabilities: roleCapabilities(ctx.tenantContext.membership.role),
          commands: input.commands,
          deviceId: input.deviceId,
          requiresApproval: requiresOfflineApproval(
            ctx.tenantContext.membership.role,
            policy.approvalRequired,
          ),
          storeId,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message })
        }
        throw error
      }
    }),

  review: protectedProcedure
    .input(offlineReviewConflictSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageOfflineReviews(ctx.tenantContext.membership.role)
      try {
        return await reviewOfflineConflict(ctx.db, {
          actorUserId: ctx.session.user.id,
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError) {
          throw new TRPCError({ code: "NOT_FOUND", message: error.message })
        }
        throw error
      }
    }),
})
