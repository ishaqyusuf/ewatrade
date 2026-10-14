import { createHash } from "node:crypto"
import {
  type SimpleTransfer,
  generalMoney,
  normalizedSaleName,
  similarSaleNames,
  simpleTransferStep,
} from "@ewatrade/assistant/general/contracts"
import { listAssistantAttachments } from "@ewatrade/db/assistant-attachments"
import {
  assertFinancePostingDate,
  createFinanceMoneyAccountInTransaction,
  getFinanceMoneyMovementReview,
  recordFinanceMoneyMovementInTransaction,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import { assertFinanceAccess } from "../trpc/finance-procedure"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"
import { proposalDigest } from "./proposal-security"
const refuse = (message: string): never => {
  throw new TRPCError({ code: "BAD_REQUEST", message })
}
export async function simpleTransferOptions(ctx: GeneralTransactionContext) {
  assertFinanceAccess(ctx.tenantContext)
  const scope = requireGeneralScope(ctx)
  const book = await ctx.db.financeBook.findUnique({
    where: {
      tenantId_currencyCode: {
        tenantId: scope.tenantId,
        currencyCode: ctx.tenantContext.tenant.currencyCode,
      },
    },
    select: {
      id: true,
      currencyCode: true,
      startsAt: true,
      closedThrough: true,
    },
  })
  if (!book) refuse("Set up Finance first.")
  const accounts = await ctx.db.financeAccount.findMany({
    where: {
      bookId: book.id,
      kind: "ASSET",
      purpose: { in: ["CASH", "BANK", "CLEARING"] },
      archivedAt: null,
    },
    select: { id: true, name: true, purpose: true },
    orderBy: { code: "asc" },
    take: 200,
  })
  return {
    book,
    bookId: book.id,
    currencyCode: book.currencyCode,
    startsAt: book.startsAt,
    closedThrough: book.closedThrough,
    accounts,
  }
}
const movement = (
  ctx: GeneralTransactionContext,
  input: SimpleTransfer,
  toId: string,
) => ({
  tenantId: requireGeneralScope(ctx).tenantId,
  actorUserId: requireGeneralScope(ctx).userId,
  storeId: requireGeneralScope(ctx).storeId,
  bookId: input.bookId ?? refuse("Review the Finance Book again."),
  accountId: input.fromMoneyAccountId ?? refuse("Choose a source account."),
  destinationAccountId: toId,
  kind: "TRANSFER" as const,
  amountMinor: String(input.amountMinor),
  description: input.note || "Money moved",
  effectiveAt: new Date(
    input.effectiveAt ?? refuse("Review the posting date."),
  ),
})
async function current(ctx: GeneralTransactionContext, input: SimpleTransfer) {
  const scope = requireGeneralScope(ctx)
  const options = await simpleTransferOptions(ctx)
  if (input.bookId && input.bookId !== options.bookId)
    refuse("Choose accounts from this business.")
  const from = options.accounts.find((a) => a.id === input.fromMoneyAccountId)
  const to = options.accounts.find((a) => a.id === input.toMoneyAccountId)
  if ((input.fromMoneyAccountId && !from) || (input.toMoneyAccountId && !to))
    refuse("Choose an active account from this business.")
  if (from && to && from.id === to.id)
    refuse("Choose a different destination account.")
  const newAccount = input.newToAccount
  if (newAccount) {
    if (
      input.toMoneyAccountId ||
      normalizedSaleName(newAccount.name) !==
        normalizedSaleName(input.toAccountName ?? "")
    )
      refuse("Review the destination account again.")
    if (
      options.accounts.some(
        (a) =>
          normalizedSaleName(a.name) === normalizedSaleName(newAccount.name),
      )
    )
      refuse("That destination now exists. Choose it and review again.")
  }
  if (input.effectiveAt)
    assertFinancePostingDate({
      effectiveAt: new Date(input.effectiveAt),
      startsAt: options.startsAt,
      closedThrough: options.closedThrough,
      now: new Date(),
    })
  const files = await listAssistantAttachments(
    ctx.db,
    scope,
    input.attachmentIds,
  )
  if (
    files.length !== input.attachmentIds.length ||
    files.some(
      (f) =>
        !f.messageId ||
        f.kind !== "IMAGE" ||
        f.status !== "READY" ||
        !f.storagePath ||
        f.retentionUntil.getTime() <= Date.now(),
    )
  )
    refuse("Attach that image again or remove it.")
  const review =
    simpleTransferStep(input) === "review" && to
      ? await getFinanceMoneyMovementReview(ctx.db, movement(ctx, input, to.id))
      : null
  return {
    scope,
    options,
    from,
    to,
    target: {
      id: options.bookId,
      revision: proposalDigest({
        options,
        from,
        to,
        review,
        files: files.map((f) => ({ id: f.id, digest: f.contentDigest })),
      }),
    },
  }
}
export async function validateTransferAttachmentConversation(
  ctx: GeneralTransactionContext,
  input: SimpleTransfer,
  conversationId: string,
) {
  const files = await listAssistantAttachments(
    ctx.db,
    requireGeneralScope(ctx),
    input.attachmentIds,
  )
  if (files.some((f) => f.conversationId !== conversationId))
    refuse("Use an image sent in this chat.")
}
export const simpleTransferRecord = {
  stale: "The accounts or posting period changed. Review again.",
  unavailable: "Check the amount and accounts, then review again.",
  async prepare(ctx, input) {
    const options = await simpleTransferOptions(ctx)
    let draft = {
      ...input,
      bookId: options.bookId,
      effectiveAt: input.effectiveAt ?? new Date().toISOString(),
    }
    if (new Date(draft.effectiveAt) < options.startsAt) {
      if (
        draft.effectiveAt.slice(0, 10) ===
        options.startsAt.toISOString().slice(0, 10)
      )
        draft.effectiveAt = options.startsAt.toISOString()
      else refuse("Choose a date on or after bookkeeping started.")
    }
    for (const side of ["from", "to"] as const) {
      const nameKey = side === "from" ? "fromAccountName" : "toAccountName"
      const idKey = side === "from" ? "fromMoneyAccountId" : "toMoneyAccountId"
      if (draft[idKey] && !options.accounts.some((a) => a.id === draft[idKey]))
        refuse("Choose an active account from this business.")
      const exact = draft[idKey]
        ? options.accounts.find((a) => a.id === draft[idKey])
        : options.accounts.find(
            (a) =>
              normalizedSaleName(a.name) ===
              normalizedSaleName(draft[nameKey] ?? ""),
          )
      const cash =
        normalizedSaleName(draft[nameKey] ?? "") === "cash"
          ? options.accounts.filter((a) => a.purpose === "CASH")
          : []
      const matched = exact ?? (cash.length === 1 ? cash[0] : undefined)
      if (matched) {
        draft = { ...draft, [idKey]: matched.id, [nameKey]: matched.name }
        if (side === "to") draft.newToAccount = undefined
      } else if (
        side === "to" &&
        draft.toAccountName &&
        !similarSaleNames(draft.toAccountName, options.accounts).length &&
        !draft.newToAccount
      )
        draft.newToAccount = {
          name: draft.toAccountName,
          kind: /\bcash\b/i.test(draft.toAccountName) ? "CASH" : "BANK",
        }
    }
    return draft
  },
  async validate(ctx, input, lock) {
    if (lock && simpleTransferStep(input) !== "review")
      refuse("Enter the amount and both accounts first.")
    return (await current(ctx, input)).target
  },
  async review(ctx, input) {
    const info = await current(ctx, input)
    const step = simpleTransferStep(input)
    const name = step === "from" ? input.fromAccountName : input.toAccountName
    const all = info.options.accounts.filter(
      (a) => step !== "to" || a.id !== input.fromMoneyAccountId,
    )
    const close = name ? similarSaleNames(name, all) : all
    const choices = (
      step === "from" || step === "to" ? (close.length ? close : all) : []
    )
      .slice(0, 8)
      .map((a) => ({ label: a.name, text: `Use ${step} account: ${a.id}` }))
    if (step === "to" && input.toAccountName)
      choices.push({
        label: `Create ${input.toAccountName}`,
        text: "Create destination account",
      })
    return {
      target: info.target,
      question:
        step === "amount"
          ? "How much?"
          : step === "from"
            ? "From which account?"
            : step === "to"
              ? "To which account?"
              : undefined,
      choices,
      lines: [
        input.amountMinor === undefined
          ? "Amount pending"
          : `${generalMoney(input.amountMinor, info.options.currencyCode)} from ${input.fromAccountName ?? "an account"} to ${input.toAccountName ?? "an account"}${input.newToAccount ? " (new account)" : ""}`,
        "Today · by you",
        ...(input.note ? [input.note] : []),
      ],
    }
  },
  async execute(ctx, input, key) {
    if (simpleTransferStep(input) !== "review")
      refuse("Enter the amount and both accounts first.")
    const info = await current(ctx, input)
    let toId = input.toMoneyAccountId
    if (!toId) {
      const newAccount =
        input.newToAccount ?? refuse("Choose a destination account.")
      await ctx.db
        .$queryRaw`SELECT id FROM "FinanceBook" WHERE id = ${info.options.bookId} FOR UPDATE`
      const options = await simpleTransferOptions(ctx)
      if (
        options.accounts.some(
          (a) =>
            normalizedSaleName(a.name) === normalizedSaleName(newAccount.name),
        )
      )
        refuse("That destination now exists. Review again.")
      toId = (
        await createFinanceMoneyAccountInTransaction(ctx.db, {
          tenantId: info.scope.tenantId,
          actorUserId: info.scope.userId,
          bookId: info.options.bookId,
          code: `CHAT_${createHash("sha256").update(normalizedSaleName(newAccount.name)).digest("hex").slice(0, 20)}`,
          name: newAccount.name,
          purpose: newAccount.kind,
        })
      ).id
    }
    const result = await recordFinanceMoneyMovementInTransaction(ctx.db, {
      ...movement(ctx, input, toId),
      clientCommandId: key,
    })
    return {
      kind: "finance_movement" as const,
      recordId: result.entryId,
      bookId: info.options.bookId,
      title: "Transfer recorded",
      detail: `${generalMoney(input.amountMinor ?? 0, info.options.currencyCode)} from ${input.fromAccountName} to ${input.toAccountName}.`,
    }
  },
} satisfies GeneralActionAdapter<SimpleTransfer>
