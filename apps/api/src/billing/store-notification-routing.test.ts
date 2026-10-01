import { expect, test } from "bun:test"
import {
  classifyAppleStoreNotification,
  classifyGoogleStoreNotification,
  requireSupportedGoogleVoidedSubscription,
} from "./store-notification-routing"

test("Apple acknowledges only TEST without a transaction", () => {
  expect(classifyAppleStoreNotification({ notificationType: "TEST" })).toBe(
    "test",
  )
  expect(() =>
    classifyAppleStoreNotification({
      notificationType: "RENEWAL_EXTENSION",
      subtype: "SUMMARY",
    }),
  ).toThrow("separate handling")
  expect(() =>
    classifyAppleStoreNotification({
      notificationType: "CONSUMPTION_REQUEST",
      signedTransactionInfo: "signed-transaction",
    }),
  ).toThrow("separate handling")
  expect(() =>
    classifyAppleStoreNotification({ notificationType: "DID_RENEW" }),
  ).toThrow("no signed transaction")
  expect(() =>
    classifyAppleStoreNotification({
      notificationType: "EXTERNAL_PURCHASE_TOKEN",
    }),
  ).toThrow("separate handling")
  expect(
    classifyAppleStoreNotification({
      notificationType: "DID_RENEW",
      signedTransactionInfo: "signed-transaction",
    }),
  ).toBe("reconcile")
})

test("Google requires one known event kind before acknowledgment", () => {
  expect(classifyGoogleStoreNotification({ testNotification: {} })).toBe("test")
  expect(
    classifyGoogleStoreNotification({ subscriptionNotification: {} }),
  ).toBe("subscription")
  expect(
    classifyGoogleStoreNotification({ voidedPurchaseNotification: {} }),
  ).toBe("voided")
  expect(
    classifyGoogleStoreNotification({ pendingRefundReviewNotification: {} }),
  ).toBe("refund_review")
  for (const event of [
    {},
    { oneTimeProductNotification: {} },
    { testNotification: {}, subscriptionNotification: {} },
    { testNotification: {}, pendingRefundReviewNotification: {} },
  ]) {
    expect(() => classifyGoogleStoreNotification(event)).toThrow()
  }
})

test("Google voided notifications reconcile only a full subscription void", () => {
  expect(() =>
    requireSupportedGoogleVoidedSubscription({ productType: 1, refundType: 1 }),
  ).not.toThrow()
  for (const input of [
    { productType: 2, refundType: 1 },
    { productType: 1, refundType: 2 },
    { productType: 99, refundType: 1 },
  ]) {
    expect(() => requireSupportedGoogleVoidedSubscription(input)).toThrow(
      "Unsupported Play voided subscription",
    )
  }
})
