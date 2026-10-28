import { describe, expect, test } from "bun:test"
import {
  orderCreditIdentity,
  orderCreditView,
} from "./order-customer-credit-model"

const funds = {
  orderId: "ord_1",
  customerId: "cus_1",
  availableMinor: "300000",
  reservedMinor: "500000",
  currencyCode: "NGN",
  accountId: "acc_1",
  accountRevision: "4",
  showCredit: true,
}
const fresh = {
  allowed: true,
  status: "success" as const,
  forbidden: false,
  fetchedAfterMount: true,
  data: funds,
  orderId: "ord_1",
  customerId: "cus_1",
  orderCurrency: "NGN",
}

describe("order customer credit", () => {
  test("shows a fresh positive amount to an owner or admin", () => {
    expect(orderCreditView(fresh)).toEqual({
      kind: "credit",
      availableMinor: "300000",
      currencyCode: "NGN",
      accountId: "acc_1",
    })
  })
  test("unknown or missing access never reads or shows a balance", () => {
    for (const allowed of [null, false])
      expect(orderCreditView({ ...fresh, allowed })).toEqual({ kind: "hidden" })
  })
  test("an earlier cached answer isn't shown until this read finishes", () => {
    expect(orderCreditView({ ...fresh, fetchedAfterMount: false })).toEqual({
      kind: "loading",
    })
  })
  test("a failed read is unavailable, never zero, even with cached data", () => {
    expect(orderCreditView({ ...fresh, status: "error" })).toEqual({
      kind: "unavailable",
    })
    expect(orderCreditView({ ...fresh, orderCurrency: "USD" })).toEqual({
      kind: "unavailable",
    })
    // Refused Finance access shows nothing at all, not a retry or a zero.
    expect(
      orderCreditView({ ...fresh, status: "error", forbidden: true }),
    ).toEqual({ kind: "hidden" })
  })
  test("no account, nothing left or a zero hides the row", () => {
    expect(orderCreditView({ ...fresh, data: null })).toEqual({
      kind: "hidden",
    })
    expect(
      orderCreditView({ ...fresh, data: { ...funds, showCredit: false } }),
    ).toEqual({ kind: "hidden" })
    expect(
      orderCreditView({ ...fresh, data: { ...funds, availableMinor: "0" } }),
    ).toEqual({ kind: "hidden" })
  })
  test("a new customer or currency on the same Order reads afresh", () => {
    const order = {
      id: "ord_1",
      customerId: "cus_1",
      currencyCode: "NGN",
      totalMinor: 1000,
      amountPaidMinor: 0,
      creditMinor: 0,
      balanceDueMinor: 1000,
    }
    const key = orderCreditIdentity(order)
    for (const change of [
      { customerId: "cus_2" },
      { customerId: null },
      { currencyCode: "USD" },
      { amountPaidMinor: 500 },
    ])
      expect(orderCreditIdentity({ ...order, ...change })).not.toBe(key)
  })
  test("rejects a different customer or Order returned between the two reads", () => {
    for (const change of [{ customerId: "cus_2" }, { orderId: "ord_2" }])
      expect(
        orderCreditView({ ...fresh, data: { ...funds, ...change } }),
      ).toEqual({ kind: "changed" })
  })
  test("missing or malformed successful data is unavailable, not known zero", () => {
    expect(orderCreditView({ ...fresh, data: undefined })).toEqual({
      kind: "unavailable",
    })
    expect(
      orderCreditView({
        ...fresh,
        data: { ...funds, availableMinor: "invalid" },
      }),
    ).toEqual({ kind: "unavailable" })
  })
})
