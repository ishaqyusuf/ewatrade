// @ts-expect-error Bun test runtime types are outside the notifications package tsconfig.
import { describe, expect, test } from "bun:test"

import type { EmailMessage } from "@ewatrade/email"

import {
  EmailService,
  createRetailOpsSharedLinkOrderDispatch,
  planNotificationDeliveries,
} from "../index"

const sharedLinkOrderPayload = {
  businessName: "Ewa Store",
  customerEmail: "buyer@example.com",
  customerName: "Buyer Name",
  customerPhone: "08000000000",
  merchantRecipients: [
    {
      displayName: "Owner",
      email: "owner@example.com",
    },
    {
      displayName: "Sales Rep",
      email: "rep@example.com",
    },
  ],
  notes: "Hold for pickup",
  orderId: "order-1",
  orderNumber: "ORD-1001",
  productName: "Rice",
  productUrl: "https://storefront.example.com/p/ewa/main/rice?t=token-12345",
  quantity: 2,
  totalFormatted: "NGN 37,000.00",
  unitName: "Bag",
}

describe("EmailService shared-link order dispatch", () => {
  test("sends customer and merchant shared-link order emails", async () => {
    const sentMessages: EmailMessage[] = []
    const notification = createRetailOpsSharedLinkOrderDispatch(
      sharedLinkOrderPayload,
    )
    const deliveryPlan = planNotificationDeliveries(notification)
    const service = new EmailService()

    expect(deliveryPlan.skippedChannels).toEqual([
      {
        channel: "in_app",
        reason: "No user recipients were available for in-app delivery.",
      },
    ])

    const result = await service.sendBulk(deliveryPlan.dispatches, {
      async send(message) {
        sentMessages.push(message)

        return {
          provider: "test",
          providerMessageId: `message-${sentMessages.length}`,
        }
      },
    })

    expect(result.failed).toBe(0)
    expect(result.sent).toBe(3)
    expect(result.skipped).toBe(0)
    expect(sentMessages).toHaveLength(3)

    const deliveryRoles = result.deliveries.map(
      (delivery) => delivery.deliveryRole,
    )
    expect(deliveryRoles).toEqual(["customer", "admin", "admin"])
    expect(
      result.deliveries.map((delivery) => delivery.recipientEmail),
    ).toEqual(["buyer@example.com", "owner@example.com", "rep@example.com"])

    const customerMessage = sentMessages.find(
      (message) => message.to === "buyer@example.com",
    )
    const merchantMessages = sentMessages.filter((message) =>
      ["owner@example.com", "rep@example.com"].includes(message.to),
    )

    expect(customerMessage?.subject).toContain("ORD-1001")
    expect(customerMessage?.text).toContain("Your order request was received")
    expect(customerMessage?.text).toContain("Rice")
    expect(customerMessage?.text).toContain("NGN 37,000.00")
    expect(customerMessage?.text).not.toContain("buyer@example.com")

    expect(merchantMessages).toHaveLength(2)
    for (const message of merchantMessages) {
      expect(message.subject).toContain("ORD-1001")
      expect(message.text).toContain("New product-link order request")
      expect(message.text).toContain("buyer@example.com")
      expect(message.text).toContain("Hold for pickup")
    }
  })

  test("records failed recipient delivery without throwing the dispatch", async () => {
    const notification = createRetailOpsSharedLinkOrderDispatch(
      sharedLinkOrderPayload,
    )
    const deliveryPlan = planNotificationDeliveries(notification)
    const service = new EmailService()

    const result = await service.sendBulk(deliveryPlan.dispatches, {
      async send(message) {
        if (message.to === "rep@example.com") {
          throw new Error("Provider rejected recipient")
        }

        return {
          provider: "test",
          providerMessageId: `sent:${message.to}`,
        }
      },
    })

    expect(result.sent).toBe(2)
    expect(result.failed).toBe(1)
    expect(result.deliveries).toHaveLength(3)

    const failedDelivery = result.deliveries.find(
      (delivery) => delivery.recipientEmail === "rep@example.com",
    )
    const sentDeliveries = result.deliveries.filter(
      (delivery) => delivery.status === "sent",
    )

    expect(failedDelivery).toMatchObject({
      deliveryRole: "admin",
      error: "Provider rejected recipient",
      notificationType: "retail_ops_shared_link_order_requested",
      recipientEmail: "rep@example.com",
      status: "failed",
    })
    expect(failedDelivery?.failedAt).toBeTruthy()
    expect(sentDeliveries.map((delivery) => delivery.recipientEmail)).toEqual([
      "buyer@example.com",
      "owner@example.com",
    ])
  })
})
