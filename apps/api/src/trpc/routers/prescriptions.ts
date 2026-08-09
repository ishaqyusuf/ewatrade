import { canManageTenant, normalizeRole } from "@ewatrade/auth/roles"
import {
  createEmbeddedSignupState,
  protectCommunicationsCredential,
} from "@ewatrade/communications"
import { protectCommunicationsActionId } from "@ewatrade/communications"
import {
  PrescriptionCommerceError,
  PrescriptionComplianceError,
  PrescriptionRequestError,
  activatePrescriptionIncidentControl,
  approvePrescriptionManualDeliveryFee,
  assertAnyPrescriptionStoreRole,
  assertPrescriptionOperationalOrBreakGlassAccess,
  assignPrescriptionStoreRole,
  attachPrescriptionRefundProviderResult,
  claimPrescriptionRefundProviderDispatch,
  completeWhatsAppEmbeddedSignupSession,
  createPrescriptionCommunicationIntent,
  createPrescriptionDeliveryAssignment,
  createPrescriptionPrivacyRequest,
  createPrescriptionQuickAction,
  createPrescriptionRefund,
  ensurePrescriptionChannel,
  getPrescriptionChannel,
  getPrescriptionNotificationContext,
  getPrescriptionOperationsReport,
  getPrescriptionPrivacyRequestResult,
  getPrescriptionQueueContext,
  getPrescriptionRequest,
  getPrescriptionRetentionPolicy,
  getPrescriptionStoreSetup,
  getWhatsAppEmbeddedSignupSession,
  handoffPrescriptionPickup,
  issuePrescriptionQuote,
  listPrescriptionComplianceEvents,
  listPrescriptionDeliveryQueue,
  listPrescriptionDeliveryZones,
  listPrescriptionManualDeliveryReviews,
  listPrescriptionPickupQueue,
  listPrescriptionRequests,
  listPrescriptionSelectableOfferings,
  listWhatsAppConnections,
  markPrescriptionDeliveryReady,
  markPrescriptionMediaReadyForTranscription,
  markPrescriptionPickupReady,
  reconcilePrescriptionUsageEvents,
  recordPrescriptionMediaAccess,
  recordPrescriptionPharmacistReview,
  recordPrescriptionPickupException,
  requestClearerPrescriptionMedia,
  resolvePrescriptionIncidentControl,
  resolvePrescriptionRefundReconciliationMiss,
  revokePrescriptionStoreRole,
  setPrescriptionStoreActivation,
  setWhatsAppConnectionLifecycle,
  startManualPrescriptionTranscription,
  submitPrescriptionForPharmacistReview,
  submitStaffPrescriptionRequest,
  suspendWhatsAppStoreBinding,
  transitionPrescriptionDelivery,
  updatePrescriptionStoreSettings,
  upsertManualWhatsAppConnection,
  upsertPrescriptionDeliveryZone,
  upsertPrescriptionRetentionPolicy,
  verifyPrescriptionPrivacyRequest,
  verifyPrescriptionTranscriptionLine,
} from "@ewatrade/db/queries"
import {
  enqueuePrescriptionCommunicationDispatch,
  enqueuePrescriptionMediaSafety,
  enqueuePrescriptionPrivacyRequest,
  enqueuePrescriptionTranscription,
  enqueueWhatsAppConnectionTest,
} from "@ewatrade/jobs"
import { getConfiguredHostedPaymentProvider } from "@ewatrade/payments"
import { getConfiguredPrivateMediaProvider } from "@ewatrade/prescriptions"
import { TRPCError } from "@trpc/server"

