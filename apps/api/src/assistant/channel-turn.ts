import type { WhatsAppTurnResult } from "@ewatrade/assistant/channels/worker"
import {
  assistantWhatsAppPilotUserIds,
  readAssistantWhatsAppConfig,
} from "@ewatrade/communications"
import { prisma } from "@ewatrade/db"
import {
  AssistantWhatsAppError,
  claimAssistantWhatsAppInbox,
  nextAssistantWhatsAppInbox,
  processAssistantWhatsAppControl,
  recoverAssistantWhatsAppInboxRun,
  retryAssistantWhatsAppInbox,
  settleAssistantWhatsAppInbox,
  settleAssistantWhatsAppNotice,
} from "@ewatrade/db/assistant-whatsapp"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { processAssistantWhatsAppAction } from "./channel-action-turn"
import { prepareAssistantWhatsAppMediaTurn } from "./channel-media-turn"
import { createLinkedAssistantContext } from "./channel-principal"
import { prepareAssistantWhatsAppReview } from "./channel-review-staging"
import {
  createAssistantWhatsAppWorkflowReceiptContext,
  processAssistantWhatsAppWorkflowAction,
} from "./channel-workflow-action-turn"
import { prepareAssistantWhatsAppWorkflowReview } from "./channel-workflow-review-staging"
import { createChannelWorkflowTurn } from "./channel-workflow-turn"
import type { GeneralContext } from "./general-context"
import { createGeneralAssistantTurn } from "./general-turn"
import { GeneralTurnError } from "./general-turn-contract"
import type { GeneralTurnInput } from "./general-turn-contract"
import { WorkflowTurnError } from "./workflow-turn-contract"

const textContent = z
  .object({
    type: z.literal("text"),
    text: z.string().min(1).max(8000),
    replyToMessageId: z.string().optional(),
  })
  .strict()
export function defaultChannelTurnDependencies() {
  return {
    enabled: () => Boolean(readAssistantWhatsAppConfig()),
    control: (id: string) =>
      processAssistantWhatsAppControl(
        prisma,
        id,
        assistantWhatsAppPilotUserIds(),
      ),
    claim: (id: string) =>
      claimAssistantWhatsAppInbox(prisma, id, assistantWhatsAppPilotUserIds()),
    recover: (lease: Parameters<typeof recoverAssistantWhatsAppInboxRun>[1]) =>
      recoverAssistantWhatsAppInboxRun(prisma, lease),
    context: (
      principal: Parameters<typeof createLinkedAssistantContext>[1],
      requestId: string,
      lease: Parameters<typeof recoverAssistantWhatsAppInboxRun>[1],
    ) =>
      createLinkedAssistantContext(prisma, principal, requestId, lease).catch(
        async (error: unknown) => {
          try {
            return await createAssistantWhatsAppWorkflowReceiptContext(
              prisma,
              principal,
              lease,
            )
          } catch {
            throw error
          }
        },
      ),
    createTurn: createGeneralAssistantTurn,
    createWorkflowTurn: createChannelWorkflowTurn,
    prepareMedia: prepareAssistantWhatsAppMediaTurn,
    notice: (
      principal: Parameters<typeof createLinkedAssistantContext>[1],
      lease: Parameters<typeof settleAssistantWhatsAppInbox>[1],
      code: Parameters<typeof settleAssistantWhatsAppNotice>[1]["code"],
    ) => settleAssistantWhatsAppNotice(prisma, { principal, lease, code }),
    action: processAssistantWhatsAppAction,
    workflowAction: processAssistantWhatsAppWorkflowAction,
    settle: (
      lease: Parameters<typeof settleAssistantWhatsAppInbox>[1],
      errorCode?: string,
    ) =>
      (async () => {
        const review = errorCode
          ? undefined
          : await prepareAssistantWhatsAppReview(prisma, lease).catch(
              () => undefined,
            )
        const workflowReview = errorCode
          ? undefined
          : await prepareAssistantWhatsAppWorkflowReview(prisma, lease).catch(
              () => undefined,
            )
        return settleAssistantWhatsAppInbox(prisma, lease, {
          permittedUserIds: readAssistantWhatsAppConfig()
            ? assistantWhatsAppPilotUserIds()
            : [],
          errorCode,
          review,
          workflowReview,
        })
      })(),
    retry: (lease: Parameters<typeof retryAssistantWhatsAppInbox>[1]) =>
      retryAssistantWhatsAppInbox(prisma, lease),
    next: (bindingId: string) => nextAssistantWhatsAppInbox(prisma, bindingId),
  }
}
export type ChannelTurnDependencies = Omit<
  ReturnType<typeof defaultChannelTurnDependencies>,
  | "control"
  | "action"
  | "workflowAction"
  | "createWorkflowTurn"
  | "notice"
  | "prepareMedia"
