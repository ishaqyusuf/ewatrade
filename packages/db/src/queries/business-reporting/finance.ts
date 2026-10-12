import type { PrismaClient } from "../../../generated/prisma/client"
import { type FinanceActor, assertFinanceManager } from "../finance/access"
import { getFinanceReportsInTransaction } from "../finance/reports"
import { getFinanceSupplierPayableAging } from "../finance/supplier-aging"
import type { BusinessReport } from "./types"

export function supplierAgingBusinessReport(
  source: Pick<
    Awaited<ReturnType<typeof getFinanceSupplierPayableAging>>,
    | "supplier"
    | "asOfDate"
    | "snapshotSequence"
    | "currencyCode"
    | "payableMinor"
    | "advanceMinor"
    | "sourcesRead"
    | "sourceLimit"
    | "buckets"
  >,
): BusinessReport {
  return {
    report: "supplier_aging",
    complete: true,
    asOf: new Date().toISOString(),
    scope: `${source.currencyCode} book · ${source.supplier.name} · all Stores`,
    dateBasis: `${source.asOfDate} · UTC as-of date · posting sequence ${source.snapshotSequence}`,
    currencyCode: source.currencyCode,
    period: null,
    totals: {
      kind: "supplier_aging",
      payableMinor: source.payableMinor,
      advanceMinor: source.advanceMinor,
      sourcesRead: String(source.sourcesRead),
    },
    summary: `Supplier payable ${source.payableMinor}; advance ${source.advanceMinor} ${source.currencyCode} minor units. Complete canonical aging buckets across ${source.sourcesRead} sources.`,
    rows: source.buckets.map((bucket) => ({
      id: bucket.bucket,
      label: `${source.supplier.name} · ${bucket.bucket}`,
      moneyMinor: bucket.amountMinor,
      value: `${bucket.amountMinor} ${source.currencyCode} minor units`,
      detail: `Original supplier ${source.supplier.id}, code ${source.supplier.code}; Book ${source.supplier.bookId}; canonical UTC aging snapshot ${source.snapshotSequence}. Advance remains separate from payable.`,
    })),
    gaps: [
      "Canonical posted supplier control/aging only, all Stores. Not a Store-only payable or bank settlement report.",
      `Canonical source bound ${source.sourceLimit}; over-limit or unreconciled source sets fail unavailable. No limited source page is summed.`,
      "Detailed source pagination remains in the native supplier statement/aging workspace; bucket totals cover all canonical sources, including undated balances.",
    ],
  }
}
export async function getBusinessSupplierAgingReport(
  db: PrismaClient,
  input: FinanceActor & {
    bookId: string
    supplierId: string
    asOfDate: string
    snapshotSequence?: string
  },
) {
  return supplierAgingBusinessReport(
    await getFinanceSupplierPayableAging(db, { ...input, limit: 10 }),
  )
}

type FinanceSource = Awaited<ReturnType<typeof getFinanceReportsInTransaction>>
export function postedProfitBusinessReport(
  source: Pick<
    FinanceSource,
    | "bookId"
    | "snapshotSequence"
    | "currencyCode"
    | "from"
    | "through"
    | "profitAndLoss"
    | "completeness"
    | "coverage"
    | "coverageGaps"
  >,
): BusinessReport {
  return {
    report: "posted_profit",
    complete: true,
    asOf: new Date().toISOString(),
    scope: `${source.currencyCode} book · all Stores · posted finance entries only`,
    dateBasis: `Journal effectiveAt · start/end inclusive · UTC · posting sequence ${source.snapshotSequence}`,
    currencyCode: source.currencyCode,
    period: {
      from: source.from.toISOString(),
      to: source.through.toISOString(),
      end: "inclusive",
      timezone: "UTC",
    },
    totals: {
      kind: "posted_profit",
      revenueMinor: source.profitAndLoss.revenueMinor,
      costOfSalesMinor: source.profitAndLoss.costOfSalesMinor,
      expensesMinor: source.profitAndLoss.expensesMinor,
      netProfitMinor: source.profitAndLoss.netProfitMinor,
    },
    summary:
      "Complete posted-entry report; whole-business profit and cost completeness remain unknown.",
    rows: [
      ["Posted revenue", source.profitAndLoss.revenueMinor],
      ["Posted cost of sales", source.profitAndLoss.costOfSalesMinor],
      ["Posted expenses", source.profitAndLoss.expensesMinor],
      ["Posted entries net profit", source.profitAndLoss.netProfitMinor],
    ].map(([label, value], index) => ({
      id: `posted_${index}`,
      label: label ?? "Posted value",
      moneyMinor: value,
      value: `${value} ${source.currencyCode} minor units`,
      detail: `Original canonical posted Book report at sequence ${source.snapshotSequence}. A posted zero is not known zero actual cost, sales, collection, or profit. No Store attribution is available.`,
    })),
    sourceCoverage: {
      coverage: source.coverage,
      completeness: source.completeness,
      gaps: source.coverageGaps,
    },
    gaps: [
      "Posted finance entries only; actual source coverage is incomplete.",
      `Missing coverage: ${source.coverageGaps.map((gap) => ({ COMMERCIAL_SALES_AND_CUSTOMER_PAYMENTS: "commercial sales and customer payments", INVENTORY_COSTS: "inventory costs", OPENING_BALANCE_RECONCILIATION: "opening balance reconciliation" })[gap]).join(", ")}. Unknown costs are never treated as known zero actual costs.`,
      "Book report covers all Stores; Store-only profit is unsupported. Commercial sales, payment collections, item-line value and posted revenue are different definitions.",
    ],
  }
}
export function getBusinessPostedProfitReport(
  db: PrismaClient,
  input: FinanceActor & {
    bookId: string
    from: Date
    through: Date
    snapshotSequence?: string
  },
) {
  return db.$transaction(
    async (tx) => {
      await assertFinanceManager(tx, input)
      const accounts = await tx.financeAccount.findMany({
        where: { book: { tenantId: input.tenantId }, bookId: input.bookId },
        select: { id: true },
        take: 201,
      })
      if (accounts.length > 200)
        throw new Error(
          "This Book exceeds the bounded native report account scope; a staged report is required.",
        )
      return postedProfitBusinessReport(
        await getFinanceReportsInTransaction(tx, input),
      )
    },
    { maxWait: 10000, timeout: 30000, isolationLevel: "RepeatableRead" },
  )
}
