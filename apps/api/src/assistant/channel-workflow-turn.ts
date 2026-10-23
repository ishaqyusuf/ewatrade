import { parseWhatsAppTypedAction } from "@ewatrade/assistant/channels/action-review"
import { whatsAppVoiceChoiceContentSchema } from "@ewatrade/assistant/channels/media"
import { whatsAppChannelPolicy } from "@ewatrade/assistant/channels/policy"
import { whatsAppWorkflowEnabled } from "@ewatrade/assistant/channels/workflow"
import { SETUP_ATTACHMENT_PART } from "@ewatrade/assistant/setup/attachments"
import {
  beginAssistantRunInTransaction,
  markSetupDraftAreaInTransaction,
  readAssistantConversation,
  removeSetupDraftEntitiesInTransaction,
  upsertSetupDraftEntitiesInTransaction,
} from "@ewatrade/db/assistant"
import {
  consumeAssistantWhatsAppVoiceReviewInTransaction,
  stampAssistantWhatsAppExecution,
} from "@ewatrade/db/assistant-whatsapp"
import type { Prisma } from "@ewatrade/db/types"
import { resolveProtectedTenantContext } from "../trpc/init"
import {
  isLinkedAssistantIdentity,
  lockLinkedAssistantIdentity,
  resolveLinkedAssistantIdentity,
} from "./channel-principal"
import { createAssistantChatRepository } from "./chat-repository"
import type { GeneralTransactionContext } from "./general-actions"
import type { GeneralContext } from "./general-context"
import { assistantMediaAvailability } from "./media-availability"
import { resolveSetupAssistantModel } from "./model-resolution"
import { requireSetupAssistantScope } from "./setup-context"
import { AssistantStreamGuard } from "./stream-guard"
import {
  createWorkflowAssistantTurn,
  workflowTurnInputSchema,
} from "./workflow-turn"
import { WorkflowTurnError } from "./workflow-turn-contract"

const guard = new AssistantStreamGuard()
const activeRuns = new Map<string, AbortController>()

/** Only canonical accepted voice-review output may cross Product's file/photo restriction. */
export function assertChannelProductVoiceInput(
  input: ReturnType<typeof workflowTurnInputSchema.parse>,
  admitted: {
    conversationId: string
    requestId: string
    userMessageId: string
  },
  selected: Awaited<
    ReturnType<typeof consumeAssistantWhatsAppVoiceReviewInTransaction>
  >,
) {
  const [text, attachment] = input.message.parts
  if (
    selected.state !== "ready" ||
    input.conversationId !== admitted.conversationId ||
    input.requestId !== admitted.requestId ||
    input.message.id !== admitted.userMessageId ||
    input.message.parts.length !== 2 ||
    text?.type !== "text" ||
    text.text !== selected.text ||
    parseWhatsAppTypedAction(text.text) ||
    attachment?.type !== SETUP_ATTACHMENT_PART ||
    attachment.data.attachmentId !== selected.attachmentId
  )
    throw new WorkflowTurnError(
      400,
      "BAD_REQUEST",
      "Use the exact reviewed voice transcript. Send Product photos and files through the saved EwaTrade workflow.",
    )
}

export function assertChannelWorkflowConversation(
  conversation: {
    id: string
    ownerUserId: string
    tenantId: string
    storeId: string
    purpose: string
    status: string
    setupDraft: { id: string } | null
  },
  expected: {
    conversationId: string
    userId: string
    tenantId: string
    storeId: string
    purpose: "SETUP" | "PRODUCT_CREATE"
  },
) {
  if (
    conversation.id !== expected.conversationId ||
    conversation.ownerUserId !== expected.userId ||
    conversation.tenantId !== expected.tenantId ||
    conversation.storeId !== expected.storeId ||
    conversation.purpose !== expected.purpose ||
    conversation.status !== "ACTIVE" ||
    !conversation.setupDraft
  )
    throw new WorkflowTurnError(
      404,
      "CONVERSATION_NOT_FOUND",
      "This exact workflow conversation is not available.",
    )
}

