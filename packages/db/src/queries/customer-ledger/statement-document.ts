import {
  type CustomerStatementDocument,
  customerStatementLineWords,
  customerStatementPeriod,
} from "@ewatrade/order-receipts/statement"
import type { PrismaClient } from "../../../generated/prisma/client"
import { type FinanceActor, assertFinanceManager } from "../finance/access"
import { FinanceError } from "../finance/rules"

/** Most lines one printed statement carries; longer periods must be split. */
export const CUSTOMER_STATEMENT_MAX_LINES = 2000
const MAX_PAYMENT_ACCOUNTS = 3

function validTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format()
    return true
  } catch {
    return false
  }
}

function zonedParts(date: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<"year" | "month" | "day" | "hour" | "minute" | "second", number>
  return parts
}

/** The instant a local calendar day (YYYY-MM-DD) starts in `timeZone`. */
export function customerStatementDayStart(day: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  const utc = match
    ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : Number.NaN
  const check = new Date(utc)
  if (
    !match ||
    !Number.isFinite(utc) ||
    check.toISOString().slice(0, 10) !== day ||
    !validTimeZone(timeZone)
  )
    throw new FinanceError("INVALID_JOURNAL", "Choose valid statement dates.")
  const offset = (at: number) => {
    const p = zonedParts(new Date(at), timeZone)
    return (
      Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) -
      Math.floor(at / 1000) * 1000
    )
  }
  // Two passes settle the offset when a clock change falls near midnight.
  let guess = utc - offset(utc)
  guess = utc - offset(guess)
  return new Date(guess)
}

