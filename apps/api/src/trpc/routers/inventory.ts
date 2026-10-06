import {
  type EwaTradeRole,
  canManageSalesOperations,
  canOperatePos,
  normalizeRole,
} from "@ewatrade/auth/roles"
import { StockOperationType } from "@ewatrade/db/enums"
import type { TenantContext } from "@ewatrade/db/queries"
import { FinanceError } from "@ewatrade/db/queries"
import {
  CatalogError,
  commitCatalogStockReservation,
  correctStockOperation,
  createAndDispatchStockTransfer,
  createInventoryCloseout,
  createStockCount,
  exportInventoryAuditRows,
  finalizeInventoryCloseout,
  finalizeStockCount,
  getCatalogOfferingAvailability,
  getInventoryReconciliationSummary,
  getStockOperationAudit,
  listInventoryBalanceReport,
  listInventoryOperationHistory,
  listStockOperationCategoryNames,
  listStockTransfers,
  moveInventoryCustody,
  postSingleBalanceStockOperation,
  receiveOrCancelStockTransfer,
  releaseCatalogStockReservation,
  reserveCatalogOfferingStock,
  transformPackagedStock,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"

import {
  inventoryAuditExportSchema,
  inventoryBalanceReportSchema,
  inventoryCategorySuggestionsSchema,
  inventoryCommitReservationSchema,
  inventoryCorrectOperationSchema,
  inventoryCreateCloseoutSchema,
  inventoryCreateStockCountSchema,
  inventoryDispatchTransferSchema,
  inventoryFinalizeCloseoutSchema,
  inventoryFinalizeStockCountSchema,
  inventoryListTransfersSchema,
  inventoryMoveCustodySchema,
  inventoryOfferingAvailabilitySchema,
  inventoryOperationAuditSchema,
  inventoryOperationHistorySchema,
  inventoryReconciliationReportSchema,
  inventoryReleaseReservationSchema,
  inventoryReserveOfferingSchema,
  inventorySingleBalanceOperationSchema,
  inventoryTransformationSchema,
  inventoryTransitionTransferSchema,
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

function assertCanManageInventory(tenant: TenantContext) {
  if (tenant.staffAccess?.mode === "SCOPED") return // Central procedure guard checks the requested Store and action.
  const normalized = inventoryRole(tenant.membership.role)
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

function inventoryError(error: CatalogError | FinanceError) {
  if (error instanceof FinanceError) {
    return new TRPCError({
      cause: error,
      code:
        error.code === "FORBIDDEN"
          ? "FORBIDDEN"
          : error.code === "NOT_FOUND"
            ? "NOT_FOUND"
            : error.code === "CONFLICT" || error.code === "CLOSED_PERIOD"
              ? "CONFLICT"
              : "BAD_REQUEST",
      message: error.message,
    })
  }
  if (
    error.code === "CATALOG_ITEM_NOT_FOUND" ||
    error.code === "CATALOG_OFFERING_NOT_FOUND" ||
    error.code === "RESERVATION_NOT_FOUND" ||
    error.code === "STOCK_COUNT_NOT_FOUND" ||
    error.code === "STORE_NOT_FOUND"
  ) {
    return new TRPCError({
      cause: error,
      code: "NOT_FOUND",
      message: error.message,
    })
  }
  if (
    error.code === "IDEMPOTENCY_MISMATCH" ||
    error.code === "INSUFFICIENT_STOCK" ||
    error.code === "OFFERING_UNAVAILABLE" ||
    error.code === "REVISION_CONFLICT" ||
    error.code === "STALE_CONFIGURATION"
  ) {
    return new TRPCError({
      cause: error,
      code: "CONFLICT",
      message: error.message,
    })
  }
  return new TRPCError({
    cause: error,
    code: "BAD_REQUEST",
    message: error.message,
  })
}

export const inventoryRouter = createTRPCRouter({
  categorySuggestions: protectedProcedure
    .input(inventoryCategorySuggestionsSchema)
    .query(({ ctx, input }) => {
      assertCanManageInventory(ctx.tenantContext)
      return listStockOperationCategoryNames(ctx.db, {
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  transfers: protectedProcedure
    .input(inventoryListTransfersSchema)
    .query(({ ctx, input }) => {
      assertCanManageInventory(ctx.tenantContext)
      return listStockTransfers(ctx.db, {
        ...input,
        allowedStoreIds:
          ctx.tenantContext.staffAccess?.mode === "SCOPED"
            ? ctx.tenantContext.stores.map((store) => store.id)
            : undefined,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  auditExport: protectedProcedure
    .input(inventoryAuditExportSchema)
    .query(async ({ ctx, input }) => {
      assertCanManageInventory(ctx.tenantContext)
      return exportInventoryAuditRows(ctx.db, {
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  balanceReport: protectedProcedure
    .input(inventoryBalanceReportSchema)
    .query(async ({ ctx, input }) => {
      assertCanManageInventory(ctx.tenantContext)
      return listInventoryBalanceReport(ctx.db, {
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  operationAudit: protectedProcedure
    .input(inventoryOperationAuditSchema)
    .query(async ({ ctx, input }) => {
      assertCanManageInventory(ctx.tenantContext)
      return getStockOperationAudit(ctx.db, {
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  operationHistory: protectedProcedure
    .input(inventoryOperationHistorySchema)
    .query(async ({ ctx, input }) => {
      assertCanManageInventory(ctx.tenantContext)
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
      assertCanManageInventory(ctx.tenantContext)
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
        if (error instanceof CatalogError || error instanceof FinanceError)
          throw inventoryError(error)
        throw error
      }
    }),

  correctOperation: protectedProcedure
    .input(inventoryCorrectOperationSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageInventory(ctx.tenantContext)
      try {
        return await correctStockOperation(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError || error instanceof FinanceError)
          throw inventoryError(error)
        throw error
      }
    }),

  createCloseout: protectedProcedure
    .input(inventoryCreateCloseoutSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageInventory(ctx.tenantContext)
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
        if (error instanceof CatalogError || error instanceof FinanceError)
          throw inventoryError(error)
        throw error
      }
    }),

  createStockCount: protectedProcedure
    .input(inventoryCreateStockCountSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageInventory(ctx.tenantContext)
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
        if (error instanceof CatalogError || error instanceof FinanceError)
          throw inventoryError(error)
        throw error
      }
    }),

  dispatchTransfer: protectedProcedure
    .input(inventoryDispatchTransferSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageInventory(ctx.tenantContext)
      try {
        return await createAndDispatchStockTransfer(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError || error instanceof FinanceError)
          throw inventoryError(error)
        throw error
      }
    }),

  finalizeCloseout: protectedProcedure
    .input(inventoryFinalizeCloseoutSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageInventory(ctx.tenantContext)
      try {
        return await finalizeInventoryCloseout(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError || error instanceof FinanceError)
          throw inventoryError(error)
        throw error
      }
    }),

  finalizeStockCount: protectedProcedure
    .input(inventoryFinalizeStockCountSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageInventory(ctx.tenantContext)
      try {
        return await finalizeStockCount(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError || error instanceof FinanceError)
          throw inventoryError(error)
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
        if (error instanceof CatalogError || error instanceof FinanceError)
          throw inventoryError(error)
        throw error
      }
    }),

  moveCustody: protectedProcedure
    .input(inventoryMoveCustodySchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageInventory(ctx.tenantContext)
      try {
        return await moveInventoryCustody(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError || error instanceof FinanceError)
          throw inventoryError(error)
        throw error
      }
    }),

  postBalanceOperation: protectedProcedure
    .input(inventorySingleBalanceOperationSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageInventory(ctx.tenantContext)
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
        if (error instanceof CatalogError || error instanceof FinanceError)
          throw inventoryError(error)
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
        if (error instanceof CatalogError || error instanceof FinanceError)
          throw inventoryError(error)
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
        if (error instanceof CatalogError || error instanceof FinanceError)
          throw inventoryError(error)
        throw error
      }
    }),

  transformPackagedStock: protectedProcedure
    .input(inventoryTransformationSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageInventory(ctx.tenantContext)
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
        if (error instanceof CatalogError || error instanceof FinanceError)
          throw inventoryError(error)
        throw error
      }
    }),

  transitionTransfer: protectedProcedure
    .input(inventoryTransitionTransferSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageInventory(ctx.tenantContext)
      try {
        return await receiveOrCancelStockTransfer(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError || error instanceof FinanceError)
          throw inventoryError(error)
        throw error
      }
    }),
})