/** Shared fresh linked Setup/Product transaction for canonical workflow and media adapters. */
export async function inFreshLinkedWorkflowTransaction<T>(
  context: GeneralContext,
  work: (fresh: GeneralTransactionContext) => Promise<T>,
) {
  const identity = context.session
  if (
    !isLinkedAssistantIdentity(identity) ||
    !identity.inboxLease ||
    !context.assistantConversationId ||
    (identity.purpose !== "SETUP" && identity.purpose !== "PRODUCT_CREATE")
  )
    throw new WorkflowTurnError(
      403,
      "FORBIDDEN",
      "Choose a Setup or Product conversation first.",
    )
  const inboxLease = identity.inboxLease
  const expected = {
    ...requireSetupAssistantScope(context),
    conversationId: context.assistantConversationId,
    purpose: identity.purpose,
  }
  return context.db.$transaction(
    async (tx) => {
      const resolved = await lockLinkedAssistantIdentity(tx, identity)
      const fresh: GeneralTransactionContext = {
        ...context,
        db: tx,
        session: resolved.identity,
        tenantContext: resolved.tenantContext,
        assistantConversationId: resolved.conversation.id,
      }
      const scope = requireSetupAssistantScope(fresh)
      if (
        scope.userId !== expected.userId ||
        scope.tenantId !== expected.tenantId ||
        scope.storeId !== expected.storeId ||
        resolved.conversation.id !== expected.conversationId ||
        resolved.conversation.purpose !== expected.purpose
      )
        throw new WorkflowTurnError(
          403,
          "AUTHORITY_CHANGED",
          "Workflow access changed.",
        )
      await stampAssistantWhatsAppExecution(tx, inboxLease, resolved)
      await tx.$queryRaw`SELECT id FROM "AssistantConversation" WHERE id=${expected.conversationId} FOR UPDATE`
      const conversation = await readAssistantConversation(
        tx,
        scope,
        expected.conversationId,
      )
      assertChannelWorkflowConversation(conversation, expected)
      return work(fresh)
    },
    { isolationLevel: "Serializable" },
  )
}

/** Binds the existing repository to a real linked identity, never a browser Session. */
export function createLinkedWorkflowRepository(context: GeneralContext) {
  const identity = context.session
  if (
    !isLinkedAssistantIdentity(identity) ||
    !identity.inboxLease ||
    !context.assistantConversationId ||
    (identity.purpose !== "SETUP" && identity.purpose !== "PRODUCT_CREATE")
  )
    throw new WorkflowTurnError(
      403,
      "FORBIDDEN",
      "Choose a Setup or Product conversation first.",
    )
  const scope = requireSetupAssistantScope(context)
  const expected = {
    ...scope,
    conversationId: context.assistantConversationId,
    purpose: identity.purpose,
  }
  const base = createAssistantChatRepository(context.db, scope)
  const fresh = async () => {
    const resolved = await resolveLinkedAssistantIdentity(
      context.db,
      identity.principal,
      identity.inboxLease,
    )
    const currentScope = requireSetupAssistantScope({
      ...context,
      session: resolved.identity,
      tenantContext: resolved.tenantContext,
    })
    if (
      currentScope.userId !== scope.userId ||
      currentScope.tenantId !== scope.tenantId ||
      currentScope.storeId !== scope.storeId ||
      resolved.conversation.id !== expected.conversationId ||
      resolved.conversation.purpose !== expected.purpose
    )
      throw new WorkflowTurnError(
        403,
        "AUTHORITY_CHANGED",
        "Workflow access changed.",
      )
  }
  const readConversation = async (conversationId: string) => {
    if (conversationId !== expected.conversationId)
      throw new WorkflowTurnError(
        404,
        "CONVERSATION_NOT_FOUND",
        "This workflow conversation is not available.",
      )
    await fresh()
    const conversation = await base.readConversation(conversationId)
    assertChannelWorkflowConversation(conversation, expected)
    return conversation
  }
  const inCurrentDraft = async <T>(
    draftId: string | undefined,
    run: (tx: Prisma.TransactionClient) => Promise<T>,
  ) =>
    inFreshLinkedWorkflowTransaction(context, async ({ db: tx }) => {
      const conversation = await readAssistantConversation(
        tx,
        scope,
        expected.conversationId,
      )
      assertChannelWorkflowConversation(conversation, expected)
      if (draftId && conversation.setupDraft?.id !== draftId)
        throw new WorkflowTurnError(
          404,
          "CONVERSATION_NOT_FOUND",
          "This setup list is not available.",
        )
      return run(tx)
    })
  const requireDraft = async (draftId: string) => {
    const conversation = await readConversation(expected.conversationId)
    if (conversation.setupDraft?.id !== draftId)
      throw new WorkflowTurnError(
        404,
        "CONVERSATION_NOT_FOUND",
        "This setup list is not available.",
      )
  }
  return {
    scope,
    purpose: expected.purpose,
    repository: {
      ...base,
      readConversation,
      beginRun: (input: Parameters<typeof base.beginRun>[0]) => {
        if (
          input.conversationId !== expected.conversationId ||
          input.actorUserId !== scope.userId
        )
          throw new WorkflowTurnError(
            403,
            "FORBIDDEN",
            "Workflow access changed.",
          )
        return inCurrentDraft(undefined, (tx) =>
          beginAssistantRunInTransaction(tx, input),
        )
      },
      listMessages: async (
        conversationId: string,
        options?: { limit?: number },
      ) => {
        await readConversation(conversationId)
        return base.listMessages(conversationId, options)
      },
      readDraftEntities: async (draftId: string) => {
        await requireDraft(draftId)
        return base.readDraftEntities(draftId)
      },
      readAreaMarks: async (draftId: string) => {
        await requireDraft(draftId)
        return base.readAreaMarks(draftId)
      },
      markArea: (
        draftId: string,
        area: string,
        mark: "DONE" | "SKIPPED" | null,
      ) => {
        if (expected.purpose !== "SETUP")
          throw new WorkflowTurnError(
            403,
            "FORBIDDEN",
            "Product chat does not change setup areas.",
          )
        return inCurrentDraft(draftId, (tx) =>
          markSetupDraftAreaInTransaction(tx, { draftId, area, mark }),
        )
      },
      writeDraftEntities: (
        draftId: string,
        entities: Parameters<typeof base.writeDraftEntities>[1],
        productRunId?: string,
      ) =>
        inCurrentDraft(draftId, (tx) =>
          upsertSetupDraftEntitiesInTransaction(tx, {
            draftId,
            entities,
            ...(expected.purpose === "PRODUCT_CREATE" && productRunId
              ? { productRun: { runId: productRunId, scope } }
              : {}),
          }),
        ),
      removeDraftEntities: (draftId: string, keys: string[]) =>
        inCurrentDraft(draftId, (tx) =>
          removeSetupDraftEntitiesInTransaction(tx, { draftId, keys }),
        ),
      loadBusinessContext: async () => {
        await fresh()
        const result = await base.loadBusinessContext()
        const media = assistantMediaAvailability(scope.dataClassification)
        return {
          ...result,
          context: {
            ...result.context,
            mediaEnabled:
              expected.purpose === "SETUP" &&
              whatsAppChannelPolicy().media &&
              (media.files || media.photos),
          },
        }
      },
      isActorStillAuthorized: async (conversationId: string) => {
        try {
          await readConversation(conversationId)
          return base.isActorStillAuthorized(conversationId)
        } catch {
          return false
        }
      },
      readRun: async (runId: string) => {
        await fresh()
        const run = await base.readRun(runId)
        return run?.conversationId === expected.conversationId ? run : null
      },
    },
  }
}

