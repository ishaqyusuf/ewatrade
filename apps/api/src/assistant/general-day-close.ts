import { generalMoney } from "@ewatrade/assistant/general/contracts"
import {
  generalCashCountHistoryInput,
  generalCashCountLookupInput,
  generalCashCountReadInput,
  generalDayCloseInput,
} from "@ewatrade/assistant/general/contracts"
import { listAssistantCashAccountsInTransaction } from "@ewatrade/db/queries"
import {
  getFinanceCashCountInTransaction,
  listFinanceCashCounts,
} from "@ewatrade/db/queries"
import { getFinancePeriodCloseChecklistInTransaction } from "@ewatrade/db/queries"
import { getFinanceReportsInTransaction } from "@ewatrade/db/queries"
import type { Prisma } from "@ewatrade/db/types"
import { assertFinanceAccess } from "../trpc/finance-procedure"
import type { GeneralContext } from "./general-context"
import { requireGeneralScope } from "./general-context"

async function read<A>(
  ctx: GeneralContext,
  fn: (
    tx: Prisma.TransactionClient,
    scope: ReturnType<typeof requireGeneralScope>,
  ) => Promise<A>,
) {
  const scope = requireGeneralScope(ctx)
  assertFinanceAccess(ctx.tenantContext)
  return ctx.db.$transaction(
    async (tx) => {
      if (
        !(await tx.store.findFirst({
          where: {
            id: scope.storeId,
            tenantId: scope.tenantId,
            status: "ACTIVE",
          },
          select: { id: true },
        }))
      )
        throw new Error("The selected Store is no longer available.")
      return fn(tx, scope)
    },
    { maxWait: 10_000, timeout: 30_000, isolationLevel: "RepeatableRead" },
  )
}
export function readGeneralCashAccounts(ctx: GeneralContext, raw: unknown) {
  const input = generalCashCountLookupInput.parse(raw)
  return read(ctx, (tx, scope) =>
    listAssistantCashAccountsInTransaction(tx, {
      ...input,
      tenantId: scope.tenantId,
      actorUserId: scope.userId,
      storeId: scope.storeId,
    }),
  )
}
export function readGeneralCashCount(ctx: GeneralContext, raw: unknown) {
  const input = generalCashCountReadInput.parse(raw)
  return read(ctx, (tx, scope) =>
    getFinanceCashCountInTransaction(tx, {
      ...input,
      tenantId: scope.tenantId,
      actorUserId: scope.userId,
    }),
  )
}
export async function readGeneralCashCountHistory(
  ctx: GeneralContext,
  raw: unknown,
) {
  const input = generalCashCountHistoryInput.parse(raw)
  const scope = requireGeneralScope(ctx)
  assertFinanceAccess(ctx.tenantContext)
  if (
    !(await ctx.db.store.findFirst({
      where: { id: scope.storeId, tenantId: scope.tenantId, status: "ACTIVE" },
      select: { id: true },
    }))
  )
    throw new Error("The selected Store is no longer available.")
  return listFinanceCashCounts(ctx.db, {
    ...input,
    tenantId: scope.tenantId,
    actorUserId: scope.userId,
    limit: 10,
  })
}
export function readGeneralDayClose(ctx: GeneralContext, raw: unknown) {
  const input = generalDayCloseInput.parse(raw)
  return read(ctx, async (tx, scope) => {
    const actor = { tenantId: scope.tenantId, actorUserId: scope.userId }
    const through = new Date(input.through)
    const checklist = await getFinancePeriodCloseChecklistInTransaction(tx, {
      ...actor,
      bookId: input.bookId,
      through,
    })
    const from = new Date(`${input.through.slice(0, 10)}T00:00:00.000Z`)
    const day = await getFinanceReportsInTransaction(tx, {
      ...actor,
      bookId: input.bookId,
      through,
      from: from < new Date(checklist.from) ? new Date(checklist.from) : from,
      snapshotSequence: checklist.snapshotSequence,
    })
    return { checklist, day }
  })
}
type Checklist = Awaited<
  ReturnType<typeof getFinancePeriodCloseChecklistInTransaction>
>
export function generalDayCloseAnswer(
  checklist: Checklist,
  day?: Awaited<ReturnType<typeof getFinanceReportsInTransaction>>,
) {
  const unresolved = checklist.checks.filter((check) => check.status !== "PASS")
  const labels = unresolved
    .map((check) => `${check.label}: ${check.status}`)
    .join("; ")
  if (
    day &&
    (day.bookId !== checklist.bookId ||
      day.currencyCode !== checklist.currencyCode ||
      day.snapshotSequence !== checklist.snapshotSequence ||
      day.through.getTime() !== checklist.through.getTime())
  )
    throw new Error("The posted day summary scope changed. Refresh the review.")
  const detail = `Assistant close/reopen unavailable; operational reconciliation remains uncertified. ${unresolved.length} unresolved checks. Cash count/command coverage: ${checklist.cashCountCoverageComplete && checklist.cashCommandCoverageComplete ? "within review bound" : "incomplete"}. Coverage: ${checklist.completeness}. ${
    day
      ? `Posted day revenue ${generalMoney(day.profitAndLoss.revenueMinor, day.currencyCode)}; cash/bank net change ${generalMoney(day.cashFlow.netChangeMinor, day.currencyCode)}. Posted facts are incomplete business activity. `
      : ""
  }Open the exact checklist for all explanations and source gaps. Native date locking, stock closeout and fiscal close remain separate. Checks: ${labels}`
  return {
    id: `day_close_${crypto.randomUUID()}`,
    title: "Day-close review",
    value: `${unresolved.length} unresolved checks`,
    scope: `Tenant Finance Book · ${checklist.currencyCode} · snapshot ${checklist.snapshotSequence} · ${checklist.from.toISOString()}–${checklist.through.toISOString()} UTC`,
    asOf: new Date().toISOString(),
    detail:
      detail.length > 1000
        ? `${detail.slice(0, 1000 - "… Full checklist in object.".length)}… Full checklist in object.`
        : detail,
    target: {
      kind: "finance_day_close" as const,
      bookId: checklist.bookId,
      through: checklist.through.toISOString(),
    },
  }
}
export function generalCashCountAnswer(
  count: Awaited<ReturnType<typeof getFinanceCashCountInTransaction>>,
) {
  return {
    id: `cash_count_${crypto.randomUUID()}`,
    title: `Cash count · ${count.accountName}`.slice(0, 160),
    value: generalMoney(count.observedBalanceMinor, count.currencyCode),
    scope: `Tenant Finance Book · ${count.currencyCode} · original snapshot ${count.snapshotSequence}`,
    asOf: new Date().toISOString(),
    detail: `Original observation at ${count.asOf.toISOString()} UTC: ${generalMoney(count.observedBalanceMinor, count.currencyCode)} physically counted, posted basis ${generalMoney(count.expectedBalanceMinor, count.currencyCode)}, original difference ${generalMoney(count.differenceMinor, count.currencyCode)}. Current status: ${count.status}. ${count.reviewRequired ? "Later postings changed the original account history; investigate before a new count." : "Original basis preserved."} No adjustment or close performed.`,
    target: {
      kind: "finance_cash_count" as const,
      bookId: count.bookId,
      countId: count.id,
    },
  }
}
