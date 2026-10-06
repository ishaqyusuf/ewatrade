import { describe, expect, test } from "bun:test"
import { qaLiveEffectForProcedure } from "./qa-provider-operation"

describe("qaLiveEffectForProcedure", () => {
  test.each([
    ["catalog.categories.suggest", "ai_analysis"],
    ["storeSubscriptions.verifyPurchase", "subscription"],
    ["domains.checkAvailability", "domain_registration"],
    ["domains.connectExternal", "domain_hosting"],
    ["domains.createCheckout", "domain_registration"],
    ["domains.verifyConnection", "domain_hosting"],
    ["prescriptions.refund", "refund"],
    ["prescriptions.uploadMedia", "media_analysis"],
    ["prescriptions.mediaAccess", "media_analysis"],
    ["prescriptions.startTranscription", "media_analysis"],
    ["serviceCommerce.media.requestMediaViewerGrant", "media_analysis"],
    ["retailOpsSubscriptions.createSubscriptionCheckoutIntent", "subscription"],
    ["prescriptions.connectWhatsAppManually", "whatsapp"],
    ["prescriptions.updateWhatsAppConnectionLifecycle", "whatsapp"],
    ["catalog.permanentDelete", "destructive"],
  ] as const)("classifies %s", (path, operation) => {
    expect(qaLiveEffectForProcedure(path)).toBe(operation)
  })

  test.each([
    "catalog.createItem",
    "orders.create",
    "payments.recordManualPayment",
    "qaPurge.start",
  ])("leaves safe ordinary mutation %s alone", (path) => {
    expect(qaLiveEffectForProcedure(path)).toBeNull()
  })
})
