import {
  canManageSalesOperations,
  canOperatePos,
  normalizeRole,
} from "@ewatrade/auth/roles"
import {
  CatalogError,
  listOfflineConflictReviews,
  replayOfflineCommands,
  reviewOfflineConflict,
} from "@ewatrade/db/queries"
import {
  OfflineDevicePlatform,
  OfflineDeviceStatus,
} from "@ewatrade/db/enums"
import { TRPCError } from "@trpc/server"

import {
  offlineListConflictsSchema,
  offlineRegisterDeviceSchema,
  offlineReplaySchema,
  offlineReviewConflictSchema,
} from "../../schemas/offline"
import { createTRPCRouter, protectedProcedure } from "../init"

function roleCapabilities(role: string) {
  const normalized = normalizeRole(role)
  return {
    manageCatalog: Boolean(
      normalized && canManageSalesOperations(normalized),
    ),
    manageInventory: Boolean(
      normalized && canManageSalesOperations(normalized),
    ),
    operateOrders: Boolean(normalized && canOperatePos(normalized)),
    operateServices: Boolean(normalized && canOperatePos(normalized)),
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
  conflicts: protectedProcedure
    .input(offlineListConflictsSchema)
    .query(async ({ ctx, input }) => {
      assertCanUseOffline(ctx.tenantContext.membership.role)
      return listOfflineConflictReviews(ctx.db, {
        storeId: input.storeId,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  registerDevice: protectedProcedure
    .input(offlineRegisterDeviceSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanUseOffline(ctx.tenantContext.membership.role)
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
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      try {
        return await replayOfflineCommands(ctx.db, {
          actorUserId: ctx.session.user.id,
          capabilities: roleCapabilities(ctx.tenantContext.membership.role),
          commands: input.commands,
          deviceId: input.deviceId,
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
      assertCanUseOffline(ctx.tenantContext.membership.role)
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
