import { createHash } from "node:crypto"
import {
  type GeneralReviewPresentation,
  type SimpleSale,
  generalMoney,
  generalReviewPresentationSchema,
  normalizedSaleName,
  similarSaleNames,
  simpleSaleQuestions,
  simpleSaleStep,
} from "@ewatrade/assistant/general/contracts"
import { listAssistantAttachments } from "@ewatrade/db/assistant-attachments"
import {
  createCustomerInTransaction,
  createFinanceMoneyAccountInTransaction,
  listOrderPaymentAccounts,
  lockCommerceFinancialContext,
} from "@ewatrade/db/queries"
import { catalogFreeLineDescriptionError } from "@ewatrade/utils/catalog-free-lines"
import { TRPCError } from "@trpc/server"
import { assertFinanceAccess } from "../trpc/finance-procedure"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import {
  assertGeneralAction,
  assertGeneralCompositeDependency,
  requireGeneralScope,
} from "./general-context"
import { orderAttachmentAdd } from "./general-order-attachment"
import {
  createReviewedNewBook,
  isReviewedNewBookDefault,
} from "./general-reviewed-new-book"
import { proposalDigest } from "./proposal-security"

const currency = (ctx: GeneralTransactionContext) =>
  ctx.tenantContext.activeStore?.currencyCode ??
  ctx.tenantContext.tenant.currencyCode
