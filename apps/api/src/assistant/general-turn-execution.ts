import { capabilityForAction } from "@ewatrade/assistant/capabilities/manifest"
import { whatsAppAssistantInstructions } from "@ewatrade/assistant/channels/instructions"
import { isPlainAccountBalanceRequest } from "@ewatrade/assistant/general/contracts"
import {
  generalInstructions,
  generalLocalNow,
} from "@ewatrade/assistant/general/prompt"
import type { listAssistantMessages } from "@ewatrade/db/assistant"
import type { listAssistantAttachments } from "@ewatrade/db/assistant-attachments"
import {
  type LanguageModelUsage,
  type ModelMessage,
  ToolLoopAgent,
  type UIMessageStreamWriter,
  stepCountIs,
} from "ai"
import { isLinkedAssistantIdentity } from "./channel-principal"
import { streamGeneralReply } from "./general-announced-action"
import { type GeneralContext, canUseCapability } from "./general-context"
import { generalProposalReferencePart } from "./general-persistence"
import { handleSimpleExpenseChat } from "./general-simple-expense-chat"
import { handleSimpleMoneyInChat } from "./general-simple-money-in-chat"
import { handleSimpleSaleChat } from "./general-simple-sale-chat"
import { handleSimpleTransferChat } from "./general-simple-transfer-chat"
import { createGeneralTools } from "./general-tools"
import type {
  GeneralTurnInput,
  GeneralUIMessage,
} from "./general-turn-contract"
import type { ResolvedAssistantModel } from "./model-resolution"

type GeneralTurnExecution = {
  ctx: GeneralContext
  body: GeneralTurnInput
  model: ResolvedAssistantModel
  conversationId: string
  runId: string
  budget: { remainingRequests: number }
  textParts: Array<{ type: "text"; text: string }>
  attachments: Awaited<ReturnType<typeof listAssistantAttachments>>
  stored: Awaited<ReturnType<typeof listAssistantMessages>>
  messages: ModelMessage[]
  writer: UIMessageStreamWriter<GeneralUIMessage>
  signal: AbortSignal
  onUsage: (usage: LanguageModelUsage, stepCount: number) => void
}

/** Reuses the same deterministic fast paths and model/tools across transports. */
export async function executeGeneralTurn({
  ctx,
  body,
  model,
  conversationId,
  runId,
  budget,
  textParts,
  attachments,
  stored,
  messages,
  writer,
  signal,
  onUsage,
}: GeneralTurnExecution) {
  writer.write({
    type: "data-general-run",
    data: {
      runId,
      remainingRequests: budget.remainingRequests,
    },
    transient: true,
  })
  const tools = createGeneralTools(
    ctx,
    conversationId,
    (proposalId, source) => {
      writer.write({
        type: "data-general-proposal",
        data: { proposalId },
        transient: true,
      })
      if (isLinkedAssistantIdentity(ctx.session)) {
        const reference = generalProposalReferencePart(proposalId, source)
        if (reference) writer.write(reference)
      }
    },
    (answer) => writer.write({ type: "data-general-answer", data: answer }),
  )
  const balanceRead = tools.readMoneyAccountBalances
  if (
    !body.saleChoice &&
    !attachments.length &&
    isPlainAccountBalanceRequest(
      textParts.map((part) => part.text).join("\n"),
    ) &&
    balanceRead?.execute
  ) {
    // Reuse the gated tool and its fresh authority checks, not a second balance reader.
    const result = await balanceRead.execute(
      {},
      { toolCallId: `balance_${runId}`, messages: [] },
    )
    const available =
      result &&
      typeof result === "object" &&
      "status" in result &&
      result.status === "available"
    writer.write({ type: "text-start", id: "balance-reply" })
    writer.write({
      type: "text-delta",
      id: "balance-reply",
      delta: available
        ? "Here are your recorded balances."
        : "Account balances are unavailable for your current access or setup.",
    })
    writer.write({ type: "text-end", id: "balance-reply" })
    return
  }
  const simpleInput = {
    conversationId,
    messageId: body.message.id,
    text: textParts.map((part) => part.text).join("\n"),
    choice: body.saleChoice,
    imageIds: attachments
      .filter((file) => file.kind === "IMAGE")
      .map((file) => file.id),
    history: stored,
  }
  const linked = isLinkedAssistantIdentity(ctx.session)
  const channelConfirmation =
    linked &&
    /^(?:proceed|confirm|cancel|yes|go ahead|done|save(?: it| sale)?)[.!]*$/i.test(
      simpleInput.text.trim(),
    )
  const handlers = [
    ["money_transfer_simple", handleSimpleTransferChat],
    ["expense_record_simple", handleSimpleExpenseChat],
    ["money_in_record", handleSimpleMoneyInChat],
    ["sale_record", handleSimpleSaleChat],
  ] as const
  for (const [action, handler] of handlers) {
    // Channel confirmations must be correlated to an exact server-issued review outside the model turn.
    if (
      linked &&
      (channelConfirmation ||
        !canUseCapability(ctx, capabilityForAction(action)))
    )
      continue
    const reply = await handler(ctx, simpleInput)
    if (!reply) continue
    if (reply.proposalId)
      writer.write({
        type: "data-general-proposal",
        data: { proposalId: reply.proposalId },
        transient: true,
      })
    if (linked && "proposalSource" in reply && reply.proposalSource) {
      const reference = generalProposalReferencePart(
        reply.proposalSource.proposalId,
        reply.proposalSource,
      )
      if (reference) writer.write(reference)
    }
    writer.write({ type: "text-start", id: "sale-reply" })
    writer.write({ type: "text-delta", id: "sale-reply", delta: reply.text })
    writer.write({ type: "text-end", id: "sale-reply" })
    return
  }
  const agent = new ToolLoopAgent({
    model: model.model,
    instructions:
      generalInstructions({
        businessName: ctx.tenantContext.tenant.name,
        storeName: ctx.tenantContext.activeStore?.name ?? "Store",
        currencyCode:
          ctx.tenantContext.activeStore?.currencyCode ??
          ctx.tenantContext.tenant.currencyCode,
        role: ctx.tenantContext.membership.role,
        ...generalLocalNow(ctx.tenantContext.tenant.timezone ?? "Africa/Lagos"),
      }) + (linked ? whatsAppAssistantInstructions() : ""),
    tools,
    stopWhen: stepCountIs(6),
    maxOutputTokens: 2000,
    maxRetries: 1,
    providerOptions: model.providerOptions as never,
    onFinish: (event) => {
      onUsage(event.totalUsage, event.steps.length)
    },
  })
  await streamGeneralReply(agent, messages, writer, signal)
}
