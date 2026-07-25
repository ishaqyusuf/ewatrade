import { describe, expect, test } from "bun:test"

import {
  offlineCommandPayloadSchema,
  offlineReviewConflictSchema,
  offlineSettingsUpdateSchema,
} from "./offline"

describe("offline command payload", () => {
  test("accepts an Order with customer facts and an initial payment", () => {
    const result = offlineCommandPayloadSchema.parse({
      customerName: "Ada Okafor",
      customerPhone: "08000000000",
      initialPayment: {
        amountMinor: 12_500,
        clientPaymentId: "payment-offline-123",
        method: "cash",
      },
      kind: "commercial_order",
      lines: [
        {
          expectedFixedPriceMinor: 12_500,
          offeringId: "offering_123",
          quantity: "1",
        },
      ],
    })

    expect(result).toMatchObject({
      customerName: "Ada Okafor",
      initialPayment: {
        amountMinor: 12_500,
        clientPaymentId: "payment-offline-123",
        method: "cash",
      },
      kind: "commercial_order",
    })
  })

  test("rejects Product, inventory, Service, and staff work", () => {
    const unsupportedPayloads = [
      {
        canonicalUnitName: "Bag",
        kind: "product_setup",
        name: "Rabbit feed",
      },
      {
        balanceSourceId: "balance_123",
        enteredInventoryUnitId: "unit_123",
        enteredQuantity: "1",
        expectedBalanceRevision: 0,
        expectedConfigurationVersionId: "configuration_123",
        kind: "stock_receipt",
        reason: "Received",
      },
      {
        customerName: "Ada Okafor",
        kind: "service_intake",
        lines: [{ offeringId: "service_123", quantity: "1" }],
      },
      {
        email: "staff@example.com",
        kind: "staff_invite",
        role: "cashier",
      },
    ]

    for (const payload of unsupportedPayloads) {
      expect(offlineCommandPayloadSchema.safeParse(payload).success).toBe(false)
    }
  })
})

describe("offline admin policy and review schemas", () => {
  test("accepts both offline access and staff approval settings", () => {
    expect(
      offlineSettingsUpdateSchema.parse({
        approvalRequired: true,
        enabled: true,
      }),
    ).toEqual({ approvalRequired: true, enabled: true })
  })

  test("accepts approving a staged staff record", () => {
    expect(
      offlineReviewConflictSchema.parse({
        commandId: "command_123",
        decision: "approve",
      }),
    ).toEqual({ commandId: "command_123", decision: "approve" })
  })
})
