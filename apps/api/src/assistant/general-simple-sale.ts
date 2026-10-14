import { createHash } from "node:crypto"
import {
  type SimpleSale,
  generalMoney,
  normalizedSaleName,
  similarSaleNames,
  simpleSaleQuestions,
  simpleSaleStep,
} from "@ewatrade/assistant/general/contracts"
import { listAssistantAttachments } from "@ewatrade/db/assistant-attachments"
import {
  createCustomerInTransaction,
  createFinanceBookInTransaction,
  createFinanceMoneyAccountInTransaction,
  listOrderPaymentAccounts,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import { assertFinanceAccess } from "../trpc/finance-procedure"
import type {
  GeneralActionAdapter,
  GeneralTransactionContext,
} from "./general-actions"
import { assertGeneralAction, requireGeneralScope } from "./general-context"
import { orderAttachmentAdd } from "./general-order-attachment"
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
  assertGeneralAction(ctx, "order_create")
  assertGeneralAction(ctx, "payment_record")
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
      refuse("Finish the account, customer and amounts before saving.")
    return (await current(ctx, sale)).target
  },
  async review(ctx, sale) {
    const info = await current(ctx, sale)
    const step = simpleSaleStep(sale)
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
      refuse("Finish the sale details first.")
    const info = await current(ctx, sale)
    let moneyAccountId = sale.moneyAccountId
    if (!moneyAccountId) {
      assertFinanceAccess(ctx.tenantContext)
      const actor = {
        tenantId: info.scope.tenantId,
        actorUserId: info.scope.userId,
      }
      const book =
        info.options.book ??
        (await createFinanceBookInTransaction(ctx.db, {
          ...actor,
          startsAt: new Date(),
        }))
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
        (existing.paused || !existing.paymentMethods.includes(sale.method))
      )
        refuse("That account cannot receive this payment.")
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
    const { orderCreate } = await import("./general-actions")
    const receipt = await orderCreate.execute(ctx, payload, key)
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
