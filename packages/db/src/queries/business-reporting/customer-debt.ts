import type { Prisma, PrismaClient } from "../../../generated/prisma/client"
import { getCustomerLedgerTotalsInTransaction } from "../customer-ledger/balances"
import { getCustomerLedgerScopeTotalsInTransaction } from "../customer-ledger/totals-projection"
import { type FinanceActor, assertFinanceManager } from "../finance/access"
import { FinanceError } from "../finance/rules"
import { literalContains } from "../literal-contains"
import { makeReportCursor, readReportCursor, reportCursorScope } from "./cursor"
import type { BusinessReport } from "./types"

export const CUSTOMER_DEBT_PAGE_SIZE = 10
export async function getBusinessCustomerDebtInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceActor & {
    currencyCode: string
    query?: string
    cursor?: string
  },
): Promise<BusinessReport> {
  if (
    !/^[A-Z]{3}$/.test(input.currencyCode) ||
    (input.query?.length ?? 0) > 160
  )
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Choose a currency and valid customer filter.",
    )
  await assertFinanceManager(tx, input)
  const query = input.query?.trim()
  const fingerprint = reportCursorScope({
    report: "customer_debt",
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    currencyCode: input.currencyCode,
    query: query ?? null,
  })
  const after = readReportCursor(input.cursor, fingerprint)
  const where: Prisma.CustomerLedgerAccountWhereInput = {
    tenantId: input.tenantId,
    currencyCode: input.currencyCode,
    ...(query
      ? {
          customer: {
            OR: ["name", "phone", "email"].map((field) => ({
              [field]: {
                contains: literalContains(query),
                mode: "insensitive",
              },
            })),
          },
        }
      : {}),
  }
  const full = await getCustomerLedgerScopeTotalsInTransaction(tx, {
    ...input,
    query,
  })
  const accounts = await tx.customerLedgerAccount.findMany({
    where: { ...where, ...(after ? { id: { gt: after } } : {}) },
    orderBy: { id: "asc" },
    take: CUSTOMER_DEBT_PAGE_SIZE + 1,
    select: {
      id: true,
      lastSequence: true,
      customer: { select: { id: true, name: true } },
    },
  })
  const page = accounts.slice(0, CUSTOMER_DEBT_PAGE_SIZE)
  const rows: BusinessReport["rows"] = []
  for (const account of page) {
    const totals = await getCustomerLedgerTotalsInTransaction(
      tx,
      account.id,
      account.lastSequence,
    )
    rows.push({
      id: account.id,
      label: account.customer.name,
      moneyMinor: totals.outstandingDebtMinor,
      moneyLabel: "debt",
      moneyDetails: [
        { label: "Available credit", amountMinor: totals.availableCreditMinor },
        { label: "Net balance", amountMinor: totals.netBalanceMinor },
      ],
      value: `${totals.outstandingDebtMinor} ${input.currencyCode} minor units debt`,
      detail: `Account ${account.id}; immutable posting sequence ${account.lastSequence}. Debt and credit are separate.`,
      target: { kind: "customer", id: account.customer.id },
    })
  }
  const last = page.at(-1)
  return {
    report: "customer_debt",
    asOf: new Date().toISOString(),
    complete: true,
    scope: `Business · all Stores · ${query ? `customer filter: ${query}` : "all customer ledger accounts"}`,
    currencyCode: input.currencyCode,
    period: null,
    dateBasis:
      "Current repeatable-read posting snapshot; no historical date filter",
    rows,
    pagination: {
      totalRows: full.accountCount,
      nextCursor:
        accounts.length > CUSTOMER_DEBT_PAGE_SIZE && last
          ? makeReportCursor(last.id, fingerprint)
          : null,
    },
    totals: {
      kind: "customer_debt",
      accountCount: full.accountCount,
      outstandingDebtMinor: full.totals.outstandingDebtMinor,
      availableCreditMinor: full.totals.availableCreditMinor,
      netBalanceMinor: full.totals.netBalanceMinor,
    },
    summary: `Debt ${full.totals.outstandingDebtMinor}; available credit ${full.totals.availableCreditMinor} ${input.currencyCode} minor units across all ${full.accountCount} matching posted accounts.`,
    gaps: [
      "Posted customer ledger accounts only; unintegrated orders and customers without accounts excluded. No accounts does not mean no unpaid orders.",
      "Business-wide account debt cannot be attributed to one Store. No historical or Store debt total is inferred.",
      "Complete aggregate covers every matching account at its posting sequence, independently of this detail page. Debt and credit use canonical allocation/release rules. Pages are live request snapshots; never add page totals.",
    ],
  }
}
export function getBusinessCustomerDebt(
  db: PrismaClient,
  input: Parameters<typeof getBusinessCustomerDebtInTransaction>[1],
) {
  return db.$transaction(
    (tx) => getBusinessCustomerDebtInTransaction(tx, input),
    { maxWait: 10_000, timeout: 30_000, isolationLevel: "RepeatableRead" },
  )
}
