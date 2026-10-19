import { isAssistantWhatsAppPilotTenant } from "@ewatrade/assistant/channels/policy"
import {
  whatsAppChatPageSchema,
  whatsAppConfirmLinkSchema,
  whatsAppConnectUrl,
  whatsAppLinkIdSchema,
  whatsAppScopePageSchema,
  whatsAppScopeSelectionSchema,
  whatsAppStorePageSchema,
} from "@ewatrade/assistant/channels/whatsapp"
import {
  isAssistantWhatsAppPilot,
  readAssistantWhatsAppConfig,
} from "@ewatrade/communications"
import {
  AssistantWhatsAppError,
  type WhatsAppWebActor,
  confirmAssistantWhatsAppLink,
  createAssistantWhatsAppLink,
  listAssistantWhatsAppBusinesses,
  listAssistantWhatsAppChats,
  listAssistantWhatsAppGrants,
  listAssistantWhatsAppStores,
  readAssistantWhatsAppLink,
  revokeAssistantWhatsAppGrant,
  selectAssistantWhatsAppScope,
} from "@ewatrade/db/assistant-whatsapp"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { requireBrowserIdentity } from "../../assistant/channel-principal"
import type { GeneralContext } from "../../assistant/general-context"
import {
  authenticatedProcedure,
  createTRPCRouter,
  protectedProcedure,
} from "../init"

function configuration(userId: string, tenantId?: string) {
  if (
    !isAssistantWhatsAppPilot(userId) ||
    (tenantId !== undefined && !isAssistantWhatsAppPilotTenant(tenantId))
  )
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "WhatsApp assistant is not available.",
    })
  const config = readAssistantWhatsAppConfig()
  if (!config)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "WhatsApp assistant is not available.",
    })
  return config
}

function actor(ctx: GeneralContext): WhatsAppWebActor {
  const store = ctx.tenantContext.activeStore
  if (!store)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Choose an accessible Store.",
    })
  return {
    userId: ctx.session.user.id,
    sessionId: requireBrowserIdentity(ctx.session).session.id,
    tenantId: ctx.tenantContext.tenant.id,
    membershipId: ctx.tenantContext.membership.id,
    storeId: store.id,
  }
}

async function result<T>(operation: () => Promise<T>) {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof AssistantWhatsAppError)
      throw new TRPCError({
        code:
          error.code === "RATE_LIMITED"
            ? "TOO_MANY_REQUESTS"
            : error.code === "UNAUTHORIZED"
              ? "UNAUTHORIZED"
              : error.code === "CONFLICT"
                ? "CONFLICT"
                : "NOT_FOUND",
        message: error.message,
      })
    throw error
  }
}

/** Personal linking controls. No model tool can issue or confirm a link. */
export const assistantChannelsRouter = createTRPCRouter({
  whatsAppBusinesses: authenticatedProcedure
    .input(whatsAppScopePageSchema)
    .query(({ ctx, input }) =>
      result(async () => {
        const config = configuration(ctx.session.user.id)
        return listAssistantWhatsAppBusinesses(
          ctx.db,
          { userId: ctx.session.user.id, sessionId: ctx.session.session.id },
          config.phoneNumberId,
          input,
        )
      }),
    ),
  whatsAppStores: authenticatedProcedure
    .input(whatsAppStorePageSchema)
    .query(({ ctx, input }) =>
      result(async () => {
        const config = configuration(ctx.session.user.id)
        return listAssistantWhatsAppStores(
          ctx.db,
          { userId: ctx.session.user.id, sessionId: ctx.session.session.id },
          config.phoneNumberId,
          input,
        )
      }),
    ),
  whatsAppChats: authenticatedProcedure
    .input(whatsAppChatPageSchema)
    .query(({ ctx, input }) =>
      result(async () => {
        const config = configuration(ctx.session.user.id)
        return listAssistantWhatsAppChats(
          ctx.db,
          { userId: ctx.session.user.id, sessionId: ctx.session.session.id },
          config.phoneNumberId,
          input,
        )
      }),
    ),
  selectWhatsAppScope: authenticatedProcedure
    .input(whatsAppScopeSelectionSchema)
    .mutation(({ ctx, input }) =>
      result(async () => {
        const config = configuration(ctx.session.user.id)
        return selectAssistantWhatsAppScope(
          ctx.db,
          { userId: ctx.session.user.id, sessionId: ctx.session.session.id },
          config.phoneNumberId,
          input,
        )
      }),
    ),
  availability: protectedProcedure.query(({ ctx }) => {
    try {
      configuration(ctx.session.user.id, ctx.tenantContext.tenant.id)
      return { enabled: true }
    } catch {
      return { enabled: false }
    }
  }),
  createWhatsAppLink: protectedProcedure
    .input(z.object({}).strict())
    .mutation(({ ctx }) =>
      result(async () => {
        const config = configuration(
          ctx.session.user.id,
          ctx.tenantContext.tenant.id,
        )
        const link = await createAssistantWhatsAppLink(
          ctx.db,
          actor(ctx),
          config.phoneNumberId,
        )
        return {
          id: link.id,
          revision: link.revision,
          expiresAt: link.expiresAt,
          url: whatsAppConnectUrl(config.displayNumber, link.code),
        }
      }),
    ),
  whatsAppLink: protectedProcedure
    .input(z.object({ linkId: whatsAppLinkIdSchema }).strict())
    .query(({ ctx, input }) =>
      result(async () => {
        const config = configuration(
          ctx.session.user.id,
          ctx.tenantContext.tenant.id,
        )
        return readAssistantWhatsAppLink(
          ctx.db,
          actor(ctx),
          input.linkId,
          config.phoneNumberId,
        )
      }),
    ),
  confirmWhatsAppLink: protectedProcedure
    .input(whatsAppConfirmLinkSchema)
    .mutation(({ ctx, input }) =>
      result(async () => {
        const config = configuration(
          ctx.session.user.id,
          ctx.tenantContext.tenant.id,
        )
        return confirmAssistantWhatsAppLink(ctx.db, actor(ctx), {
          ...input,
          phoneNumberId: config.phoneNumberId,
        })
      }),
    ),
  whatsAppConnections: authenticatedProcedure
    .input(
      z.object({ cursor: whatsAppLinkIdSchema.optional() }).strict().optional(),
    )
    .query(({ ctx, input }) =>
      result(() =>
        listAssistantWhatsAppGrants(
          ctx.db,
          {
            userId: ctx.session.user.id,
            sessionId: ctx.session.session.id,
          },
          undefined,
          undefined,
          input?.cursor,
        ),
      ),
    ),
  // Revocation must remain possible after rollout/pilot/configuration is disabled.
  revokeWhatsApp: authenticatedProcedure
    .input(z.object({ grantId: whatsAppLinkIdSchema }).strict())
    .mutation(({ ctx, input }) =>
      result(() =>
        revokeAssistantWhatsAppGrant(
          ctx.db,
          { userId: ctx.session.user.id, sessionId: ctx.session.session.id },
          input.grantId,
        ),
      ),
    ),
})
