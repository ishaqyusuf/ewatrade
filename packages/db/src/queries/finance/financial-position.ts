import type { FinanceAccountKind } from "../../../generated/prisma/client"

type PositionAccount = {
  accountId: string
  code: string
  name: string
  kind: FinanceAccountKind
  closingBalanceMinor: string
}

/** Income/expense balances are cumulative as of the report date, not the P&L range. */
export function calculateFinancialPosition<T extends PositionAccount>(
  accounts: T[],
) {
  const sum = (kind: FinanceAccountKind) =>
    accounts
      .filter((account) => account.kind === kind)
      .reduce(
        (total, account) => total + BigInt(account.closingBalanceMinor),
        BigInt(0),
      )
  const assets = sum("ASSET")
  const liabilities = sum("LIABILITY")
  const postedEquity = sum("EQUITY")
  const unclosedEarnings = sum("INCOME") - sum("EXPENSE")
  const equity = postedEquity + unclosedEarnings
  const difference = assets - liabilities - equity
  return {
    assets: accounts.filter((account) => account.kind === "ASSET"),
    liabilities: accounts.filter((account) => account.kind === "LIABILITY"),
    equity: accounts.filter((account) => account.kind === "EQUITY"),
    assetsMinor: assets.toString(),
    liabilitiesMinor: liabilities.toString(),
    postedEquityMinor: postedEquity.toString(),
    unclosedEarningsMinor: unclosedEarnings.toString(),
    totalEquityMinor: equity.toString(),
    liabilitiesAndEquityMinor: (liabilities + equity).toString(),
    differenceMinor: difference.toString(),
    balanced: difference === BigInt(0),
  }
}
