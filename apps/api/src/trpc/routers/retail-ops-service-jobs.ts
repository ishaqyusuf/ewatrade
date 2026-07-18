import {
  type EwaTradeRole,
  canManageSalesOperations,
  canOperatePos,
  normalizeRole,
} from "@ewatrade/auth/roles"
import {
  RetailOpsServiceOperationsError,
  addRetailOpsServiceJobEvidence,
  assignRetailOpsServiceJob,
  convertRetailOpsServiceRequestToSale,
  createPublicRetailOpsServiceRequest,
  createRetailOpsServiceRequestLink,
  delayRetailOpsServiceJob,
  disableRetailOpsServiceRequestLink,
  getPublicRetailOpsServiceRequestLink,
  getPublicRetailOpsServiceTracking,
  getRetailOpsServiceOperationsReport,
  listRetailOpsServiceJobs,
  listRetailOpsServiceRequestLinks,
  listRetailOpsServiceRequests,
  queueRetailOpsServiceReadyNotification,
  updateRetailOpsServiceJobStatus,
  updateRetailOpsServiceRequestStatus,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import {
  retailOpsAddServiceJobEvidenceSchema,
  retailOpsAssignServiceJobSchema,
  retailOpsConvertServiceRequestSchema,
  retailOpsCreatePublicServiceRequestSchema,
  retailOpsCreateServiceRequestLinkSchema,
  retailOpsDelayServiceJobSchema,
  retailOpsPublicServiceRequestLinkSchema,
  retailOpsReportRangeSchema,
  retailOpsServiceJobIdSchema,
  retailOpsServiceJobsSchema,
  retailOpsServiceRequestLinkIdSchema,
  retailOpsServiceRequestsSchema,
  retailOpsServiceTrackingSchema,
  retailOpsStoreScopeSchema,
  retailOpsUpdateServiceJobStatusSchema,
  retailOpsUpdateServiceRequestStatusSchema,
} from "../../schemas/retail-ops"
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../init"

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

function assertCanOperateServiceJobs(role: string) {
  if (!canOperatePos(getRetailOpsRole(role))) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to operate service jobs.",
    })
  }
}

function assertCanManageServiceOperations(role: string) {
  if (!canManageSalesOperations(getRetailOpsRole(role))) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to manage service operations.",
    })
  }
}

function resolveStore(
  stores: Array<{ id: string; name: string; slug: string }>,
  activeStore: { id: string; name: string; slug: string } | null,
  input: { storeId?: string },
) {
  const store = input.storeId
    ? stores.find((candidate) => candidate.id === input.storeId)
    : (activeStore ?? stores[0])
  if (!store) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Store not found for this tenant.",
    })
  }
  return store
}

async function runServiceOperation<T>(operation: () => Promise<T>) {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof RetailOpsServiceOperationsError) {
      throw new TRPCError({
        code:
          error.code === "INVALID_STATUS_TRANSITION" ||
          error.code === "REQUEST_ALREADY_CONVERTED"
            ? "CONFLICT"
            : "NOT_FOUND",
        message: error.message,
      })
    }
    throw error
  }
}