const refuse = (message: string): never => {
  throw new TRPCError({ code: "BAD_REQUEST", message })
}
export async function simpleSaleOptions(
  ctx: GeneralTransactionContext,
  sale: SimpleSale,
) {
  const scope = requireGeneralScope(ctx)
  const accounts = await listOrderPaymentAccounts(ctx.db, {
    tenantId: scope.tenantId,
    currencyCode: currency(ctx),
  })
  // Search terms reduce directory reads; fuzzy spelling is checked in the bounded result.
  const words = sale.customerName?.trim().split(/\s+/).filter(Boolean) ?? []
  const customers = words.length
    ? await ctx.db.customer.findMany({
        where: {
          tenantId: scope.tenantId,
          OR: words.map((word) => ({
            name: {
              contains: word.slice(0, Math.max(2, word.length - 2)),
              mode: "insensitive" as const,
            },
          })),
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
        take: 100,
      })
    : []
  let matches = similarSaleNames(sale.customerName ?? "", customers)
  if (words.length && !matches.length) {
    // Try close spellings even when the first letters differed from the prefix search.
    const nearby = await ctx.db.customer.findMany({
      where: { tenantId: scope.tenantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 100,
    })
    matches = similarSaleNames(sale.customerName ?? "", nearby)
  }
  return { ...accounts, customers: matches }
}
async function current(ctx: GeneralTransactionContext, sale: SimpleSale) {
  const scope = requireGeneralScope(ctx)
  assertGeneralCompositeDependency(ctx, "sale_record", "order_create")
  assertGeneralCompositeDependency(ctx, "sale_record", "payment_record")
  const options = await simpleSaleOptions(ctx, sale)
  const account = options.accounts.find((row) => row.id === sale.moneyAccountId)
  if (
    sale.moneyAccountId &&
    (!account ||
      account.paused ||
      !account.paymentMethods.includes(sale.method))
  )
    refuse("Choose an available account for this payment.")
  if (sale.createAccount) assertFinanceAccess(ctx.tenantContext)
  if (
    sale.createAccount &&
    !sale.moneyAccountId &&
    options.accounts.some(
      (row) =>
        normalizedSaleName(row.name) ===
        normalizedSaleName(sale.accountName ?? ""),
    )
  )
    refuse("That account now exists. Choose it and review again.")
  if (!options.book) {
    assertFinanceAccess(ctx.tenantContext)
    if (currency(ctx) !== ctx.tenantContext.tenant.currencyCode)
      refuse("Set up a Finance book in this Store's currency first.")
  }
  const customer = sale.customerId
    ? await ctx.db.customer.findFirst({
        where: { id: sale.customerId, tenantId: scope.tenantId },
        select: { id: true, name: true },
      })
    : null
  if (sale.customerId && !customer)
    refuse("Choose a customer from this business.")
  if (sale.customerChoice === "new") assertGeneralAction(ctx, "customer_create")
  const files = await listAssistantAttachments(
    ctx.db,
    scope,
    sale.attachmentIds,
  )
  if (
    files.length !== sale.attachmentIds.length ||
    files.some(
      (file) =>
        !file.messageId ||
        file.status !== "READY" ||
        file.kind !== "IMAGE" ||
        !file.storagePath ||
        file.retentionUntil.getTime() <= Date.now(),
    )
  )
    refuse(
      "That image is no longer available. Attach it again or remove it from the draft.",
    )
  const total =
    sale.totalMinor ?? (!sale.partial ? sale.receivedMinor : undefined)
  if (
    sale.receivedMinor !== undefined &&
    total !== undefined &&
    sale.receivedMinor > total
  )
    refuse("The amount paid cannot exceed the sale total.")
  const target = {
    id: scope.storeId,
    revision: proposalDigest({
      book: options.book?.id ?? null,
      account: account ?? null,
      customer,
      files: files.map((file) => ({ id: file.id, digest: file.contentDigest })),
    }),
  }
  return { scope, options, account, customer, total, target }
}
export async function validateSaleAttachmentConversation(
  ctx: GeneralTransactionContext,
  sale: SimpleSale,
  conversationId: string,
) {
  const files = await listAssistantAttachments(
    ctx.db,
    requireGeneralScope(ctx),
    sale.attachmentIds,
  )
  if (files.some((file) => file.conversationId !== conversationId))
    refuse("Use an image sent in this chat.")
}
/** The authorized amount-first sale review, including staged bookkeeping effects. */
export function simpleSaleReviewPresentation(
  sale: SimpleSale,
  facts: {
    businessName: string
    storeName: string
    currencyCode: string
    timezone: string
    hasBook: boolean
    accountName?: string
    customerName?: string
    total?: number
  },
): GeneralReviewPresentation | undefined {
  if (
    simpleSaleStep(sale) !== "review" ||
    sale.receivedMinor === undefined ||
    facts.total === undefined ||
    !facts.timezone ||
    !(facts.accountName ?? sale.accountName)
  )
    return undefined
  const presentation: GeneralReviewPresentation = {
    summary: {
      party: facts.customerName ?? sale.customerName ?? "Walk-in",
      context: "Record an amount-first sale and payment already received.",
      amount: generalMoney(facts.total, facts.currencyCode),
      amountLabel: "Sale total",
    },
    facts: [
      { label: "Currency", value: facts.currencyCode },
      { label: "Recorded at", value: "Time of confirmation" },
      { label: "Book timezone", value: facts.timezone },
    ],
    sections: [
      {
        title: "Sale details",
        rows: [
          {
            label: "Book",
            value: `${facts.businessName} · ${facts.currencyCode}`,
            detail: facts.hasBook
              ? "Existing Book"
              : "Create Book when confirmed; bookkeeping starts at confirmation",
          },
          { label: "Store", value: facts.storeName },
          {
            label: "Customer",
            value: facts.customerName ?? sale.customerName ?? "Walk-in",
            detail:
              sale.customerChoice === "new"
                ? "Create saved customer when confirmed"
                : sale.customerId
                  ? "Existing saved customer"
                  : "Walk-in; no saved customer created",
          },
          {
            label: "Receiving account",
            value: facts.accountName ?? sale.accountName ?? "",
            detail: sale.createAccount
              ? "Create account when confirmed"
              : "Existing account",
          },
          {
            label: "Payment method",
            value: sale.method === "cash" ? "Cash" : "Bank transfer",
          },
          {
            label: "Received",
            value: generalMoney(sale.receivedMinor, facts.currencyCode),
          },
          {
            label: "Total",
            value: generalMoney(facts.total, facts.currencyCode),
          },
          {
            label: "Remaining",
            value: generalMoney(
              facts.total - sale.receivedMinor,
              facts.currencyCode,
            ),
          },
        ],
        ...(sale.description ? { note: sale.description } : {}),
      },
    ],
    note: "Bookkeeping only: records an existing sale and payment. No inventory or catalog stock is changed. This does not charge a customer or move money between bank accounts.",
  }
  const parsed = generalReviewPresentationSchema.safeParse(presentation)
  return parsed.success ? parsed.data : undefined
}
export const simpleSaleRecord = {
  stale: "The sale details changed. Review the draft again.",
  unavailable:
    "Check the sale's account, customer and image, then save the draft again.",
  async prepare(ctx, input) {
    let sale = input
    if (!sale.customerName && !sale.customerId && !sale.customerChoice)
      sale = { ...sale, customerChoice: "walk_in" }
    const options = await simpleSaleOptions(ctx, sale)
    if (sale.moneyAccountId) {
      const selected = options.accounts.find(
        (account) => account.id === sale.moneyAccountId,
      )
      if (selected)
        sale = { ...sale, accountName: selected.name, createAccount: false }
    }
    if (sale.customerId) {
      const selected = await ctx.db.customer.findFirst({
        where: {
          id: sale.customerId,
          tenantId: requireGeneralScope(ctx).tenantId,
        },
        select: { name: true },
      })
      if (selected) sale = { ...sale, customerName: selected.name }
    }
    if (!options.book && sale.accountName?.toLowerCase() === "cash")
      return {
        ...sale,
        accountName: "Shop cash",
        method: "cash",
        createAccount: true,
      }
    // "cash" is the payment destination, even when the single drawer is named Shop cash.
    if (sale.accountName?.toLowerCase() === "cash") {
      const drawers = options.accounts.filter(
        (account) =>
          account.purpose === "CASH" &&
          !account.paused &&
          account.paymentMethods.includes("cash"),
      )
      if (drawers.length === 1 && drawers[0])
        return {
          ...sale,
          moneyAccountId: drawers[0].id,
          accountName: drawers[0].name,
          createAccount: false,
          method: "cash",
        }
    }
    const exact = sale.accountName
      ? options.accounts.find(
          (row) =>
            normalizedSaleName(row.name) ===
            normalizedSaleName(sale.accountName ?? ""),
        )
      : null
    if (exact)
      return {
        ...sale,
        moneyAccountId: exact.id,
        accountName: exact.name,
        createAccount: false,
        method: exact.purpose === "CASH" ? "cash" : "bank_transfer",
      }
    if (
      sale.accountName &&
      !sale.moneyAccountId &&
      !similarSaleNames(sale.accountName, options.accounts).length
    )
      return { ...sale, createAccount: true }
    return sale
  },
  async validate(ctx, sale, lock) {
    if (lock && simpleSaleStep(sale) !== "review")
      refuse(
        simpleSaleStep(sale) === "description"
          ? (catalogFreeLineDescriptionError({
              kind: "quick_sale",
              description: sale.description,
            }) ?? simpleSaleQuestions.description)
          : "Finish the account, customer, amounts and description before saving.",
      )
    return (await current(ctx, sale)).target
  },
  async review(ctx, sale) {
    const info = await current(ctx, sale)
    const step = simpleSaleStep(sale)
    const book = info.options.book
      ? await ctx.db.financeBook.findFirst({
          where: { id: info.options.book.id, tenantId: info.scope.tenantId },
          select: { timezone: true },
        })
      : null
    if (info.options.book && !book) refuse("Review the Finance Book again.")
    const choices =
      step === "account"
        ? (sale.accountName
            ? similarSaleNames(sale.accountName, info.options.accounts)
            : info.options.accounts
          )
            .filter(
              (account) =>
                !account.paused &&
                account.paymentMethods.some(
                  (method) => method === "cash" || method === "bank_transfer",
                ),
            )
            .slice(0, 8)
            .map((account) => ({
              label: account.name,
              text: `Use account: ${account.id}`,
            }))
        : step === "customer"
          ? info.options.customers.map((customer) => ({
              label: customer.name,
              text: `Use customer: ${customer.id}`,
            }))
          : []
    if (step === "account" && !info.options.book && !sale.accountName)
      choices.push({ label: "Cash", text: "Cash" })
    if (step === "account" && sale.accountName)
      choices.push({
        label: `Create ${sale.accountName}`,
        text: "Create this account",
      })
    if (step === "customer") {
      if (sale.customerName)
        choices.push({
          label: `New customer: ${sale.customerName}`,
          text: "New customer",
        })
      choices.push({ label: "Walk-in", text: "Walk-in" })
    }
    if (step === "review" && !sale.customerName && !sale.customerId)
      choices.push({ label: "Customer (Walk-in)", text: "Change customer" })
    return {
      target: info.target,
      question: simpleSaleQuestions[step],
      choices,
      presentation: simpleSaleReviewPresentation(sale, {
        businessName: ctx.tenantContext.tenant.name,
        storeName: ctx.tenantContext.activeStore?.name ?? "",
        currencyCode: currency(ctx),
        timezone: book?.timezone ?? ctx.tenantContext.tenant.timezone,
        hasBook: Boolean(info.options.book),
        accountName: info.account?.name,
        customerName: info.customer?.name,
        total: info.total,
      }),
      lines: [
        `Account: ${info.account?.name ?? (sale.createAccount ? `${sale.accountName} (new)` : "Pending")}`,
        `Customer: ${info.customer?.name ?? (sale.customerChoice === "walk_in" ? "Walk-in" : sale.customerName ? `${sale.customerName}${sale.customerChoice === "new" ? " (new)" : " (choose a match or new customer)"}` : "Walk-in")}`,
        `Received: ${sale.receivedMinor === undefined ? "Pending" : generalMoney(sale.receivedMinor, currency(ctx))}`,
        `Total: ${info.total === undefined ? "Pending" : generalMoney(info.total, currency(ctx))}`,
        `Remaining: ${info.total === undefined || sale.receivedMinor === undefined ? "Pending" : generalMoney(info.total - sale.receivedMinor, currency(ctx))}`,
        ...(sale.attachmentIds.length
          ? ["Image attached to order activity; not analysed."]
          : []),
        ...(sale.description ? [sale.description] : []),
      ],
    }
  },
  async execute(ctx, sale, key) {
    if (simpleSaleStep(sale) !== "review")
      refuse(
        simpleSaleStep(sale) === "description"
          ? (catalogFreeLineDescriptionError({
              kind: "quick_sale",
              description: sale.description,
            }) ?? simpleSaleQuestions.description)
          : "Finish the sale details first.",
      )
    const info = await current(ctx, sale)
    if (
      sale.moneyAccountId &&
      !sale.customerId &&
      sale.customerChoice === "new"
    ) {
      // Match canonical/offline Book-before-Customer ordering, after the
      // current scope/account/authority checks and before the Tenant FK write.
      const context = await lockCommerceFinancialContext(ctx.db, {
        tenantId: info.scope.tenantId,
        currencyCode: currency(ctx),
        customerId: null,
      })
      if (!context || context.bookId !== info.options.book?.id)
        refuse("The Finance Book changed. Review the sale again.")
    }
    let moneyAccountId = sale.moneyAccountId
    if (!moneyAccountId) {
      assertFinanceAccess(ctx.tenantContext)
      const actor = {
        tenantId: info.scope.tenantId,
        actorUserId: info.scope.userId,
      }
      const book =
        info.options.book ??
        (await createReviewedNewBook(ctx, actor, new Date()))
      // Lock the book and recheck names: concurrent creation must not duplicate it.
      await ctx.db
        .$queryRaw`SELECT id FROM "FinanceBook" WHERE id = ${book.id} FOR UPDATE`
      const accounts = await listOrderPaymentAccounts(ctx.db, {
        tenantId: info.scope.tenantId,
        currencyCode: currency(ctx),
      })
      const existing = accounts.accounts.find(
        (account) =>
          normalizedSaleName(account.name) ===
          normalizedSaleName(sale.accountName ?? ""),
      )
      if (
        existing &&
        (info.options.book ||
          existing.paused ||
          !existing.paymentMethods.includes(sale.method) ||
          !(await isReviewedNewBookDefault(ctx, {
            bookId: book.id,
            accountId: existing.id,
            purpose: sale.method === "cash" ? "CASH" : "BANK",
          })))
      )
        refuse("That account now exists. Choose it and review again.")
      moneyAccountId =
        existing?.id ??
        (
          await createFinanceMoneyAccountInTransaction(ctx.db, {
            ...actor,
            bookId: book.id,
            code: `CHAT_${createHash("sha256")
              .update(normalizedSaleName(sale.accountName ?? ""))
              .digest("hex")
              .slice(0, 20)}`,
            name: sale.accountName ?? refuse("Choose an account name."),
            purpose: sale.method === "cash" ? "CASH" : "BANK",
          })
        ).id
    }
    const customerId =
      sale.customerId ??
      (sale.customerChoice === "new"
        ? (
            await createCustomerInTransaction(ctx.db, {
              tenantId: info.scope.tenantId,
              name: sale.customerName ?? refuse("Choose a customer name."),
            })
          ).id
        : undefined)
    const payload = {
      action: "order_create" as const,
      customerId,
      lines: [
        {
          custom: "quick_sale" as const,
          amountMinor: info.total ?? refuse("Enter the sale total."),
          ...(sale.description ? { description: sale.description } : {}),
        },
      ],
      initialPayment: {
        amountMinor: sale.receivedMinor ?? refuse("Enter the amount received."),
        moneyAccountId,
        method: sale.method,
      },
    }
    const { executeSimpleSaleOrder } = await import("./general-actions")
    const receipt = await executeSimpleSaleOrder(ctx, payload, key)
    if (receipt.kind !== "order")
      return refuse("The sale did not produce an order.")
    for (const attachmentId of sale.attachmentIds)
      await orderAttachmentAdd.execute(
        ctx,
        {
          action: "order_attachment_add",
          orderId: receipt.recordId,
          attachmentId,
        },
        `${key}:image:${attachmentId}`,
      )
    return { ...receipt, title: "Sale saved" }
  },
} satisfies GeneralActionAdapter<SimpleSale>
