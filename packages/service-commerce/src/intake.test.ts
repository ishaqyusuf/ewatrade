import { describe, expect, test } from "bun:test"

import {
  serviceCommerceIntakeAcceptedSchema,
  serviceCommerceIntakeEnvelopeSchema,
  serviceCommerceIntakeRecoverySchema,
} from "./schemas/intake"

const consent = {
  contactOptIn: false,
  privacyNoticeVersion: "2026-08-10",
}

describe("Service Commerce channel-neutral intake", () => {
  test("binds every channel to its server-resolved opaque context", () => {
    const web = serviceCommerceIntakeEnvelopeSchema.parse({
      channel: "web",
      clientCommandId: "web_1",
      consent,
      context: { kind: "entry_point", token: "entry_token" },
      intent: {
        customer: { name: "Ada" },
        demand: { kind: "commerce_inquiry", reason: "needs_identification" },
        kind: "commerce_inquiry",
        lines: [{ description: "Red small bag" }],
        summary: "Is this bag available?",
      },
    })
    expect(web.context.kind).toBe("entry_point")

    expect(
      serviceCommerceIntakeEnvelopeSchema.safeParse({
        ...web,
        channel: "whatsapp",
      }).success,
    ).toBe(false)
  })

  test("requires an explicit source intent instead of guessing from free text", () => {
    expect(
      serviceCommerceIntakeEnvelopeSchema.safeParse({
        channel: "web",
        clientCommandId: "web_1",
        consent,
        context: { kind: "entry_point", token: "entry_token" },
        intent: { kind: "unknown", text: "I need help" },
      }).success,
    ).toBe(false)
  })

  test("keeps exact Product demand on the cart or Order recovery path", () => {
    const envelope = serviceCommerceIntakeEnvelopeSchema.parse({
      channel: "staff",
      clientCommandId: "staff_1",
      consent,
      context: { kind: "store", storeId: "store_1" },
      intent: {
        kind: "exact_product",
        offeringId: "offering_1",
        quantity: "2",
      },
    })
    expect(envelope.intent.kind).toBe("exact_product")
    expect(
      serviceCommerceIntakeRecoverySchema.parse({
        action: "use_cart",
        code: "unsupported",
        status: "recovery",
      }),
    ).toMatchObject({ action: "use_cart" })
  })

  test("normalizes accepted results without private customer or provider data", () => {
    const result = serviceCommerceIntakeAcceptedSchema.parse({
      channel: "whatsapp",
      replayed: true,
      source: { id: "inquiry_1", kind: "commerce_inquiry" },
      status: "accepted",
    })
    expect(Object.keys(result).sort()).toEqual([
      "channel",
      "replayed",
      "source",
      "status",
    ])
  })
})
