import { expect, test } from "bun:test"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import {
  canSeeOrderCustomerCredit,
  orderCustomerCreditView,
} from "./order-customer-credit-model"

const funds = {
  availableMinor: "1250050",
  reservedMinor: "0",
  currencyCode: "NGN",
  accountId: "acct_1",
  accountRevision: "7",
  showCredit: true,
}
const view = (
  input: Partial<Parameters<typeof orderCustomerCreditView>[0]> = {},
) =>
  orderCustomerCreditView({
    allowed: true,
    offline: false,
    status: "success",
    data: funds,
    ...input,
  })

test("only owners and admins see customer credit", () => {
  expect(canSeeOrderCustomerCredit("OWNER")).toBe(true)
  expect(canSeeOrderCustomerCredit(" admin ")).toBe(true)
  for (const role of ["MANAGER", "CASHIER", "OPERATOR", undefined])
    expect(canSeeOrderCustomerCredit(role)).toBe(false)
  // Losing the role hides data that was already loaded.
  expect(view({ allowed: false })).toEqual({ kind: "hidden" })
})

test("positive credit shows the exact server amount", () => {
  expect(view()).toEqual({
    kind: "credit",
    accountId: "acct_1",
    available: formatFinanceMoney("1250050", "NGN"),
    reserved: null,
  })
  const big = view({
    data: {
      ...funds,
      availableMinor: "900719925474099312",
      reservedMinor: "500",
    },
  })
  expect(big).toMatchObject({
    available: formatFinanceMoney("900719925474099312", "NGN"),
    reserved: formatFinanceMoney("500", "NGN"),
  })
})

test("known zero and absent customer or ledger are hidden", () => {
  expect(
    view({ data: { ...funds, availableMinor: "0", showCredit: false } }),
  ).toEqual({ kind: "hidden" })
  expect(view({ data: null })).toEqual({ kind: "hidden" })
})

test("loading, errors, offline and odd answers never read as zero", () => {
  expect(view({ status: "pending", data: undefined })).toEqual({
    kind: "loading",
  })
  expect(view({ status: "error" })).toEqual({ kind: "error" })
  expect(view({ offline: true })).toEqual({ kind: "offline" })
  expect(view({ data: { ...funds, availableMinor: "0" } })).toEqual({
    kind: "unavailable",
  })
  expect(view({ data: { ...funds, availableMinor: "12.5" } })).toEqual({
    kind: "unavailable",
  })
  expect(view({ data: { ...funds, reservedMinor: "-1" } })).toEqual({
    kind: "unavailable",
  })
})
