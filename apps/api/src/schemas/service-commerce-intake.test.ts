import { describe, expect, test } from "bun:test"

import {
  publicServiceCommerceIntakeSchema,
  staffServiceCommerceIntakeSchema,
  whatsAppServiceCommerceIntakeSchema,
} from "./service-commerce-intake"

const consent = {
  contactOptIn: false,
  privacyNoticeVersion: "2026-08",
}
const exactProduct = {
  kind: "exact_product" as const,
  offeringId: "offering_1",
  quantity: "1",
}

describe("Service Commerce intake API contracts", () => {
  test("keeps public web intake on an opaque entry point", () => {
    expect(
      publicServiceCommerceIntakeSchema.safeParse({
        channel: "web",
        clientCommandId: "command_123",
        consent,
        context: { kind: "entry_point", token: "opaque_token" },
        intent: exactProduct,
      }).success,
    ).toBe(true)
    expect(
      publicServiceCommerceIntakeSchema.safeParse({
        channel: "staff",
        clientCommandId: "command_123",
        consent,
        context: { kind: "store", storeId: "store_1" },
        intent: exactProduct,
      }).success,
    ).toBe(false)
  })

  test("requires authenticated Store context for staff intake", () => {
    expect(
      staffServiceCommerceIntakeSchema.safeParse({
        channel: "staff",
        clientCommandId: "command_123",
        consent,
        context: { kind: "store", storeId: "store_1" },
        intent: exactProduct,
      }).success,
    ).toBe(true)
  })

  test("requires provider identity for internal WhatsApp intake", () => {
    expect(
      whatsAppServiceCommerceIntakeSchema.safeParse({
        channel: "whatsapp",
        clientCommandId: "command_123",
        consent,
        context: { inboundEventId: "event_1", kind: "inbound_event" },
        intent: exactProduct,
      }).success,
    ).toBe(false)
  })
})
