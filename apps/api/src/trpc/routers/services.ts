import {
  CatalogError,
  addServiceInternalNote,
  assignServiceJob,
  authorizeServiceJobLine,
  captureServiceEvidence,
  confirmServiceIntake,
  createAndConfirmServiceIntake,
  createServiceIntakeDraft,
  createServiceRework,
  getServiceJob,
  listServiceWorkQueue,
  listServiceAssignees,
  publishServiceEvidence,
  recordServiceException,
  rescheduleServiceJob,
  revokeServiceEvidencePublication,
  splitServiceJobLine,
  transitionServiceJobLine,
  updateServiceEvidenceUpload,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"

import {
  serviceEvidenceCaptureSchema,
  serviceEvidencePublishSchema,
  serviceEvidenceRevokeSchema,
  serviceEvidenceUploadSchema,
  serviceIntakeConfirmSchema,
  serviceIntakeCreateSchema,
  serviceJobAssignSchema,
  serviceJobExceptionSchema,
  serviceJobGetSchema,
  serviceJobLineAuthorizeSchema,
  serviceJobLineSplitSchema,
  serviceJobLineTransitionSchema,
  serviceJobNoteSchema,
  serviceJobRescheduleSchema,
  serviceJobReworkSchema,
  serviceWorkQueueSchema,
} from "../../schemas/services"
import { createTRPCRouter, protectedProcedure } from "../init"
import {
  assertServiceManager,
  assertServiceOperator,
  resolveServiceStoreId,
} from "./service-permissions"

function serviceError(error: CatalogError) {
  if (
    error.code === "SERVICE_JOB_NOT_FOUND" ||
    error.code === "SERVICE_INTAKE_NOT_FOUND"
  ) {
    return new TRPCError({ code: "NOT_FOUND", message: error.message })
  }
  if (
    error.code === "REVISION_CONFLICT" ||
    error.code === "IDEMPOTENCY_MISMATCH" ||
    error.code === "OFFERING_UNAVAILABLE" ||
    error.code === "SERVICE_ALLOCATION_CONFLICT" ||
    error.code === "SERVICE_WORK_NOT_AUTHORIZED"
  ) {
    return new TRPCError({ code: "CONFLICT", message: error.message })
  }
  return new TRPCError({ code: "BAD_REQUEST", message: error.message })
}

async function run<T>(action: () => Promise<T>) {
  try {
    return await action()
  } catch (error) {
    if (error instanceof CatalogError) throw serviceError(error)
    throw error
  }
}

export const servicesRouter = createTRPCRouter({
  assignees: protectedProcedure.query(({ ctx }) => {
    assertServiceManager(ctx.tenantContext.membership.role)
    return listServiceAssignees(ctx.db, {
      tenantId: ctx.tenantContext.tenant.id,
    })
  }),

  addNote: protectedProcedure
    .input(serviceJobNoteSchema)
    .mutation(({ ctx, input }) => {
      assertServiceOperator(ctx.tenantContext.membership.role)
      return run(() =>
        addServiceInternalNote(ctx.db, {
          actorUserId: ctx.session.user.id,
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
    }),

  assignJob: protectedProcedure
    .input(serviceJobAssignSchema)
    .mutation(({ ctx, input }) => {
      if (input.assigneeUserId === ctx.session.user.id) {
        assertServiceOperator(ctx.tenantContext.membership.role)
      } else {
        assertServiceManager(ctx.tenantContext.membership.role)
      }
      return run(() =>
        assignServiceJob(ctx.db, {
          actorUserId: ctx.session.user.id,
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
    }),

  authorizeLine: protectedProcedure
    .input(serviceJobLineAuthorizeSchema)
    .mutation(({ ctx, input }) => {
      assertServiceManager(ctx.tenantContext.membership.role)
      return run(() =>
        authorizeServiceJobLine(ctx.db, {
          actorUserId: ctx.session.user.id,
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
    }),

  captureEvidence: protectedProcedure
    .input(serviceEvidenceCaptureSchema)
    .mutation(({ ctx, input }) => {
      assertServiceOperator(ctx.tenantContext.membership.role)
      return run(() =>
        captureServiceEvidence(ctx.db, {
          actorUserId: ctx.session.user.id,
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
    }),

  confirmIntake: protectedProcedure
    .input(serviceIntakeConfirmSchema)
    .mutation(({ ctx, input }) => {
      assertServiceOperator(ctx.tenantContext.membership.role)
      return run(() =>
        confirmServiceIntake(ctx.db, {
          actorUserId: ctx.session.user.id,
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
    }),

  createAndConfirmIntake: protectedProcedure
    .input(serviceIntakeCreateSchema)
    .mutation(({ ctx, input }) => {
      assertServiceOperator(ctx.tenantContext.membership.role)
      const storeId = resolveServiceStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      return run(() =>
        createAndConfirmServiceIntake(ctx.db, {
          actorUserId: ctx.session.user.id,
          ...input,
          storeId,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
    }),

  createIntakeDraft: protectedProcedure
    .input(serviceIntakeCreateSchema)
    .mutation(({ ctx, input }) => {
      assertServiceOperator(ctx.tenantContext.membership.role)
      const storeId = resolveServiceStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      return run(() =>
        createServiceIntakeDraft(ctx.db, {
          actorUserId: ctx.session.user.id,
          ...input,
          storeId,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
    }),

  createRework: protectedProcedure
    .input(serviceJobReworkSchema)
    .mutation(({ ctx, input }) => {
      assertServiceManager(ctx.tenantContext.membership.role)
      return run(() =>
        createServiceRework(ctx.db, {
          actorUserId: ctx.session.user.id,
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
    }),

  getJob: protectedProcedure.input(serviceJobGetSchema).query(({ ctx, input }) => {
    assertServiceOperator(ctx.tenantContext.membership.role)
    return getServiceJob(ctx.db, {
      ...input,
      tenantId: ctx.tenantContext.tenant.id,
    })
  }),

  publishEvidence: protectedProcedure
    .input(serviceEvidencePublishSchema)
    .mutation(({ ctx, input }) => {
      assertServiceManager(ctx.tenantContext.membership.role)
      return run(() =>
        publishServiceEvidence(ctx.db, {
          actorUserId: ctx.session.user.id,
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
    }),

  queue: protectedProcedure.input(serviceWorkQueueSchema).query(({ ctx, input }) => {
    assertServiceOperator(ctx.tenantContext.membership.role)
    return listServiceWorkQueue(ctx.db, {
      ...input,
      tenantId: ctx.tenantContext.tenant.id,
    })
  }),

  recordException: protectedProcedure
    .input(serviceJobExceptionSchema)
    .mutation(({ ctx, input }) => {
      assertServiceOperator(ctx.tenantContext.membership.role)
      return run(() =>
        recordServiceException(ctx.db, {
          actorUserId: ctx.session.user.id,
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
    }),

  rescheduleJob: protectedProcedure
    .input(serviceJobRescheduleSchema)
    .mutation(({ ctx, input }) => {
      assertServiceManager(ctx.tenantContext.membership.role)
      return run(() =>
        rescheduleServiceJob(ctx.db, {
          actorUserId: ctx.session.user.id,
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
    }),

  revokeEvidence: protectedProcedure
    .input(serviceEvidenceRevokeSchema)
    .mutation(({ ctx, input }) => {
      assertServiceManager(ctx.tenantContext.membership.role)
      return run(() =>
        revokeServiceEvidencePublication(ctx.db, {
          actorUserId: ctx.session.user.id,
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
    }),

  splitLine: protectedProcedure
    .input(serviceJobLineSplitSchema)
    .mutation(({ ctx, input }) => {
      assertServiceManager(ctx.tenantContext.membership.role)
      return run(() =>
        splitServiceJobLine(ctx.db, {
          actorUserId: ctx.session.user.id,
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
    }),

  transitionLine: protectedProcedure
    .input(serviceJobLineTransitionSchema)
    .mutation(({ ctx, input }) => {
      assertServiceOperator(ctx.tenantContext.membership.role)
      return run(() =>
        transitionServiceJobLine(ctx.db, {
          actorUserId: ctx.session.user.id,
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
    }),

  updateEvidenceUpload: protectedProcedure
    .input(serviceEvidenceUploadSchema)
    .mutation(({ ctx, input }) => {
      assertServiceOperator(ctx.tenantContext.membership.role)
      return run(() =>
        updateServiceEvidenceUpload(ctx.db, {
          actorUserId: ctx.session.user.id,
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
    }),
})
