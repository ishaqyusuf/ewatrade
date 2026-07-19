import {
  type EwaTradeRole,
  canManageSalesOperations,
  canOperatePos,
  normalizeRole,
} from "@ewatrade/auth/roles"
import {
  CatalogError,
  commitCatalogStockReservation,
  correctStockOperation,
  createAndDispatchStockTransfer,
  createInventoryCloseout,
  createStockCount,
  finalizeStockCount,
  finalizeInventoryCloseout,
  getCatalogOfferingAvailability,
  postSingleBalanceStockOperation,
  moveInventoryCustody,
  receiveOrCancelStockTransfer,
  releaseCatalogStockReservation,
  reserveCatalogOfferingStock,
  transformPackagedStock,
  exportInventoryAuditRows,
  getInventoryReconciliationSummary,
  getStockOperationAudit,
  listInventoryBalanceReport,
  listInventoryOperationHistory,
  listStockTransfers,
} from "@ewatrade/db/queries"
import { StockOperationType } from "@ewatrade/db/enums"
import { TRPCError } from "@trpc/server"

import {
  inventoryCommitReservationSchema,
  inventoryCorrectOperationSchema,
  inventoryCreateCloseoutSchema,
  inventoryCreateStockCountSchema,
  inventoryFinalizeStockCountSchema,
  inventoryFinalizeCloseoutSchema,
  inventoryDispatchTransferSchema,
  inventoryMoveCustodySchema,
  inventoryListTransfersSchema,
  inventoryOfferingAvailabilitySchema,
  inventoryReleaseReservationSchema,
  inventoryReserveOfferingSchema,
  inventorySingleBalanceOperationSchema,
  inventoryTransformationSchema,
  inventoryTransitionTransferSchema,
  inventoryAuditExportSchema,
  inventoryBalanceReportSchema,
  inventoryOperationAuditSchema,
  inventoryOperationHistorySchema,
  inventoryReconciliationReportSchema,
} from "../../schemas/inventory"
import { createTRPCRouter, protectedProcedure } from "../init"

function inventoryRole(role: string): EwaTradeRole {
  const normalized = normalizeRole(role)
  if (!normalized || !canOperatePos(normalized)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to operate inventory.",
    })
  }
  return normalized
}

function assertCanManageInventory(role: string) {
  const normalized = inventoryRole(role)
  if (!canManageSalesOperations(normalized)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to manage inventory.",
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
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Store not found for this business.",
      })
    }
    return requestedStoreId
  }
  const storeId = activeStore?.id ?? stores[0]?.id
  if (!storeId) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Create a Store before operating inventory.",
    })
  }
  return storeId
}

function inventoryError(error: CatalogError) {
  if (
    error.code === "CATALOG_ITEM_NOT_FOUND" ||
    error.code === "CATALOG_OFFERING_NOT_FOUND" ||
    error.code === "RESERVATION_NOT_FOUND" ||
    error.code === "STOCK_COUNT_NOT_FOUND" ||
    error.code === "STORE_NOT_FOUND"
  ) {
    return new TRPCError({ code: "NOT_FOUND", message: error.message })
  }
  if (
    error.code === "IDEMPOTENCY_MISMATCH" ||
    error.code === "INSUFFICIENT_STOCK" ||
    error.code === "OFFERING_UNAVAILABLE" ||
    error.code === "REVISION_CONFLICT" ||
    error.code === "STALE_CONFIGURATION"
  ) {
    return new TRPCError({ code: "CONFLICT", message: error.message })
  }
  return new TRPCError({ code: "BAD_REQUEST", message: error.message })
}

