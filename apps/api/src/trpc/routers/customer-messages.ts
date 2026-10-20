import { ASSISTANT_RUNTIME_CONFIGURATION_KEY } from "@ewatrade/ai/runtime-config"
import { customerMessageEvents } from "@ewatrade/customer-messages"
import {
  accountPrivacyPrivateWritesAllowed,
  recordAssistantMessageUsage,
  reserveAssistantBudget,
} from "@ewatrade/db/assistant"
import {
  CustomerMessageError,
  customerMessageScope,
  listCustomerMessageTemplates,
  prepareCustomerMessageOpen,
  previewCustomerMessage,
  resetCustomerMessageTemplate,
  saveCustomerMessageTemplate,
  setCustomerMessageTemplateEnabled,
} from "@ewatrade/db/customer-messages"
import { TRPCError } from "@trpc/server"
import { withCustomerMessageDraftLease } from "../../assistant/customer-message-draft-guard"
import {
  generateCustomerMessageDrafts,
  starterCustomerMessageDrafts,
} from "../../assistant/customer-message-drafts"
import {
  GENERAL_BUDGET_LIMITS,
  generalBudgetScopeKey,
} from "../../assistant/general-allowance"
import { resolveGeneralAssistantModel } from "../../assistant/model-resolution"
import {
  customerMessageAiSchema,
  customerMessageOpenSchema,
  customerMessagePreviewSchema,
  messageTemplateEnabledSchema,
  messageTemplateListSchema,
  messageTemplateResetSchema,
  messageTemplateSaveSchema,
} from "../../schemas/customer-messages"
import { type TRPCContext, createTRPCRouter, protectedProcedure } from "../init"

type ProtectedContext = TRPCContext & {
  session: NonNullable<TRPCContext["session"]>
  tenantContext: NonNullable<TRPCContext["tenantContext"]>
}
function activeScope(ctx: ProtectedContext) {
  const storeId = ctx.tenantContext.activeStore?.id
  if (!storeId)
    throw new TRPCError({ code: "NOT_FOUND", message: "Choose a Store first." })
  return {
    tenantId: ctx.tenantContext.tenant.id,
    storeId,
    actorUserId: ctx.session.user.id,
  }
}
/**
 * Saved wording in Settings: another Store the person can reach, or the
 * active Store when none is named. Order messages always use the active one.
 */
function templateScope(ctx: ProtectedContext, storeId: string | undefined) {
  if (!storeId) return activeScope(ctx)
  if (!ctx.tenantContext.stores.some((store) => store.id === storeId))
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Choose an accessible Store.",
    })
  return {
    tenantId: ctx.tenantContext.tenant.id,
    storeId,
    actorUserId: ctx.session.user.id,
  }
}
async function messaging<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof CustomerMessageError)
      throw new TRPCError({
        code: error.code,
        message: error.message,
        cause: error,
      })
    throw error
  }
}

export const customerMessagesRouter = createTRPCRouter({
  catalog: protectedProcedure.query(async ({ ctx }) => {
    await messaging(() =>
      ctx.db.$transaction((tx) => customerMessageScope(tx, activeScope(ctx))),
    )
    return customerMessageEvents
  }),
  templateStatus: protectedProcedure.query(({ ctx }) =>
    messaging(() =>
      listCustomerMessageTemplates(ctx.db, activeScope(ctx), false),
    ),
  ),
  templates: createTRPCRouter({
    list: protectedProcedure
      .input(messageTemplateListSchema)
      .query(({ ctx, input }) =>
        messaging(() =>
          listCustomerMessageTemplates(
            ctx.db,
            templateScope(ctx, input?.storeId),
          ),
        ),
      ),
    save: protectedProcedure
      .input(messageTemplateSaveSchema)
      .mutation(({ ctx, input: { storeId, ...input } }) =>
        messaging(() =>
          saveCustomerMessageTemplate(ctx.db, {
            ...templateScope(ctx, storeId),
            ...input,
          }),
        ),
      ),
    reset: protectedProcedure
      .input(messageTemplateResetSchema)
      .mutation(({ ctx, input: { storeId, ...input } }) =>
        messaging(() =>
          resetCustomerMessageTemplate(ctx.db, {
            ...templateScope(ctx, storeId),
            ...input,
          }),
        ),
      ),
    setEnabled: protectedProcedure
      .input(messageTemplateEnabledSchema)
      .mutation(({ ctx, input: { storeId, ...input } }) =>
        messaging(() =>
          setCustomerMessageTemplateEnabled(ctx.db, {
            ...templateScope(ctx, storeId),
            ...input,
          }),
        ),
      ),
  }),
  preview: protectedProcedure
    .input(customerMessagePreviewSchema)
    .query(({ ctx, input }) =>
      messaging(() =>
        previewCustomerMessage(ctx.db, { ...activeScope(ctx), ...input }),
      ),
    ),
  prepareOpen: protectedProcedure
    .input(customerMessageOpenSchema)
    .mutation(({ ctx, input }) =>
      messaging(() =>
        prepareCustomerMessageOpen(ctx.db, { ...activeScope(ctx), ...input }),
      ),
    ),
  draftWithAi: protectedProcedure
    .input(customerMessageAiSchema)
    .mutation(async ({ ctx, input }) => {
      const scope = activeScope(ctx)
      const access = await messaging(() =>
        ctx.db.$transaction((tx) => customerMessageScope(tx, scope, true)),
      )
      const privateWritesAllowed = await ctx.db.$transaction((tx) =>
        accountPrivacyPrivateWritesAllowed(tx, scope.actorUserId),
      )
      if (!privateWritesAllowed)
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "AI composition is unavailable while account deletion is processing.",
        })
      return withCustomerMessageDraftLease(scope.actorUserId, async () => {
        const model = await resolveGeneralAssistantModel({
          dataClassification: access.store.tenant.dataClassification,
          readRuntimeConfiguration: async () =>
            (
              await ctx.db.systemConfiguration.findUnique({
                where: { key: ASSISTANT_RUNTIME_CONFIGURATION_KEY },
                select: { value: true },
              })
            )?.value,
        })
        if (!model || model.rehearsal)
          return starterCustomerMessageDrafts(
            input,
            "AI is unavailable. These are editable starter messages.",
          )
        const budgetScopeKey = generalBudgetScopeKey(scope)
        const budget = await reserveAssistantBudget(ctx.db, {
          scopeKey: budgetScopeKey,
          limits: GENERAL_BUDGET_LIMITS,
        })
        if (!budget.allowed)
          return starterCustomerMessageDrafts(
            input,
            "This month's AI allowance is used up. You can edit these starter messages.",
          )
        const started = Date.now()
        const result = await generateCustomerMessageDrafts(input, { model })
        // Content-free usage metadata shares the canonical tenant GENERAL allowance.
        await recordAssistantMessageUsage(ctx.db, {
          tenantId: scope.tenantId,
          actorUserId: scope.actorUserId,
          requestClass: "customer_message",
          provider: model.provider,
          model: model.modelId,
          outcome: result.source === "ai" ? "success" : "fallback",
          durationMs: Date.now() - started,
          inputTokens: result.usage?.inputTokens,
          outputTokens: result.usage?.outputTokens,
          totalTokens: result.usage?.totalTokens,
          budgetScopeKey,
        })
        return result
      })
    }),
})
