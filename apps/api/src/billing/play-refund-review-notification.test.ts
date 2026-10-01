import { expect, test } from "bun:test"
import { parsePlayRefundReviewNotification } from "./play-refund-review-notification"

const validEvent = {
  eventTimeMillis: "1780000000000",
  pendingRefundReviewNotification: {
    pendingRefundToken: "pending-secret",
    orderId: "GPA.1234-5678-9012-34567",
    refundReason: 7,
    obfuscatedAccountId: "account-uuid",
  },
}

test("parses a review deadline from the provider event time", () => {
  const review = parsePlayRefundReviewNotification(validEvent)
  expect(review.pendingRefundToken).toBe("pending-secret")
  expect(review.occurredAt.getTime()).toBe(1_780_000_000_000)
  expect(review.responseDueAt.getTime()).toBe(1_780_086_400_000)
})

test("keeps unknown refund reasons reviewable and rejects missing custody data", () => {
  expect(
    parsePlayRefundReviewNotification({
      ...validEvent,
      pendingRefundReviewNotification: {
        ...validEvent.pendingRefundReviewNotification,
        refundReason: 99,
      },
    }).refundReason,
  ).toBe(99)
  expect(() =>
    parsePlayRefundReviewNotification({
      ...validEvent,
      pendingRefundReviewNotification: {
        ...validEvent.pendingRefundReviewNotification,
        pendingRefundToken: "",
      },
    }),
  ).toThrow()
  expect(() =>
    parsePlayRefundReviewNotification({
      ...validEvent,
      eventTimeMillis: "not-a-time",
    }),
  ).toThrow()
})
