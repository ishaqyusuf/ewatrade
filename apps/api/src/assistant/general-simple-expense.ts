import {
  type SimpleExpense,
  generalMoney,
  normalizedSaleName,
  similarSaleNames,
  simpleExpenseStep,
} from "@ewatrade/assistant/general/contracts"
import { listAssistantAttachments } from "@ewatrade/db/assistant-attachments"
import {
  type FinanceExpenseInput,
  getFinanceExpenseReview,
  recordFinanceExpenseInTransaction,
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
export async function simpleExpenseOptions(ctx: GeneralTransactionContext) {
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
  if (!book) return { book: null, accounts: [], categories: [] }
  const rows = await ctx.db.financeAccount.findMany({
    where: {
      bookId: book.id,
      archivedAt: null,
      purpose: { in: ["CASH", "BANK", "CLEARING", "OPERATING_EXPENSE"] },
    },
    select: { id: true, name: true, purpose: true, kind: true, code: true },
    orderBy: { code: "asc" },
    take: 200,
  })
  return {
    book,
    accounts: rows.filter((a) =>
      ["CASH", "BANK", "CLEARING"].includes(a.purpose),
    ),
    categories: rows.filter(
      (a) => a.purpose === "OPERATING_EXPENSE" && a.kind === "EXPENSE",
    ),
  }
}
async function photos(
  ctx: GeneralTransactionContext,
  input: SimpleExpense,
  conversationId?: string,
) {
  const files = await listAssistantAttachments(
    ctx.db,
    requireGeneralScope(ctx),
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
        f.retentionUntil.getTime() <= Date.now() ||
        (conversationId !== undefined && f.conversationId !== conversationId),
    )
  )
    refuse("Attach that image again or remove it.")
  return files.map((f) => ({ id: f.id, digest: f.contentDigest }))
}
export async function validateExpenseAttachmentConversation(
  ctx: GeneralTransactionContext,
  input: SimpleExpense,
  conversationId: string,
) {
  await photos(ctx, input, conversationId)
}
function canonical(
  ctx: GeneralTransactionContext,
  input: SimpleExpense,
): Omit<FinanceExpenseInput, "clientCommandId"> {
  const scope = requireGeneralScope(ctx)
  if (simpleExpenseStep(input) !== "review")
    refuse("Complete the expense details first.")
  const amount = String(input.amountMinor)
  const date = new Date(input.effectiveAt ?? new Date().toISOString())
  return {
    tenantId: scope.tenantId,
    actorUserId: scope.userId,
    storeId: scope.storeId,
    bookId: input.bookId ?? refuse("Set up Finance first."),
    payeeName: input.payeeName || "Not specified",
    description: input.description ?? refuse("What was it for?"),
    incurredAt: date,
    lines: [
      {
        accountId: input.expenseCategoryId ?? refuse("Which category?"),
        description: input.description ?? "Expense",
        amountMinor: amount,
      },
    ],
    ...(input.paid
      ? {
          payment: {
            funding: "BUSINESS_ACCOUNT" as const,
            accountId: input.moneyAccountId ?? refuse("Which account?"),
            amountMinor: amount,
            effectiveAt: date,
          },
        }
      : {}),
  }
}
async function current(ctx: GeneralTransactionContext, input: SimpleExpense) {
  const scope = requireGeneralScope(ctx)
  const options = await simpleExpenseOptions(ctx)
  if (input.bookId && input.bookId !== options.book?.id)
    refuse("Use this business's Finance Book.")
  const account = options.accounts.find((a) => a.id === input.moneyAccountId)
  const category = options.categories.find(
    (a) => a.id === input.expenseCategoryId,
  )
  if (input.moneyAccountId && !account)
    refuse("Choose an account from this business.")
  if (input.expenseCategoryId && !category)
    refuse("Choose an active expense category from this business.")
  const files = await photos(ctx, input)
  const review =
    simpleExpenseStep(input) === "review"
      ? await getFinanceExpenseReview(ctx.db, canonical(ctx, input))
      : null
  return {
    options,
    account,
    category,
    review,
    target: {
      id: options.book?.id ?? scope.tenantId,
      revision: proposalDigest({
        book: options.book,
        account: input.paid ? account : null,
        category,
        review,
        files,
      }),
    },
  }
}
export const simpleExpenseRecord = {
  stale: "The expense or account changed. Review it again.",
  unavailable: "Check the expense details and review again.",
  async prepare(ctx, input) {
    const options = await simpleExpenseOptions(ctx)
    let draft = {
      ...input,
      effectiveAt: input.effectiveAt ?? new Date().toISOString(),
    }
    if (input.bookId && input.bookId !== options.book?.id)
      refuse("Use this business's Finance Book.")
    if (options.book) {
      draft.bookId = options.book.id
      const date = new Date(draft.effectiveAt)
      const start = options.book.startsAt
      if (date < start) {
        if (
          date.toISOString().slice(0, 10) === start.toISOString().slice(0, 10)
        )
          draft.effectiveAt = start.toISOString()
        else
          refuse(
            `Bookkeeping starts on ${start.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}.`,
          )
      }
    }
    if (draft.paid === false) {
      draft.moneyAccountId = undefined
      draft.accountName = undefined
    } else {
      const exact = draft.moneyAccountId
        ? options.accounts.find((a) => a.id === draft.moneyAccountId)
        : options.accounts.find(
            (a) =>
              normalizedSaleName(a.name) ===
              normalizedSaleName(draft.accountName ?? ""),
          )
      const cash =
        draft.accountName?.toLowerCase() === "cash"
          ? options.accounts.filter((a) => a.purpose === "CASH")
          : []
      const account = exact ?? (cash.length === 1 ? cash[0] : undefined)
      if (account)
        draft = {
          ...draft,
          moneyAccountId: account.id,
          accountName: account.name,
        }
    }
    const category = draft.expenseCategoryId
      ? options.categories.find((a) => a.id === draft.expenseCategoryId)
      : draft.categoryName
        ? options.categories.find(
            (a) =>
              normalizedSaleName(a.name) ===
              normalizedSaleName(draft.categoryName ?? ""),
          )
        : (options.categories.find(
            (a) =>
              normalizedSaleName(a.name) ===
              normalizedSaleName(draft.description ?? ""),
          ) ?? options.categories.find((a) => a.code === "6000"))
    if (category)
      draft = {
        ...draft,
        expenseCategoryId: category.id,
        categoryName: category.name,
      }
    return draft
  },
  async validate(ctx, input, lock) {
    if (lock && simpleExpenseStep(input) !== "review")
      refuse("Complete the expense details first.")
    return (await current(ctx, input)).target
  },
  async review(ctx, input) {
    const info = await current(ctx, input)
    const step = simpleExpenseStep(input)
    const similarAccounts = input.accountName
      ? similarSaleNames(input.accountName, info.options.accounts)
      : []
    const accountChoices = similarAccounts.length
      ? similarAccounts
      : info.options.accounts
    const choices =
      step === "paid"
        ? [
            { label: "Paid", text: "Already paid" },
            { label: "Not paid yet", text: "Unpaid" },
          ]
        : step === "account"
          ? accountChoices.slice(0, 8).map((a) => ({
              label: a.name,
              text: `Use expense account: ${a.id}`,
            }))
          : step === "category"
            ? info.options.categories.slice(0, 8).map((a) => ({
                label: a.name,
                text: `Use expense category: ${a.id}`,
              }))
            : []
    return {
      target: info.target,
      question:
        step === "amount"
          ? "How much?"
          : step === "description"
            ? "What was it for?"
            : step === "paid"
              ? "Was this already paid?"
              : step === "account"
                ? "Which account did it come from?"
                : step === "category"
                  ? info.options.book
                    ? "Which category?"
                    : "Set up Finance first."
                  : undefined,
      choices,
      lines: [
        `${input.amountMinor === undefined ? "Amount pending" : generalMoney(input.amountMinor, info.options.book?.currencyCode ?? ctx.tenantContext.tenant.currencyCode)} on ${input.description ?? "an expense"}`,
        input.paid === false
          ? "Unpaid"
          : `Paid from ${info.account?.name ?? input.accountName ?? "an account"}`,
        `Category: ${info.category?.name ?? input.categoryName ?? "pending"}`,
      ],
    }
  },
  async execute(ctx, input, key) {
    await current(ctx, input)
    const result = await recordFinanceExpenseInTransaction(ctx.db, {
      ...canonical(ctx, input),
      clientCommandId: key,
    })
    return {
      kind: "finance_bill" as const,
      recordId: result.id,
      bookId: input.bookId ?? refuse("Set up Finance first."),
      title: "Expense recorded",
      detail: `${generalMoney(input.amountMinor ?? 0, ctx.tenantContext.tenant.currencyCode)} on ${input.description}${input.paid ? ` from ${input.accountName}` : " (unpaid)"}.`,
    }
  },
} satisfies GeneralActionAdapter<SimpleExpense>
