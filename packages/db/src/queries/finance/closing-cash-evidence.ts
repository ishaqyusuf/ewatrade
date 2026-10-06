import { Prisma } from "../../../generated/prisma/client"
import { FinanceError, financePayloadHash } from "./rules"

export const FINANCE_CLOSING_CASH_REVIEW_LIMIT = 200

type CashStatus = "PASS" | "BLOCKED" | "REVIEW_REQUIRED"
type ClosingAccount = {
  accountId: string
  name: string
  kind: string
  purpose: string
  closingBalanceMinor: string
}

/** Caller holds current authority and supplies a complete, same-snapshot report. */
export async function getFinanceClosingCashEvidenceInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    bookId: string
    through: Date
    snapshotSequence: bigint
    accounts: readonly ClosingAccount[]
    now: Date
  },
) {
  if (
    !input.bookId ||
    !Number.isFinite(input.through.getTime()) ||
    !Number.isFinite(input.now.getTime()) ||
    input.snapshotSequence < 0n ||
    input.accounts.length > FINANCE_CLOSING_CASH_REVIEW_LIMIT ||
    new Set(input.accounts.map((row) => row.accountId)).size !==
      input.accounts.length
  )
    throw new FinanceError("CONFLICT", "Cash review scope changed.")
  const accounts = input.accounts.filter((row) => row.purpose === "CASH")
  if (accounts.some((row) => row.kind !== "ASSET"))
    throw new FinanceError("CONFLICT", "Cash controls must be asset accounts.")
  const cashIds = new Set(accounts.map((row) => row.accountId))
  const counts = accounts.length
    ? await tx.financeReconciliation.findMany({
        where: {
          bookId: input.bookId,
          accountId: { in: [...cashIds] },
          asOf: input.through,
          snapshotSequence: { lte: input.snapshotSequence },
          account: { purpose: "CASH", kind: "ASSET" },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: FINANCE_CLOSING_CASH_REVIEW_LIMIT + 1,
        select: {
          id: true,
          bookId: true,
          accountId: true,
          asOf: true,
          snapshotSequence: true,
          expectedBalanceMinor: true,
          observedBalanceMinor: true,
          reference: true,
          actorUserId: true,
          createdAt: true,
        },
      })
    : []
  const countCoverageComplete =
    counts.length <= FINANCE_CLOSING_CASH_REVIEW_LIMIT
  const latest = new Map<string, (typeof counts)[number]>()
  const countIds = new Set<string>()
  for (const count of counts) {
    if (
      !count.id ||
      countIds.has(count.id) ||
      count.bookId !== input.bookId ||
      !cashIds.has(count.accountId) ||
      count.asOf.getTime() !== input.through.getTime() ||
      count.snapshotSequence < 0n ||
      count.snapshotSequence > input.snapshotSequence ||
      count.observedBalanceMinor < 0n ||
      count.observedBalanceMinor > 9223372036854775807n ||
      !count.actorUserId ||
      !count.reference.trim() ||
      count.reference !== count.reference.trim() ||
      count.reference.length > 200 ||
      !Number.isFinite(count.createdAt.getTime()) ||
      count.createdAt < count.asOf ||
      count.createdAt > input.now
    )
      throw new FinanceError("CONFLICT", "Cash review source changed.")
    countIds.add(count.id)
    if (!latest.has(count.accountId)) latest.set(count.accountId, count)
  }
  const selected = countCoverageComplete ? [...latest.values()] : []
  // An overflowing count source has not supplied a complete command scope.
  let commandCoverageComplete = countCoverageComplete
  if (selected.length) {
    const [basis, commands] = await Promise.all([
      tx.$queryRaw<Array<{ id: string; expectedMinor: string }>>(Prisma.sql`
        SELECT count.id,
          COALESCE(SUM(CASE WHEN entry.id IS NOT NULL
            THEN line."debitMinor" - line."creditMinor" ELSE 0 END), 0)::text AS "expectedMinor"
        FROM "FinanceReconciliation" count
        LEFT JOIN "FinanceJournalLine" line
          ON line."bookId" = count."bookId" AND line."accountId" = count."accountId"
        LEFT JOIN "FinanceJournalEntry" entry
          ON entry.id = line."entryId" AND entry."bookId" = line."bookId"
          AND entry.sequence <= count."snapshotSequence" AND entry."effectiveAt" <= count."asOf"
        WHERE count."bookId" = ${input.bookId} AND count.id IN (${Prisma.join(selected.map((count) => count.id))})
        GROUP BY count.id
      `),
      tx.financeCommand.findMany({
        where: {
          bookId: input.bookId,
          kind: "CASH_COUNT",
          OR: selected.map((count) => ({
            result: { path: ["id"], equals: count.id },
          })),
        },
        take: FINANCE_CLOSING_CASH_REVIEW_LIMIT + 1,
        select: {
          id: true,
          bookId: true,
          kind: true,
          actorUserId: true,
          payloadHash: true,
          result: true,
        },
      }),
    ])
    const original = new Map(basis.map((row) => [row.id, row.expectedMinor]))
    if (original.size !== selected.length || basis.length !== selected.length)
      throw new FinanceError(
        "CONFLICT",
        "Cash count ledger basis is incomplete.",
      )
    commandCoverageComplete =
      commands.length <= FINANCE_CLOSING_CASH_REVIEW_LIMIT
    const commandIds = new Set<string>()
    for (const command of commands) {
      if (
        !command.id ||
        commandIds.has(command.id) ||
        command.bookId !== input.bookId ||
        command.kind !== "CASH_COUNT"
      )
        throw new FinanceError("CONFLICT", "Cash count command scope changed.")
      commandIds.add(command.id)
    }
    for (const count of selected) {
      // Expected balance and sequence are not in the original command payload:
      // independently recompute that stored basis from actual original postings.
      const expected = original.get(count.id)
      if (expected !== count.expectedBalanceMinor.toString())
        throw new FinanceError(
          "CONFLICT",
          "Cash count original ledger basis changed.",
        )
      if (!commandCoverageComplete) continue
      const linked = commands.filter((command) => {
        const result = command.result
        return (
          result &&
          typeof result === "object" &&
          !Array.isArray(result) &&
          result.id === count.id
        )
      })
      const command = linked[0]
      if (
        linked.length !== 1 ||
        !command ||
        command.actorUserId !== count.actorUserId ||
        command.payloadHash !==
          financePayloadHash({
            accountId: count.accountId,
            asOf: count.asOf,
            observedBalanceMinor: count.observedBalanceMinor,
            reference: count.reference,
          })
      )
        throw new FinanceError(
          "CONFLICT",
          "Cash count original command changed.",
        )
    }
  }
  const cutoffCompleted = input.through < input.now
  const coverageComplete = countCoverageComplete && commandCoverageComplete
  const cash = accounts.map((account) => {
    const count = coverageComplete ? latest.get(account.accountId) : undefined
    const status: CashStatus =
      !count || !cutoffCompleted
        ? "REVIEW_REQUIRED"
        : count.observedBalanceMinor.toString() === account.closingBalanceMinor
          ? "PASS"
          : "BLOCKED"
    return {
      accountId: account.accountId,
      name: account.name,
      closingBalanceMinor: account.closingBalanceMinor,
      countId: count?.id ?? null,
      observedBalanceMinor: count?.observedBalanceMinor.toString() ?? null,
      countSnapshotSequence: count?.snapshotSequence.toString() ?? null,
      originalExpectedBalanceMinor:
        count?.expectedBalanceMinor.toString() ?? null,
      basisVerified: Boolean(count),
      status,
    }
  })
  const status: CashStatus = cash.some((row) => row.status === "BLOCKED")
    ? "BLOCKED"
    : !cutoffCompleted ||
        !coverageComplete ||
        cash.some((row) => row.status !== "PASS")
      ? "REVIEW_REQUIRED"
      : "PASS"
  return {
    through: input.through,
    snapshotSequence: input.snapshotSequence.toString(),
    scope: "REGISTERED_CASH_ACCOUNTS" as const,
    status,
    cash,
    cutoffCompleted,
    countCoverageComplete,
    commandCoverageComplete,
    reviewLimit: FINANCE_CLOSING_CASH_REVIEW_LIMIT,
  }
}
