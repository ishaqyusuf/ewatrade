import type { PrismaClient } from "../../../generated/prisma/client"
import type {
  FinanceAccountKind,
  FinanceAccountPurpose,
} from "../../../generated/prisma/enums"
import {
  type FinanceActor,
  assertFinanceManager,
  lockFinanceBook,
} from "./access"
import { FINANCE_RETAINED_EARNINGS_ACCOUNT } from "./retained-earnings"
import { FinanceError } from "./rules"

export const FINANCE_DEFAULT_ACCOUNTS: Array<{
  code: string
  name: string
  kind: FinanceAccountKind
  purpose: FinanceAccountPurpose
}> = [
  { code: "1000", name: "Shop cash", kind: "ASSET", purpose: "CASH" },
  { code: "1100", name: "Bank account", kind: "ASSET", purpose: "BANK" },
  {
    code: "1150",
    name: "Payments awaiting settlement",
    kind: "ASSET",
    purpose: "CLEARING",
  },
  {
    code: "1200",
    name: "Customer receivables",
    kind: "ASSET",
    purpose: "RECEIVABLE",
  },
  {
    code: "1250",
    name: "Supplier advances",
    kind: "ASSET",
    purpose: "SUPPLIER_ADVANCE",
  },
  { code: "1300", name: "Inventory", kind: "ASSET", purpose: "INVENTORY" },
  {
    code: "2000",
    name: "Supplier and expense payables",
    kind: "LIABILITY",
    purpose: "PAYABLE",
  },
  {
    code: "2100",
    name: "Customer deposits",
    kind: "LIABILITY",
    purpose: "CUSTOMER_ADVANCE",
  },
  { code: "3000", name: "Owner capital", kind: "EQUITY", purpose: "CAPITAL" },
  {
    code: "3100",
    name: "Owner withdrawals",
    kind: "EQUITY",
    purpose: "DRAWINGS",
  },
  {
    code: "3900",
    name: "Opening equity",
    kind: "EQUITY",
    purpose: "OPENING_EQUITY",
  },
  FINANCE_RETAINED_EARNINGS_ACCOUNT,
  { code: "4000", name: "Sales", kind: "INCOME", purpose: "SALES" },
  {
    code: "5000",
    name: "Cost of goods sold",
    kind: "EXPENSE",
    purpose: "COST_OF_SALES",
  },
  {
    code: "6000",
    name: "Operating expenses",
    kind: "EXPENSE",
    purpose: "OPERATING_EXPENSE",
  },
]

export async function createFinanceExpenseCategory(
  db: PrismaClient,
  input: FinanceActor & {
    bookId: string
    code: string
    name: string
  },
) {
  if (
    !/^[A-Z0-9_-]{1,32}$/i.test(input.code) ||
    !input.name.trim() ||
    input.name.length > 100
  ) {
    throw new FinanceError("INVALID_JOURNAL", "Enter a category code and name.")
  }
  return db.$transaction(
    async (tx) => {
      await lockFinanceBook(tx, input)
      const previous = await tx.financeAccount.findUnique({
        where: { bookId_code: { bookId: input.bookId, code: input.code } },
      })
      if (previous) {
        if (
          previous.name !== input.name.trim() ||
          previous.purpose !== "OPERATING_EXPENSE" ||
          previous.archivedAt
        ) {
          throw new FinanceError(
            "CONFLICT",
            "That category code is already in use.",
          )
        }
        return previous
      }
      return tx.financeAccount.create({
        data: {
          bookId: input.bookId,
          code: input.code,
          name: input.name.trim(),
          kind: "EXPENSE",
          purpose: "OPERATING_EXPENSE",
        },
      })
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}

export async function createFinanceBook(
  db: PrismaClient,
  input: FinanceActor & { startsAt: Date },
) {
  if (
    !Number.isFinite(input.startsAt.getTime()) ||
    input.startsAt > new Date()
  ) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Choose a valid bookkeeping start date.",
    )
  }
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${input.tenantId} FOR UPDATE`
      const tenant = await assertFinanceManager(tx, input)
      const existing = await tx.financeBook.findUnique({
        where: {
          tenantId_currencyCode: {
            tenantId: tenant.id,
            currencyCode: tenant.currencyCode,
          },
        },
      })
      if (existing) {
        if (existing.startsAt.getTime() !== input.startsAt.getTime()) {
          throw new FinanceError(
            "CONFLICT",
            "This business already has a different bookkeeping start date.",
          )
        }
        return { id: existing.id }
      }
      const book = await tx.financeBook.create({
        data: {
          tenantId: tenant.id,
          currencyCode: tenant.currencyCode,
          timezone: tenant.timezone,
          startsAt: input.startsAt,
          createdById: input.actorUserId,
          accounts: { create: FINANCE_DEFAULT_ACCOUNTS },
        },
      })
      return { id: book.id }
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}

export async function getFinanceBook(db: PrismaClient, input: FinanceActor) {
  return db.$transaction(
    async (tx) => {
      const tenant = await assertFinanceManager(tx, input)
      const book = await tx.financeBook.findUnique({
        where: {
          tenantId_currencyCode: {
            tenantId: input.tenantId,
            currencyCode: tenant.currencyCode,
          },
        },
        include: { accounts: { orderBy: { code: "asc" } } },
      })
      return book
        ? { ...book, lastSequence: book.lastSequence.toString() }
        : null
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}

export async function createFinanceMoneyAccount(
  db: PrismaClient,
  input: FinanceActor & {
    bookId: string
    code: string
    name: string
    purpose: "CASH" | "BANK" | "CLEARING"
  },
) {
  if (
    !/^[A-Z0-9_-]{1,32}$/i.test(input.code) ||
    !input.name.trim() ||
    input.name.length > 100 ||
    !["CASH", "BANK", "CLEARING"].includes(input.purpose)
  ) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Enter an account code, name and money account type.",
    )
  }
  return db.$transaction(
    async (tx) => {
      await lockFinanceBook(tx, input)
      const previous = await tx.financeAccount.findUnique({
        where: { bookId_code: { bookId: input.bookId, code: input.code } },
      })
      if (previous) {
        if (
          previous.name !== input.name.trim() ||
          previous.purpose !== input.purpose ||
          previous.archivedAt
        ) {
          throw new FinanceError(
            "CONFLICT",
            "That account code is already in use.",
          )
        }
        return previous
      }
      return tx.financeAccount.create({
        data: {
          bookId: input.bookId,
          code: input.code,
          name: input.name.trim(),
          kind: "ASSET",
          purpose: input.purpose,
        },
      })
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}
