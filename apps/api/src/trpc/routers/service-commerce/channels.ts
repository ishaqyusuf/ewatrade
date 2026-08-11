import { canManageTenant, normalizeRole } from "@ewatrade/auth/roles"
import {
  createEmbeddedSignupState,
  protectCommunicationsActionId,
  protectCommunicationsCredential,
} from "@ewatrade/communications"
import {
  CommerceQuoteError,
  CustomerChannelsError,
  ServiceCommerceQuoteReleaseError,
  approveCommerceQuoteVersion,
  assignCustomerChannelAttendant,
  completeCustomerChannelEmbeddedSignup,
  getCommerceQuoteApprovalDetail,
  getCustomerChannelEmbeddedSignupSession,
  getCustomerChannelWorkspace,
  getPublicCustomerEntryPoint,
  getServiceCommerceQuoteReleaseSettings,
  listPendingServiceCommerceQuoteApprovals,
  publishCustomerEntryPoint,
  rejectCommerceQuoteVersion,
  revokeCustomerChannelAttendant,
  revokeCustomerEntryPoint,
  saveCustomerChannelStoreBindings,
  saveCustomerWhatsAppConnectionCandidate,
  setCustomerChannelConnectionLifecycle,
  updateServiceCommerceQuoteReleaseSettings,
} from "@ewatrade/db/queries"
import {
  enqueuePrescriptionCommunicationDispatch,
  enqueueWhatsAppConnectionTest,
} from "@ewatrade/jobs"
import { TRPCError } from "@trpc/server"

import {
  customerChannelAttendantAssignSchema,
  customerChannelAttendantRevokeSchema,
  customerChannelConnectionLifecycleSchema,
  customerChannelConnectionSchema,
  customerChannelEmbeddedSignupSelectionSchema,
  customerChannelEmbeddedSignupSessionSchema,
  customerChannelEntryPointPublishSchema,
  customerChannelEntryPointRevokeSchema,
  customerChannelManualConnectionSchema,
  customerChannelPendingQuoteApprovalsSchema,
  customerChannelPublicEntryPointSchema,
  customerChannelQuoteApprovalDecisionSchema,
  customerChannelQuoteApprovalDetailSchema,
  customerChannelQuoteReleaseSettingsSchema,
  customerChannelQuoteReleaseSettingsUpdateSchema,
  customerChannelStoreBindingsSchema,
  customerChannelWorkspaceSchema,
} from "../../../schemas/customer-channels"
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "../../init"
import { resolveServiceStoreId } from "../service-permissions"

function assertCustomerChannelsManager(role: string) {
  const normalized = normalizeRole(role)
  if (!normalized || !canManageTenant(normalized)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only an Owner or Admin can manage Customer channels.",
    })
  }
}

function mapCustomerChannelsError(error: unknown): never {
  if (error instanceof CustomerChannelsError) {
    throw new TRPCError({
      code:
        error.code === "FORBIDDEN"
          ? "FORBIDDEN"
          : error.code === "NOT_FOUND"
            ? "NOT_FOUND"
            : "CONFLICT",
      message: error.message,
    })
  }
  throw error
}

function mapQuoteReleaseError(error: unknown): never {
  if (error instanceof ServiceCommerceQuoteReleaseError) {
    throw new TRPCError({
      code:
        error.code === "FORBIDDEN"
          ? "FORBIDDEN"
          : error.code === "NOT_FOUND"
            ? "NOT_FOUND"
            : error.code === "INVALID_INPUT"
              ? "BAD_REQUEST"
              : "CONFLICT",
      message: error.message,
    })
  }
  if (error instanceof CommerceQuoteError) {
    throw new TRPCError({
      code:
        error.code === "QUOTE_RELEASE_FORBIDDEN"
          ? "FORBIDDEN"
          : error.code === "QUOTE_SOURCE_NOT_FOUND" ||
              error.code === "STORE_NOT_FOUND"
            ? "NOT_FOUND"
            : "CONFLICT",
      message: error.message,
    })
  }
  throw error
}

function storeId(
  ctx: {
    tenantContext: {
      activeStore: { id: string } | null
      stores: Array<{ id: string }>
    }
  },
  requested?: string,
) {
  return resolveServiceStoreId(
    ctx.tenantContext.stores,
    ctx.tenantContext.activeStore,
    requested,
  )
}

