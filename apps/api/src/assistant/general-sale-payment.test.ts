import { expect, test } from "bun:test"
import { generalActionSchema } from "@ewatrade/assistant/general/contracts"
import { respondGeneralRehearsal } from "@ewatrade/assistant/general/rehearsal"
const sale = {
  action: "order_create",
  lines: [
    { offeringId: "offering", quantity: "2", expectedFixedPriceMinor: 100 },
  ],
}
test("initial payment has explicit positive amount/method and no client command key", () => {
  expect(generalActionSchema.safeParse(sale).success).toBe(true)
  expect(
    generalActionSchema.safeParse({
      ...sale,
      initialPayment: { amountMinor: 150, method: "cash" },
    }).success,
  ).toBe(true)
  for (const payment of [
    { amountMinor: 0, method: "cash" },
    { amountMinor: 1.5, method: "cash" },
    { amountMinor: 150 },
    { amountMinor: 150, method: "cash", clientPaymentId: "injected" },
  ])
    expect(
      generalActionSchema.safeParse({ ...sale, initialPayment: payment })
        .success,
    ).toBe(false)
  expect(
    respondGeneralRehearsal([
      { role: "user", content: "sell 2 of offering at 1 paid 1.50 cash" },
    ]),
  ).toMatchObject({
    toolName: "draftAction",
    input: { ...sale, initialPayment: { amountMinor: 150, method: "cash" } },
  })
})

test("sale line chooses one explicit canonical pricing policy", () => {
  const line = { offeringId: "offering", quantity: "2" }
  expect(
    generalActionSchema.safeParse({
      ...sale,
      lines: [{ ...line, enteredTotalMinor: 175 }],
    }).success,
  ).toBe(true)
  for (const price of [
    {},
    { enteredTotalMinor: 0 },
    { enteredTotalMinor: 175, expectedFixedPriceMinor: 100 },
    { approvedQuotePriceMinor: 100 },
    { trustedUnitPriceMinor: 100 },
  ])
    expect(
      generalActionSchema.safeParse({ ...sale, lines: [{ ...line, ...price }] })
        .success,
    ).toBe(false)
})

test("saved customer rehearsal uses only an explicit ID; snapshot fields remain server-owned", () => {
  expect(
    respondGeneralRehearsal([
      {
        role: "user",
        content: "sell 2 of offering at 1 paid 1.50 cash customer customer-id",
      },
    ]),
  ).toMatchObject({
    toolName: "draftAction",
    input: {
      ...sale,
      customerId: "customer-id",
      initialPayment: { amountMinor: 150, method: "cash" },
    },
  })
  expect(
    generalActionSchema.safeParse({
      ...sale,
      customerName: "Injected snapshot",
    }).success,
  ).toBe(false)
})

test("item-total rehearsal preserves total rather than multiplying it by quantity", () => {
  expect(
    respondGeneralRehearsal([
      { role: "user", content: "sell 3 of offering for total 1.75" },
    ]),
  ).toMatchObject({
    toolName: "draftAction",
    input: {
      action: "order_create",
      lines: [
        { offeringId: "offering", quantity: "3", enteredTotalMinor: 175 },
      ],
    },
  })
})
