import { expect, test } from "bun:test"
import { generalActionSchema } from "./contracts"
import {
  canonicalStatedMoneyDraft,
  statedAmountToMinor,
  statedMoneyDraftSchemas,
} from "./stated-money"

// 12 Oct 2026, Jawdah Poultry QA: "They paid 3,000 cash." was drafted as
// amountMinor 3000 (₦30.00) beside a correct line price of 240000.
const walkInSale = {
  action: "order_create",
  lines: [
    {
      offeringId: "quail-eggs-tray",
      quantity: "2",
      expectedFixedPriceMinor: 240_000,
      expectedConfigurationVersionId: "config",
    },
  ],
  initialPayment: { amount: "3,000", method: "cash", moneyAccountId: "till" },
}

test("a stated payment of 3,000 is ₦3,000.00, not ₦30.00", () => {
  expect(
    statedMoneyDraftSchemas.order_create.safeParse(walkInSale).success,
  ).toBe(true)
  const payload = generalActionSchema.parse(
    canonicalStatedMoneyDraft(walkInSale),
  )
  expect(payload).toMatchObject({
    initialPayment: { amountMinor: 300_000, method: "cash" },
    lines: [{ expectedFixedPriceMinor: 240_000 }],
  })
})

test("the model cannot send stated money as minor units", () => {
  for (const initialPayment of [
    { amountMinor: 3000, method: "cash" },
    { amount: 3000, method: "cash" },
    { amount: "₦3,000", method: "cash" },
    { amount: "3,00", method: "cash" },
    { amount: "3000.505", method: "cash" },
  ])
    expect(
      statedMoneyDraftSchemas.order_create.safeParse({
        ...walkInSale,
        initialPayment,
      }).success,
    ).toBe(false)
  expect(
    statedMoneyDraftSchemas.payment_record.safeParse({
      action: "payment_record",
      orderId: "order",
      amountMinor: 300_000,
      method: "cash",
    }).success,
  ).toBe(false)
})

test("typed lines, item totals and order payments convert exactly", () => {
  expect(statedAmountToMinor("0.5")).toBe(50)
  expect(statedAmountToMinor("1,234,567.89")).toBe(123_456_789)
  expect(
    canonicalStatedMoneyDraft({
      action: "order_create",
      lines: [
        { custom: "quick_sale", amount: "2500", description: "Fish" },
        { custom: "additional_cost", amount: "150.5" },
        { offeringId: "rice", quantity: "3", enteredTotal: "1,750" },
      ],
    }),
  ).toEqual({
    action: "order_create",
    lines: [
      { custom: "quick_sale", amountMinor: 250_000, description: "Fish" },
      { custom: "additional_cost", amountMinor: 15_050 },
      { offeringId: "rice", quantity: "3", enteredTotalMinor: 175_000 },
    ],
  })
  expect(
    canonicalStatedMoneyDraft({
      action: "payment_record",
      orderId: "order",
      amount: "5,020",
      method: "pos",
    }),
  ).toEqual({
    action: "payment_record",
    orderId: "order",
    amountMinor: 502_000,
    method: "pos",
  })
  const other = { action: "customer_create", name: "Amina" }
  expect(canonicalStatedMoneyDraft(other)).toBe(other)
})

test("a catalog line still needs exactly one pricing choice", () => {
  const line = { offeringId: "rice", quantity: "1" }
  for (const price of [
    {},
    { expectedFixedPriceMinor: 100, enteredTotal: "1" },
    { enteredTotalMinor: 100 },
  ])
    expect(
      statedMoneyDraftSchemas.order_create.safeParse({
        action: "order_create",
        lines: [{ ...line, ...price }],
      }).success,
    ).toBe(false)
})
