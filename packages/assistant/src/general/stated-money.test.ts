import { expect, test } from "bun:test"
import { z } from "zod"
import { writeCapabilities } from "../capabilities/manifest"
import { generalActionSchema } from "./contracts"
import {
  canonicalStatedMoneyDraft,
  copiedMinorFields,
  minorToStatedAmount,
  statedAmountToMinor,
  statedMoneyFields,
  statedMoneyFromCanonical,
  statedMoneyJsonSchema,
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
  const payload = generalActionSchema.parse(
    canonicalStatedMoneyDraft(walkInSale),
  )
  expect(payload).toMatchObject({
    initialPayment: { amountMinor: 300_000, method: "cash" },
    lines: [{ expectedFixedPriceMinor: 240_000 }],
  })
  // The model's own input is left as it was sent.
  expect(walkInSale.initialPayment.amount).toBe("3,000")
})

test("stated money cannot arrive in minor units or malformed", () => {
  for (const initialPayment of [
    { amountMinor: 3000, method: "cash" },
    { amount: 3000, method: "cash" },
    { amount: "₦3,000", method: "cash" },
    { amount: "3,00", method: "cash" },
    { amount: "3000.505", method: "cash" },
  ])
    expect(() =>
      canonicalStatedMoneyDraft({ ...walkInSale, initialPayment }),
    ).toThrow(z.ZodError)
  expect(() =>
    canonicalStatedMoneyDraft({
      action: "money_movement",
      amountMinor: "500000",
    }),
  ).toThrow("Write amount in major units")
})

test("bookkeeping amounts stay exact digit strings beyond float range", () => {
  expect(statedAmountToMinor("0.5")).toBe(50)
  expect(statedAmountToMinor("1,234,567.89")).toBe(123_456_789)
  expect(statedAmountToMinor("999999999999.99", "string")).toBe(
    "99999999999999",
  )
  expect(minorToStatedAmount(150)).toBe("1.50")
  expect(minorToStatedAmount("250000")).toBe("2500")
  expect(
    canonicalStatedMoneyDraft({
      action: "expense_record",
      lines: [{ amount: "12,500.75", categoryId: "feed" }],
      payment: { amount: "12500.75" },
    }),
  ).toEqual({
    action: "expense_record",
    lines: [{ amountMinor: "1250075", categoryId: "feed" }],
    payment: { amountMinor: "1250075" },
  })
})

test("nested product prices, totals and counted cash convert", () => {
  expect(
    canonicalStatedMoneyDraft({
      action: "product_create",
      name: "Eggs",
      price: "200",
      sellingUnits: [{ name: "Crate", containsQuantity: "30", price: "5,400" }],
      variants: [
        {
          price: "250",
          sellingUnitPrices: [{ unitName: "Crate", price: "6000" }],
        },
      ],
    }),
  ).toEqual({
    action: "product_create",
    name: "Eggs",
    priceMinor: 20_000,
    sellingUnits: [
      { name: "Crate", containsQuantity: "30", priceMinor: 540_000 },
    ],
    variants: [
      {
        priceMinor: 25_000,
        sellingUnitPrices: [{ unitName: "Crate", priceMinor: 600_000 }],
      },
    ],
  })
  expect(
    canonicalStatedMoneyDraft({
      action: "service_intake",
      initialPaymentAmount: "1500",
    }),
  ).toEqual({ action: "service_intake", initialPaymentMinor: 150_000 })
  expect(
    canonicalStatedMoneyDraft({
      action: "cash_count_record",
      observedBalance: "0",
    }),
  ).toEqual({ action: "cash_count_record", observedBalanceMinor: "0" })
  const copied = {
    action: "customer_credit_apply",
    amountMinor: "500000",
  }
  expect(canonicalStatedMoneyDraft(copied)).toBe(copied)
})

test("rehearsal drafts round-trip through the stated form", () => {
  const canonical = {
    action: "order_replace",
    changes: [
      { lineId: "line", unitPriceMinor: 150, enteredTotalMinor: 250_000 },
    ],
  }
  const stated = statedMoneyFromCanonical(canonical)
  expect(stated).toEqual({
    action: "order_replace",
    changes: [{ lineId: "line", unitPrice: "1.50", enteredTotal: "2500" }],
  })
  expect(canonicalStatedMoneyDraft(stated)).toEqual(canonical)
})

type JsonNode = {
  type?: unknown
  properties?: Record<string, JsonNode>
  items?: JsonNode
  anyOf?: JsonNode[]
  oneOf?: JsonNode[]
  allOf?: JsonNode[]
}
function minorPaths(
  node: JsonNode | undefined,
  path = "",
  out = new Map<string, unknown>(),
) {
  if (!node) return out
  for (const branch of [
    ...(node.anyOf ?? []),
    ...(node.oneOf ?? []),
    ...(node.allOf ?? []),
  ])
    minorPaths(branch, path, out)
  if (node.items) minorPaths(node.items, `${path}[]`, out)
  for (const [key, value] of Object.entries(node.properties ?? {})) {
    const next = path ? `${path}.${key}` : key
    if (/Minor$/.test(key)) out.set(next, value.type)
    minorPaths(value, next, out)
  }
  return out
}

// A new money field must say whether the user states it or it is copied from
// a read; unclassified minor fields are how "3,000" became ₦30.00.
test("every minor-unit draft field is classified as stated or copied", () => {
  for (const capability of writeCapabilities) {
    const found = minorPaths(
      z.toJSONSchema(capability.schema, {
        io: "input",
        unrepresentable: "any",
      }) as JsonNode,
    )
    const stated = Object.entries(
      (statedMoneyFields as Record<string, Record<string, { kind: string }>>)[
        capability.action
      ] ?? {},
    )
    const copied: readonly string[] =
      (copiedMinorFields as Record<string, readonly string[]>)[
        capability.action
      ] ?? []
    expect({
      action: capability.action,
      fields: [...found.keys()].sort(),
    }).toEqual({
      action: capability.action,
      fields: [...stated.map(([path]) => path), ...copied].sort(),
    })
    for (const [path, field] of stated)
      expect({
        action: capability.action,
        path,
        type: found.get(path),
      }).toEqual({
        action: capability.action,
        path,
        type: field.kind === "number" ? "integer" : "string",
      })
  }
})

test("the tool schema shows stated fields in major units", () => {
  const order = writeCapabilities.find(
    (capability) => capability.action === "order_create",
  )
  if (!order) throw Error("order_create capability missing")
  const schema = statedMoneyJsonSchema(
    z.toJSONSchema(order.schema, { io: "input" }),
  )
  const paths = minorPaths(schema as JsonNode)
  expect([...paths.keys()]).toEqual(["lines[].expectedFixedPriceMinor"])
  const json = JSON.stringify(schema)
  expect(json).toContain('"amount":{"type":"string"')
  expect(json).toContain('"enteredTotal":{"type":"string"')
  expect(json).toContain("Never convert to kobo/cents")
})
