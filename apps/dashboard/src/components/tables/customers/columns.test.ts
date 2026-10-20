import { describe, expect, test } from "bun:test"
import {
  compareCustomerTotals,
  describeCustomerBalance,
  getCustomerContact,
} from "./columns"

describe("customer total sorting", () => {
  test("compares exact minor-unit strings beyond Number safe integer range", () => {
    expect(compareCustomerTotals("9007199254740993", "9007199254740992")).toBe(
      1,
    )
    expect(compareCustomerTotals("9007199254740992", "9007199254740993")).toBe(
      -1,
    )
    expect(compareCustomerTotals("9007199254740993", "9007199254740993")).toBe(
      0,
    )
  })
})

describe("customer balance wording", () => {
  const balance = (owed: string, paidAhead: string) => ({
    owedMinor: owed,
    paidAheadMinor: paidAhead,
    netMinor: (BigInt(owed) - BigInt(paidAhead)).toString(),
  })
  test("owing shows the amount net of money paid ahead", () => {
    expect(describeCustomerBalance(balance("12800000", "800000"))).toEqual({
      kind: "owes",
      amountMinor: "12000000",
      afterPaidAheadMinor: "800000",
    })
    expect(describeCustomerBalance(balance("4500000", "0"))).toEqual({
      kind: "owes",
      amountMinor: "4500000",
      afterPaidAheadMinor: null,
    })
  })
  test("paid ahead and paid up never show a minus sign", () => {
    expect(describeCustomerBalance(balance("0", "1250000"))).toEqual({
      kind: "paidAhead",
      amountMinor: "1250000",
    })
    expect(describeCustomerBalance(balance("0", "0"))).toEqual({
      kind: "settled",
    })
  })
})

describe("customer contact line", () => {
  const row = (fields: Record<string, unknown>) =>
    ({
      phone: null,
      email: null,
      identityType: "name",
      ...fields,
    }) as unknown as Parameters<typeof getCustomerContact>[0]
  test("never shows identity codes", () => {
    expect(getCustomerContact(row({ phone: "0803" }))).toBe("0803")
    expect(getCustomerContact(row({ identityType: "walk-in" }))).toBe(
      "Sales with no customer details",
    )
    expect(getCustomerContact(row({}))).toBe("No phone or email")
  })
})
