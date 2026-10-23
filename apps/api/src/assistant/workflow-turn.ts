import {
  WHATSAPP_ASSISTANT_PROMPT_VERSION,
  whatsAppCollectionInstructions,
  whatsAppPresentationInstructions,
} from "@ewatrade/assistant/channels/instructions"
import {
  PRODUCT_ASSISTANT_PROMPT_VERSION,
  productAssistantInstructions,
  productWorkflowContextSchema,
} from "@ewatrade/assistant/product/contracts"
import {
  SETUP_ATTACHMENTS_PER_MESSAGE,
  SETUP_ATTACHMENT_PART,
} from "@ewatrade/assistant/setup/attachments"
import { SETUP_ASSISTANT_PROMPT_VERSION } from "@ewatrade/assistant/setup/contracts"
import type { SetupAssistantDataParts } from "@ewatrade/assistant/setup/messages"
import { buildSetupAssistantInstructions } from "@ewatrade/assistant/setup/prompt"
import { createSetupAssistantTools } from "@ewatrade/assistant/setup/tools"
import {
  AssistantRecordError,
  type AssistantScope,
  type AssistantStoredMessage,
  assistantBudgetScopeKey,
  newAssistantMessageId,
} from "@ewatrade/db/assistant"
import { AssistantAttachmentError } from "@ewatrade/db/assistant-attachments"
import {
  type LanguageModelUsage,
  ToolLoopAgent,
  type UIMessage,
  convertToModelMessages,
  createUIMessageStream,
  stepCountIs,
} from "ai"
import { z } from "zod"
import {
  attachmentSendRefusal,
  knownAttachments,
  referencedAttachmentIds,
  storedUserParts,
  withAttachmentText,
} from "./chat-attachments"
import type { AssistantChatRepository } from "./chat-repository"
import type { ResolvedAssistantModel } from "./model-resolution"
import { SETUP_BUDGET_LIMITS } from "./setup-context"
import { AssistantLimitError, type AssistantStreamGuard } from "./stream-guard"

import type {
  GeneralTurn,
  GeneralTurnCompletion,
} from "./general-turn-contract"
import { WorkflowTurnError } from "./workflow-turn-contract"
export { WorkflowTurnError } from "./workflow-turn-contract"
export type SetupUIMessage = UIMessage<never, SetupAssistantDataParts>

const foregroundDeadlineMs = 45_000

export const workflowTurnInputSchema = z
  .object({
    conversationId: z.string().min(1).max(64),
    requestId: z.string().min(8).max(120),
    message: z.object({
      id: z.string().min(1).max(80),
      role: z.literal("user"),
      parts: z
        .array(
          z.union([
            z.object({
              type: z.literal("text"),
              text: z.string().min(1).max(8000),
            }),
            z.object({
              type: z.literal(SETUP_ATTACHMENT_PART),
              data: z.object({ attachmentId: z.string().min(1).max(64) }),
            }),
          ]),
        )
        .min(1)
        .max(4 + SETUP_ATTACHMENTS_PER_MESSAGE)
        .refine(
          (parts) =>
            parts.filter((part) => part.type === "text").length <= 4 &&
            parts.filter((part) => part.type !== "text").length <=
              SETUP_ATTACHMENTS_PER_MESSAGE,
        ),
    }),
  })
  .strict()

export type WorkflowChatScope = AssistantScope & {
  dataClassification: "LIVE" | "QA"
}
export type WorkflowTurnDependencies = {
  scope: WorkflowChatScope
  repository: AssistantChatRepository
  resolveModel: (input: {
    scope: WorkflowChatScope
    repository: AssistantChatRepository
  }) => Promise<ResolvedAssistantModel | null>
  guard: AssistantStreamGuard
  activeRuns: Map<string, AbortController>
}

/** Only text, step and settled tool parts are kept in history. */
function persistableParts(message: SetupUIMessage) {
  return message.parts.filter(
    (part) =>
      part.type === "text" ||
      part.type === "step-start" ||
      (part.type.startsWith("tool-") &&
        "state" in part &&
        (part.state === "output-available" || part.state === "output-error")),
  )
}

function usageRecord(usage: LanguageModelUsage | undefined) {
  if (!usage) return undefined
  return {
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
  }
}

const ATTACHMENT_REFUSALS: Record<string, string> = {
  ATTACHMENT_NOT_FOUND: "One of these files is not available. Attach it again.",
  ATTACHMENT_NOT_READY: "Wait until every file has been read, then send again.",
  ATTACHMENT_ALREADY_SENT: "One of these files was already sent.",
}

