import {
  expenseFactsFromText,
  generalMoney,
  isSimpleExpenseIntent,
  normalizedSaleName,
  simpleExpenseAction,
  simpleExpenseStep,
} from "@ewatrade/assistant/general/contracts"
import { generalProposalWhere } from "@ewatrade/db/assistant-general"
import type { GeneralContext } from "./general-context"
import { assertGeneralAction, requireGeneralScope } from "./general-context"
import {
  decideGeneralProposal,
  draftGeneralProposal,
  editGeneralProposal,
  generalProposalForApp,
} from "./general-proposals"
import { simpleExpenseOptions } from "./general-simple-expense"
type Message = { id: string; role: string; parts: unknown }
export async function handleSimpleExpenseChat(
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
  const intent = isSimpleExpenseIntent(text)
  const proceeding = /^(?:proceed|confirm|go ahead|save|yes)[.!]?$/i.test(text)
  const scope = requireGeneralScope(ctx)
  const latest = await ctx.db.assistantActionProposal.findFirst({
    where: {
      ...generalProposalWhere(scope),
      conversationId: input.conversationId,
      status: { in: proceeding ? ["PENDING", "COMPLETED"] : ["PENDING"] },
      ...(!proceeding ? { expiresAt: { gt: new Date() } } : {}),
      ...(input.choice
        ? {
            action: "expense_record_simple",
            id: input.choice.proposalId,
            revision: input.choice.revision,
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
  })
  if (
    proceeding &&
    latest?.action === "expense_record_simple" &&
    latest.status === "COMPLETED"
  )
    return { text: "Already recorded.", proposalId: latest.id }
  const pending =
    latest?.action === "expense_record_simple" && latest.status === "PENDING"
      ? latest
      : null
  if (input.choice && !pending) return null
  if (!intent && !pending) return null
  if (!text && !input.imageIds.length) return null
  // Never turn a sale, money movement, inventory purchase or an existing bill payment into another expense.
  if (
    !intent &&
    /\b(?:sale|order|transfer|loan|refund|owner contribution|put .* into|drop .* into|add .* into|pay (?:the |this |an? )?bill|supplier invoice|stock receipt|inventory purchase|will spend|planning to|budget)\b/i.test(
      text,
    )
  )
    return null
  if (
    !intent &&
    /\b(?:expense|expenses|spent|partial|remaining|balance)\b/i.test(text)
  )
    return null
  assertGeneralAction(ctx, "expense_record_simple")
  if (
    pending &&
    /^(?:proceed|confirm|go ahead|save|yes|cancel)[.!]?$/i.test(text)
  ) {
    const draft = simpleExpenseAction.parse(pending.payload)
    const step = simpleExpenseStep(draft)
    if (!/^cancel/i.test(text) && step !== "review")
      return {
        text:
          step === "amount"
            ? "How much?"
            : step === "description"
              ? "What was it for?"
              : step === "paid"
                ? "Was this already paid?"
                : step === "account"
                  ? "Which account did it come from?"
                  : "Which category?",
        proposalId: pending.id,
      }
    const saved = await decideGeneralProposal(ctx, {
      proposalId: pending.id,
      revision: pending.revision,
      decision: /^cancel/i.test(text) ? "cancel" : "confirm",
      approvalToken: generalProposalForApp(pending).approvalToken,
    })
    return {
      text:
        saved.status === "CANCELLED"
          ? "Cancelled."
          : `Recorded ${generalMoney(draft.amountMinor ?? 0, ctx.tenantContext.tenant.currencyCode)} for ${draft.description}${draft.paid ? ` from ${draft.accountName}` : " as not paid yet"}.`,
      proposalId: pending.id,
    }
  }
  let draft = simpleExpenseAction.parse(
    pending?.payload ?? {
      action: "expense_record_simple",
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
  const step = simpleExpenseStep(draft)
  const facts = expenseFactsFromText(text)
  if (
    facts.accountName &&
    normalizedSaleName(facts.accountName) !==
      normalizedSaleName(draft.accountName ?? "")
  )
    draft.moneyAccountId = undefined
  if (
    facts.categoryName &&
    normalizedSaleName(facts.categoryName) !==
      normalizedSaleName(draft.categoryName ?? "")
  )
    draft.expenseCategoryId = undefined
  if (
    facts.description &&
    facts.description !== draft.description &&
    !facts.categoryName
  ) {
    draft.expenseCategoryId = undefined
    draft.categoryName = undefined
  }
  draft = { ...draft, ...facts }
  const remove = /^(?:remove|clear)(?: the)? (?:image|photo|receipt)s?$/i.test(
    text,
  )
  const accountId = text.match(/^Use expense account:\s*(\S+)$/i)?.[1]
  const categoryId = text.match(/^Use expense category:\s*(\S+)$/i)?.[1]
  if (accountId || categoryId) {
    const options = await simpleExpenseOptions(ctx)
    if (accountId) {
      const a = options.accounts.find((a) => a.id === accountId)
      if (!a) throw Error("Choose an account from this business.")
      draft = { ...draft, moneyAccountId: a.id, accountName: a.name }
    }
    if (categoryId) {
      const a = options.categories.find((a) => a.id === categoryId)
      if (!a) throw Error("Choose a category from this business.")
      draft = { ...draft, expenseCategoryId: a.id, categoryName: a.name }
    }
  } else if (
    !intent &&
    !remove &&
    Object.keys(facts).length === 0 &&
    /^[\p{L}][\p{L}\p{N} .’'-]{0,159}$/u.test(text)
  ) {
    if (step === "account")
      draft = { ...draft, accountName: text, moneyAccountId: undefined }
    else if (step === "description")
      draft = {
        ...draft,
        description: text,
        categoryName: undefined,
        expenseCategoryId: undefined,
      }
    else if (step === "category")
      draft = { ...draft, categoryName: text, expenseCategoryId: undefined }
    else return null
  }
  if (step === "amount" && facts.amountMinor === undefined) {
    const amount = expenseFactsFromText(`amount ${text}`).amountMinor
    if (amount !== undefined) draft.amountMinor = amount
  }
  if (remove) draft.attachmentIds = []
  if (
    pending &&
    !intent &&
    !accountId &&
    !categoryId &&
    !remove &&
    !input.imageIds.length &&
    Object.keys(facts).length === 0 &&
    step === "review"
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
  const prepared = simpleExpenseAction.parse(result.payload)
  const next = simpleExpenseStep(prepared)
  return {
    text:
      next === "amount"
        ? "How much?"
        : next === "description"
          ? "What was it for?"
          : next === "paid"
            ? "Was this already paid?"
            : next === "account"
              ? "Which account did it come from?"
              : next === "category"
                ? "Which category?"
                : `Record ${generalMoney(prepared.amountMinor ?? 0, ctx.tenantContext.tenant.currencyCode)} for ${prepared.description}${prepared.paid ? ` from ${prepared.accountName}` : " as not paid yet"}. Proceed or change anything?`,
    proposalId: result.proposalId,
  }
}