function nextDay(day: string) {
  const date = new Date(`${day}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

/**
 * A customer statement for local dates `from`–`through` at one pinned
 * snapshot: the balance before `from`, every entry dated inside the period in
 * date order (posting sequence breaks ties) with a running balance, and the
 * closing balance. Same Owner/Admin rule as the statement view. Closed
 * finance periods are read like any other dates. Optional receiving bank
 * accounts come from Finance money accounts in the statement's currency.
 */
export async function getCustomerStatementDocument(
  db: PrismaClient,
  input: FinanceActor & {
    accountId: string
    from: string
    through: string
    snapshotSequence?: string
    storeId?: string
    includePaymentAccounts?: boolean
    now?: Date
  },
): Promise<CustomerStatementDocument> {
  if (
    input.snapshotSequence !== undefined &&
    !/^(0|[1-9]\d{0,18})$/.test(input.snapshotSequence)
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Invalid customer statement sequence.",
    )
  if (input.from > input.through)
    throw new FinanceError(
      "INVALID_JOURNAL",
      "The start date must be on or before the end date.",
    )
  return db.$transaction(
    async (tx) => {
      const tenant = await assertFinanceManager(tx, input)
      const account = await tx.customerLedgerAccount.findFirst({
        where: { id: input.accountId, tenantId: input.tenantId },
        include: {
          customer: { select: { name: true, phone: true, email: true } },
        },
      })
      if (!account)
        throw new FinanceError(
          "NOT_FOUND",
          "Customer ledger account not found in this business.",
        )
      const snapshot =
        input.snapshotSequence === undefined
          ? account.lastSequence
          : BigInt(input.snapshotSequence)
      if (snapshot > account.lastSequence)
        throw new FinanceError(
          "INVALID_JOURNAL",
          "The statement snapshot is beyond available history.",
        )
      // One interactive transaction runs one query at a time.
      const business = await tx.tenant.findUniqueOrThrow({
        where: { id: input.tenantId },
        select: { name: true },
      })
      const store = input.storeId
        ? await tx.store.findFirst({
            where: { id: input.storeId, tenantId: input.tenantId },
            select: {
              name: true,
              supportPhone: true,
              supportEmail: true,
              addressLine1: true,
              addressLine2: true,
              city: true,
              region: true,
            },
          })
        : null
      const book = await tx.financeBook.findUnique({
        where: {
          tenantId_currencyCode: {
            tenantId: input.tenantId,
            currencyCode: account.currencyCode,
          },
        },
        select: { id: true, timezone: true },
      })
      const timezone =
        book && validTimeZone(book.timezone) ? book.timezone : tenant.timezone
      const from = customerStatementDayStart(input.from, timezone)
      const before = customerStatementDayStart(nextDay(input.through), timezone)
      const scope = { accountId: account.id, sequence: { lte: snapshot } }
      const opening = await tx.customerLedgerEntry.groupBy({
        by: ["side"],
        where: { ...scope, effectiveAt: { lt: from } },
        _sum: { amountMinor: true },
      })
      const rows = await tx.customerLedgerEntry.findMany({
        where: { ...scope, effectiveAt: { gte: from, lt: before } },
        orderBy: [{ effectiveAt: "asc" }, { sequence: "asc" }],
        take: CUSTOMER_STATEMENT_MAX_LINES + 1,
        select: {
          id: true,
          kind: true,
          side: true,
          amountMinor: true,
          effectiveAt: true,
          order: { select: { orderNumber: true } },
          receipt: { select: { method: true } },
        },
      })
      const paymentAccounts =
        book && input.includePaymentAccounts !== false
          ? await tx.financeAccount.findMany({
              where: {
                bookId: book.id,
                kind: "ASSET",
                purpose: "BANK",
                archivedAt: null,
                paymentsPausedAt: null,
                bankName: { not: null },
                bankAccountNumber: { not: null },
                bankAccountHolder: { not: null },
                OR: [
                  { paymentMethods: { isEmpty: true } },
                  { paymentMethods: { has: "BANK_TRANSFER" } },
                ],
              },
              orderBy: { code: "asc" },
              take: MAX_PAYMENT_ACCOUNTS,
              select: {
                bankName: true,
                bankAccountNumber: true,
                bankAccountHolder: true,
                mobileMoney: true,
              },
            })
          : []
      if (rows.length > CUSTOMER_STATEMENT_MAX_LINES)
        throw new FinanceError(
          "INVALID_JOURNAL",
          `These dates have more than ${CUSTOMER_STATEMENT_MAX_LINES} entries. Choose shorter dates.`,
        )
      const sum = (side: string) =>
        opening.find((row) => row.side === side)?._sum.amountMinor ?? BigInt(0)
      const period = customerStatementPeriod({
        openingMinor: sum("DEBIT") - sum("CREDIT"),
        entries: rows.map((row) => ({
          id: row.id,
          effectiveAt: row.effectiveAt.toISOString(),
          side: row.side,
          amountMinor: row.amountMinor,
          ...customerStatementLineWords({
            kind: row.kind,
            orderNumber: row.order?.orderNumber ?? null,
            method: row.receipt?.method ?? null,
          }),
        })),
      })
      const address = store
        ? [store.addressLine1, store.addressLine2, store.city, store.region]
            .filter(Boolean)
            .join(", ")
        : ""
      return {
        accountId: account.id,
        customerId: account.customerId,
        currencyCode: account.currencyCode,
        snapshotSequence: snapshot.toString(),
        timezone,
        from: input.from,
        through: input.through,
        issuedAt: (input.now ?? new Date()).toISOString(),
        business: {
          name: business.name,
          storeName: store?.name ?? null,
          address: address || null,
          phone: store?.supportPhone ?? null,
          email: store?.supportEmail ?? null,
        },
        customer: {
          name: account.customer.name,
          phone: account.customer.phone,
          email: account.customer.email,
        },
        ...period,
        paymentAccounts: paymentAccounts.map((row) => ({
          bankName: row.bankName ?? "",
          accountNumber: row.bankAccountNumber ?? "",
          accountHolder: row.bankAccountHolder ?? "",
          mobileMoney: row.mobileMoney,
        })),
      }
    },
    { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 30_000 },
  )
}
