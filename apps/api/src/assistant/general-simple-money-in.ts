import { createHash } from "node:crypto"
import {
  type GeneralReviewPresentation,
  type SimpleMoneyIn,
  generalMoney,
  generalReviewPresentationSchema,
  normalizedSaleName,
  similarSaleNames,
  simpleMoneyInStep,
} from "@ewatrade/assistant/general/contracts"
import { listAssistantAttachments } from "@ewatrade/db/assistant-attachments"
import {
  createFinanceMoneyAccountInTransaction,
  listOrderPaymentAccounts,
  recordFinanceMoneyMovementInTransaction,
} from "@ewatrade/db/queries"
import { assertFinancePostingDate } from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { assertFinanceAccess } from "../trpc/finance-procedure"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { requireGeneralScope } from "./general-context"
import {
  createReviewedNewBook,
  isReviewedNewBookDefault,
} from "./general-reviewed-new-book"
import { proposalDigest } from "./proposal-security"
const refuse = (message: string): never => {
  throw new TRPCError({ code: "BAD_REQUEST", message })
}
export async function moneyInOptions(ctx: GeneralTransactionContext) {
  assertFinanceAccess(ctx.tenantContext)
  const result = await listOrderPaymentAccounts(ctx.db, {
    tenantId: requireGeneralScope(ctx).tenantId,
    currencyCode: ctx.tenantContext.tenant.currencyCode,
  })
  return { ...result, currencyCode: ctx.tenantContext.tenant.currencyCode }
}
async function current(ctx: GeneralTransactionContext, input: SimpleMoneyIn) {
  const scope = requireGeneralScope(ctx)
  const options = await moneyInOptions(ctx)
  const account = options.accounts.find(
    (row) => row.id === input.moneyAccountId,
  )
  if (input.moneyAccountId && !account)
    refuse("Choose an account from this business.")
  if (
    input.createAccount &&
    !input.moneyAccountId &&
    options.accounts.some(
      (row) =>
        normalizedSaleName(row.name) ===
        normalizedSaleName(input.accountName ?? ""),
    )
  )
    refuse("That account now exists. Choose it and review again.")
  const files = await listAssistantAttachments(
    ctx.db,
    scope,
    input.attachmentIds,
  )
  if (
    files.length !== input.attachmentIds.length ||
    files.some(
      (file) =>
        !file.messageId ||
        file.kind !== "IMAGE" ||
        file.status !== "READY" ||
        !file.storagePath ||
        file.retentionUntil.getTime() <= Date.now(),
    )
  )
    refuse("Attach that image again or remove it.")
  if (input.effectiveAt) {
    const book = options.book
      ? await ctx.db.financeBook.findFirst({
          where: { id: options.book.id, tenantId: scope.tenantId },
        })
      : null
    if (book)
      assertFinancePostingDate({
        effectiveAt: new Date(input.effectiveAt),
        startsAt: book.startsAt,
        closedThrough: book.closedThrough,
        now: new Date(),
      })
    else if (new Date(input.effectiveAt).getTime() > Date.now())
      refuse("Choose today or an earlier date.")
  }
  return {
    scope,
    options,
    account,
    target: {
      id: scope.tenantId,
      revision: proposalDigest({
        book: options.book?.id ?? null,
        account: account ?? null,
        files: files.map((file) => ({
          id: file.id,
          digest: file.contentDigest,
        })),
      }),
    },
  }
}
export async function validateMoneyInAttachmentConversation(
  ctx: GeneralTransactionContext,
  input: SimpleMoneyIn,
  conversationId: string,
) {
  const files = await listAssistantAttachments(
    ctx.db,
    requireGeneralScope(ctx),
    input.attachmentIds,
  )
  if (files.some((file) => file.conversationId !== conversationId))
    refuse("Use an image sent in this chat.")
}
/** Current Book and existing/staged destination facts, without inventing account identities. */
export function simpleMoneyInReviewPresentation(
  input: SimpleMoneyIn,
  facts: {
    businessName: string
    storeName: string
    currencyCode: string
    timezone: string
    existingBook: boolean
    account?: { name: string; purpose: string }
  },
): GeneralReviewPresentation | undefined {
  if (
    simpleMoneyInStep(input) !== "review" ||
    !input.effectiveAt ||
    !facts.timezone ||
    (!facts.account && !input.createAccount)
  )
    return undefined
  const presentation: GeneralReviewPresentation = {
    summary: {
      party: "Owner funds",
      context: "Record owner funds already received by the business.",
      amount: generalMoney(input.amountMinor ?? 0, facts.currencyCode),
      amountLabel: "Owner contribution",
    },
    facts: [
      { label: "Currency", value: facts.currencyCode },
      { label: "Effective at (UTC)", value: input.effectiveAt },
      { label: "Book timezone", value: facts.timezone },
      { label: "Funding", value: "Owner contribution · not sales income" },
    ],
    sections: [
      {
        title: "Money received details",
        rows: [
          {
            label: "Book",
            value: `${facts.businessName} · ${facts.currencyCode}`,
            detail: facts.existingBook
              ? "Existing Book"
              : `Create Book when recorded · bookkeeping starts ${input.effectiveAt} (UTC)`,
          },
          { label: "Store", value: facts.storeName },
          {
            label: "Destination account",
            value: facts.account?.name ?? input.accountName ?? "",
            detail: facts.account
              ? `Existing ${facts.account.purpose} account`
              : `Create ${/\bcash\b/i.test(input.accountName ?? "") ? "CASH" : "BANK"} account when recorded`,
          },
        ],
        note: `Description: ${input.description || "Money added"}`,
      },
    ],
    note: "Bookkeeping only: records money already received. Recording this does not collect or transfer money.",
  }
  const parsed = generalReviewPresentationSchema.safeParse(presentation)
  return parsed.success ? parsed.data : undefined
}
export const simpleMoneyInRecord = {
  stale: "The account changed. Review it again.",
  unavailable: "Check the account and amount, then review again.",
  async prepare(ctx, input) {
    let draft = {
      ...input,
      effectiveAt: input.effectiveAt ?? new Date().toISOString(),
    }
    const options = await moneyInOptions(ctx)
    if (options.book) {
      const book = await ctx.db.financeBook.findFirst({
        where: {
          id: options.book.id,
          tenantId: requireGeneralScope(ctx).tenantId,
        },
      })
      const effectiveAt = new Date(draft.effectiveAt)
      if (book && effectiveAt < book.startsAt) {
        if (
          effectiveAt.toISOString().slice(0, 10) ===
          book.startsAt.toISOString().slice(0, 10)
        )
          draft = { ...draft, effectiveAt: book.startsAt.toISOString() }
        else
          refuse(
            `Bookkeeping starts on ${book.startsAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}.`,
          )
      }
    }
    const exact = draft.moneyAccountId
      ? options.accounts.find((a) => a.id === draft.moneyAccountId)
      : options.accounts.find(
          (a) =>
            normalizedSaleName(a.name) ===
            normalizedSaleName(draft.accountName ?? ""),
        )
    if (exact)
      return {
        ...draft,
        moneyAccountId: exact.id,
        accountName: exact.name,
        createAccount: false,
      }
    if (draft.accountName?.toLowerCase() === "cash") {
      const cash = options.accounts.filter((a) => a.purpose === "CASH")
      if (cash.length === 1 && cash[0])
        return {
          ...draft,
          moneyAccountId: cash[0].id,
          accountName: cash[0].name,
          createAccount: false,
        }
      if (!options.book) draft = { ...draft, accountName: "Shop cash" }
    }
    if (
      draft.accountName &&
      !similarSaleNames(draft.accountName, options.accounts).length
    )
      draft = { ...draft, createAccount: true }
    return draft
  },
  async validate(ctx, input, lock) {
    if (lock && simpleMoneyInStep(input) !== "review")
      refuse("Enter the amount and account first.")
    return (await current(ctx, input)).target
  },
  async review(ctx, input) {
    const info = await current(ctx, input)
    const step = simpleMoneyInStep(input)
    const book = info.options.book
      ? await ctx.db.financeBook.findFirst({
          where: { id: info.options.book.id, tenantId: info.scope.tenantId },
          select: { timezone: true },
        })
      : null
    if (info.options.book && !book) refuse("Review the Finance Book again.")
    const timezone = book?.timezone ?? ctx.tenantContext.tenant.timezone
    const choices =
      step === "account"
        ? (input.accountName
            ? similarSaleNames(input.accountName, info.options.accounts)
            : info.options.accounts
          )
            .slice(0, 8)
            .map((a) => ({ label: a.name, text: `Use account: ${a.id}` }))
        : []
    if (step === "account" && input.accountName)
      choices.push({
        label: `Create ${input.accountName}`,
        text: "Create this account",
      })
    return {
      target: info.target,
      question:
        step === "amount"
          ? "How much?"
          : step === "account"
            ? "Which account?"
            : undefined,
      choices,
      lines: [
        input.amountMinor === undefined
          ? "Amount pending"
          : `${generalMoney(input.amountMinor, info.options.currencyCode)} into ${info.account?.name ?? input.accountName ?? "an account"}${input.createAccount ? " (new account)" : ""}`,
        `Owner funds · ${input.effectiveAt ? `${input.effectiveAt} (UTC) · ${timezone}` : "Posting date pending"} · recorded by you`,
        ...(input.description ? [input.description] : []),
      ],
      presentation: simpleMoneyInReviewPresentation(input, {
        businessName: ctx.tenantContext.tenant.name,
        storeName: ctx.tenantContext.activeStore?.name ?? "",
        currencyCode: info.options.currencyCode,
        timezone,
        existingBook: Boolean(book),
        account: info.account,
      }),
    }
  },
  async execute(ctx, input, key) {
    if (simpleMoneyInStep(input) !== "review")
      refuse("Enter the amount and account first.")
    const info = await current(ctx, input)
    const actor = {
      tenantId: info.scope.tenantId,
      actorUserId: info.scope.userId,
    }
    const effectiveAt = new Date(input.effectiveAt ?? new Date().toISOString())
    const book =
      info.options.book ??
      (await createReviewedNewBook(ctx, actor, effectiveAt))
    let accountId = input.moneyAccountId
    if (!accountId) {
      await ctx.db
        .$queryRaw`SELECT id FROM "FinanceBook" WHERE id = ${book.id} FOR UPDATE`
      const accounts = await moneyInOptions(ctx)
      const exact = accounts.accounts.find(
        (a) =>
          normalizedSaleName(a.name) ===
          normalizedSaleName(input.accountName ?? ""),
      )
      const purpose = /\bcash\b/i.test(input.accountName ?? "")
        ? "CASH"
        : "BANK"
      if (
        exact &&
        (info.options.book ||
          !(await isReviewedNewBookDefault(ctx, {
            bookId: book.id,
            accountId: exact.id,
            purpose,
          })))
      )
        refuse("That account now exists. Choose it and review again.")
      accountId =
        exact?.id ??
        (
          await createFinanceMoneyAccountInTransaction(ctx.db, {
            ...actor,
            bookId: book.id,
            code: `CHAT_${createHash("sha256")
              .update(normalizedSaleName(input.accountName ?? ""))
              .digest("hex")
              .slice(0, 20)}`,
            name: input.accountName ?? refuse("Name the account."),
            purpose,
          })
        ).id
    }
    const result = await recordFinanceMoneyMovementInTransaction(ctx.db, {
      ...actor,
      storeId: info.scope.storeId,
      bookId: book.id,
      accountId,
      kind: "OWNER_CONTRIBUTION",
      amountMinor: String(input.amountMinor),
      description: input.description || "Money added",
      effectiveAt,
      clientCommandId: key,
    })
    const receipt = z.object({ entryId: z.string().min(1) }).parse(result)
    return {
      kind: "finance_movement" as const,
      recordId: receipt.entryId,
      bookId: book.id,
      title: "Money recorded",
      detail: `${generalMoney(input.amountMinor ?? 0, info.options.currencyCode)} into ${input.accountName}.`,
    }
  },
} satisfies GeneralActionAdapter<SimpleMoneyIn>