> & {
  control?: ReturnType<typeof defaultChannelTurnDependencies>["control"]
  action?: ReturnType<typeof defaultChannelTurnDependencies>["action"]
  workflowAction?: ReturnType<
    typeof defaultChannelTurnDependencies
  >["workflowAction"]
  createWorkflowTurn?: ReturnType<
    typeof defaultChannelTurnDependencies
  >["createWorkflowTurn"]
  notice?: ReturnType<typeof defaultChannelTurnDependencies>["notice"]
  prepareMedia?: ReturnType<
    typeof defaultChannelTurnDependencies
  >["prepareMedia"]
}

/** Internal worker operation. Service auth never substitutes for current linked merchant authority. */
export async function processAssistantChannelTurn(
  ingressId: string,
  deps: ChannelTurnDependencies = defaultChannelTurnDependencies(),
): Promise<WhatsAppTurnResult> {
  if (!deps.enabled()) return { status: "disabled" }
  const control = await deps.control?.(ingressId)
  if (control) return control
  const claim = await deps.claim(ingressId)
  const next = async () => {
    const bindingId =
      claim.kind === "claimed" ? claim.lease.bindingId : claim.bindingId
    const row = bindingId ? await deps.next(bindingId) : null
    return row && row.id !== ingressId ? { nextIngressId: row.id } : {}
  }
  if (claim.kind !== "claimed")
    return {
      status: claim.kind,
      ...(claim.kind === "busy" ? {} : await next()),
    }
  const finish = async (errorCode?: string): Promise<WhatsAppTurnResult> => {
    const settled = await deps.settle(claim.lease, errorCode)
    return {
      status: !settled
        ? "busy"
        : settled.state === "COMPLETED"
          ? "completed"
          : settled.state === "CANCELLED"
            ? "cancelled"
            : "failed",
      ...(settled ? await next() : {}),
    }
  }
  if (claim.inbox.kind === "ACTION") {
    if (claim.purpose === "GENERAL" ? !deps.action : !deps.workflowAction) {
      await deps.retry(claim.lease)
      return { status: "retry" }
    }
    try {
      const ctx = await deps.context(
        claim.principal,
        claim.inbox.requestId,
        claim.lease,
      )
      const result =
        claim.purpose !== "GENERAL" && deps.workflowAction
          ? await deps.workflowAction(ctx, claim.lease)
          : deps.action
            ? await deps.action(ctx as GeneralContext, claim.lease)
            : undefined
      if (!result) throw Error("Channel action unavailable")
      return { status: result.status, ...(await next()) }
    } catch {
      // The action transaction rolled back or outcome is unresolved; only its
      // own durable proof/result can recover. Never start a model turn here.
      await deps.retry(claim.lease)
      return { status: "retry" }
    }
  }
  // Reloading the exact actor/request/conversation recovers a crash after canonical commit.
  const prior = await deps.recover(claim.lease)
  if (prior) {
    if (prior.status === "RUNNING") return { status: "busy" }
    return finish(
      prior.status === "COMPLETED" && prior.assistantMessageId
        ? undefined
        : (prior.errorCode ?? "TURN_FAILED"),
    )
  }
  const parsed = textContent.safeParse(claim.inbox.content)
  try {
    const ctx = await deps.context(
      claim.principal,
      claim.inbox.requestId,
      claim.lease,
    )
    let parts: GeneralTurnInput["message"]["parts"] = parsed.success
      ? [{ type: "text", text: parsed.data.text }]
      : []
    if (!parsed.success && deps.prepareMedia) {
      const prepared = await deps.prepareMedia(
        ctx as GeneralContext,
        claim.lease,
        claim.inbox,
      )
      if (prepared.kind === "completed")
        return { status: "completed", ...(await next()) }
      if (prepared.kind === "retry") return { status: "retry" }
      if (prepared.kind === "input") parts = prepared.parts
    }
    if (!parts.length) return finish("BAD_REQUEST")
    const input = {
      conversationId: claim.conversationId,
      requestId: claim.inbox.requestId,
      message: {
        id: claim.inbox.userMessageId,
        role: "user" as const,
        parts,
      },
    }
    const turn =
      claim.purpose === "GENERAL"
        ? await deps.createTurn(ctx as GeneralContext, input)
        : deps.createWorkflowTurn
          ? await deps.createWorkflowTurn(ctx as GeneralContext, input)
          : undefined
    if (!turn) return finish("WORKFLOW_NOT_READY")
    // Drain locally. No SSE delta/tool output/private text crosses the job HTTP boundary.
    const reader = turn.stream.getReader()
    try {
      while (!(await reader.read()).done) {
        /* Finalize canonical state before returning. */
      }
    } finally {
      reader.releaseLock()
    }
    const result = await turn.completion
    return await finish(
      result.status === "COMPLETED" &&
        result.persisted &&
        result.assistantMessageId
        ? undefined
        : (result.errorCode ?? "FINALIZATION_FAILED"),
    )
  } catch (error) {
    if (error instanceof WorkflowTurnError) {
      if (error.code === "WORKFLOW_NOT_READY" && deps.notice) {
        await deps.notice(claim.principal, claim.lease, "WORKFLOW_NOT_READY")
        return { status: "completed", ...(await next()) }
      }
      if (
        ["ASSISTANT_UNAVAILABLE", "REQUEST_IN_PROGRESS"].includes(error.code)
      ) {
        await deps.retry(claim.lease)
        return { status: "retry" }
      }
      return finish(error.code)
    }
    if (error instanceof AssistantWhatsAppError)
      return finish("AUTHORITY_CHANGED")
    if (
      (error instanceof GeneralTurnError &&
        error.code === "ASSISTANT_UNAVAILABLE") ||
      (error instanceof TRPCError && error.code === "CONFLICT")
    ) {
      await deps.retry(claim.lease)
      return { status: "retry" }
    }
    if (
      error instanceof GeneralTurnError &&
      error.code === "REQUEST_REPLAYED"
    ) {
      const saved = await deps.recover(claim.lease)
      if (saved?.status === "RUNNING") return { status: "busy" }
      return finish(
        saved?.status === "COMPLETED" && saved.assistantMessageId
          ? undefined
          : (saved?.errorCode ?? "TURN_FAILED"),
      )
    }
    if (
      (error instanceof GeneralTurnError &&
        ["BUDGET_EXHAUSTED", "NOT_FOUND", "BAD_REQUEST"].includes(
          error.code,
        )) ||
      (error instanceof TRPCError &&
        ["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND"].includes(error.code))
    )
      return finish(
        error instanceof GeneralTurnError ? error.code : "AUTHORITY_CHANGED",
      )
    // Unknown failures retain the lease. Recovery inspects the saved request before deciding anything.
    throw new Error("Assistant channel turn interrupted.")
  }
}
