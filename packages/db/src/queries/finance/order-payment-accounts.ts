import {
  type MoneyAccountPurpose,
  ORDER_PAYMENT_METHOD_LABELS,
  type OrderPaymentMethod,
  moneyAccountPaymentMethods,
} from "@ewatrade/utils/finance-payment-methods"
import type { Prisma } from "../../../generated/prisma/client"
import { FinanceError } from "./rules"

const moneyAccount = {
  archivedAt: null,
  kind: "ASSET",
  purpose: { in: ["CASH", "BANK", "CLEARING"] },
} satisfies Prisma.FinanceAccountWhereInput

/**
 * Receiving accounts for order screens: names and payment settings only.
 * Sales staff use this without Finance access, so it never returns balances.
 */
export async function listOrderPaymentAccounts(
  db: Prisma.TransactionClient,
  input: { tenantId: string; currencyCode: string },
) {
  const book = await db.financeBook.findUnique({
    where: {
      tenantId_currencyCode: {
        tenantId: input.tenantId,
        currencyCode: input.currencyCode,
      },
    },
    select: { id: true, currencyCode: true },
  })
  if (!book) return { book: null, accounts: [] }
  const rows = await db.financeAccount.findMany({
    where: { bookId: book.id, ...moneyAccount },
    select: {
      id: true,
      name: true,
      purpose: true,
      paymentMethods: true,
      paymentsPausedAt: true,
    },
    orderBy: { code: "asc" },
  })
  return {
    book,
    accounts: rows.map((row) => {
      const purpose = row.purpose as MoneyAccountPurpose
      return {
        id: row.id,
        name: row.name,
        purpose,
        paymentMethods: moneyAccountPaymentMethods({
          purpose,
          paymentMethods: row.paymentMethods,
        }),
        paused: row.paymentsPausedAt !== null,
      }
    }),
  }
}

/**
 * Checks the account a payment or refund names. Call while holding the
 * order's Finance book lock, so a concurrent pause or method change can't
 * slip between this check and the posting.
 */
export async function assertOrderPaymentAccountInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    bookId: string
    accountId: string
    method: OrderPaymentMethod
    refund: boolean
  },
) {
  const account = await tx.financeAccount.findFirst({
    where: { id: input.accountId, bookId: input.bookId, ...moneyAccount },
  })
  if (!account)
    throw new FinanceError(
      "CONFLICT",
      "Choose an active cash or bank account from this business.",
    )
  const methods = moneyAccountPaymentMethods({
    purpose: account.purpose as MoneyAccountPurpose,
    paymentMethods: account.paymentMethods,
  })
  if (!methods.includes(input.method)) {
    const label = ORDER_PAYMENT_METHOD_LABELS[input.method]
    throw new FinanceError(
      "CONFLICT",
      `${account.name} doesn't take ${input.method === "pos" ? label : label.toLowerCase()} payments. Choose another account.`,
    )
  }
  // A paused account stops taking money in; refunds can still come out of it.
  if (!input.refund && account.paymentsPausedAt)
    throw new FinanceError(
      "CONFLICT",
      `${account.name} is paused for new payments. Choose another account.`,
    )
  return account
}
