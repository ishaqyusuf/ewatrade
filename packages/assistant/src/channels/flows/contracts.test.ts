import { describe, expect, test } from "bun:test"
import {
  parseWhatsAppFlowSubmission,
  whatsAppFlowKinds,
  whatsAppFlowReviewBoundary,
} from "./contracts"
import { whatsAppFlowDefinitions } from "./definitions"

const registration = {
  form_kind: "registration",
  form_version: "1",
  name: "QA Owner",
  email: "qa@example.com",
  businessName: "QA Shop",
  ageBand: "ADULT",
  countryCode: "NG",
  currencyCode: "NGN",
  acceptedTerms: true,
  acknowledgedPrivacyNotice: true,
}
const sale = {
  form_kind: "sale",
  form_version: "1",
  checkedAmount: true,
  customerChoice: "walk_in",
  description: "Goods supplied",
  received: "3000.50",
  method: "cash",
  moneyAccountId: "account-current-scope",
  paymentStatus: "full",
}
describe("Hybrid form contracts", () => {
  test("registration requires eligible age and separate legal consent, never a chat password", () => {
    expect(
      parseWhatsAppFlowSubmission("registration", registration).success,
    ).toBe(true)
    for (const patch of [
      { ageBand: "UNDER_13" },
      { acceptedTerms: false },
      { acknowledgedPrivacyNotice: false },
      { countryCode: "ZZ" },
      { password: "not-allowed" },
    ])
      expect(
        parseWhatsAppFlowSubmission("registration", {
          ...registration,
          ...patch,
        }).success,
      ).toBe(false)
    expect(whatsAppFlowReviewBoundary("registration")).toBe("email_proof")
  })
  test("sale drafts exact received money, description and partial total, without stock effects", () => {
    const parsed = parseWhatsAppFlowSubmission("sale", sale)
    expect(parsed.success).toBe(true)
    expect(
      parseWhatsAppFlowSubmission("sale", { ...sale, checkedAmount: undefined })
        .success,
    ).toBe(false)
    if (parsed.success)
      expect(parsed.data).toMatchObject({
        action: "sale_record",
        receivedMinor: 300050,
        totalMinor: 300050,
        description: "Goods supplied",
      })
    for (const patch of [
      { received: "30.005" },
      { received: "0" },
      { description: "" },
      { paymentStatus: "partial" },
      { paymentStatus: "partial", total: "100" },
      { balanceSourceId: "must-not-move-stock" },
    ])
      expect(
        parseWhatsAppFlowSubmission("sale", { ...sale, ...patch }).success,
      ).toBe(false)
  })
  test("Customer and zero-price simple product use canonical draft validation", () => {
    expect(
      parseWhatsAppFlowSubmission("customer", {
        form_kind: "customer",
        form_version: "1",
        name: "Buyer",
        email: "invalid",
      }).success,
    ).toBe(false)
    const parsed = parseWhatsAppFlowSubmission("product", {
      form_kind: "product",
      form_version: "1",
      name: "Rice",
      canonicalUnitName: "Bag",
      price: "0",
      openingStock: "0",
    })
    expect(parsed.success && parsed.data).toMatchObject({
      action: "product_create",
      priceMinor: 0,
      openingStock: "0",
    })
  })
  test("expense represents records only, stock draft remains app review with exact quantity", () => {
    const expense = {
      form_kind: "expense",
      form_version: "1",
      checkedAmount: true,
      amount: "40",
      description: "Delivery fare",
      bookId: "book",
      expenseCategoryId: "category",
      paymentStatus: "paid",
    }
    expect(parseWhatsAppFlowSubmission("expense", expense).success).toBe(false)
    expect(
      parseWhatsAppFlowSubmission("expense", {
        ...expense,
        moneyAccountId: "account",
      }).success,
    ).toBe(true)
    const stock = {
      form_kind: "stock_receive",
      form_version: "1",
      balanceSourceId: "stock",
      enteredInventoryUnitId: "unit",
      enteredQuantity: "2.250001",
      reason: "New delivery",
      source: "Receipt",
    }
    expect(parseWhatsAppFlowSubmission("stock_receive", stock).success).toBe(
      true,
    )
    expect(
      parseWhatsAppFlowSubmission("stock_receive", {
        ...stock,
        enteredQuantity: "0",
      }).success,
    ).toBe(false)
    expect(
      parseWhatsAppFlowSubmission("stock_receive", {
        ...stock,
        reason: "x".repeat(500),
        supplierName: "x".repeat(160),
      }).success,
    ).toBe(false)
    expect(whatsAppFlowReviewBoundary("stock_receive")).toBe("app_review")
  })
  test("money and quantity inputs retain exact decimal strings through native review", () => {
    const decimalFields = new Set([
      "received",
      "total",
      "price",
      "openingStock",
      "amount",
      "enteredQuantity",
      "unitCost",
    ])
    const seen = new Set<string>()
    for (const definition of Object.values(whatsAppFlowDefinitions))
      for (const screen of definition.screens) {
        const children = screen.layout.children[0]?.children ?? []
        for (const component of children)
          if (
            typeof component.name === "string" &&
            decimalFields.has(component.name)
          ) {
            seen.add(component.name)
            expect(component).toMatchObject({
              type: "TextInput",
              "input-type": "text",
            })
          }
      }
    expect([...seen].sort()).toEqual([...decimalFields].sort())
    expect(whatsAppFlowDefinitions.sale.screens.at(-1)?.data).toMatchObject({
      received: { type: "string", __example__: "Example" },
      total: { type: "string", __example__: "Example" },
    })
    expect(whatsAppFlowDefinitions.expense.screens.at(-1)?.data).toMatchObject({
      amount: { type: "string", __example__: "Example" },
    })
  })
  test("all six native definitions route to a draft completion without deployment IDs", () => {
    for (const kind of whatsAppFlowKinds) {
      const definition = whatsAppFlowDefinitions[kind]
      expect(JSON.stringify(definition)).not.toContain("flow_id")
      const terminal = definition.screens.at(-1)
      expect(terminal?.terminal).toBe(true)
      const children = terminal?.layout.children[0]?.children
      const footer = children?.at(-1)
      expect(footer).toMatchObject({
        type: "Footer",
        "on-click-action": {
          name: "complete",
          payload: { form_kind: kind, form_version: "1" },
        },
      })
    }
  })
})