export const inventoryRouter = createTRPCRouter({
  transfers: protectedProcedure
    .input(inventoryListTransfersSchema)
    .query(({ ctx, input }) => {
      assertCanManageInventory(ctx.tenantContext.membership.role)
      return listStockTransfers(ctx.db, {
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  auditExport: protectedProcedure
    .input(inventoryAuditExportSchema)
    .query(async ({ ctx, input }) => {
      assertCanManageInventory(ctx.tenantContext.membership.role)
      return exportInventoryAuditRows(ctx.db, {
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  balanceReport: protectedProcedure
    .input(inventoryBalanceReportSchema)
    .query(async ({ ctx, input }) => {
      assertCanManageInventory(ctx.tenantContext.membership.role)
      return listInventoryBalanceReport(ctx.db, {
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  operationAudit: protectedProcedure
    .input(inventoryOperationAuditSchema)
    .query(async ({ ctx, input }) => {
      assertCanManageInventory(ctx.tenantContext.membership.role)
      return getStockOperationAudit(ctx.db, {
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  operationHistory: protectedProcedure
    .input(inventoryOperationHistorySchema)
    .query(async ({ ctx, input }) => {
      assertCanManageInventory(ctx.tenantContext.membership.role)
      return listInventoryOperationHistory(ctx.db, {
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
        type: input.type
          ? StockOperationType[
              input.type.toUpperCase() as keyof typeof StockOperationType
            ]
          : undefined,
      })
    }),

  reconciliationReport: protectedProcedure
    .input(inventoryReconciliationReportSchema)
    .query(async ({ ctx, input }) => {
      assertCanManageInventory(ctx.tenantContext.membership.role)
      return getInventoryReconciliationSummary(ctx.db, {
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),
  commitReservation: protectedProcedure
    .input(inventoryCommitReservationSchema)
    .mutation(async ({ ctx, input }) => {
      inventoryRole(ctx.tenantContext.membership.role)
      try {
        return await commitCatalogStockReservation(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError) throw inventoryError(error)
        throw error
      }
    }),

  correctOperation: protectedProcedure
    .input(inventoryCorrectOperationSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageInventory(ctx.tenantContext.membership.role)
      try {
        return await correctStockOperation(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError) throw inventoryError(error)
        throw error
      }
    }),

  createCloseout: protectedProcedure
    .input(inventoryCreateCloseoutSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageInventory(ctx.tenantContext.membership.role)
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      try {
        return await createInventoryCloseout(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          storeId,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError) throw inventoryError(error)
        throw error
      }
    }),

  createStockCount: protectedProcedure
    .input(inventoryCreateStockCountSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageInventory(ctx.tenantContext.membership.role)
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      try {
        return await createStockCount(ctx.db, {
          actorUserId: ctx.session.user.id,
          clientOperationId: input.clientOperationId,
          lines: input.lines,
          reason: input.actorNote,
          schemaVersion: input.schemaVersion,
          storeId,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError) throw inventoryError(error)
        throw error
      }
    }),

  dispatchTransfer: protectedProcedure
    .input(inventoryDispatchTransferSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageInventory(ctx.tenantContext.membership.role)
      try {
        return await createAndDispatchStockTransfer(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError) throw inventoryError(error)
        throw error
      }
    }),

  finalizeCloseout: protectedProcedure
    .input(inventoryFinalizeCloseoutSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageInventory(ctx.tenantContext.membership.role)
      try {
        return await finalizeInventoryCloseout(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError) throw inventoryError(error)
        throw error
      }
    }),

  finalizeStockCount: protectedProcedure
    .input(inventoryFinalizeStockCountSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageInventory(ctx.tenantContext.membership.role)
      try {
        return await finalizeStockCount(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError) throw inventoryError(error)
        throw error
      }
    }),

  offeringAvailability: protectedProcedure
    .input(inventoryOfferingAvailabilitySchema)
    .query(async ({ ctx, input }) => {
      inventoryRole(ctx.tenantContext.membership.role)
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      try {
        return await getCatalogOfferingAvailability(ctx.db, {
          offeringId: input.offeringId,
          storeId,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError) throw inventoryError(error)
        throw error
      }
    }),

  moveCustody: protectedProcedure
    .input(inventoryMoveCustodySchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageInventory(ctx.tenantContext.membership.role)
      try {
        return await moveInventoryCustody(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError) throw inventoryError(error)
        throw error
      }
    }),

  postBalanceOperation: protectedProcedure
    .input(inventorySingleBalanceOperationSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageInventory(ctx.tenantContext.membership.role)
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      try {
        return await postSingleBalanceStockOperation(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          storeId,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError) throw inventoryError(error)
        throw error
      }
    }),

  releaseReservation: protectedProcedure
    .input(inventoryReleaseReservationSchema)
    .mutation(async ({ ctx, input }) => {
      inventoryRole(ctx.tenantContext.membership.role)
      try {
        return await releaseCatalogStockReservation(ctx.db, {
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError) throw inventoryError(error)
        throw error
      }
    }),

  reserveOffering: protectedProcedure
    .input(inventoryReserveOfferingSchema)
    .mutation(async ({ ctx, input }) => {
      inventoryRole(ctx.tenantContext.membership.role)
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      try {
        return await reserveCatalogOfferingStock(ctx.db, {
          ...input,
          storeId,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError) throw inventoryError(error)
        throw error
      }
    }),

  transformPackagedStock: protectedProcedure
    .input(inventoryTransformationSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageInventory(ctx.tenantContext.membership.role)
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      try {
        return await transformPackagedStock(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          storeId,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError) throw inventoryError(error)
        throw error
      }
    }),

  transitionTransfer: protectedProcedure
    .input(inventoryTransitionTransferSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageInventory(ctx.tenantContext.membership.role)
      try {
        return await receiveOrCancelStockTransfer(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError) throw inventoryError(error)
        throw error
      }
    }),
})