import { storePrescriptionMediaUpload } from "../../domains/prescription-media"
import {
  prescriptionActivationSchema,
  prescriptionClearerMediaSchema,
  prescriptionDeliveryAssignmentSchema,
  prescriptionDeliveryReadySchema,
  prescriptionDeliveryTransitionSchema,
  prescriptionDeliveryZoneSchema,
  prescriptionDetailSchema,
  prescriptionIncidentIdSchema,
  prescriptionIncidentSchema,
  prescriptionLineVerificationSchema,
  prescriptionManualDeliveryFeeSchema,
  prescriptionMediaAccessSchema,
  prescriptionMediaReadySchema,
  prescriptionMediaUploadSchema,
  prescriptionPharmacistReviewSchema,
  prescriptionPickupExceptionSchema,
  prescriptionPickupHandoffSchema,
  prescriptionPickupReadySchema,
  prescriptionPrivacyRequestIdSchema,
  prescriptionPrivacyRequestSchema,
  prescriptionQueueSchema,
  prescriptionQuoteIssueSchema,
  prescriptionRefundSchema,
  prescriptionReportSchema,
  prescriptionRetentionPolicySchema,
  prescriptionRoleAssignmentSchema,
  prescriptionRoleRevokeSchema,
  prescriptionSelectableOfferingsSchema,
  prescriptionStaffIntakeSchema,
  prescriptionStoreSettingsUpdateSchema,
  prescriptionStoreSetupSchema,
  whatsappConnectionIdSchema,
  whatsappConnectionLifecycleSchema,
  whatsappEmbeddedSignupSelectionSchema,
  whatsappEmbeddedSignupSessionSchema,
  whatsappManualConnectionSchema,
} from "../../schemas/prescriptions"
import { createTRPCRouter, protectedProcedure } from "../init"

function assertPrescriptionSetupManager(role: string) {
  const normalizedRole = normalizeRole(role)
  if (!normalizedRole || !canManageTenant(normalizedRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only an Owner or Admin can configure Prescription Commerce.",
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
      message: "Create a Store before configuring Prescription Commerce.",
    })
  }
  return storeId
}

function prescriptionError(error: PrescriptionCommerceError) {
  if (
    error.code === "STORE_NOT_FOUND" ||
    error.code === "PRESCRIPTION_ROLE_NOT_FOUND" ||
    error.code === "PRESCRIPTION_USER_NOT_FOUND"
  ) {
    return new TRPCError({ code: "NOT_FOUND", message: error.message })
  }
  if (error.code === "PRESCRIPTION_NOT_READY") {
    return new TRPCError({ code: "CONFLICT", message: error.message })
  }
  if (error.code === "PRESCRIPTION_ROLE_REQUIRED") {
    return new TRPCError({ code: "FORBIDDEN", message: error.message })
  }
  return new TRPCError({ code: "BAD_REQUEST", message: error.message })
}

async function run<T>(action: () => Promise<T>) {
  try {
    return await action()
  } catch (error) {
    if (error instanceof PrescriptionComplianceError) {
      throw new TRPCError({
        code: error.message.includes("active, personal break-glass")
          ? "FORBIDDEN"
          : "BAD_REQUEST",
        message: error.message,
      })
    }
    if (error instanceof PrescriptionCommerceError) {
      throw prescriptionError(error)
    }
    if (error instanceof PrescriptionRequestError) {
      if (error.code === "REQUEST_NOT_FOUND") {
        throw new TRPCError({ code: "NOT_FOUND", message: error.message })
      }
      if (
        error.code === "IDEMPOTENCY_MISMATCH" ||
        error.code === "MEDIA_CONFLICT" ||
        error.code === "MEDIA_NOT_READY" ||
        error.code === "REQUEST_CONFLICT" ||
        error.code === "TRANSCRIPT_NOT_READY"
      ) {
        throw new TRPCError({ code: "CONFLICT", message: error.message })
      }
      throw new TRPCError({ code: "BAD_REQUEST", message: error.message })
    }
    throw error
  }
}

