import { describe, expect, test } from "bun:test"
import { evaluateQaProviderPolicy } from "@ewatrade/utils/qa-provider-policy"
import {
  qaLiveEffectForProcedure,
  qaProviderAdapterForProcedure,
} from "./qa-provider-operation"

describe("qaLiveEffectForProcedure", () => {
  test.each([
    ["storeSubscriptions.verifyPurchase", "subscription"],
    ["retailOps.checkWebSubscriptionPayment", "subscription"],
    ["retailOps.manageWebSubscription", "subscription"],
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
    "catalog.categories.suggest",
    "orders.create",
    "payments.recordManualPayment",
    "qaPurge.start",
  ])("leaves safe ordinary mutation %s alone", (path) => {
    expect(qaLiveEffectForProcedure(path)).toBeNull()
  })
})

describe("registered Paystack QA subscription adapter", () => {
  const configured = {
    APP_ENV: "preview",
    DEV_PROFILE: "preview",
    OWNER_BILLING_ENABLED: "true",
    STORE_BILLING_ENVIRONMENT: "sandbox",
    WEB_BILLING_ENVIRONMENT: "sandbox",
    WEB_BILLING_RECONCILIATION_ENABLED: "true",
    PAYSTACK_SUBSCRIPTION_SECRET_KEY: "sk_test_FAKE_NOT_A_REAL_KEY",
    PAYSTACK_QA_SUBSCRIPTIONS_TEST_ADAPTER_ENABLED: "true",
  }
  const paths = [
    "retailOps.createSubscriptionCheckoutIntent",
    "retailOps.checkWebSubscriptionPayment",
    "retailOps.manageWebSubscription",
  ]
  test("admits only explicit local/Preview sandbox web paths through the existing policy", () => {
    for (const profile of ["local", "preview"]) {
      const env = { ...configured, APP_ENV: profile, DEV_PROFILE: profile }
      for (const path of paths) {
        const adapter = qaProviderAdapterForProcedure(path, env, true)
        expect(adapter).toBe("test")
        expect(
          evaluateQaProviderPolicy({
            adapter,
            operation: "subscription",
            tenantDataClassification: "QA",
          }).allowed,
        ).toBe(true)
      }
    }
    for (const path of [
      "storeSubscriptions.verifyPurchase",
      "prescriptions.refund",
      "domains.createCheckout",
      "catalog.permanentDelete",
      "retailOpsSubscriptions.createSubscriptionCheckoutIntent",
      "unknown.createSubscriptionCheckoutIntent",
    ])
      expect(qaProviderAdapterForProcedure(path, configured, true)).toBe("live")
    for (const path of paths) {
      expect(qaProviderAdapterForProcedure(path, configured, false)).toBe(
        "live",
      )
      expect(
        evaluateQaProviderPolicy({
          adapter: qaProviderAdapterForProcedure(path, configured, false),
          operation: "subscription",
          tenantDataClassification: "QA",
        }).allowed,
      ).toBe(false)
    }
  })

  test("missing opt-ins, Production, profile/mode mismatch and live keys retain QA refusal", () => {
    for (const change of [
      { PAYSTACK_QA_SUBSCRIPTIONS_TEST_ADAPTER_ENABLED: undefined },
      { PAYSTACK_QA_SUBSCRIPTIONS_TEST_ADAPTER_ENABLED: "false" },
      { WEB_BILLING_RECONCILIATION_ENABLED: "false" },
      { OWNER_BILLING_ENABLED: "false" },
      { APP_ENV: "production", DEV_PROFILE: "production" },
      { APP_ENV: "dev", DEV_PROFILE: "dev" },
      { DEV_PROFILE: "local" },
      { WEB_BILLING_ENVIRONMENT: "production" },
      { STORE_BILLING_ENVIRONMENT: "production" },
      { PAYSTACK_SUBSCRIPTION_SECRET_KEY: "sk_live_FAKE_NOT_A_REAL_KEY" },
      { PAYSTACK_SUBSCRIPTION_SECRET_KEY: "" },
    ])
      for (const path of paths) {
        const adapter = qaProviderAdapterForProcedure(
          path,
          { ...configured, ...change },
          true,
        )
        expect(adapter).toBe("live")
        expect(
          evaluateQaProviderPolicy({
            adapter,
            operation: "subscription",
            tenantDataClassification: "QA",
          }).allowed,
        ).toBe(false)
      }
  })
})
