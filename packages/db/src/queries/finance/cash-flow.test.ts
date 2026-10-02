import { expect, test } from "bun:test"
import { calculateCashFlow } from "./cash-flow"

test("returning held customer money reduces operating cash without new revenue", () => {
  const result = calculateCashFlow(
    [
      { sourceKind: "CUSTOMER_RECEIPT", netMinor: BigInt(5000) },
      { sourceKind: "CUSTOMER_HELD_CREDIT_REFUND", netMinor: BigInt(-3000) },
    ],
    BigInt(0),
    BigInt(2000),
  )
  expect(result.operatingMinor).toBe("2000")
  expect(result.financingMinor).toBe("0")
  expect(result.groups[1]?.category).toBe("OPERATING")
  expect(result.reconciled).toBe(true)
  expect(result.classificationComplete).toBe(true)
})
test("cash bridge separates opening imports, owner funding and clearing movements", () => {
  const result = calculateCashFlow(
    [
      { sourceKind: "OPENING_BALANCE", netMinor: BigInt(10000) },
      { sourceKind: "BILL_PAYMENT", netMinor: BigInt(-2000) },
      { sourceKind: "OWNER_CONTRIBUTION", netMinor: BigInt(3000) },
      { sourceKind: "OWNER_WITHDRAWAL", netMinor: BigInt(-1000) },
      { sourceKind: "TRANSFER", netMinor: BigInt(-500) },
    ],
    BigInt(100),
    BigInt(9600),
  )
  expect(result.operatingMinor).toBe("-2000")
  expect(result.financingMinor).toBe("2000")
  expect(result.openingAdjustmentsMinor).toBe("10000")
  expect(result.transfersAndClearingMinor).toBe("-500")
  expect(result.reconciled).toBe(true)
  expect(result.classificationComplete).toBe(true)
})
test("unknown sources and mismatches are explicit even when unknowns net to zero", () => {
  const result = calculateCashFlow(
    [{ sourceKind: "NEW_ADAPTER", netMinor: BigInt(0) }],
    BigInt(0),
    BigInt(1),
  )
  expect(result.classificationComplete).toBe(false)
  expect(result.reconciled).toBe(false)
  expect(result.differenceMinor).toBe("1")
})
