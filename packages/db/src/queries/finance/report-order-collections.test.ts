import { describe, expect, test } from "bun:test"
import {
  ORDER_COLLECTIONS_ACCOUNT,
  reportOrderCollections,
} from "./report-order-collections"

const row = {
  accountId: "collections",
  ...ORDER_COLLECTIONS_ACCOUNT,
  closingBalanceMinor: "9007199254740993123",
  periodBalanceMinor: "-2500",
}

describe("reportOrderCollections", () => {
  test("returns exact period and closing amounts of the control account", () => {
    expect(
      reportOrderCollections([
        { ...row, accountId: "cash", code: "1000", name: "Cash" },
        row,
      ]),
    ).toEqual({
      accountId: "collections",
      receivedMinor: "-2500",
      heldMinor: "9007199254740993123",
    })
  })

  test("ignores look-alike accounts and Books without collections", () => {
    expect(reportOrderCollections([])).toBeNull()
    expect(
      reportOrderCollections([
        { ...row, name: "Customer deposits" },
        { ...row, kind: "ASSET" },
        { ...row, purpose: "CUSTOMER_ADVANCES" },
      ]),
    ).toBeNull()
  })
})