export const serviceCommerceChannelsRouter = createTRPCRouter({
  approveQuoteVersion: protectedProcedure
    .input(customerChannelQuoteApprovalDecisionSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await approveCommerceQuoteVersion(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          protectActionId: protectCommunicationsActionId,
          storeId: storeId(ctx, input.storeId),
          tenantId: ctx.tenantContext.tenant.id,
        })
        if (result.communicationIntentId) {
          await enqueuePrescriptionCommunicationDispatch(
            result.communicationIntentId,
          )
        }
        return result
      } catch (error) {
        mapQuoteReleaseError(error)
      }
    }),

  assignChannelAttendant: protectedProcedure
    .input(customerChannelAttendantAssignSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await assignCustomerChannelAttendant(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          storeId: storeId(ctx, input.storeId),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapCustomerChannelsError(error)
      }
    }),

  channelEmbeddedSignupSession: protectedProcedure
    .input(customerChannelEmbeddedSignupSessionSchema)
    .query(({ ctx, input }) => {
      assertCustomerChannelsManager(ctx.tenantContext.membership.role)
      return getCustomerChannelEmbeddedSignupSession(ctx.db, {
        storeId: storeId(ctx, input.storeId),
        tenantId: ctx.tenantContext.tenant.id,
        userId: ctx.session.user.id,
      })
    }),

  channelEmbeddedSignupUrl: protectedProcedure
    .input(customerChannelWorkspaceSchema)
    .query(({ ctx, input }) => {
      assertCustomerChannelsManager(ctx.tenantContext.membership.role)
      const resolvedStoreId = storeId(ctx, input.storeId)
      const appId = process.env.META_APP_ID?.trim()
      const stateSecret = process.env.META_EMBEDDED_SIGNUP_STATE_SECRET?.trim()
      const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "")
      if (!appId || !stateSecret || !apiUrl) {
        return { available: false as const, url: null }
      }
      const state = createEmbeddedSignupState(
        {
          storeId: resolvedStoreId,
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

  channelWorkspace: protectedProcedure
    .input(customerChannelWorkspaceSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getCustomerChannelWorkspace(ctx.db, {
          actorUserId: ctx.session.user.id,
          storeId: storeId(ctx, input.storeId),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapCustomerChannelsError(error)
      }
    }),

  completeChannelEmbeddedSignup: protectedProcedure
    .input(customerChannelEmbeddedSignupSelectionSchema)
    .mutation(async ({ ctx, input }) => {
      assertCustomerChannelsManager(ctx.tenantContext.membership.role)
      const resolvedStoreId = storeId(ctx, input.storeId)
      const connection = await completeCustomerChannelEmbeddedSignup(ctx.db, {
        actorUserId: ctx.session.user.id,
        billingOwner: input.billingOwner,
        phoneNumberId: input.phoneNumberId,
        storeId: resolvedStoreId,
        tenantId: ctx.tenantContext.tenant.id,
        testRecipient: input.testRecipient,
      })
      await enqueueWhatsAppConnectionTest({
        connectionId: connection.connectionId,
        tenantId: ctx.tenantContext.tenant.id,
      })
      return connection
    }),

  publicCustomerEntryPoint: publicProcedure
    .input(customerChannelPublicEntryPointSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getPublicCustomerEntryPoint(ctx.db, input)
      } catch (error) {
        if (!(error instanceof CustomerChannelsError)) throw error
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This customer entry point is unavailable.",
        })
      }
    }),

  pendingQuoteApprovals: protectedProcedure
    .input(customerChannelPendingQuoteApprovalsSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await listPendingServiceCommerceQuoteApprovals(ctx.db, {
          actorUserId: ctx.session.user.id,
          storeId: storeId(ctx, input.storeId),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapQuoteReleaseError(error)
      }
    }),

  quoteApprovalDetail: protectedProcedure
    .input(customerChannelQuoteApprovalDetailSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getCommerceQuoteApprovalDetail(ctx.db, {
          actorUserId: ctx.session.user.id,
          approvalId: input.approvalId,
          storeId: storeId(ctx, input.storeId),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapQuoteReleaseError(error)
      }
    }),

  quoteReleaseSettings: protectedProcedure
    .input(customerChannelQuoteReleaseSettingsSchema)
    .query(async ({ ctx, input }) => {
      try {
        assertCustomerChannelsManager(ctx.tenantContext.membership.role)
        return await getServiceCommerceQuoteReleaseSettings(ctx.db, {
          actorUserId: ctx.session.user.id,
          storeId: storeId(ctx, input.storeId),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapQuoteReleaseError(error)
      }
    }),

  rejectQuoteVersion: protectedProcedure
    .input(customerChannelQuoteApprovalDecisionSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await rejectCommerceQuoteVersion(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          storeId: storeId(ctx, input.storeId),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapQuoteReleaseError(error)
      }
    }),

  publishCustomerEntryPoint: protectedProcedure
    .input(customerChannelEntryPointPublishSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await publishCustomerEntryPoint(ctx.db, {
          actorUserId: ctx.session.user.id,
          storeId: storeId(ctx, input.storeId),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapCustomerChannelsError(error)
      }
    }),

  retestCustomerChannelConnection: protectedProcedure
    .input(customerChannelConnectionSchema)
    .mutation(async ({ ctx, input }) => {
      assertCustomerChannelsManager(ctx.tenantContext.membership.role)
      storeId(ctx, input.storeId)
      await enqueueWhatsAppConnectionTest({
        connectionId: input.connectionId,
        tenantId: ctx.tenantContext.tenant.id,
      })
      return { queued: true }
    }),

  revokeChannelAttendant: protectedProcedure
    .input(customerChannelAttendantRevokeSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await revokeCustomerChannelAttendant(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          storeId: storeId(ctx, input.storeId),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapCustomerChannelsError(error)
      }
    }),

  revokeCustomerEntryPoint: protectedProcedure
    .input(customerChannelEntryPointRevokeSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await revokeCustomerEntryPoint(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          storeId: storeId(ctx, input.storeId),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapCustomerChannelsError(error)
      }
    }),

  saveCustomerChannelBindings: protectedProcedure
    .input(customerChannelStoreBindingsSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await saveCustomerChannelStoreBindings(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapCustomerChannelsError(error)
      }
    }),

  saveCustomerWhatsAppConnection: protectedProcedure
    .input(customerChannelManualConnectionSchema)
    .mutation(async ({ ctx, input }) => {
      assertCustomerChannelsManager(ctx.tenantContext.membership.role)
      const resolvedStoreId = storeId(ctx, input.storeId)
      const connection = await saveCustomerWhatsAppConnectionCandidate(ctx.db, {
        actorUserId: ctx.session.user.id,
        billingOwner: input.billingOwner,
        businessDisplayName: input.businessDisplayName,
        credentialReference: protectCommunicationsCredential(input.accessToken),
        displayNumber: input.displayNumber,
        phoneNumberId: input.phoneNumberId,
        storeId: resolvedStoreId,
        tenantId: ctx.tenantContext.tenant.id,
        testRecipient: input.testRecipient,
        wabaId: input.wabaId,
      })
      await enqueueWhatsAppConnectionTest({
        connectionId: connection.connectionId,
        tenantId: ctx.tenantContext.tenant.id,
      })
      return connection
    }),

  setCustomerChannelConnectionLifecycle: protectedProcedure
    .input(customerChannelConnectionLifecycleSchema)
    .mutation(async ({ ctx, input }) => {
      assertCustomerChannelsManager(ctx.tenantContext.membership.role)
      storeId(ctx, input.storeId)
      return setCustomerChannelConnectionLifecycle(ctx.db, {
        actorUserId: ctx.session.user.id,
        connectionId: input.connectionId,
        status: input.status,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  updateQuoteReleaseSettings: protectedProcedure
    .input(customerChannelQuoteReleaseSettingsUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        assertCustomerChannelsManager(ctx.tenantContext.membership.role)
        return await updateServiceCommerceQuoteReleaseSettings(ctx.db, {
          ...input,
          actorUserId: ctx.session.user.id,
          storeId: storeId(ctx, input.storeId),
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        mapQuoteReleaseError(error)
      }
    }),
})
