import {
  type EwaTradeRole,
  canManageSalesOperations,
  canManageTenant,
  canOperatePos,
  normalizeRole,
} from "@ewatrade/auth/roles"
import {
  BusinessTemplateError,
  convertDryCleaningServiceRequestToOrder,
  createDryCleaningPublicServiceRequest,
  createDryCleaningServiceItem,
  createDryCleaningServiceOrder,
  createDryCleaningServiceRequestLink,
  getDryCleaningOperationalReport,
  getDryCleaningStoreSettings,
  getStoreBusinessTemplate,
  listBusinessTemplates,
  listDryCleaningServiceItems,
  listDryCleaningServiceOrders,
  listDryCleaningServiceRequestLinks,
  listDryCleaningServiceRequests,
  listUnsupportedBusinessDemand,
  resolveDryCleaningServiceRequestLink,
  resolveDryCleaningTrackingToken,
  updateDryCleaningServiceItem,
  updateDryCleaningServiceOrderStatus,
  updateDryCleaningServiceRequestStatus,
  updateDryCleaningStoreSettings,
  updateStoreBusinessTemplate,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import {
  retailOpsDryCleaningConvertServiceRequestSchema,
  retailOpsDryCleaningCreatePublicRequestSchema,
  retailOpsDryCleaningCreateRequestLinkSchema,
  retailOpsDryCleaningCreateServiceItemSchema,
  retailOpsDryCleaningCreateServiceOrderSchema,
  retailOpsDryCleaningListServiceItemsSchema,
  retailOpsDryCleaningListServiceOrdersSchema,
  retailOpsDryCleaningListServiceRequestsSchema,
  retailOpsDryCleaningPublicTokenSchema,
  retailOpsDryCleaningUpdateServiceItemSchema,
  retailOpsDryCleaningUpdateServiceOrderStatusSchema,
  retailOpsDryCleaningUpdateServiceRequestStatusSchema,
  retailOpsDryCleaningUpdateSettingsSchema,
  retailOpsStoreScopeSchema,
  retailOpsUnsupportedBusinessDemandSchema,
  retailOpsUpdateBusinessTemplateSchema,
} from "../../schemas/retail-ops"
import {
  type TRPCContext,
  createTRPCRouter,
  internalProcedure,
  protectedProcedure,
  publicProcedure,
} from "../init"

function getTemplateErrorCode(
  error: BusinessTemplateError,
): "BAD_REQUEST" | "CONFLICT" | "FORBIDDEN" | "NOT_FOUND" {
  if (error.code === "INVALID_STATUS_TRANSITION") return "BAD_REQUEST"
  if (error.code === "SERVICE_ITEM_ARCHIVED") return "CONFLICT"
  if (error.code === "TEMPLATE_CHANGE_BLOCKED") return "CONFLICT"
  if (error.code === "TEMPLATE_MISMATCH") return "FORBIDDEN"

  return "NOT_FOUND"
}

function rethrowTemplateError(error: unknown): never {
  if (error instanceof BusinessTemplateError) {
    throw new TRPCError({
      code: getTemplateErrorCode(error),
      message: error.message,
    })
  }

  throw error
}

function getRetailOpsRole(role: string): EwaTradeRole {
  const normalizedRole = normalizeRole(role)

  if (!normalizedRole) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to use Retail Ops.",
    })
  }

  return normalizedRole
}

function assertCanManageTemplate(role: string) {
  const normalizedRole = getRetailOpsRole(role)

  if (!canManageTenant(normalizedRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to manage business templates.",
    })
  }
}

function assertCanManageDryCleaningCatalog(role: string) {
  const normalizedRole = getRetailOpsRole(role)

  if (!canManageSalesOperations(normalizedRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to manage dry cleaning services.",
    })
  }
}

function assertCanOperateDryCleaningOrders(role: string) {
  const normalizedRole = getRetailOpsRole(role)

  if (!canOperatePos(normalizedRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to operate dry cleaning orders.",
    })
  }
}

function resolveStore(
  stores: Array<{
    id: string
    name: string
    slug: string
  }>,
  activeStore: {
    id: string
    name: string
    slug: string
  } | null,
  input: {
    storeId?: string
  },
) {
  if (input.storeId) {
    const store = stores.find(
      (currentStore) => currentStore.id === input.storeId,
    )

    if (!store) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Store not found for this tenant.",
      })
    }

    return store
  }

  const store = activeStore ?? stores[0] ?? null

  if (!store) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Create a store before opening Retail Ops.",
    })
  }

  return store
}

