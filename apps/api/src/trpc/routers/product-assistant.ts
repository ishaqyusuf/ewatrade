import { createHash } from "node:crypto"
import { effectiveAssistantAllowance } from "@ewatrade/assistant/product/allowance"
import {
  PRODUCT_DRAFT_KEY,
  productCreationReady,
  productFormSnapshotSchema,
  productRequiresForm,
  productSeed,
  productWorkflowContextSchema,
} from "@ewatrade/assistant/product/contracts"
import { setupProductPayloadSchema } from "@ewatrade/assistant/setup/contracts"
import {
  AssistantRecordError,
  commitProductConversation,
  createProductConversation,
  listAssistantMessages,
  listProductConversations,
  productConversationHasRunningTurn,
  readAssistantBudget,
  readAssistantConversation,
  readSetupDraft,
  updateProductConversationSnapshot,
} from "@ewatrade/db/assistant"
import { CatalogError, simpleCatalogItemCommand } from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { catalogCommandForSetupEntity } from "../../assistant/setup-commit"
import {
  SETUP_BUDGET_LIMITS,
  isSetupAssistantEnabled,
  requireSetupAssistantScope,
} from "../../assistant/setup-context"
import { readSetupPrerequisites } from "../../assistant/setup-prerequisites"
import {
  catalogCreateItemSchema,
  catalogCreateSimpleItemSchema,
} from "../../schemas/catalog"
import { createTRPCRouter, protectedProcedure } from "../init"

