import {
  generalMoney,
  isSimpleTransferIntent,
  normalizedSaleName,
  simpleTransferAction,
  simpleTransferStep,
  transferFactsFromText,
} from "@ewatrade/assistant/general/contracts"
import { generalProposalWhere } from "@ewatrade/db/assistant-general"
import { isLinkedAssistantIdentity } from "./channel-principal"
import type { GeneralContext } from "./general-context"
import { assertGeneralAction, requireGeneralScope } from "./general-context"
import {
  decideGeneralProposal,
  draftGeneralProposal,
  editGeneralProposal,
  generalProposalForApp,
} from "./general-proposals"
import { simpleTransferOptions } from "./general-simple-transfer"
import { proposalDigest } from "./proposal-security"
type Message = { id: string; role: string; parts: unknown }
export async function handleSimpleTransferChat(
  ctx: GeneralContext,
  input: {
    conversationId: string
    messageId: string
    text: string
    imageIds: string[]
    history: Message[]
    choice?: { proposalId: string; revision: number; text: string }
  },
) {
  const text = input.choice?.text ?? input.text.trim()
  // A channel confirmation must identify an exact delivered review outside this draft helper.
  if (
    isLinkedAssistantIdentity(ctx.session) &&
    /^(?:proceed|confirm|cancel|yes|go ahead|done|save(?: it| sale)?)[.!]*$/i.test(
      text.trim(),
    )
  )
    return null
  if (!text && !input.imageIds.length) return null
  const scope = requireGeneralScope(ctx)
  const intent = isSimpleTransferIntent(text)
  const proceeding = /^(?:proceed|confirm|go ahead|save|yes)[.!]?$/i.test(text)
  const latest = await ctx.db.assistantActionProposal.findFirst({
    where: {
      ...generalProposalWhere(scope),
      conversationId: input.conversationId,
      ...(input.choice ? { action: "money_transfer_simple" } : {}),
      status: { in: proceeding ? ["PENDING", "COMPLETED"] : ["PENDING"] },
      ...(!proceeding ? { expiresAt: { gt: new Date() } } : {}),
      ...(input.choice
        ? { id: input.choice.proposalId, revision: input.choice.revision }
        : {}),
    },
    orderBy: { createdAt: "desc" },
  })
  if (
    proceeding &&
    latest?.action === "money_transfer_simple" &&
    latest.status === "COMPLETED"
  )
    return { text: "Already recorded.", proposalId: latest.id }
  const pending =
    latest?.action === "money_transfer_simple" && latest.status === "PENDING"
      ? latest
      : null
  if (input.choice && !pending) return null // another action's pills are handled by its own flow
  if (!intent && !pending) return null
  if (
    !intent &&
    /\b(?:sale|order|loan|refund|expense|spent|fees?|charges?|conversion|exchange|opening balance|put .* into|stock|inventory)\b/i.test(
      text,
    )
  )
    return null
  assertGeneralAction(ctx, "money_transfer_simple")
  if (
    pending &&
    /^(?:proceed|confirm|go ahead|save|yes|cancel)[.!]?$/i.test(text)
  ) {
    const draft = simpleTransferAction.parse(pending.payload)
    if (!/^cancel/i.test(text) && simpleTransferStep(draft) !== "review")
      return {
        text:
          simpleTransferStep(draft) === "amount"
            ? "How much?"
            : simpleTransferStep(draft) === "from"
              ? "Which account is it moving from?"
              : "Which account is it going to?",
        proposalId: pending.id,
      }
    const app = generalProposalForApp(pending)
    if (isLinkedAssistantIdentity(ctx.session)) return null
    const saved = await decideGeneralProposal(ctx, {
      proposalId: pending.id,
      revision: pending.revision,
      decision: /^cancel/i.test(text) ? "cancel" : "confirm",
      approvalToken: app.approvalToken,
    })
    return {
      text:
        saved.status === "CANCELLED"
          ? "Cancelled."
          : `Recorded ${generalMoney(draft.amountMinor ?? 0, ctx.tenantContext.tenant.currencyCode)} from ${draft.fromAccountName} to ${draft.toAccountName}.`,
      proposalId: pending.id,
    }
  }
  let draft = simpleTransferAction.parse(
    pending?.payload ?? {
      action: "money_transfer_simple",
      attachmentIds: input.imageIds,
    },
  )
  const previous = [...input.history]
    .reverse()
    .find((m) => m.role === "user" && m.id !== input.messageId)
  if (
    !pending &&
    !input.imageIds.length &&
    Array.isArray(previous?.parts) &&
    !previous.parts.some((p) => p?.type === "text" && p.text?.trim())
  )
    draft.attachmentIds = previous.parts.flatMap((p) =>
      p?.type === "data-setup-attachment" && p.data?.kind === "IMAGE"
        ? [p.data.attachmentId]
        : [],
    )
  if (input.imageIds.length)
    draft.attachmentIds = [
      ...new Set([...draft.attachmentIds, ...input.imageIds]),
    ]
  const step = simpleTransferStep(draft)
  const facts = transferFactsFromText(text)
  for (const side of ["from", "to"] as const) {
    const nameKey = side === "from" ? "fromAccountName" : "toAccountName"
    const idKey = side === "from" ? "fromMoneyAccountId" : "toMoneyAccountId"
    if (
      facts[nameKey] &&
      normalizedSaleName(facts[nameKey]) !==
        normalizedSaleName(draft[nameKey] ?? "")
    ) {
      draft[idKey] = undefined
      if (side === "to") draft.newToAccount = undefined
    }
  }
  draft = { ...draft, ...facts }
  if (/^(?:remove|clear)(?: the)? (?:image|photo|receipt)s?$/i.test(text))
    draft.attachmentIds = []
  const picked = text.match(/^Use (from|to) account:\s*(\S+)$/i)
  if (picked) {
    const options = await simpleTransferOptions(ctx)
    const account = options.accounts.find((a) => a.id === picked[2])
    if (!account) throw Error("Choose an account from this business.")
    if (picked[1] === "from")
      draft = {
        ...draft,
        fromMoneyAccountId: account.id,
        fromAccountName: account.name,
      }
    else
      draft = {
        ...draft,
        toMoneyAccountId: account.id,
        toAccountName: account.name,
        newToAccount: undefined,
      }
  } else if (
    /^Create destination account$/i.test(text) &&
    draft.toAccountName
  ) {
    draft.toMoneyAccountId = undefined
    draft.newToAccount = {
      name: draft.toAccountName,
      kind: /\bcash\b/i.test(draft.toAccountName) ? "CASH" : "BANK",
    }
  } else if (
    !intent &&
    Object.keys(facts).length === 0 &&
    (step === "from" || step === "to") &&
    /^[\p{L}][\p{L}\p{N} .’'-]{0,199}$/u.test(text)
  ) {
    if (step === "from")
      draft = { ...draft, fromAccountName: text, fromMoneyAccountId: undefined }
    else
      draft = {
        ...draft,
        toAccountName: text,
        toMoneyAccountId: undefined,
        newToAccount: undefined,
      }
  } else if (step === "amount" && facts.amountMinor === undefined) {
    const amount = transferFactsFromText(`amount ${text}`).amountMinor
    if (amount !== undefined) draft.amountMinor = amount
  } else if (
    pending &&
    !intent &&
    !input.imageIds.length &&
    Object.keys(facts).length === 0 &&
    !/^(?:remove|clear)(?: the)? (?:image|photo|receipt)s?$/i.test(text)
  )
    return null
  if (/\b(?:yesterday|tomorrow|last week)\b/i.test(text) && !facts.effectiveAt)
    return null
  const result = pending
    ? await editGeneralProposal(ctx, {
        proposalId: pending.id,
        revision: pending.revision,
        payload: draft,
      })
    : await draftGeneralProposal(ctx, input.conversationId, draft)
  const proposalId = "proposalId" in result ? result.proposalId : result.id
  const prepared = simpleTransferAction.parse(result.payload)
  const next = simpleTransferStep(prepared)
  return {
    text:
      next === "amount"
        ? "How much?"
        : next === "from"
          ? "Which account is it moving from?"
          : next === "to"
            ? "Which account is it going to?"
            : `Record ${generalMoney(prepared.amountMinor ?? 0, ctx.tenantContext.tenant.currencyCode)} from ${prepared.fromAccountName} to ${prepared.toAccountName}${prepared.newToAccount ? " (new account)" : ""}. Proceed or change anything?`,
    proposalId,
    proposalSource: {
      proposalId,
      revision: result.revision,
      payloadHash: proposalDigest(result.payload),
    },
  }
}
