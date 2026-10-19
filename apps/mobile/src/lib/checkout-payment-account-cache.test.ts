import { expect, test } from "bun:test"
import {
  checkoutAccountScope,
  checkoutAccountScopeKey,
  checkoutAccountTicketCurrent,
  eligibleCheckoutPaymentAccounts,
  parseCheckoutAccountSnapshot,
} from "./checkout-payment-account-cache"

const scope = {
  actorUserId: "actor",
  businessId: "business",
  storeId: "store",
  currencyCode: "NGN",
}
const snapshot = () => ({
  scope: { ...scope },
  checkedAt: 1000,
  data: {
    book: { id: "book", currencyCode: "NGN" },
    accounts: [
      {
        id: "cash",
        name: "Till",
        purpose: "CASH",
        paymentMethods: ["cash"],
        paused: false,
      },
      {
        id: "bank",
        name: "Bank",
        purpose: "BANK",
        paymentMethods: ["bank_transfer", "pos"],
        paused: false,
      },
      {
        id: "paused",
        name: "Paused",
        purpose: "BANK",
        paymentMethods: ["bank_transfer"],
        paused: true,
      },
    ],
  },
})

test("checkout scope and ticket bind original actor/business/Store/currency/generation", () => {
  expect(
    checkoutAccountScope(
      { id: "actor", businessId: "business", storeId: "store" },
      "NGN",
    ),
  ).toEqual(scope)
  expect(
    checkoutAccountScope({ id: "actor", businessId: "business" }, "NGN"),
  ).toBeNull()
  expect(
    checkoutAccountScope(
      { id: "actor", businessId: "business", storeId: "store" },
      "ngn",
    ),
  ).toBeNull()
  const ticket = { scope, generation: 5 }
  expect(checkoutAccountTicketCurrent(ticket, scope, 5)).toBe(true)
  for (const changed of [
    null,
    { ...scope, actorUserId: "other" },
    { ...scope, businessId: "other" },
    { ...scope, storeId: "other" },
    { ...scope, currencyCode: "USD" },
  ])
    expect(checkoutAccountTicketCurrent(ticket, changed, 5)).toBe(false)
  expect(checkoutAccountTicketCurrent(ticket, scope, 6)).toBe(false)
  expect(checkoutAccountScopeKey(scope)).not.toBe(
    checkoutAccountScopeKey({ ...scope, storeId: "other" }),
  )
})

test("cache accepts dedicated balance-free response and respects actual method/pause settings", () => {
  const input = snapshot()
  const parsed = parseCheckoutAccountSnapshot(input)
  if (!parsed) throw Error("Expected dedicated account snapshot")
  expect(
    eligibleCheckoutPaymentAccounts(parsed.data, "bank_transfer").map(
      (account) => account.id,
    ),
  ).toEqual(["bank"])
  expect(
    eligibleCheckoutPaymentAccounts(parsed.data, "cash").map(
      (account) => account.id,
    ),
  ).toEqual(["cash"])
  expect(eligibleCheckoutPaymentAccounts(parsed.data, "card")).toEqual([])
  const first = input.data.accounts[0]
  if (!first) throw Error("Expected cash account")
  first.name = "Changed caller"
  expect(parsed.data.accounts[0]?.name).toBe("Till")
})

test("cache refuses foreign currency, extra/private Finance data, duplicates and malformed settings", () => {
  const input = snapshot()
  for (const bad of [
    { ...input, data: { ...input.data, balance: 500 } },
    {
      ...input,
      data: {
        ...input.data,
        book: { ...input.data.book, currencyCode: "USD" },
      },
    },
    { ...input, data: { ...input.data, book: null } },
    {
      ...input,
      data: {
        ...input.data,
        accounts: [input.data.accounts[0], input.data.accounts[0]],
      },
    },
    {
      ...input,
      data: {
        ...input.data,
        accounts: [{ ...input.data.accounts[0], balance: 500 }],
      },
    },
    {
      ...input,
      data: {
        ...input.data,
        accounts: [
          { ...input.data.accounts[0], paymentMethods: ["bank_transfer"] },
        ],
      },
    },
    {
      ...input,
      data: {
        ...input.data,
        accounts: [
          { ...input.data.accounts[0], paymentMethods: ["cash", "cash"] },
        ],
      },
    },
    { ...input, checkedAt: Number.NaN },
  ])
    expect(parseCheckoutAccountSnapshot(bad)).toBeNull()
  expect(
    parseCheckoutAccountSnapshot({
      ...input,
      data: { book: null, accounts: [] },
    })?.data.book,
  ).toBeNull()
})