function getScopedStore(
  ctx: {
    tenantContext: NonNullable<TRPCContext["tenantContext"]>
  },
  input: {
    storeId?: string
  },
) {
  return resolveStore(
    ctx.tenantContext.stores,
    ctx.tenantContext.activeStore,
    input,
  )
}

function normalizeDryCleaningCustomer(input: {
  email?: string
  name: string
  phone?: string
}) {
  return {
    email: input.email ?? null,
    name: input.name,
    phone: input.phone ?? null,
  }
}

export const retailOpsBusinessTemplatesRouter = createTRPCRouter({
  businessTemplates: protectedProcedure.query(() => listBusinessTemplates()),

  storeBusinessTemplate: protectedProcedure
    .input(retailOpsStoreScopeSchema)
    .query(async ({ ctx, input }) => {
      const store = getScopedStore(ctx, input)

      try {
        return await getStoreBusinessTemplate(ctx.db, {
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        rethrowTemplateError(error)
      }
    }),

  updateBusinessTemplate: protectedProcedure
    .input(retailOpsUpdateBusinessTemplateSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageTemplate(ctx.tenantContext.membership.role)

      const store = getScopedStore(ctx, input)

      try {
        return await updateStoreBusinessTemplate(ctx.db, {
          actorUserId: ctx.session.user.id,
          allowOperationalDataChange: input.allowOperationalDataChange,
          nextTemplateKey: input.nextTemplateKey,
          reason: input.reason,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        rethrowTemplateError(error)
      }
    }),

  unsupportedBusinessDemand: internalProcedure
    .input(retailOpsUnsupportedBusinessDemandSchema)
    .query(({ ctx, input }) =>
      listUnsupportedBusinessDemand(ctx.db, { limit: input.limit }),
    ),

  dryCleaningServiceItems: protectedProcedure
    .input(retailOpsDryCleaningListServiceItemsSchema)
    .query(async ({ ctx, input }) => {
      const store = getScopedStore(ctx, input)

      try {
        return await listDryCleaningServiceItems(ctx.db, {
          includeArchived: input.includeArchived,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        rethrowTemplateError(error)
      }
    }),

  dryCleaningSettings: protectedProcedure
    .input(retailOpsStoreScopeSchema)
    .query(async ({ ctx, input }) => {
      const store = getScopedStore(ctx, input)

      try {
        return await getDryCleaningStoreSettings(ctx.db, {
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        rethrowTemplateError(error)
      }
    }),

  updateDryCleaningSettings: protectedProcedure
    .input(retailOpsDryCleaningUpdateSettingsSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageDryCleaningCatalog(ctx.tenantContext.membership.role)

      const store = getScopedStore(ctx, input)

      try {
        return await updateDryCleaningStoreSettings(ctx.db, {
          expressSurchargePercent: input.expressSurchargePercent,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        rethrowTemplateError(error)
      }
    }),

  createDryCleaningServiceItem: protectedProcedure
    .input(retailOpsDryCleaningCreateServiceItemSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageDryCleaningCatalog(ctx.tenantContext.membership.role)

      const store = getScopedStore(ctx, input)

      try {
        return await createDryCleaningServiceItem(ctx.db, {
          category: input.category,
          description: input.description,
          estimatedTurnaroundHours: input.estimatedTurnaroundHours,
          name: input.name,
          priceMinor: input.priceMinor,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
          variants: input.variants,
        })
      } catch (error) {
        rethrowTemplateError(error)
      }
    }),

  updateDryCleaningServiceItem: protectedProcedure
    .input(retailOpsDryCleaningUpdateServiceItemSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageDryCleaningCatalog(ctx.tenantContext.membership.role)

      const store = getScopedStore(ctx, input)

      try {
        return await updateDryCleaningServiceItem(ctx.db, {
          category: input.category,
          description: input.description,
          estimatedTurnaroundHours: input.estimatedTurnaroundHours,
          name: input.name,
          priceMinor: input.priceMinor,
          serviceItemId: input.serviceItemId,
          status: input.status,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
          variants: input.variants,
        })
      } catch (error) {
        rethrowTemplateError(error)
      }
    }),

  dryCleaningServiceOrders: protectedProcedure
    .input(retailOpsDryCleaningListServiceOrdersSchema)
    .query(async ({ ctx, input }) => {
      const store = getScopedStore(ctx, input)

      try {
        return await listDryCleaningServiceOrders(ctx.db, {
          from: input.from,
          limit: input.limit,
          status: input.status,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
          to: input.to,
        })
      } catch (error) {
        rethrowTemplateError(error)
      }
    }),

  createDryCleaningServiceOrder: protectedProcedure
    .input(retailOpsDryCleaningCreateServiceOrderSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanOperateDryCleaningOrders(ctx.tenantContext.membership.role)

      const store = getScopedStore(ctx, input)

      try {
        return await createDryCleaningServiceOrder(ctx.db, {
          actorUserId: ctx.session.user.id,
          customer: normalizeDryCleaningCustomer(input.customer),
          dueAt: input.dueAt,
          evidence: input.evidence,
          lines: input.lines,
          notes: input.notes,
          paymentStatus: input.paymentStatus,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        rethrowTemplateError(error)
      }
    }),

  updateDryCleaningServiceOrderStatus: protectedProcedure
    .input(retailOpsDryCleaningUpdateServiceOrderStatusSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanOperateDryCleaningOrders(ctx.tenantContext.membership.role)

      const store = getScopedStore(ctx, input)

      try {
        return await updateDryCleaningServiceOrderStatus(ctx.db, {
          actorUserId: ctx.session.user.id,
          evidence: input.evidence,
          note: input.note,
          notifyCustomer: input.notifyCustomer,
          orderId: input.orderId,
          status: input.status,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        rethrowTemplateError(error)
      }
    }),

  createDryCleaningServiceRequestLink: protectedProcedure
    .input(retailOpsDryCleaningCreateRequestLinkSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageDryCleaningCatalog(ctx.tenantContext.membership.role)

      const store = getScopedStore(ctx, input)

      try {
        return await createDryCleaningServiceRequestLink(ctx.db, {
          createdByUserId: ctx.session.user.id,
          label: input.label,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        rethrowTemplateError(error)
      }
    }),

  dryCleaningServiceRequestLinks: protectedProcedure
    .input(retailOpsStoreScopeSchema)
    .query(async ({ ctx, input }) => {
      const store = getScopedStore(ctx, input)

      try {
        return await listDryCleaningServiceRequestLinks(ctx.db, {
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        rethrowTemplateError(error)
      }
    }),

  dryCleaningServiceRequests: protectedProcedure
    .input(retailOpsDryCleaningListServiceRequestsSchema)
    .query(async ({ ctx, input }) => {
      const store = getScopedStore(ctx, input)

      try {
        return await listDryCleaningServiceRequests(ctx.db, {
          limit: input.limit,
          status: input.status,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        rethrowTemplateError(error)
      }
    }),

  updateDryCleaningServiceRequestStatus: protectedProcedure
    .input(retailOpsDryCleaningUpdateServiceRequestStatusSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanOperateDryCleaningOrders(ctx.tenantContext.membership.role)

      const store = getScopedStore(ctx, input)

      try {
        return await updateDryCleaningServiceRequestStatus(ctx.db, {
          requestId: input.requestId,
          status: input.status,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        rethrowTemplateError(error)
      }
    }),

  convertDryCleaningServiceRequest: protectedProcedure
    .input(retailOpsDryCleaningConvertServiceRequestSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanOperateDryCleaningOrders(ctx.tenantContext.membership.role)

      const store = getScopedStore(ctx, input)

      try {
        return await convertDryCleaningServiceRequestToOrder(ctx.db, {
          actorUserId: ctx.session.user.id,
          paymentStatus: input.paymentStatus,
          requestId: input.requestId,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        rethrowTemplateError(error)
      }
    }),

  dryCleaningOperationalReport: protectedProcedure
    .input(
      retailOpsStoreScopeSchema.extend({
        from: retailOpsDryCleaningListServiceOrdersSchema.shape.from,
        to: retailOpsDryCleaningListServiceOrdersSchema.shape.to,
      }),
    )
    .query(async ({ ctx, input }) => {
      const store = getScopedStore(ctx, input)

      try {
        return await getDryCleaningOperationalReport(ctx.db, {
          from: input.from,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
          to: input.to,
        })
      } catch (error) {
        rethrowTemplateError(error)
      }
    }),

  dryCleaningServiceRequestLink: publicProcedure
    .input(retailOpsDryCleaningPublicTokenSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await resolveDryCleaningServiceRequestLink(ctx.db, input)
      } catch (error) {
        rethrowTemplateError(error)
      }
    }),

  createDryCleaningPublicServiceRequest: publicProcedure
    .input(retailOpsDryCleaningCreatePublicRequestSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await createDryCleaningPublicServiceRequest(ctx.db, {
          customer: normalizeDryCleaningCustomer(input.customer),
          lines: input.lines,
          notes: input.notes,
          token: input.token,
        })
      } catch (error) {
        rethrowTemplateError(error)
      }
    }),

  dryCleaningTracking: publicProcedure
    .input(retailOpsDryCleaningPublicTokenSchema)
    .query(({ ctx, input }) => resolveDryCleaningTrackingToken(ctx.db, input)),
})