/** The canonical Setup/Product runner shared by app transport and linked channels. */
export async function createWorkflowAssistantTurn(
  deps: WorkflowTurnDependencies,
  input: unknown,
  options: {
    purpose?: "SETUP" | "PRODUCT_CREATE"
    signal?: AbortSignal
    channel?: "whatsapp"
  } = {},
): Promise<GeneralTurn> {
  const parsed = workflowTurnInputSchema.safeParse(input)
  if (!parsed.success)
    throw new WorkflowTurnError(
      400,
      "BAD_REQUEST",
      "Invalid assistant message.",
    )
  const body = parsed.data
  const { scope, repository } = deps
  let conversation: Awaited<
    ReturnType<AssistantChatRepository["readConversation"]>
  >
  try {
    conversation = await repository.readConversation(body.conversationId)
  } catch (error) {
    if (error instanceof AssistantRecordError)
      throw new WorkflowTurnError(404, error.code, error.message)
    throw error
  }
  if (
    !["SETUP", "PRODUCT_CREATE"].includes(conversation.purpose) ||
    (options.purpose && conversation.purpose !== options.purpose)
  )
    throw new WorkflowTurnError(
      404,
      "CONVERSATION_NOT_FOUND",
      "This workflow conversation is not available.",
    )
  const draftId = conversation.setupDraft?.id
  const productMode = conversation.purpose === "PRODUCT_CREATE"
  const productSnapshot = productMode
    ? productWorkflowContextSchema.parse(conversation.workflowContext).snapshot
    : null
  if (conversation.status !== "ACTIVE" || !draftId)
    throw new WorkflowTurnError(
      409,
      "CONVERSATION_CLOSED",
      "Start setup with the assistant first.",
    )

  let lease: ReturnType<AssistantStreamGuard["acquire"]>
  try {
    lease = deps.guard.acquire(scope.userId)
  } catch (error) {
    if (error instanceof AssistantLimitError)
      throw new WorkflowTurnError(
        error.status,
        error.code,
        error.message,
        error.resetAt,
      )
    throw error
  }
  // Every return before the stream starts must hand the slot back.
  let streaming = false
  try {
    const model = await deps.resolveModel({ scope, repository })
    if (!model)
      throw new WorkflowTurnError(
        503,
        "ASSISTANT_UNAVAILABLE",
        "The assistant is unavailable right now. You can still set up your business yourself.",
      )

    const budgetScopeKey = assistantBudgetScopeKey(scope.tenantId, "SETUP")
    const textParts = body.message.parts.filter(
      (part): part is { type: "text"; text: string } => part.type === "text",
    )
    const attachmentIds = body.message.parts.flatMap((part) =>
      part.type === SETUP_ATTACHMENT_PART ? [part.data.attachmentId] : [],
    )
    const attachments = await repository.readAttachmentsToSend(attachmentIds)
    const refusal = attachmentSendRefusal(attachments, {
      conversationId: conversation.id,
      messageId: body.message.id,
      requested: attachmentIds,
    })
    if (refusal)
      throw new WorkflowTurnError(
        409,
        refusal,
        ATTACHMENT_REFUSALS[refusal] ?? "",
      )
    const userMessage: AssistantStoredMessage = {
      id: body.message.id,
      role: "user",
      parts: storedUserParts(
        textParts,
        attachments,
        attachmentIds,
      ) as unknown as AssistantStoredMessage["parts"],
    }
    let begun: Awaited<ReturnType<AssistantChatRepository["beginRun"]>>
    try {
      begun = await repository.beginRun({
        actorUserId: scope.userId,
        conversationId: conversation.id,
        model: model.modelId,
        promptVersion:
          (productMode
            ? PRODUCT_ASSISTANT_PROMPT_VERSION
            : SETUP_ASSISTANT_PROMPT_VERSION) +
          (options.channel === "whatsapp"
            ? `+${WHATSAPP_ASSISTANT_PROMPT_VERSION}`
            : ""),
        provider: model.provider,
        requestId: body.requestId,
        userMessage,
        attachmentIds,
      })
    } catch (error) {
      if (error instanceof AssistantAttachmentError)
        throw new WorkflowTurnError(
          409,
          error.code,
          ATTACHMENT_REFUSALS[error.code] ?? error.message,
        )
      if (error instanceof AssistantRecordError)
        throw new WorkflowTurnError(409, error.code, error.message)
      throw error
    }
    if (begun.replay)
      throw new WorkflowTurnError(
        409,
        "REQUEST_REPLAYED",
        "This message was already sent. Refresh to see the reply.",
      )
    const budget = await repository.reserveBudget({
      scopeKey: budgetScopeKey,
      limits: SETUP_BUDGET_LIMITS,
    })
    if (!budget.allowed) {
      await repository.completeRun({
        runId: begun.run.id,
        tenantId: scope.tenantId,
        actorUserId: scope.userId,
        provider: model.provider,
        model: model.modelId,
        status: "FAILED",
        errorCode: "BUDGET_EXHAUSTED",
        // The owner's message is already stored; answer it so the history
        // does not show it unanswered after a reload.
        assistantMessage: {
          id: newAssistantMessageId(),
          role: "assistant",
          parts: [{ type: "text", text: BUDGET_EXHAUSTED_MESSAGE }],
        },
      })
      throw new WorkflowTurnError(
        429,
        "BUDGET_EXHAUSTED",
        BUDGET_EXHAUSTED_MESSAGE,
      )
    }

    const [{ context: business }, storedHistory] = await Promise.all([
      repository.loadBusinessContext(),
      repository.listMessages(conversation.id, { limit: 40 }),
    ])
    const history = storedHistory as unknown as SetupUIMessage[]
    const sentAttachments = await repository.readSentAttachments(
      conversation.id,
      referencedAttachmentIds(
        storedHistory as unknown as Parameters<
          typeof referencedAttachmentIds
        >[0],
      ),
    )
    // Attachments reach the model only as delimited, untrusted text.
    const modelHistory = withAttachmentText(
      history as unknown as Parameters<typeof withAttachmentText>[0],
      sentAttachments,
    ) as unknown as SetupUIMessage[]
    const modelMessages = await convertToModelMessages(
      modelHistory.map(({ role, parts }) => ({ role, parts })),
      { ignoreIncompleteToolCalls: true },
    )
    const startedAt = Date.now()
    const controller = new AbortController()
    const abort = () => controller.abort()
    if (options.signal?.aborted) controller.abort()
    else options.signal?.addEventListener("abort", abort, { once: true })
    const deadline = setTimeout(() => controller.abort(), foregroundDeadlineMs)
    // A stream nobody reads never reaches onFinish; free the slot regardless.
    const leaseSafety = setTimeout(
      () => lease.release(),
      foregroundDeadlineMs + 15_000,
    )
    // A dropped connection does not stop the turn: its draft writes and reply
    // are saved for the reconnecting client. Only an explicit Stop cancels it.
    deps.activeRuns.set(begun.run.id, controller)
    let resolveFinish: (value: {
      usage?: LanguageModelUsage
      steps: number
    }) => void
    const finished = new Promise<{ usage?: LanguageModelUsage; steps: number }>(
      (resolve) => {
        resolveFinish = resolve
      },
    )
    let failed = false
    const streamFailed = (error: unknown) => {
      failed = true
      console.error("[assistant] turn failed", {
        runId: begun.run.id,
        name: error instanceof Error ? error.name : "unknown",
      })
      return STREAM_FAILURE_MESSAGE
    }

    let settle: (result: GeneralTurnCompletion) => void = () => {}
    const completion = new Promise<GeneralTurnCompletion>((resolve) => {
      settle = resolve
    })
    const stream = createUIMessageStream<SetupUIMessage>({
      originalMessages: history,
      generateId: newAssistantMessageId,
      execute: async ({ writer }) => {
        writer.write({
          type: "data-setup-run",
          data: {
            runId: begun.run.id,
            remainingRequests: budget.remainingRequests,
          },
          transient: true,
        })
        const setupTools = createSetupAssistantTools({
          productOnly: productMode,
          productSeed: productSnapshot?.form,
          context: business,
          sourceMessageId: body.message.id,
          knownAttachments: knownAttachments(sentAttachments),
          authorize: async () =>
            !controller.signal.aborted &&
            (await repository.isActorStillAuthorized(conversation.id)) &&
            (!productMode ||
              (await repository.readRun(begun.run.id))?.status === "RUNNING") &&
            !controller.signal.aborted,
          readDraft: () => repository.readDraftEntities(draftId),
          readAreaMarks: productMode
            ? undefined
            : () => repository.readAreaMarks(draftId),
          markArea: productMode
            ? undefined
            : (area, mark) => repository.markArea(draftId, area, mark),
          writeEntities: (entities) =>
            repository.writeDraftEntities(
              draftId,
              entities,
              productMode ? begun.run.id : undefined,
            ),
          removeEntities: (keys) =>
            repository.removeDraftEntities(draftId, keys),
          onDraftChanged: (change) =>
            writer.write({
              type: "data-setup-draft",
              data: change,
              transient: true,
            }),
        })
        const tools = productMode
          ? {
              setup_get_context: setupTools.setup_get_context,
              setup_search_quick_setups: setupTools.setup_search_quick_setups,
              setup_search_categories: setupTools.setup_search_categories,
              setup_draft_upsert_items: setupTools.setup_draft_upsert_items,
            }
          : setupTools
        const agent = new ToolLoopAgent({
          model: model.model,
          instructions:
            (productMode
              ? productAssistantInstructions(business)
              : buildSetupAssistantInstructions(business)) +
            (options.channel === "whatsapp"
              ? whatsAppPresentationInstructions() +
                whatsAppCollectionInstructions()
              : ""),
          tools,
          stopWhen: stepCountIs(8),
          maxOutputTokens: 2_000,
          maxRetries: 1,
          providerOptions: model.providerOptions as never,
          onFinish: (event) =>
            resolveFinish({
              usage: event.totalUsage,
              steps: event.steps.length,
            }),
        })
        const result = await agent.stream({
          messages: modelMessages,
          abortSignal: controller.signal,
        })
        writer.merge(
          result.toUIMessageStream({
            sendReasoning: false,
            // The model's own stream reports provider errors; its default
            // would send the provider's message to the browser.
            onError: (error) => streamFailed(error),
          }),
        )
      },
      onError: (error) => streamFailed(error),
      onFinish: async ({ responseMessage, isAborted }) => {
        clearTimeout(deadline)
        try {
          const outcome = await Promise.race([
            finished,
            new Promise<{ usage?: LanguageModelUsage; steps: number }>(
              (resolve) => setTimeout(() => resolve({ steps: 0 }), 2_000),
            ),
          ])
          const parts = persistableParts(responseMessage)
          await repository.completeRun({
            runId: begun.run.id,
            tenantId: scope.tenantId,
            actorUserId: scope.userId,
            provider: model.provider,
            model: model.modelId,
            status: failed || isAborted ? "FAILED" : "COMPLETED",
            errorCode: failed
              ? "STREAM_FAILED"
              : isAborted
                ? "ABORTED"
                : undefined,
            usage: usageRecord(outcome.usage),
            stepCount: outcome.steps,
            durationMs: Date.now() - startedAt,
            budgetScopeKey,
            assistantMessage:
              parts.length > 0
                ? {
                    id: responseMessage.id,
                    role: "assistant",
                    parts: parts as unknown as AssistantStoredMessage["parts"],
                  }
                : undefined,
          })
          const [saved, messages] = await Promise.all([
            repository.readRun(begun.run.id),
            repository.listMessages(conversation.id, { limit: 1 }),
          ])
          const message = messages.find(
            (entry) =>
              entry.id === responseMessage.id && entry.role === "assistant",
          )
          settle({
            runId: begun.run.id,
            status: saved?.status === "COMPLETED" ? "COMPLETED" : "FAILED",
            persisted: Boolean(
              saved && saved.status !== "RUNNING" && (!parts.length || message),
            ),
            assistantMessageId: message?.id ?? null,
            ...(saved?.errorCode ? { errorCode: saved.errorCode } : {}),
          })
        } catch (error) {
          console.error("[assistant] run finalization failed", {
            runId: begun.run.id,
            name: error instanceof Error ? error.name : "unknown",
          })
          settle({
            runId: begun.run.id,
            status: "FAILED",
            persisted: false,
            assistantMessageId: null,
            errorCode: "FINALIZATION_FAILED",
          })
        } finally {
          clearTimeout(leaseSafety)
          options.signal?.removeEventListener("abort", abort)
          deps.activeRuns.delete(begun.run.id)
          lease.release()
        }
      },
    })
    streaming = true
    return { runId: begun.run.id, stream, completion }
  } finally {
    if (!streaming) lease.release()
  }
}
const BUDGET_EXHAUSTED_MESSAGE =
  "You've used this business's setup assistant allowance. Your setup list is still here to review and finish."

/** What the owner sees when a turn fails; provider details stay server-side. */
const STREAM_FAILURE_MESSAGE =
  "Something went wrong. Your setup list is safe, please try again."
