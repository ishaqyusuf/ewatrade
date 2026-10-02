import { describe, expect, test } from "bun:test"

import { buildOfflineOrderCommand } from "./offline-order"

describe("offline Order command", () => {
  test("carries only an explicit saved directory identity", () => {
    const base = {
      clientCommandId: "saved-customer-order",
      lines: [{ offeringId: "offering_123", quantity: "1" }],
    }
    const saved = buildOfflineOrderCommand({
      ...base,
      customer: { name: "Ada", directoryId: "saved-customer-id" },
    })
    expect(saved.payload).toHaveProperty("customerId", "saved-customer-id")
    const contact = buildOfflineOrderCommand({
      ...base,
      customer: { name: "Ada" },
    })
    expect(contact.payload).not.toHaveProperty("customerId")
  })
  test("keeps customer creation and payment inside the Order command", () => {
    expect(
      buildOfflineOrderCommand({
        clientCommandId: "order-offline-123",
        customer: {
          name: "Ada Okafor",
          phone: "08000000000",
        },
        lines: [{ offeringId: "offering_123", quantity: "2" }],
        payment: {
          amountMinor: 25_000,
          clientPaymentId: "payment-offline-123",
          method: "bank_transfer",
        },
      }),
    ).toEqual({
      clientCommandId: "order-offline-123",
      dependencyClientIds: [],
      eventVersion: 1,
      payload: {
        customerEmail: undefined,
        customerName: "Ada Okafor",
        customerPhone: "08000000000",
        initialPayment: {
          amountMinor: 25_000,
          clientPaymentId: "payment-offline-123",
          method: "bank_transfer",
        },
        kind: "commercial_order",
        lines: [{ offeringId: "offering_123", quantity: "2" }],
      },
    })
  })

  test("omits payment for an unpaid Order", () => {
    expect(
      buildOfflineOrderCommand({
        clientCommandId: "order-offline-456",
        lines: [{ offeringId: "offering_456", quantity: "1" }],
      }).payload,
    ).toEqual({
      customerEmail: undefined,
      customerName: undefined,
      customerPhone: undefined,
      kind: "commercial_order",
      lines: [{ offeringId: "offering_456", quantity: "1" }],
    })
  })
})
