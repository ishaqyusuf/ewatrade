import { expect, test } from "bun:test"
import { setupMoneyEdit } from "./setup-money-edit"

const fields = {
  name: "Till",
  purpose: "CASH" as const,
  bankName: "",
  balance: "",
}
test("missing cash balance stays unknown; an explicit zero is retained", () => {
  expect(setupMoneyEdit(fields)?.openingBalanceMinor).toBeUndefined()
  expect(setupMoneyEdit({ ...fields, balance: "0" })?.openingBalanceMinor).toBe(
    0,
  )
  expect(
    setupMoneyEdit({ ...fields, balance: "1,250.50" })?.openingBalanceMinor,
  ).toBe(125050)
})
test("cash removes an old bank name and bank details use the canonical limits", () => {
  expect(
    setupMoneyEdit({ ...fields, bankName: "Old bank" })?.bankName,
  ).toBeUndefined()
  expect(
    setupMoneyEdit({ ...fields, purpose: "BANK", bankName: "  Access  " })
      ?.bankName,
  ).toBe("Access")
  expect(
    setupMoneyEdit({ ...fields, purpose: "BANK", bankName: "a".repeat(61) }),
  ).toBeNull()
})
test("invalid and negative balances cannot erase or replace a reviewed amount", () => {
  for (const balance of ["-1", "not money", "0.001", "100000000.01"])
    expect(setupMoneyEdit({ ...fields, balance })).toBeNull()
  expect(setupMoneyEdit({ ...fields, name: " " })).toBeNull()
})
