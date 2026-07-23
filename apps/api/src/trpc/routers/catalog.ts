import {
  type EwaTradeRole,
  canManageSalesOperations,
  canOperatePos,
  normalizeRole,
} from "@ewatrade/auth/roles"
import {
  CatalogError,
  archiveCatalogOffering,
  archiveCatalogVariant,
  createCatalogUnitDefinition,
  createCatalogItem,
  createProductUnitConfigurationDraft,
  createSimpleCatalogItem,
  getCatalogItem,
  listCatalogItems,
  listCatalogItemsPage,
  listCatalogUnitDefinitions,
  listProductUnitConfigurations,
  publishProductUnitConfiguration,
  setCatalogOfferingStoreAvailability,
  updateProductUnitConfigurationDraft,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"

import {
  catalogArchiveOfferingSchema,
  catalogArchiveVariantSchema,
  catalogCreateUnitDefinitionSchema,
  catalogCreateItemSchema,
  catalogCreateSimpleItemSchema,
  catalogGetItemSchema,
  catalogListItemsSchema,
  catalogListItemsPageSchema,
  catalogProductUnitConfigurationsSchema,
  catalogPublishUnitConfigurationSchema,
  catalogSetOfferingAvailabilitySchema,
  catalogUpdateUnitConfigurationDraftSchema,
} from "../../schemas/catalog"
import { createTRPCRouter, protectedProcedure } from "../init"

function catalogRole(role: string): EwaTradeRole {
  const normalized = normalizeRole(role)

  if (!normalized) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to use the Catalog.",
    })
  }

  return normalized
}

function assertCanReadCatalog(role: string) {
  if (!canOperatePos(catalogRole(role))) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to view the Catalog.",
    })
  }
}

function assertCanManageCatalog(role: string) {
  if (!canManageSalesOperations(catalogRole(role))) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to manage the Catalog.",
    })
  }
}

function resolveStoreId(
  stores: Array<{ id: string }>,
  activeStore: { id: string } | null,
  requestedStoreId?: string,
) {
  if (requestedStoreId) {
    const store = stores.find((candidate) => candidate.id === requestedStoreId)

    if (!store) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Store not found for this business.",
      })
    }

    return store.id
  }

  const storeId = activeStore?.id ?? stores[0]?.id

  if (!storeId) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Create a store before adding a Catalog Item.",
    })
  }

  return storeId
}

function catalogTRPCError(error: CatalogError) {
  if (
    error.code === "CATALOG_ITEM_NOT_FOUND" ||
    error.code === "CATALOG_OFFERING_NOT_FOUND" ||
    error.code === "CATALOG_VARIANT_NOT_FOUND" ||
    error.code === "STORE_NOT_FOUND"
  ) {
    return new TRPCError({ code: "NOT_FOUND", message: error.message })
  }

  if (
    error.code === "DUPLICATE_CATALOG_KEY" ||
    error.code === "IDEMPOTENCY_MISMATCH"
  ) {
    return new TRPCError({ code: "CONFLICT", message: error.message })
  }

  return new TRPCError({ code: "BAD_REQUEST", message: error.message })
}

export const catalogRouter = createTRPCRouter({
  archiveOffering: protectedProcedure
    .input(catalogArchiveOfferingSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageCatalog(ctx.tenantContext.membership.role)
      try {
        return await archiveCatalogOffering(ctx.db, {
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError) throw catalogTRPCError(error)
        throw error
      }
    }),

  archiveVariant: protectedProcedure
    .input(catalogArchiveVariantSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageCatalog(ctx.tenantContext.membership.role)
      try {
        return await archiveCatalogVariant(ctx.db, {
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError) throw catalogTRPCError(error)
        throw error
      }
    }),

  createUnitConfigurationDraft: protectedProcedure
    .input(catalogProductUnitConfigurationsSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageCatalog(ctx.tenantContext.membership.role)
      try {
        return await createProductUnitConfigurationDraft(ctx.db, {
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError) throw catalogTRPCError(error)
        throw error
      }
    }),

  createUnitDefinition: protectedProcedure
    .input(catalogCreateUnitDefinitionSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageCatalog(ctx.tenantContext.membership.role)
      try {
        return await createCatalogUnitDefinition(ctx.db, {
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError) throw catalogTRPCError(error)
        throw error
      }
    }),

  createSimpleItem: protectedProcedure
    .input(catalogCreateSimpleItemSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageCatalog(ctx.tenantContext.membership.role)
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )

      try {
        return await createSimpleCatalogItem(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          storeId,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError) {
          throw catalogTRPCError(error)
        }
        throw error
      }
    }),

  createItem: protectedProcedure
    .input(catalogCreateItemSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageCatalog(ctx.tenantContext.membership.role)
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )

      try {
        return await createCatalogItem(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          storeId,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError) {
          throw catalogTRPCError(error)
        }
        throw error
      }
    }),

  getItem: protectedProcedure
    .input(catalogGetItemSchema)
    .query(async ({ ctx, input }) => {
      assertCanReadCatalog(ctx.tenantContext.membership.role)

      const item = await getCatalogItem(ctx.db, {
        itemId: input.itemId,
        tenantId: ctx.tenantContext.tenant.id,
      })

      if (!item) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Catalog Item not found.",
        })
      }

      return item
    }),

  listItems: protectedProcedure
    .input(catalogListItemsSchema)
    .query(async ({ ctx, input }) => {
      assertCanReadCatalog(ctx.tenantContext.membership.role)

      return listCatalogItems(ctx.db, {
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  listItemsPage: protectedProcedure
    .input(catalogListItemsPageSchema)
    .query(async ({ ctx, input }) => {
      assertCanReadCatalog(ctx.tenantContext.membership.role)

      return listCatalogItemsPage(ctx.db, {
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  listUnitConfigurations: protectedProcedure
    .input(catalogProductUnitConfigurationsSchema)
    .query(async ({ ctx, input }) => {
      assertCanReadCatalog(ctx.tenantContext.membership.role)
      try {
        return await listProductUnitConfigurations(ctx.db, {
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError) throw catalogTRPCError(error)
        throw error
      }
    }),

  listUnitDefinitions: protectedProcedure.query(async ({ ctx }) => {
    assertCanReadCatalog(ctx.tenantContext.membership.role)
    return listCatalogUnitDefinitions(ctx.db, {
      tenantId: ctx.tenantContext.tenant.id,
    })
  }),

  publishUnitConfiguration: protectedProcedure
    .input(catalogPublishUnitConfigurationSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageCatalog(ctx.tenantContext.membership.role)
      try {
        return await publishProductUnitConfiguration(ctx.db, {
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError) throw catalogTRPCError(error)
        throw error
      }
    }),

  setOfferingAvailability: protectedProcedure
    .input(catalogSetOfferingAvailabilitySchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageCatalog(ctx.tenantContext.membership.role)
      try {
        return await setCatalogOfferingStoreAvailability(ctx.db, {
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError) throw catalogTRPCError(error)
        throw error
      }
    }),

  updateUnitConfigurationDraft: protectedProcedure
    .input(catalogUpdateUnitConfigurationDraftSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageCatalog(ctx.tenantContext.membership.role)
      try {
        return await updateProductUnitConfigurationDraft(ctx.db, {
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof CatalogError) throw catalogTRPCError(error)
        throw error
      }
    }),
})
