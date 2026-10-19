import { expect, test } from "bun:test"
import { renderWhatsAppFinalReply } from "@ewatrade/assistant/channels/render"
import { generalStoredPartSchema } from "@ewatrade/assistant/general/contracts"
import {
  catalogItemReadAnswers,
  customerReadAnswers,
} from "./catalog-customers-answers"

const options = {
  storeId: "selected",
  storeName: "Main Store",
  asOf: "2026-10-15T14:00:00.000Z",
}
const offering = {
  name: "Crate",
  status: "active" as const,
  pricingPolicy: "fixed" as const,
  fixedPriceMinor: 100001,
  currencyCode: "NGN",
  stores: [{ storeId: "selected", isAvailable: true }],
}
const variant = {
  name: "Large",
  status: "active" as const,
  offerings: [offering],
}
const item = {
  name: "Eggs",
  kind: "product" as const,
  status: "active" as const,
  variants: [variant],
}
const rendered = (answers: ReturnType<typeof catalogItemReadAnswers>) => {
  const parts = answers.map((data) => ({ type: "data-general-answer", data }))
  for (const part of parts)
    expect(generalStoredPartSchema.safeParse(part).success).toBe(true)
  const result = renderWhatsAppFinalReply(parts)
  expect(result.kind).toBe("reply")
  return result.chunks.join("\n")
}

test("catalog renders exact offering money, independent statuses and current Store availability", () => {
  const answers = catalogItemReadAnswers(
    {
      ...item,
      status: "draft",
      variants: [{ ...variant, status: "archived" }],
    },
    options,
  )
  expect(answers[1]?.value).toBe("₦1,000.01")
  const text = rendered(answers)
  expect(text).toContain("Large (archived)")
  expect(text).toContain("Item: draft")
  expect(text).toContain("Available for selling in this Store")
  expect(text).toContain("does not make a draft or archived")
  expect(text).toContain("No stock balance")
  expect(text).toContain(options.asOf)
})

test("quote/order-total policies, missing prices and absent Store facts never become free prices or zero stock", () => {
  const offerings = [
    { ...offering, pricingPolicy: "quote_required" as const },
    { ...offering, pricingPolicy: "order_total" as const },
    { ...offering, fixedPriceMinor: null },
    { ...offering, fixedPriceMinor: Number.MAX_SAFE_INTEGER + 1 },
    { ...offering, fixedPriceMinor: -1 },
    { ...offering, currencyCode: "" },
    {
      ...offering,
      fixedPriceMinor: 0,
      stores: [{ storeId: "elsewhere", isAvailable: false }],
    },
    { ...offering, stores: [{ storeId: "selected", isAvailable: false }] },
  ]
  const answers = catalogItemReadAnswers(
    { ...item, variants: [{ ...variant, offerings }] },
    options,
  )
  expect(answers.slice(1).map((answer) => answer.value)).toEqual([
    "Quote required",
    "Price set on the order",
    "Price unavailable",
    "Price unavailable",
    "Price unavailable",
    "Price unavailable",
    "₦0.00",
    "₦1,000.01",
  ])
  expect(answers[7]?.detail).toContain(
    "Store selling availability not recorded",
  )
  expect(answers[8]?.detail).toContain("Unavailable for selling in this Store")
  expect(rendered(answers)).not.toContain("zero stock")
})

test("same-name offerings stay separate and long lists explicitly omit further choices", () => {
  const variants = Array.from({ length: 12 }, (_, index) => ({
    name: `Variant ${index + 1}`,
    status: "active" as const,
    offerings: [offering],
  }))
  const answers = catalogItemReadAnswers({ ...item, variants }, options)
  expect(answers).toHaveLength(11)
  expect(answers[0]?.detail).toContain("10 of 12 saved offerings shown")
  expect(answers[0]?.detail).toContain("further offerings are omitted")
  expect(answers[0]?.detail).toContain("ask which one")
  expect(answers[1]?.detail).toContain("Variant 1")
  expect(answers[2]?.detail).toContain("Variant 2")
  expect(rendered(answers)).not.toContain("Variant 11")
})

test("customer renders saved contacts and only five authorized order status facts", () => {
  const orders = Array.from({ length: 8 }, (_, index) => ({
    orderNumber: `ORD-${index + 1}`,
    status: "COMPLETED" as const,
    paymentStatus: "PENDING" as const,
    totalMinor: 900000,
    privateNote: "never-display-this-note",
  }))
  const answers = customerReadAnswers(
    {
      name: "Amina",
      phone: "+2348000000001",
      email: "amina@example.com",
      orders,
    },
    options,
  )
  expect(answers).toHaveLength(6)
  const text = rendered(answers)
  expect(text).toContain("+2348000000001")
  expect(text).toContain("amina@example.com")
  expect(text).toContain("5 recent authorized orders")
  expect(text).toContain("ORD-5")
  expect(text).not.toContain("ORD-6")
  expect(text).not.toContain("never-display-this-note")
  expect(text).not.toContain("900000")
  expect(text).toContain("Recorded payment status: PENDING")
  expect(text).toContain("not a complete customer history")
  expect(text).toContain("No paid amount")
})

test("empty reads and oversized labels remain truthful, bounded and grapheme-safe", () => {
  const family = "👨‍👩‍👧‍👦"
  const long = family.repeat(200)
  const catalog = catalogItemReadAnswers(
    { ...item, name: long, variants: [] },
    { ...options, storeName: long },
  )
  const customer = customerReadAnswers(
    { name: long, phone: null, email: null, orders: [] },
    options,
  )
  expect(catalog[0]?.detail).toContain("0 of 0 saved offerings")
  expect(catalog[0]?.title).toBe(`${family.repeat(14)}…`)
  expect(customer[0]?.detail).toContain("Phone: not recorded")
  expect(customer[0]?.detail).toContain("0 recent authorized orders")
  rendered(catalog)
  rendered(customer)
})
