import { expect, test } from "bun:test"
import type { FinanceAccountKind } from "../../../generated/prisma/client"
import { calculateFinancialPosition } from "./financial-position"
const row = (
  kind: FinanceAccountKind,
  amount: string,
  name: string = kind,
) => ({
  accountId: name,
  code: name,
  name,
  kind,
  closingBalanceMinor: amount,
})
test("as-of earnings use cumulative balances and drawings reduce equity", () => {
  const result = calculateFinancialPosition([
    row("ASSET", "9000"),
    row("LIABILITY", "2000"),
    row("EQUITY", "10000"),
    row("EQUITY", "-1000", "DRAWINGS"),
    row("INCOME", "5000"),
    row("EXPENSE", "7000"),
  ])
  expect(result.unclosedEarningsMinor).toBe("-2000")
  expect(result.postedEquityMinor).toBe("9000")
  expect(result.totalEquityMinor).toBe("7000")
  expect(result.liabilitiesAndEquityMinor).toBe("9000")
  expect(result.balanced).toBe(true)
  expect(result.assets).toHaveLength(1)
})
test("closed earnings are not counted twice and imbalances remain visible", () => {
  const result = calculateFinancialPosition([
    row("ASSET", "12000"),
    row("EQUITY", "12000"),
    row("INCOME", "0"),
    row("EXPENSE", "0"),
  ])
  expect(result.unclosedEarningsMinor).toBe("0")
  expect(result.balanced).toBe(true)
  expect(
    calculateFinancialPosition([row("ASSET", "12001"), row("EQUITY", "12000")])
      .differenceMinor,
  ).toBe("1")
})
test("large cumulative balances and negative assets remain exact", () => {
  const result = calculateFinancialPosition([
    row("ASSET", "900719925474099312"),
    row("ASSET", "-12", "OVERDRAFT"),
    row("EQUITY", "900719925474099300"),
  ])
  expect(result.assetsMinor).toBe("900719925474099300")
  expect(result.balanced).toBe(true)
})
