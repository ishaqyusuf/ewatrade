import { type FinanceAccount, Prisma } from "../../../generated/prisma/client"

type BalanceRow = FinanceAccount & {
  totalDebit: string
  totalCredit: string
  monthDebit: string
  monthCredit: string
}

/** Caller owns current Finance authority and its RepeatableRead Book snapshot. */
export async function getFinanceAccountBalanceProjection(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  input: { bookId: string; snapshot: bigint; monthStart: Date },
) {
  const rows = await tx.$queryRaw<BalanceRow[]>(Prisma.sql`
    WITH totals AS (
      SELECT line."accountId",
        SUM(line."debitMinor") AS debit,
        SUM(line."creditMinor") AS credit,
        SUM(line."debitMinor") FILTER (WHERE entry."effectiveAt" >= ${input.monthStart}) AS "monthDebit",
        SUM(line."creditMinor") FILTER (WHERE entry."effectiveAt" >= ${input.monthStart}) AS "monthCredit"
      FROM "FinanceJournalLine" line
      JOIN "FinanceJournalEntry" entry ON entry."bookId"=line."bookId" AND entry.id=line."entryId"
      WHERE line."bookId"=${input.bookId} AND entry.sequence<=${input.snapshot}
      GROUP BY line."accountId"
    )
    SELECT account.id, account."bookId", account.code, account.name,
      account.kind::text AS kind, account.purpose::text AS purpose,
      account."archivedAt", account."paymentMethods"::text[] AS "paymentMethods",
      account."paymentsPausedAt", account."mobileMoney", account."bankName",
      account."bankAccountNumber", account."bankAccountHolder", account."createdAt",
      COALESCE(totals.debit,0)::text AS "totalDebit",
      COALESCE(totals.credit,0)::text AS "totalCredit",
      COALESCE(totals."monthDebit",0)::text AS "monthDebit",
      COALESCE(totals."monthCredit",0)::text AS "monthCredit"
    FROM "FinanceAccount" account LEFT JOIN totals ON totals."accountId"=account.id
    WHERE account."bookId"=${input.bookId}
    ORDER BY account.code ASC
  `)
  return rows.map(
    ({ totalDebit, totalCredit, monthDebit, monthCredit, ...account }) => {
      const debit = BigInt(totalDebit)
      const credit = BigInt(totalCredit)
      const debitNormal = account.kind === "ASSET" || account.kind === "EXPENSE"
      return {
        ...account,
        debitMinor: debit.toString(),
        creditMinor: credit.toString(),
        monthDebitMinor: monthDebit,
        monthCreditMinor: monthCredit,
        balanceMinor: (debitNormal
          ? debit - credit
          : credit - debit
        ).toString(),
      }
    },
  )
}
