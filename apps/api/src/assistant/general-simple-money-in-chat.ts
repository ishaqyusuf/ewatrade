import {
  generalMoney,
  isNonSaleMoneyIntent,
  isSimpleMoneyInIntent,
  moneyInFactsFromText,
  normalizedSaleName,
  simpleMoneyInAction,
  simpleMoneyInStep,
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
import { moneyInOptions } from "./general-simple-money-in"
import { proposalDigest } from "./proposal-security"
type Message = { id: string; role: string; parts: unknown }
export async function handleSimpleMoneyInChat(
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
  if (!text) return null
  const scope = requireGeneralScope(ctx)
  const intent = isSimpleMoneyInIntent(text)
  const proceeding = /^(?:proceed|confirm|go ahead|save|yes)[.!]?$/i.test(text)
  const latest = await ctx.db.assistantActionProposal.findFirst({
    where: {
      ...generalProposalWhere(scope),
      conversationId: input.conversationId,
      ...(input.choice ? { action: "money_in_record" } : {}),
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
    latest?.action === "money_in_record" &&
    latest.status === "COMPLETED"
  )
    return { text: "Already recorded.", proposalId: latest.id }
  const pending =
    latest?.action === "money_in_record" && latest.status === "PENDING"
      ? latest
      : null
  if (input.choice && !pending) return null // another action's pills are handled by its own flow
  if (!intent && !pending) return null
  if (
    !intent &&
    pending &&
    (/\b(?:customer deposit|loan|borrow|refund|expense|opening balance|transfer)\b/i.test(
      text,
    ) ||
      (/\b(?:sale|order)\b/i.test(text) && !isNonSaleMoneyIntent(text)))
  )
    return null
  assertGeneralAction(ctx, "money_in_record")
  if (
    pending &&
    /^(?:proceed|confirm|go ahead|save|yes|cancel)[.!]?$/i.test(text)
  ) {
    const draft = simpleMoneyInAction.parse(pending.payload)
    if (!/^cancel/i.test(text) && simpleMoneyInStep(draft) !== "review")
      return {
        text:
          simpleMoneyInStep(draft) === "amount"
            ? "How much?"
            : "Which account?",
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
          : `Recorded ${generalMoney(draft.amountMinor ?? 0, ctx.tenantContext.tenant.currencyCode)} into ${draft.accountName}.`,
      proposalId: pending.id,
    }
  }
  let draft = simpleMoneyInAction.parse(
    pending?.payload ?? {
      action: "money_in_record",
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
  const step = simpleMoneyInStep(draft)
  const facts = moneyInFactsFromText(text)
  if (
    facts.accountName &&
    normalizedSaleName(facts.accountName) !==
      normalizedSaleName(draft.accountName ?? "")
  ) {
    draft.moneyAccountId = undefined
    draft.createAccount = false
  }
  draft = { ...draft, ...facts }
  if (/^(?:remove|clear)(?: the)? (?:image|photo|receipt)s?$/i.test(text))
    draft.attachmentIds = []
  const accountId = text.match(/^Use account:\s*(\S+)$/i)?.[1]
  if (accountId) {
    const options = await moneyInOptions(ctx)
    const account = options.accounts.find((a) => a.id === accountId)
    if (!account) throw Error("Choose an account from this business.")
    draft = {
      ...draft,
      moneyAccountId: account.id,
      accountName: account.name,
      createAccount: false,
    }
  } else if (/^Create this account$/i.test(text) && draft.accountName)
    draft.createAccount = true
  else if (
    !intent &&
    !facts.accountName &&
    !facts.amountMinor &&
    step === "account" &&
    /^[\p{L}][\p{L}\p{N} .’'-]{0,199}$/u.test(text)
  )
    draft = {
      ...draft,
      accountName: text,
      moneyAccountId: undefined,
      createAccount: false,
    }
  else if (step === "amount" && !facts.amountMinor) {
    const amount = moneyInFactsFromText(`amount ${text}`).amountMinor
    if (amount !== undefined) draft.amountMinor = amount
  }
  if (
    pending &&
    !intent &&
    !accountId &&
    !/^Create this account$/i.test(text) &&
    Object.keys(facts).length === 0 &&
    step !== "account" &&
    step !== "amount" &&
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
  const prepared = simpleMoneyInAction.parse(result.payload)
  const next = simpleMoneyInStep(prepared)
  return {
    text:
      next === "amount"
        ? "How much?"
        : next === "account"
          ? "Which account?"
          : `Record ${generalMoney(prepared.amountMinor ?? 0, ctx.tenantContext.tenant.currencyCode)} into ${prepared.accountName}${prepared.createAccount ? " (new account)" : ""}. Proceed or change anything?`,
    proposalId,
    proposalSource: {
      proposalId,
      revision: result.revision,
      payloadHash: proposalDigest(result.payload),
    },
  }
}
