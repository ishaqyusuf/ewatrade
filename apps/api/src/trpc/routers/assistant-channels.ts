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
  type AssistantTelegramConfig,
  DirectTelegramBotProvider,
  isAssistantTelegramEnrolled,
  isAssistantWhatsAppPilot,
  readAssistantTelegramConfig,
  readAssistantWhatsAppConfig,
} from "@ewatrade/communications"
import {
  AssistantTelegramError,
  closeExpiredAssistantTelegramClaim,
  confirmAssistantTelegramLink,
  createAssistantTelegramLink,
  listAssistantTelegramGrants,
  readAssistantTelegramLink,
  rejectAssistantTelegramLink,
  revokeAssistantTelegramGrant,
} from "@ewatrade/db/assistant-telegram"
import {
  AssistantWhatsAppError,
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
import { enqueueAssistantWhatsAppDelivery } from "@ewatrade/jobs/assistant-whatsapp"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { requireBrowserIdentity } from "../../assistant/channel-principal"
import type { GeneralContext } from "../../assistant/general-context"
import { showTelegramReconnected } from "../../assistant/telegram-connected"
import {
  closeTelegramClaim,
  showTelegramConnected,
  showTelegramDisconnected,
  telegramCopy,
} from "../../assistant/telegram-presentation"
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

function actor(ctx: GeneralContext) {
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
    if (
      error instanceof AssistantWhatsAppError ||
      error instanceof AssistantTelegramError
    )
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

const telegramId = z.string().min(1).max(128)

function telegramConfiguration(scope: { userId: string; tenantId: string }) {
  const config = readAssistantTelegramConfig()
  if (!config || !isAssistantTelegramEnrolled(config, scope))
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Telegram assistant is not available.",
    })
  return config
}

/** Chat edits are presentation only; access is already decided when they run. */
const telegramChat = (config: AssistantTelegramConfig) =>
  new DirectTelegramBotProvider(config)

const linkDecisionSchema = z
  .object({ linkId: telegramId, revision: z.number().int().positive() })
  .strict()

/** Personal linking controls. No model tool can issue or confirm a link. */
export const assistantChannelsRouter = createTRPCRouter({
  telegramAvailability: protectedProcedure.query(({ ctx }) => {
    const config = readAssistantTelegramConfig()
    return {
      enabled:
        !ctx.qaSessionScope &&
        Boolean(ctx.tenantContext.activeStore) &&
        config !== null &&
        isAssistantTelegramEnrolled(config, {
          userId: ctx.session.user.id,
          tenantId: ctx.tenantContext.tenant.id,
        }),
    }
  }),
  createTelegramLink: protectedProcedure
    .input(z.object({ tenantId: telegramId, storeId: telegramId }).strict())
    .mutation(({ ctx, input }) =>
      result(async () => {
        const scope = actor(ctx)
        const config = telegramConfiguration(scope)
        if (
          scope.tenantId !== input.tenantId ||
          scope.storeId !== input.storeId
        )
          throw new TRPCError({
            code: "CONFLICT",
            message: "Your business or Store changed. Refresh and try again.",
          })
        const { id, revision, expiresAt, code } =
          await createAssistantTelegramLink(ctx.db, scope, config.botId)
        const url = new URL(`https://t.me/${config.username}`)
        url.searchParams.set("start", code)
        return { id, revision, expiresAt, url: url.href }
      }),
    ),
  telegramLink: protectedProcedure
    .input(z.object({ linkId: telegramId }).strict())
    .query(({ ctx, input }) =>
      result(() => {
        const scope = actor(ctx)
        const config = telegramConfiguration(scope)
        return readAssistantTelegramLink(
          ctx.db,
          scope,
          input.linkId,
          config.botId,
        )
      }),
    ),
  confirmTelegramLink: protectedProcedure
    .input(linkDecisionSchema)
    .mutation(({ ctx, input }) =>
      result(async () => {
        const scope = actor(ctx)
        const config = telegramConfiguration(scope)
        try {
          const { id, maskedSender, claimMessage, previousScope } =
            await confirmAssistantTelegramLink(ctx.db, scope, {
              ...input,
              botId: config.botId,
            })
          const business = {
            businessName: ctx.tenantContext.tenant.name,
            storeName: ctx.tenantContext.activeStore?.name ?? "Store",
          }
          // Phase 2 (c-switch): a chat that was already connected swaps its pin.
          if (claimMessage)
            await (previousScope
              ? showTelegramReconnected(
                  telegramChat(config),
                  claimMessage,
                  business,
                  previousScope,
                )
              : showTelegramConnected(
                  telegramChat(config),
                  claimMessage,
                  business,
                ))
          return { id, maskedSender }
        } catch (error) {
          // Expiry is applied on the next touch: close the bot's claim message once.
          if (
            error instanceof AssistantTelegramError &&
            error.code === "EXPIRED"
          ) {
            const message = await closeExpiredAssistantTelegramClaim(
              ctx.db,
              scope,
              {
                linkId: input.linkId,
                botId: config.botId,
              },
            )
            if (message)
              await closeTelegramClaim(
                telegramChat(config),
                message,
                telegramCopy.expired,
              )
          }
          throw error
        }
      }),
    ),
  rejectTelegramLink: protectedProcedure
    .input(linkDecisionSchema)
    .mutation(({ ctx, input }) =>
      result(async () => {
        const scope = actor(ctx)
        const config = telegramConfiguration(scope)
        const { claimMessage } = await rejectAssistantTelegramLink(
          ctx.db,
          scope,
          {
            ...input,
            botId: config.botId,
          },
        )
        if (claimMessage)
          await closeTelegramClaim(
            telegramChat(config),
            claimMessage,
            telegramCopy.closed,
          )
        return { closed: true as const }
      }),
    ),
  telegramConnections: authenticatedProcedure
    .input(z.object({ cursor: telegramId.optional() }).strict().optional())
    .query(({ ctx, input }) =>
      result(() =>
        listAssistantTelegramGrants(
          ctx.db,
          { userId: ctx.session.user.id, sessionId: ctx.session.session.id },
          { cursor: input?.cursor },
        ),
      ),
    ),
  revokeTelegram: authenticatedProcedure
    .input(z.object({ grantId: telegramId }).strict())
    .mutation(({ ctx, input }) =>
      result(async () => {
        const revoked = await revokeAssistantTelegramGrant(
          ctx.db,
          { userId: ctx.session.user.id, sessionId: ctx.session.session.id },
          input.grantId,
        )
        const config = readAssistantTelegramConfig()
        if (config && "chatId" in revoked && revoked.chatId)
          await showTelegramDisconnected(
            telegramChat(config),
            revoked.chatId,
            revoked.connectedMessage ?? null,
          )
        return { revoked: revoked.revoked }
      }),
    ),
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
        const { welcomeOutboxId, ...connection } =
          await confirmAssistantWhatsAppLink(ctx.db, actor(ctx), {
            ...input,
            phoneNumberId: config.phoneNumberId,
          })
        if (welcomeOutboxId)
          try {
            await enqueueAssistantWhatsAppDelivery(welcomeOutboxId)
          } catch {
            console.error("[assistant] connection welcome deferred to recovery")
          }
        return connection
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
