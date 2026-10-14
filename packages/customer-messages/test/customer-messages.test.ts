import { describe, expect, test } from "bun:test"
import {
  type MessageTemplate,
  buildWhatsAppMessageUrl,
  customerMessageEvents,
  customerMessageVariableLabels,
  normalizeWhatsAppPhone,
  renderCustomerMessageTemplate,
  resolveEffectiveMessageTemplate,
  validateCustomerMessageTemplate,
} from "../src"

describe("customer message catalog and templates", () => {
  test("exports the eight ordered customer-facing events", () => {
    expect(customerMessageEvents.map(({ key }) => key)).toEqual([
      "order.recorded",
      "payment.recorded",
      "order.payment_reminder",
      "order.ready_for_pickup",
      "order.out_for_delivery",
      "order.completed",
      "order.cancelled",
      "payment.refund_recorded",
    ])
    for (const event of customerMessageEvents) {
      expect(() =>
        validateCustomerMessageTemplate(event.key, event.starterBody),
      ).not.toThrow()
    }
    expect(customerMessageVariableLabels.customer_first_name).toBe(
      "Customer first name",
    )
  })

  test("rejects empty, overlong, malformed, unknown, disallowed and HTML input", () => {
    expect(() =>
      validateCustomerMessageTemplate("order.recorded", " \n "),
    ).toThrow(/cannot be empty/)
    expect(() =>
      validateCustomerMessageTemplate("order.recorded", "😀".repeat(1_001)),
    ).toThrow(/1000 characters/)
    expect(() =>
      validateCustomerMessageTemplate("order.recorded", "Hello {order_number"),
    ).toThrow(/malformed/)
    expect(() =>
      validateCustomerMessageTemplate("order.recorded", "Hello {unknown}"),
    ).toThrow(/not allowed/)
    expect(() =>
      validateCustomerMessageTemplate(
        "payment.recorded",
        "Hello {items_summary}",
      ),
    ).toThrow(/not allowed/)
    expect(() =>
      validateCustomerMessageTemplate("order.recorded", "<b>Hello</b>"),
    ).toThrow(/HTML/)
  })

  test("renders one pass, preserves newlines, applies name fallbacks and requires used facts", () => {
    expect(
      renderCustomerMessageTemplate(
        "payment.recorded",
        "Hi {customer_first_name},\n{business_name}: {amount_paid}.",
        { business_name: "Shop", amount_paid: "₦1,000 {order_number}" },
      ),
    ).toBe("Hi there,\nShop: ₦1,000 {order_number}.")
    expect(() =>
      renderCustomerMessageTemplate(
        "payment.recorded",
        "Payment {amount_paid} for {order_number}",
        { amount_paid: "₦500" },
      ),
    ).toThrow(/Missing required message variable: order_number/)
    expect(
      renderCustomerMessageTemplate("order.recorded", "Hi {business_name}", {}),
    ).toBe("Hi our team")
  })
})

describe("WhatsApp phone and URL helpers", () => {
  test("parses explicit international numbers independently of the country hint", () => {
    expect(normalizeWhatsAppPhone("+44 20 7031 3000", "US")).toEqual({
      phoneE164: "+442070313000",
      digits: "442070313000",
      display: "+44 20 7031 3000",
    })
    expect(normalizeWhatsAppPhone("00442070313000")?.phoneE164).toBe(
      "+442070313000",
    )
  })

  test("requires a country hint for local numbers and rejects extensions or invalid input", () => {
    expect(normalizeWhatsAppPhone("020 7031 3000")).toBeNull()
    expect(normalizeWhatsAppPhone("020 7031 3000", "GB")?.phoneE164).toBe(
      "+442070313000",
    )
    expect(normalizeWhatsAppPhone("+44 20 7031 3000 ext 4")).toBeNull()
    expect(normalizeWhatsAppPhone("not a phone", "NG")).toBeNull()
  })

  test("encodes Unicode and punctuation once and enforces text and URL bounds", () => {
    const text = "Hi Ada,\n₦5,000 & tea ☕️"
    const url = new URL(buildWhatsAppMessageUrl("+14155552671", text))
    expect(url.origin).toBe("https://wa.me")
    expect(url.pathname).toBe("/14155552671")
    expect(url.search).toContain("%20")
    expect(url.search).toContain("%0A")
    expect(url.search).toContain("%26")
    expect(url.search).toContain("%E2%82%A6")
    expect(url.search).toContain("%E2%98%95")
    expect(url.searchParams.get("text")).toBe(text)
    expect(() => buildWhatsAppMessageUrl("14155552671", "hello")).toThrow(
      /E.164/,
    )
    expect(() =>
      buildWhatsAppMessageUrl("+14155552671", "x".repeat(1_501)),
    ).toThrow(/1500 characters/)
    expect(() =>
      buildWhatsAppMessageUrl("+14155552671", "😀".repeat(700)),
    ).toThrow(/Encoded WhatsApp message URL/)
    expect(() => buildWhatsAppMessageUrl("+14155552671", " ")).toThrow(
      /cannot be empty/,
    )
  })
})

describe("effective message template resolution", () => {
  const template = (
    scopeKey: string,
    enabled: boolean,
    revision: number,
  ): MessageTemplate => ({
    eventKey: "order.recorded",
    body: "Hi {customer_first_name}",
    enabled,
    revision,
    scopeKey,
  })

  test("uses a Store override, with disabled Store overrides blocking business fallback", () => {
    const business = template("business", true, 1)
    const store = template("store:store-7", true, 1)
    expect(
      resolveEffectiveMessageTemplate(
        [business, store],
        "store-7",
        "order.recorded",
      ),
    ).toEqual({ state: "composed", template: store, scope: "store" })

    const disabledStore = template("store:store-7", false, 2)
    expect(
      resolveEffectiveMessageTemplate(
        [business, disabledStore],
        "store-7",
        "order.recorded",
      ),
    ).toEqual({ state: "disabled", template: disabledStore, scope: "store" })
  })

  test("falls back to business scope and returns a missing state when absent", () => {
    const business = template("business", true, 3)
    expect(
      resolveEffectiveMessageTemplate([business], "store-7", "order.recorded"),
    ).toEqual({ state: "composed", template: business, scope: "business" })
    expect(
      resolveEffectiveMessageTemplate([], "store-7", "order.recorded"),
    ).toEqual({ state: "missing", template: null, scope: null })
  })
})