export const retailOpsServiceJobsRouter = createTRPCRouter({
  serviceJobs: protectedProcedure
    .input(retailOpsServiceJobsSchema)
    .query(({ ctx, input }) => {
      assertCanOperateServiceJobs(ctx.tenantContext.membership.role)
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )
      return listRetailOpsServiceJobs(ctx.db, {
        limit: input.limit,
        status: input.status,
        storeId: store.id,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  updateServiceJobStatus: protectedProcedure
    .input(retailOpsUpdateServiceJobStatusSchema)
    .mutation(({ ctx, input }) => {
      assertCanOperateServiceJobs(ctx.tenantContext.membership.role)
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )
      return runServiceOperation(() =>
        updateRetailOpsServiceJobStatus(ctx.db, {
          actorUserId: ctx.session.user.id,
          jobId: input.jobId,
          note: input.note,
          status: input.status,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
    }),

  assignServiceJob: protectedProcedure
    .input(retailOpsAssignServiceJobSchema)
    .mutation(({ ctx, input }) => {
      assertCanOperateServiceJobs(ctx.tenantContext.membership.role)
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )
      return runServiceOperation(() =>
        assignRetailOpsServiceJob(ctx.db, {
          actorUserId: ctx.session.user.id,
          assignedUserId: input.assignedUserId,
          jobId: input.jobId,
          note: input.note,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
    }),

  delayServiceJob: protectedProcedure
    .input(retailOpsDelayServiceJobSchema)
    .mutation(({ ctx, input }) => {
      assertCanOperateServiceJobs(ctx.tenantContext.membership.role)
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )
      return runServiceOperation(() =>
        delayRetailOpsServiceJob(ctx.db, {
          actorUserId: ctx.session.user.id,
          dueAt: input.dueAt,
          jobId: input.jobId,
          note: input.note,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
    }),

  addServiceJobEvidence: protectedProcedure
    .input(retailOpsAddServiceJobEvidenceSchema)
    .mutation(({ ctx, input }) => {
      assertCanOperateServiceJobs(ctx.tenantContext.membership.role)
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )
      return runServiceOperation(() =>
        addRetailOpsServiceJobEvidence(ctx.db, {
          actorUserId: ctx.session.user.id,
          jobId: input.jobId,
          label: input.label,
          mediaType: input.mediaType,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
          url: input.url,
        }),
      )
    }),

  queueServiceReadyNotification: protectedProcedure
    .input(retailOpsServiceJobIdSchema)
    .mutation(({ ctx, input }) => {
      assertCanOperateServiceJobs(ctx.tenantContext.membership.role)
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )
      return runServiceOperation(() =>
        queueRetailOpsServiceReadyNotification(ctx.db, {
          jobId: input.jobId,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
    }),

  serviceRequestLinks: protectedProcedure
    .input(retailOpsStoreScopeSchema)
    .query(({ ctx, input }) => {
      assertCanManageServiceOperations(ctx.tenantContext.membership.role)
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )
      return listRetailOpsServiceRequestLinks(ctx.db, {
        storeId: store.id,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  createServiceRequestLink: protectedProcedure
    .input(retailOpsCreateServiceRequestLinkSchema)
    .mutation(({ ctx, input }) => {
      assertCanManageServiceOperations(ctx.tenantContext.membership.role)
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )
      return runServiceOperation(() =>
        createRetailOpsServiceRequestLink(ctx.db, {
          actorUserId: ctx.session.user.id,
          label: input.label,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
    }),

  disableServiceRequestLink: protectedProcedure
    .input(retailOpsServiceRequestLinkIdSchema)
    .mutation(({ ctx, input }) => {
      assertCanManageServiceOperations(ctx.tenantContext.membership.role)
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )
      return runServiceOperation(() =>
        disableRetailOpsServiceRequestLink(ctx.db, {
          linkId: input.linkId,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
    }),

  serviceRequests: protectedProcedure
    .input(retailOpsServiceRequestsSchema)
    .query(({ ctx, input }) => {
      assertCanOperateServiceJobs(ctx.tenantContext.membership.role)
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )
      return listRetailOpsServiceRequests(ctx.db, {
        limit: input.limit,
        status: input.status,
        storeId: store.id,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  updateServiceRequestStatus: protectedProcedure
    .input(retailOpsUpdateServiceRequestStatusSchema)
    .mutation(({ ctx, input }) => {
      assertCanOperateServiceJobs(ctx.tenantContext.membership.role)
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )
      return runServiceOperation(() =>
        updateRetailOpsServiceRequestStatus(ctx.db, {
          requestId: input.requestId,
          status: input.status,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
    }),

  convertServiceRequest: protectedProcedure
    .input(retailOpsConvertServiceRequestSchema)
    .mutation(({ ctx, input }) => {
      assertCanOperateServiceJobs(ctx.tenantContext.membership.role)
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )
      return runServiceOperation(() =>
        convertRetailOpsServiceRequestToSale(ctx.db, {
          actorUserId: ctx.session.user.id,
          paymentMethod: input.paymentMethod,
          requestId: input.requestId,
          serviceDueAt: input.serviceDueAt,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
    }),

  serviceOperationsReport: protectedProcedure
    .input(retailOpsReportRangeSchema)
    .query(({ ctx, input }) => {
      assertCanManageServiceOperations(ctx.tenantContext.membership.role)
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )
      return getRetailOpsServiceOperationsReport(ctx.db, {
        from: input.from,
        storeId: store.id,
        tenantId: ctx.tenantContext.tenant.id,
        to: input.to,
      })
    }),

  publicServiceTracking: publicProcedure
    .input(retailOpsServiceTrackingSchema)
    .query(({ ctx, input }) =>
      runServiceOperation(() =>
        getPublicRetailOpsServiceTracking(ctx.db, input),
      ),
    ),

  publicServiceRequestLink: publicProcedure
    .input(retailOpsPublicServiceRequestLinkSchema)
    .query(({ ctx, input }) =>
      runServiceOperation(() =>
        getPublicRetailOpsServiceRequestLink(ctx.db, input),
      ),
    ),

  createPublicServiceRequest: publicProcedure
    .input(retailOpsCreatePublicServiceRequestSchema)
    .mutation(({ ctx, input }) =>
      runServiceOperation(() =>
        createPublicRetailOpsServiceRequest(ctx.db, input),
      ),
    ),
})