/** Called only by the existing serialized channel worker; gates remain closed. */
export async function createChannelWorkflowTurn(
  context: GeneralContext,
  input: unknown,
  signal?: AbortSignal,
) {
  if (
    !isLinkedAssistantIdentity(context.session) ||
    !whatsAppWorkflowEnabled(context.session.purpose)
  )
    throw new WorkflowTurnError(
      409,
      "WORKFLOW_NOT_READY",
      "Continue this saved Setup or Product draft in EwaTrade.",
    )
  const parsed = workflowTurnInputSchema.safeParse(input)
  if (
    !parsed.success ||
    (parsed.data.message.parts.some((part) => part.type !== "text") &&
      !whatsAppChannelPolicy().media)
  )
    throw new WorkflowTurnError(
      400,
      "BAD_REQUEST",
      "Type your workflow details here. Send files through the saved EwaTrade workflow.",
    )
  const ctx = await resolveProtectedTenantContext({
    ...context,
    tenantContext: null,
  })
  if (
    context.session.purpose === "PRODUCT_CREATE" &&
    parsed.data.message.parts.some((part) => part.type !== "text")
  )
    await inFreshLinkedWorkflowTransaction(
      ctx as GeneralContext,
      async (fresh) => {
        if (
          !isLinkedAssistantIdentity(fresh.session) ||
          !fresh.session.inboxLease
        )
          throw new WorkflowTurnError(
            403,
            "AUTHORITY_CHANGED",
            "Workflow access changed.",
          )
        const lease = fresh.session.inboxLease
        const inbox = await fresh.db.assistantWhatsAppInbox.findUniqueOrThrow({
          where: { id: lease.inboxId },
        })
        const choice = whatsAppVoiceChoiceContentSchema.safeParse(inbox.content)
        if (!choice.success || choice.data.choice.decision === "cancel")
          throw new WorkflowTurnError(
            400,
            "BAD_REQUEST",
            "Review the original voice transcript before using it.",
          )
        // Repeat the canonical proof check idempotently for this exact admitted
        // choice: fresh scope, accepted quote, owned READY AUDIO, immutable
        // transcript/generation/digests and original review expiry are all required.
        const selected = await consumeAssistantWhatsAppVoiceReviewInTransaction(
          fresh.db,
          {
            principal: fresh.session.principal,
            lease,
            choice: choice.data.choice,
          },
        )
        assertChannelProductVoiceInput(
          parsed.data,
          {
            conversationId: fresh.assistantConversationId ?? "",
            requestId: inbox.requestId,
            userMessageId: inbox.userMessageId,
          },
          selected,
        )
      },
    )
  const linked = createLinkedWorkflowRepository(ctx as GeneralContext)
  return createWorkflowAssistantTurn(
    {
      ...linked,
      resolveModel: ({ scope, repository }) =>
        resolveSetupAssistantModel({
          dataClassification: scope.dataClassification,
          readRuntimeConfiguration: repository.readRuntimeConfiguration,
        }),
      guard,
      activeRuns,
    },
    parsed.data,
    { purpose: linked.purpose, signal, channel: "whatsapp" },
  )
}