export const prescriptionsRouter = createTRPCRouter({
  queueContext: protectedProcedure
    .input(prescriptionStoreSetupSchema)
    .query(async ({ ctx, input }) => {
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      await run(() =>
        assertPrescriptionOperationalOrBreakGlassAccess(ctx.db, {
          actorUserId: ctx.session.user.id,
          reason: "emergency_queue_context",
          storeId,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
      return getPrescriptionQueueContext(ctx.db, {
        actorUserId: ctx.session.user.id,
        storeId,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  report: protectedProcedure
    .input(prescriptionReportSchema)
    .query(({ ctx, input }) => {
      assertPrescriptionSetupManager(ctx.tenantContext.membership.role)
      const storeId = input.storeId
        ? resolveStoreId(
            ctx.tenantContext.stores,
            ctx.tenantContext.activeStore,
            input.storeId,
          )
        : null
      return getPrescriptionOperationsReport(ctx.db, {
        ...input,
        storeId,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  reconcileUsage: protectedProcedure
    .input(prescriptionStoreSetupSchema)
    .query(({ ctx, input }) => {
      assertPrescriptionSetupManager(ctx.tenantContext.membership.role)
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      return reconcilePrescriptionUsageEvents(ctx.db, {
        storeId,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  retentionPolicy: protectedProcedure
    .input(prescriptionStoreSetupSchema)
    .query(({ ctx, input }) => {
      assertPrescriptionSetupManager(ctx.tenantContext.membership.role)
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      return getPrescriptionRetentionPolicy(ctx.db, {
        storeId,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  updateRetentionPolicy: protectedProcedure
    .input(prescriptionRetentionPolicySchema)
    .mutation(({ ctx, input }) => {
      assertPrescriptionSetupManager(ctx.tenantContext.membership.role)
      return upsertPrescriptionRetentionPolicy(ctx.db, {
        actorUserId: ctx.session.user.id,
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  complianceEvents: protectedProcedure
    .input(prescriptionStoreSetupSchema)
    .query(({ ctx, input }) => {
      assertPrescriptionSetupManager(ctx.tenantContext.membership.role)
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      return listPrescriptionComplianceEvents(ctx.db, {
        storeId,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  createPrivacyRequest: protectedProcedure
    .input(prescriptionPrivacyRequestSchema)
    .mutation(({ ctx, input }) => {
      assertPrescriptionSetupManager(ctx.tenantContext.membership.role)
      return createPrescriptionPrivacyRequest(ctx.db, {
        actorUserId: ctx.session.user.id,
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  verifyPrivacyRequest: protectedProcedure
    .input(prescriptionPrivacyRequestIdSchema)
    .mutation(async ({ ctx, input }) => {
      assertPrescriptionSetupManager(ctx.tenantContext.membership.role)
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      const request = await verifyPrescriptionPrivacyRequest(ctx.db, {
        actorUserId: ctx.session.user.id,
        privacyRequestId: input.privacyRequestId,
        storeId,
        tenantId: ctx.tenantContext.tenant.id,
      })
      await enqueuePrescriptionPrivacyRequest({
        actorUserId: ctx.session.user.id,
        privacyRequestId: request.id,
      })
      return { queued: true }
    }),

  privacyRequestResult: protectedProcedure
    .input(prescriptionPrivacyRequestIdSchema)
    .query(({ ctx, input }) => {
      assertPrescriptionSetupManager(ctx.tenantContext.membership.role)
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      return getPrescriptionPrivacyRequestResult(ctx.db, {
        privacyRequestId: input.privacyRequestId,
        storeId,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  activateIncident: protectedProcedure
    .input(prescriptionIncidentSchema)
    .mutation(({ ctx, input }) => {
      assertPrescriptionSetupManager(ctx.tenantContext.membership.role)
      return activatePrescriptionIncidentControl(ctx.db, {
        actorUserId: ctx.session.user.id,
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  resolveIncident: protectedProcedure
    .input(prescriptionIncidentIdSchema)
    .mutation(({ ctx, input }) => {
      assertPrescriptionSetupManager(ctx.tenantContext.membership.role)
      return resolvePrescriptionIncidentControl(ctx.db, {
        actorUserId: ctx.session.user.id,
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),
  channelInfo: protectedProcedure
    .input(prescriptionStoreSetupSchema)
    .query(({ ctx, input }) => {
      assertPrescriptionSetupManager(ctx.tenantContext.membership.role)
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      return getPrescriptionChannel(ctx.db, {
        storeId,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),
  whatsappConnections: protectedProcedure.query(({ ctx }) => {
    assertPrescriptionSetupManager(ctx.tenantContext.membership.role)
    return listWhatsAppConnections(ctx.db, {
      tenantId: ctx.tenantContext.tenant.id,
    })
  }),

  connectWhatsAppManually: protectedProcedure
    .input(whatsappManualConnectionSchema)
    .mutation(async ({ ctx, input }) => {
      assertPrescriptionSetupManager(ctx.tenantContext.membership.role)
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      const connection = await upsertManualWhatsAppConnection(ctx.db, {
        actorUserId: ctx.session.user.id,
        billingOwner: input.billingOwner,
        businessDisplayName: input.businessDisplayName,
        credentialReference: protectCommunicationsCredential(input.accessToken),
        displayNumber: input.displayNumber,
        phoneNumberId: input.phoneNumberId,
        storeId,
        testRecipient: input.testRecipient,
        tenantId: ctx.tenantContext.tenant.id,
        wabaId: input.wabaId,
      })
      await enqueueWhatsAppConnectionTest({
        connectionId: connection.connectionId,
        tenantId: ctx.tenantContext.tenant.id,
      })
      return connection
    }),

  retestWhatsAppConnection: protectedProcedure
    .input(whatsappConnectionIdSchema)
    .mutation(async ({ ctx, input }) => {
      assertPrescriptionSetupManager(ctx.tenantContext.membership.role)
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      await enqueueWhatsAppConnectionTest({
        connectionId: input.connectionId,
        tenantId: ctx.tenantContext.tenant.id,
      })
      return { queued: true }
    }),

  updateWhatsAppConnectionLifecycle: protectedProcedure
    .input(whatsappConnectionLifecycleSchema)
    .mutation(({ ctx, input }) => {
      assertPrescriptionSetupManager(ctx.tenantContext.membership.role)
      resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      return setWhatsAppConnectionLifecycle(ctx.db, {
        actorUserId: ctx.session.user.id,
        connectionId: input.connectionId,
        status: input.status,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  suspendWhatsAppStoreBinding: protectedProcedure
    .input(whatsappConnectionIdSchema)
    .mutation(({ ctx, input }) => {
      assertPrescriptionSetupManager(ctx.tenantContext.membership.role)
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      return suspendWhatsAppStoreBinding(ctx.db, {
        actorUserId: ctx.session.user.id,
        connectionId: input.connectionId,
        storeId,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  whatsappEmbeddedSignupUrl: protectedProcedure
    .input(prescriptionStoreSetupSchema)
    .query(({ ctx, input }) => {
      assertPrescriptionSetupManager(ctx.tenantContext.membership.role)
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      const appId = process.env.META_APP_ID?.trim()
      const stateSecret = process.env.META_EMBEDDED_SIGNUP_STATE_SECRET?.trim()
      const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "")
      if (!appId || !stateSecret || !apiUrl) {
        return { available: false as const, url: null }
      }
      const state = createEmbeddedSignupState(
        {
          storeId,
          tenantId: ctx.tenantContext.tenant.id,
          userId: ctx.session.user.id,
        },
        stateSecret,
      )
      const callback = `${apiUrl}/api/communications/whatsapp/embedded-signup/callback`
      const url = new URL("https://www.facebook.com/v21.0/dialog/oauth")
      url.searchParams.set("client_id", appId)
      url.searchParams.set("redirect_uri", callback)
      url.searchParams.set("response_type", "code")
      url.searchParams.set(
        "scope",
        "whatsapp_business_management,whatsapp_business_messaging",
      )
      url.searchParams.set("state", state)
      return { available: true as const, url: url.toString() }
    }),

  whatsappEmbeddedSignupSession: protectedProcedure
    .input(whatsappEmbeddedSignupSessionSchema)
    .query(({ ctx, input }) => {
      assertPrescriptionSetupManager(ctx.tenantContext.membership.role)
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      return getWhatsAppEmbeddedSignupSession(ctx.db, {
        publicToken: input.publicToken,
        storeId,
        tenantId: ctx.tenantContext.tenant.id,
        userId: ctx.session.user.id,
      })
    }),

  selectWhatsAppEmbeddedSignupNumber: protectedProcedure
    .input(whatsappEmbeddedSignupSelectionSchema)
    .mutation(async ({ ctx, input }) => {
      assertPrescriptionSetupManager(ctx.tenantContext.membership.role)
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      const connection = await completeWhatsAppEmbeddedSignupSession(ctx.db, {
        actorUserId: ctx.session.user.id,
        billingOwner: input.billingOwner,
        phoneNumberId: input.phoneNumberId,
        publicToken: input.publicToken,
        storeId,
        testRecipient: input.testRecipient,
        tenantId: ctx.tenantContext.tenant.id,
      })
      await enqueueWhatsAppConnectionTest({
        connectionId: connection.connectionId,
        tenantId: ctx.tenantContext.tenant.id,
      })
      return connection
    }),
  deliveryZones: protectedProcedure
    .input(prescriptionStoreSetupSchema)
    .query(({ ctx, input }) => {
      assertPrescriptionSetupManager(ctx.tenantContext.membership.role)
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      return listPrescriptionDeliveryZones(ctx.db, {
        storeId,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  manualDeliveryReviews: protectedProcedure
    .input(prescriptionStoreSetupSchema)
    .query(({ ctx, input }) => {
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      return listPrescriptionManualDeliveryReviews(ctx.db, {
        storeId,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  approveManualDeliveryFee: protectedProcedure
    .input(prescriptionManualDeliveryFeeSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await approvePrescriptionManualDeliveryFee(ctx.db, {
        actorUserId: ctx.session.user.id,
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      })
      if (result.acceptanceToken && result.customerPhone && result.requestId) {
        const action = await createPrescriptionQuickAction(ctx.db, {
          action: "delivery",
          entityId: result.versionId,
          entityType: "quote_version",
          expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
          storeId: input.storeId,
          tenantId: ctx.tenantContext.tenant.id,
        })
        const intent = await createPrescriptionCommunicationIntent(ctx.db, {
          deduplicationKey: `manual-delivery-approved:${result.versionId}`,
          payload: {
            actions: [
              {
                protectedId: protectCommunicationsActionId(action.actionId),
                title: "Review delivery",
              },
            ],
          },
          recipientReference: result.customerPhone,
          requestId: result.requestId,
          storeId: input.storeId,
          tenantId: ctx.tenantContext.tenant.id,
          type: "quote_ready",
        })
        await enqueuePrescriptionCommunicationDispatch(intent.id)
      }
      return { versionId: result.versionId }
    }),

  upsertDeliveryZone: protectedProcedure
    .input(prescriptionDeliveryZoneSchema)
    .mutation(({ ctx, input }) => {
      assertPrescriptionSetupManager(ctx.tenantContext.membership.role)
      return upsertPrescriptionDeliveryZone(ctx.db, {
        actorUserId: ctx.session.user.id,
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  pickupQueue: protectedProcedure
    .input(prescriptionStoreSetupSchema)
    .query(({ ctx, input }) => {
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      return listPrescriptionPickupQueue(ctx.db, {
        storeId,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  deliveryQueue: protectedProcedure
    .input(prescriptionStoreSetupSchema)
    .query(({ ctx, input }) => {
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      return listPrescriptionDeliveryQueue(ctx.db, {
        storeId,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  markPickupReady: protectedProcedure
    .input(prescriptionPickupReadySchema)
    .mutation(async ({ ctx, input }) => {
      const result = await markPrescriptionPickupReady(ctx.db, {
        actorUserId: ctx.session.user.id,
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      })
      if (result.communicationIntentId) {
        await enqueuePrescriptionCommunicationDispatch(
          result.communicationIntentId,
        )
      }
      return {
        expiresAt: result.expiresAt,
        pickupCode: result.pickupCode,
      }
    }),

  handoffPickup: protectedProcedure
    .input(prescriptionPickupHandoffSchema)
    .mutation(({ ctx, input }) =>
      handoffPrescriptionPickup(ctx.db, {
        actorUserId: ctx.session.user.id,
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      }),
    ),

  recordPickupException: protectedProcedure
    .input(prescriptionPickupExceptionSchema)
    .mutation(({ ctx, input }) =>
      recordPrescriptionPickupException(ctx.db, {
        actorUserId: ctx.session.user.id,
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      }),
    ),

  assignDelivery: protectedProcedure
    .input(prescriptionDeliveryAssignmentSchema)
    .mutation(({ ctx, input }) =>
      createPrescriptionDeliveryAssignment(ctx.db, {
        actorUserId: ctx.session.user.id,
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      }),
    ),

  markDeliveryReady: protectedProcedure
    .input(prescriptionDeliveryReadySchema)
    .mutation(async ({ ctx, input }) => {
      const result = await markPrescriptionDeliveryReady(ctx.db, {
        actorUserId: ctx.session.user.id,
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      })
      if (result.communicationIntentId) {
        await enqueuePrescriptionCommunicationDispatch(
          result.communicationIntentId,
        )
      }
      return result.assignment
    }),

  transitionDelivery: protectedProcedure
    .input(prescriptionDeliveryTransitionSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await transitionPrescriptionDelivery(ctx.db, {
        actorUserId: ctx.session.user.id,
        ...input,
        tenantId: ctx.tenantContext.tenant.id,
      })
      if (result.communicationIntentId) {
        await enqueuePrescriptionCommunicationDispatch(
          result.communicationIntentId,
        )
      }
      return result.assignment
    }),
  refund: protectedProcedure
    .input(prescriptionRefundSchema)
    .mutation(async ({ ctx, input }) => {
      assertPrescriptionSetupManager(ctx.tenantContext.membership.role)
      const refundCommand = await run(() =>
        createPrescriptionRefund(ctx.db, {
          actorUserId: ctx.session.user.id,
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
      const dispatch = await run(() =>
        claimPrescriptionRefundProviderDispatch(ctx.db, {
          refundId: refundCommand.refund.id,
          storeId: input.storeId,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
      const { refund } = dispatch
      if (dispatch.action === "complete") return refund
      if (dispatch.action === "review") {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "This refund needs manual provider review before another attempt.",
        })
      }
      const provider = getConfiguredHostedPaymentProvider()
      const providerInput = {
        amountMinor: refund.amountMinor,
        claimedAt: refund.providerDispatchClaimedAt ?? refund.requestedAt,
        commandReference: `ewatrade-refund:${refund.id}`,
        currencyCode: refund.paymentIntent.currencyCode,
        providerReference: refund.paymentIntent.providerReference,
        reason: refund.reason,
      }
      const providerResult =
        dispatch.action === "reconcile"
          ? await provider.reconcileRefund(providerInput)
          : await provider.refund(providerInput)
      if (!providerResult) {
        return resolvePrescriptionRefundReconciliationMiss(ctx.db, {
          refundId: refund.id,
          storeId: input.storeId,
          tenantId: ctx.tenantContext.tenant.id,
        })
      }
      return attachPrescriptionRefundProviderResult(ctx.db, {
        providerRefundId: providerResult.providerRefundId,
        refundId: refund.id,
        storeId: input.storeId,
        status: providerResult.status,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),
  uploadMedia: protectedProcedure
    .input(prescriptionMediaUploadSchema)
    .mutation(async ({ ctx, input }) => {
      if (!input.storeId || input.publicToken) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Store id is required.",
        })
      }
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      await run(() =>
        assertAnyPrescriptionStoreRole(ctx.db, {
          storeId,
          tenantId: ctx.tenantContext.tenant.id,
          userId: ctx.session.user.id,
        }),
      )
      return storePrescriptionMediaUpload({
        ...input,
        scopeId: storeId,
      })
    }),

  channel: protectedProcedure
    .input(prescriptionStoreSetupSchema)
    .mutation(({ ctx, input }) => {
      assertPrescriptionSetupManager(ctx.tenantContext.membership.role)
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      return run(() =>
        ensurePrescriptionChannel(ctx.db, {
          actorUserId: ctx.session.user.id,
          storeId,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
    }),

  queue: protectedProcedure
    .input(prescriptionQueueSchema)
    .query(async ({ ctx, input }) => {
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      await run(() =>
        assertPrescriptionOperationalOrBreakGlassAccess(ctx.db, {
          actorUserId: ctx.session.user.id,
          reason: "emergency_queue_access",
          storeId,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
      return run(() =>
        listPrescriptionRequests(ctx.db, {
          ...input,
          storeId,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
    }),

  detail: protectedProcedure
    .input(prescriptionDetailSchema)
    .query(async ({ ctx, input }) => {
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      const access = await run(() =>
        assertPrescriptionOperationalOrBreakGlassAccess(ctx.db, {
          actorUserId: ctx.session.user.id,
          reason: "operational_request_workspace",
          requestId: input.requestId,
          storeId,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
      return run(() =>
        getPrescriptionRequest(ctx.db, {
          actorUserId: ctx.session.user.id,
          breakGlassControlId: access.breakGlassControlId,
          reason: "operational_request_workspace",
          requestId: input.requestId,
          storeId,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
    }),

  staffIntake: protectedProcedure
    .input(prescriptionStaffIntakeSchema)
    .mutation(({ ctx, input }) => {
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      return run(async () => {
        const result = await submitStaffPrescriptionRequest(ctx.db, {
          actorUserId: ctx.session.user.id,
          clientRequestId: input.clientRequestId,
          consentAcceptedAt: new Date(),
          consentVersion: input.consentVersion,
          customerEmail: input.customerEmail,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          fulfilmentPreference: input.fulfilmentPreference,
          manualIntakeText: input.manualIntakeText,
          media: input.media,
          source: input.source,
          storeId,
          tenantId: ctx.tenantContext.tenant.id,
        })
        if (input.manualIntakeText && result.created) {
          await startManualPrescriptionTranscription(ctx.db, {
            actorUserId: ctx.session.user.id,
            requestId: result.requestId,
            storeId,
            tenantId: ctx.tenantContext.tenant.id,
          })
        }
        if (input.media.length > 0 && result.created) {
          await enqueuePrescriptionMediaSafety(result.requestId)
        }
        return result
      })
    }),

  requestClearerMedia: protectedProcedure
    .input(prescriptionClearerMediaSchema)
    .mutation(({ ctx, input }) =>
      run(async () => {
        const recovery = await requestClearerPrescriptionMedia(ctx.db, {
          actorUserId: ctx.session.user.id,
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        })
        const recipient = await getPrescriptionNotificationContext(ctx.db, {
          requestId: input.requestId,
          storeId: input.storeId,
          tenantId: ctx.tenantContext.tenant.id,
        })
        if (recipient?.customerPhone) {
          const storefrontUrl =
            process.env.STOREFRONT_URL?.replace(/\/$/, "") ??
            "http://ewatrade-storefront.localhost"
          const intent = await createPrescriptionCommunicationIntent(ctx.db, {
            deduplicationKey: `clearer-media:${input.requestId}:${recovery.expiresAt.toISOString()}`,
            payload: {
              secureUrl: `${storefrontUrl}/prescription-reupload/${recovery.reuploadToken}`,
            },
            recipientReference: recipient.customerPhone,
            requestId: input.requestId,
            storeId: input.storeId,
            tenantId: ctx.tenantContext.tenant.id,
            type: "clarification",
          })
          await enqueuePrescriptionCommunicationDispatch(intent.id)
        }
        return recovery
      }),
    ),

  mediaAccess: protectedProcedure
    .input(prescriptionMediaAccessSchema)
    .mutation(async ({ ctx, input }) => {
      const media = await run(() =>
        recordPrescriptionMediaAccess(ctx.db, {
          actorUserId: ctx.session.user.id,
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
      const delivery =
        await getConfiguredPrivateMediaProvider().createAuthorizedDelivery({
          expiresInSeconds: 60,
          objectKey: media.objectKey,
        })
      return {
        expiresAt: delivery.expiresAt,
        mediaId: media.mediaId,
        url: delivery.url,
      }
    }),

  startTranscription: protectedProcedure
    .input(prescriptionMediaReadySchema)
    .mutation(async ({ ctx, input }) => {
      const transcription = await run(() =>
        markPrescriptionMediaReadyForTranscription(ctx.db, {
          actorUserId: ctx.session.user.id,
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
      await enqueuePrescriptionTranscription(transcription.id)
      return transcription
    }),

  verifyLine: protectedProcedure
    .input(prescriptionLineVerificationSchema)
    .mutation(({ ctx, input }) =>
      run(() =>
        verifyPrescriptionTranscriptionLine(ctx.db, {
          actorUserId: ctx.session.user.id,
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      ),
    ),

  submitForPharmacistReview: protectedProcedure
    .input(prescriptionDetailSchema)
    .mutation(({ ctx, input }) =>
      run(() =>
        submitPrescriptionForPharmacistReview(ctx.db, {
          actorUserId: ctx.session.user.id,
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      ),
    ),

  pharmacistReview: protectedProcedure
    .input(prescriptionPharmacistReviewSchema)
    .mutation(({ ctx, input }) =>
      run(() =>
        recordPrescriptionPharmacistReview(ctx.db, {
          actorUserId: ctx.session.user.id,
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      ),
    ),

  issueQuote: protectedProcedure
    .input(prescriptionQuoteIssueSchema)
    .mutation(({ ctx, input }) =>
      run(async () => {
        const quote = await issuePrescriptionQuote(ctx.db, {
          actorUserId: ctx.session.user.id,
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        })
        const recipient = await getPrescriptionNotificationContext(ctx.db, {
          requestId: input.requestId,
          storeId: input.storeId,
          tenantId: ctx.tenantContext.tenant.id,
        })
        if (recipient?.customerPhone && quote.token) {
          const expiresAt =
            input.expiresAt ?? new Date(Date.now() + 24 * 60 * 60_000)
          const actions = await Promise.all(
            (["pickup", "delivery", "ask_pharmacy"] as const).map(
              async (action) => ({
                protectedId: protectCommunicationsActionId(
                  (
                    await createPrescriptionQuickAction(ctx.db, {
                      action,
                      entityId: quote.versionId,
                      entityType: "quote_version",
                      expiresAt,
                      storeId: input.storeId,
                      tenantId: ctx.tenantContext.tenant.id,
                    })
                  ).actionId,
                ),
                title:
                  action === "pickup"
                    ? "Pick up"
                    : action === "delivery"
                      ? "Delivery"
                      : "Ask pharmacy",
              }),
            ),
          )
          const intent = await createPrescriptionCommunicationIntent(ctx.db, {
            deduplicationKey: `quote-ready:${quote.versionId}`,
            payload: { actions },
            recipientReference: recipient.customerPhone,
            requestId: recipient.id,
            storeId: input.storeId,
            tenantId: ctx.tenantContext.tenant.id,
            type: "quote_ready",
          })
          await enqueuePrescriptionCommunicationDispatch(intent.id)
        }
        return quote
      }),
    ),

  assignRole: protectedProcedure
    .input(prescriptionRoleAssignmentSchema)
    .mutation(({ ctx, input }) => {
      assertPrescriptionSetupManager(ctx.tenantContext.membership.role)
      return run(() =>
        assignPrescriptionStoreRole(ctx.db, {
          actorUserId: ctx.session.user.id,
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
    }),

  revokeRole: protectedProcedure
    .input(prescriptionRoleRevokeSchema)
    .mutation(({ ctx, input }) => {
      assertPrescriptionSetupManager(ctx.tenantContext.membership.role)
      return run(() =>
        revokePrescriptionStoreRole(ctx.db, {
          actorUserId: ctx.session.user.id,
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
    }),

  setActivation: protectedProcedure
    .input(prescriptionActivationSchema)
    .mutation(({ ctx, input }) => {
      assertPrescriptionSetupManager(ctx.tenantContext.membership.role)
      return run(() =>
        setPrescriptionStoreActivation(ctx.db, {
          actorUserId: ctx.session.user.id,
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
    }),

  setup: protectedProcedure
    .input(prescriptionStoreSetupSchema)
    .query(({ ctx, input }) => {
      assertPrescriptionSetupManager(ctx.tenantContext.membership.role)
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      return run(() =>
        getPrescriptionStoreSetup(ctx.db, {
          actorUserId: ctx.session.user.id,
          storeId,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
    }),

  selectableOfferings: protectedProcedure
    .input(prescriptionSelectableOfferingsSchema)
    .query(({ ctx, input }) => {
      const storeId = resolveStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.storeId,
      )
      return listPrescriptionSelectableOfferings(ctx.db, {
        storeId,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  updateSettings: protectedProcedure
    .input(prescriptionStoreSettingsUpdateSchema)
    .mutation(({ ctx, input }) => {
      assertPrescriptionSetupManager(ctx.tenantContext.membership.role)
      return run(() =>
        updatePrescriptionStoreSettings(ctx.db, {
          actorUserId: ctx.session.user.id,
          ...input,
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
    }),
})
