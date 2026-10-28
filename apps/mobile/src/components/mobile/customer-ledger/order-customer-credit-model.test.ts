import { expect, test } from "bun:test"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import {
  type OrderCustomerFunds,
  canSeeOrderCustomerCredit,
  orderCustomerCreditView,
} from "./order-customer-credit-model"

const funds = {
  orderId: "order_1",
  customerId: "customer_1",
  availableMinor: "1250050",
  reservedMinor: "0",
  currencyCode: "NGN",
  accountId: "acct_1",
  accountRevision: "7",
  showCredit: true,
} satisfies NonNullable<OrderCustomerFunds>
const order = {
  id: funds.orderId,
  customerId: funds.customerId,
  currencyCode: funds.currencyCode,
}
const view = (
  input: Partial<Parameters<typeof orderCustomerCreditView>[0]> = {},
) =>
  orderCustomerCreditView({
    order,
    allowed: true,
    offline: false,
    status: "success",
    fetching: false,
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
    customerId: "customer_1",
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
  expect(view({ order: { ...order, customerId: null } })).toEqual({
    kind: "hidden",
  })
})

test("cached funds must match the current Order customer and currency", () => {
  for (const current of [
    { ...order, id: "order_2" },
    { ...order, customerId: "customer_2" },
    { ...order, currencyCode: "USD" },
  ]) {
    expect(view({ order: current })).toEqual({ kind: "unavailable" })
    expect(view({ order: current, fetching: true })).toEqual({
      kind: "loading",
    })
  }
  // A previous customer's zero is also not a current answer.
  expect(
    view({
      order: { ...order, customerId: "customer_2" },
      data: { ...funds, availableMinor: "0", showCredit: false },
    }),
  ).toEqual({ kind: "unavailable" })
  expect(view({ data: null, fetching: true })).toEqual({ kind: "loading" })
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
