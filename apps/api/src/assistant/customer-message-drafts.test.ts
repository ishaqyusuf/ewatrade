import { expect, test } from "bun:test"
import type { CustomerMessageEventKey } from "@ewatrade/customer-messages"
import type { CustomerMessageAiInput } from "../schemas/customer-messages"
import {
  generateCustomerMessageDrafts,
  validateCustomerMessageDrafts,
} from "./customer-message-drafts"
import type { ResolvedAssistantModel } from "./model-resolution"

const one: CustomerMessageEventKey[] = ["payment.recorded"]
const all: CustomerMessageEventKey[] = [
  "order.recorded",
  "payment.recorded",
  "order.payment_reminder",
  "order.ready_for_pickup",
  "order.out_for_delivery",
  "order.completed",
  "order.cancelled",
  "payment.refund_recorded",
]
const input = (
  eventKeys: CustomerMessageEventKey[],
): CustomerMessageAiInput => ({
  eventKeys,
  tone: "friendly",
  language: "en",
  instructions: "Keep it warm.",
})
const eventDrafts = (keys: CustomerMessageEventKey[]) => ({
  drafts: keys.map((eventKey) => ({
    eventKey,
    body: `Hello {order_number}: ${eventKey}`,
  })),
})
const model = {
  model: {},
  provider: "openai",
  modelId: "test-model",
  providerOptions: {},
  rehearsal: false,
} as unknown as ResolvedAssistantModel

test("validates one requested event and returns requested order", () => {
  expect(validateCustomerMessageDrafts(eventDrafts(one), one)).toEqual(
    eventDrafts(one).drafts,
  )
})

test("validates a draft for every event and restores the requested event order", () => {
  const reversed = eventDrafts([...all].reverse())
  expect(
    validateCustomerMessageDrafts(reversed, all).map((draft) => draft.eventKey),
  ).toEqual(all)
})

test("rejects missing, duplicate, unrequested and unknown event keys", () => {
  expect(() =>
    validateCustomerMessageDrafts(eventDrafts(all.slice(0, 7)), all),
  ).toThrow("exactly one draft")
  expect(() =>
    validateCustomerMessageDrafts(
      { drafts: [eventDrafts(one).drafts[0], eventDrafts(one).drafts[0]] },
      one,
    ),
  ).toThrow("exactly one draft")
  expect(() =>
    validateCustomerMessageDrafts(eventDrafts(["order.completed"]), one),
  ).toThrow("exactly one draft")
  expect(() =>
    validateCustomerMessageDrafts(
      { drafts: [{ eventKey: "invoice.paid", body: "Done" }] },
      one,
    ),
  ).toThrow()
})

test("rejects unknown placeholder tokens and structurally invalid model output", () => {
  expect(() =>
    validateCustomerMessageDrafts(
      { drafts: [{ eventKey: "payment.recorded", body: "Hi {payment_link}" }] },
      one,
    ),
  ).toThrow()
  expect(() =>
    validateCustomerMessageDrafts(
      {
        drafts: [
          {
            eventKey: "payment.recorded",
            body: "Hi {customer_name}",
            extra: true,
          },
        ],
      },
      one,
    ),
  ).toThrow()
  expect(() =>
    validateCustomerMessageDrafts(
      { drafts: [{ eventKey: "payment.recorded", body: "   " }] },
      one,
    ),
  ).toThrow()
})

test("uses editable starter wording when no model is available without calling a provider", async () => {
  let calls = 0
  const generated = await generateCustomerMessageDrafts(input(one), {
    model: null,
    generate: async () => {
      calls++
      throw new Error("provider must not be called")
    },
  })
  expect(calls).toBe(0)
  expect(generated.source).toBe("starter")
  expect(generated.drafts).toHaveLength(1)
  expect(generated.drafts[0]).toMatchObject({
    eventKey: "payment.recorded",
    source: "STARTER",
  })
})

test("AI generation accepts exactly the requested drafts and passes only writing context", async () => {
  let prompt = ""
  const generated = await generateCustomerMessageDrafts(input(one), {
    model,
    generate: async ({ system, prompt: request }) => {
      prompt = request
      expect(system).toContain("No real customer name/phone/order data")
      return { output: eventDrafts(one), usage: { totalTokens: 42 } }
    },
  })
  expect(JSON.parse(prompt)).toMatchObject({
    tone: "friendly",
    language: "English",
    merchantInstructions: "Keep it warm.",
  })
  expect(generated).toMatchObject({
    source: "ai",
    reason: null,
    usage: { totalTokens: 42 },
    drafts: [{ eventKey: "payment.recorded", source: "AI_ASSISTED" }],
  })
})

test("invalid AI cardinality or wording falls back for all selected events", async () => {
  const invalidOutputs = [
    eventDrafts(all.slice(0, 7)),
    { drafts: [{ eventKey: "payment.recorded", body: "Hi {unknown}" }] },
    {
      drafts: [
        {
          eventKey: "payment.recorded",
          body: "Hi {customer_name}",
          extra: "unexpected",
        },
      ],
    },
  ]
  for (const output of invalidOutputs) {
    const result = await generateCustomerMessageDrafts(input(one), {
      model,
      generate: async () => ({ output }),
    })
    expect(result.source).toBe("starter")
    expect(result.reason).toContain("could not produce valid wording")
    expect(result.drafts).toHaveLength(1)
    expect(result.drafts[0]?.source).toBe("STARTER")
  }
})

test("provider errors and timeouts return editable starters without persisting a message", async () => {
  const failures = [
    new Error("provider unavailable"),
    new DOMException("provider deadline elapsed", "TimeoutError"),
  ]
  for (const failure of failures) {
    let providerCalls = 0
    const result = await generateCustomerMessageDrafts(input(all), {
      model,
      generate: async () => {
        providerCalls += 1
        throw failure
      },
    })
    expect(providerCalls).toBe(1)
    expect(result).toMatchObject({
      source: "starter",
      reason:
        "AI could not produce valid wording. These are editable starter messages.",
    })
    expect(result.drafts.map((draft) => draft.eventKey)).toEqual(all)
    expect(result.drafts.every((draft) => draft.source === "STARTER")).toBe(
      true,
    )
    // Draft generation has no persistence client; templates are only changed by a separate explicit command.
    expect(result.drafts.every((draft) => draft.body.length > 0)).toBe(true)
  }
})

test("rehearsal models return starter wording without calling the AI transport", async () => {
  let calls = 0
  const result = await generateCustomerMessageDrafts(input(all), {
    model: { ...model, rehearsal: true },
    generate: async () => {
      calls++
      throw new Error("rehearsal should stay local")
    },
  })
  expect(calls).toBe(0)
  expect(result.source).toBe("starter")
  expect(result.drafts.map((draft) => draft.eventKey)).toEqual(all)
})