const conversationInput = z.object({
  conversationId: z.string().min(1).max(64),
})
const productProcedure = protectedProcedure.use(async ({ next }) => {
  const result = await next()
  if (!result.ok) {
    const cause = result.error.cause
    if (cause instanceof AssistantRecordError)
      throw new TRPCError({
        code:
          cause.code === "CONVERSATION_NOT_FOUND" ||
          cause.code === "ENTITY_NOT_FOUND"
            ? "NOT_FOUND"
            : "CONFLICT",
        message: cause.message,
      })
    if (cause instanceof CatalogError)
      throw new TRPCError({ code: "BAD_REQUEST", message: cause.message })
  }
  return result
})
export const productAssistantRouter = createTRPCRouter({
  capabilities: productProcedure.query(async ({ ctx }) => {
    if (
      !isSetupAssistantEnabled() ||
      !["OWNER", "ADMIN"].includes(ctx.tenantContext.membership.role) ||
      !ctx.tenantContext.activeStore
    )
      return { enabled: false as const }
    const scope = requireSetupAssistantScope(ctx)
    const [budget, drafts] = await Promise.all([
      readAssistantBudget(ctx.db, scope.tenantId),
      listProductConversations(ctx.db, scope),
    ])
    return {
      enabled: true as const,
      allowance: effectiveAssistantAllowance(budget, SETUP_BUDGET_LIMITS),
      drafts,
    }
  }),
  start: productProcedure
    .input(
      z.object({
        handoffRequestId: z.string().uuid(),
        snapshot: productFormSnapshotSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const scope = requireSetupAssistantScope(ctx)
      if (input.snapshot.storeId !== scope.storeId)
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Switch to the product's Store before using AI. Your form is still here.",
        })
      const id = `prd_${createHash("sha256").update(`${scope.tenantId}:${scope.storeId}:${scope.userId}:${input.handoffRequestId}`).digest("hex").slice(0, 48)}`
      const seed = productSeed(input.snapshot)
      const conversation = await createProductConversation(ctx.db, scope, {
        id,
        snapshot: input.snapshot,
        seed: seed
          ? {
              key: PRODUCT_DRAFT_KEY,
              kind: "PRODUCT",
              payload: seed.payload,
              state: seed.state,
              openQuestions: seed.questions,
              source: { kind: "form" },
            }
          : null,
        opening: input.snapshot.form.name.trim()
          ? `Let's finish ${input.snapshot.form.name.trim()}. I've kept the details you entered. Tell me anything else about how you count it, sell or use it, its price and current stock.`
          : "Tell me about the product you want to add. You can include its name, how you sell or use it, the price and how much stock you have. Share what you know; we'll fill in the remaining details together.",
      })
      return { conversationId: conversation.id }
    }),
  state: productProcedure
    .input(conversationInput)
    .query(async ({ ctx, input }) => {
      const scope = requireSetupAssistantScope(ctx)
      const conversation = await readAssistantConversation(
        ctx.db,
        scope,
        input.conversationId,
      )
      if (conversation.purpose !== "PRODUCT_CREATE" || !conversation.setupDraft)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This product draft is not available.",
        })
      const snapshot = productWorkflowContextSchema.parse(
        conversation.workflowContext,
      ).snapshot
      const [draft, messages, running] = await Promise.all([
        readSetupDraft(ctx.db, conversation.setupDraft.id),
        listAssistantMessages(ctx.db, conversation.id),
        productConversationHasRunningTurn(ctx.db, conversation.id),
      ])
      const entity = draft.entities.find(
        (entity) => entity.key === PRODUCT_DRAFT_KEY,
      )
      const prerequisites = await readSetupPrerequisites(
        ctx.db,
        {
          userId: scope.userId,
          tenantId: scope.tenantId,
          currencyCode: ctx.tenantContext.tenant.currencyCode,
        },
        draft.entities,
      )
      const productName = setupProductPayloadSchema
        .safeParse(entity?.payload)
        .data?.name.trim()
      const possibleMatches =
        productName && productName.length >= 2
          ? await ctx.db.catalogItem.findMany({
              where: {
                tenantId: scope.tenantId,
                kind: "PRODUCT",
                status: "ACTIVE",
                name: { contains: productName, mode: "insensitive" },
              },
              select: { id: true, name: true },
              take: 5,
            })
          : []
      const lastRun = await ctx.db.assistantRun.findFirst({
        where: { conversationId: conversation.id, actorUserId: scope.userId },
        orderBy: { startedAt: "desc" },
        select: { status: true, errorCode: true },
      })
      return {
        conversation: { id: conversation.id, status: conversation.status },
        snapshot,
        draft,
        messages: messages.map(({ id, role, parts }) => ({ id, role, parts })),
        running,
        prerequisites,
        possibleMatches,
        runFailure: lastRun?.status === "FAILED" ? lastRun.errorCode : null,
        requiresForm:
          productRequiresForm(snapshot) ||
          !!setupProductPayloadSchema.safeParse(entity?.payload).data?.options
            ?.length,
        ready:
          !running &&
          !prerequisites.termsRequired &&
          productCreationReady(entity?.payload, snapshot),
        receipt: entity?.committedRecordId ?? null,
      }
    }),
  create: productProcedure
    .input(
      conversationInput.extend({
        expectedRevision: z.number().int().min(0),
        createSeparateProduct: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const scope = requireSetupAssistantScope(ctx)
      const conversation = await readAssistantConversation(
        ctx.db,
        scope,
        input.conversationId,
      )
      if (conversation.setupDraft && conversation.status === "ACTIVE") {
        const draft = await readSetupDraft(ctx.db, conversation.setupDraft.id)
        const name = setupProductPayloadSchema
          .safeParse(draft.entities[0]?.payload)
          .data?.name.trim()
        if (
          name &&
          !input.createSeparateProduct &&
          (await ctx.db.catalogItem.count({
            where: {
              tenantId: scope.tenantId,
              kind: "PRODUCT",
              status: "ACTIVE",
              name: { contains: name, mode: "insensitive" },
            },
          }))
        )
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Review the existing products and choose to create a separate product.",
          })
      }
      return commitProductConversation(
        ctx.db,
        scope,
        input,
        (entity, context) => {
          const snapshot = productWorkflowContextSchema.parse(context).snapshot
          if (!productCreationReady(entity.payload, snapshot))
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message:
                "Finish the missing details or use Back to form to create this product.",
            })
          const payload = setupProductPayloadSchema.parse(entity.payload)
          const command = catalogCommandForSetupEntity(entity.id, payload, {
            tenantId: scope.tenantId,
            storeId: scope.storeId,
            actorUserId: scope.userId,
          })
          return {
            ...command,
            category: command.category ?? (snapshot.category || undefined),
            ...(snapshot.photoAssetIds.length
              ? {
                  photoAssetIds: snapshot.photoAssetIds,
                  illustrationId: undefined,
                }
              : {
                  illustrationId:
                    snapshot.illustrationId ?? command.illustrationId,
                }),
          }
        },
      )
    }),
  createFromForm: productProcedure
    .input(
      conversationInput.extend({
        expectedRevision: z.number().int().min(0),
        command: z.discriminatedUnion("mode", [
          z.object({
            mode: z.literal("simple"),
            input: catalogCreateSimpleItemSchema,
          }),
          z.object({
            mode: z.literal("advanced"),
            input: catalogCreateItemSchema,
          }),
        ]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const scope = requireSetupAssistantScope(ctx)
      if (
        input.command.input.kind !== "product" ||
        input.command.input.storeId !== scope.storeId
      )
        throw new TRPCError({
          code: "CONFLICT",
          message: "This product form belongs to a different Store.",
        })
      const command =
        input.command.mode === "simple"
          ? simpleCatalogItemCommand({
              ...input.command.input,
              actorUserId: scope.userId,
              tenantId: scope.tenantId,
              storeId: scope.storeId,
            })
          : {
              ...input.command.input,
              actorUserId: scope.userId,
              tenantId: scope.tenantId,
              storeId: scope.storeId,
            }
      return commitProductConversation(
        ctx.db,
        scope,
        {
          conversationId: input.conversationId,
          expectedRevision: input.expectedRevision,
          manualEntity: {
            key: PRODUCT_DRAFT_KEY,
            kind: "PRODUCT",
            state: "PROPOSED",
            payload: {
              kind: "product",
              name: command.name,
              unitName:
                command.kind === "product"
                  ? (command.unitConfiguration?.units[0]?.name ?? "Unit")
                  : "Unit",
            },
            source: { kind: "form" },
            openQuestions: [],
          },
        },
        () => command,
      )
    }),
  updateSnapshot: productProcedure
    .input(
      conversationInput.extend({
        expectedRevision: z.number().int().min(0),
        snapshot: productFormSnapshotSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const scope = requireSetupAssistantScope(ctx)
      if (input.snapshot.storeId !== scope.storeId)
        throw new TRPCError({
          code: "CONFLICT",
          message: "Switch to the product's Store before continuing with AI.",
        })
      const seed = productSeed(input.snapshot)
      return updateProductConversationSnapshot(ctx.db, scope, {
        ...input,
        seed: seed
          ? {
              key: PRODUCT_DRAFT_KEY,
              kind: "PRODUCT",
              payload: seed.payload,
              state: seed.state,
              openQuestions: seed.questions,
              source: { kind: "form" },
            }
          : null,
      })
    }),
})
