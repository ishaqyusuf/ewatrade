import { expect, test } from "bun:test"
import {
  STORE_PURCHASE_PENDING_MESSAGE,
  storePurchaseErrorMessage,
} from "./store-purchase-message"

test("cancelled, pending and failed store outcomes never imply a verified grant", () => {
  expect(storePurchaseErrorMessage("user-cancelled")).toContain(
    "No new subscription",
  )
  expect(storePurchaseErrorMessage("pending")).toBe(
    STORE_PURCHASE_PENDING_MESSAGE,
  )
  expect(storePurchaseErrorMessage("deferred-payment")).toBe(
    STORE_PURCHASE_PENDING_MESSAGE,
  )
  expect(storePurchaseErrorMessage("network-error")).toContain(
    "purchase history",
  )
})
