import { expect, test } from "bun:test"
import { generateKeyPairSync } from "node:crypto"
import { isNewStoreCheckoutConfigured } from "./store-checkout-readiness"
import { getStoreProducts } from "./store-products"

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
const products = getStoreProducts(
  JSON.stringify([
    { store: "app_store", productId: "growth.ios", planId: "growth" },
    { store: "play_store", productId: "growth.play", planId: "growth" },
  ]),
)
const config = {
  APP_ENV: "local",
  DEV_PROFILE: "local",
  STORE_BILLING_ENVIRONMENT: "sandbox",
  APPLE_BUNDLE_ID: "com.ewatrade.app",
  APPLE_APP_ID: "6815837585",
  APPLE_IAP_KEY_ID: "test-key",
  APPLE_IAP_ISSUER_ID: "test-issuer",
  APPLE_IAP_PRIVATE_KEY: privateKey
    .export({ type: "pkcs8", format: "pem" })
    .toString(),
  PLAY_PACKAGE_NAME: "com.ewatrade.app",
  PLAY_NOTIFICATION_AUDIENCE: "test-audience",
  PLAY_NOTIFICATION_SERVICE_EMAIL: "push@example.invalid",
  GOOGLE_APPLICATION_CREDENTIALS: "/test/google-credentials.json",
}
const hasFixtureFile = (file: string) => file.startsWith("/test/")
const { privateKey: playPrivateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
})
const inlinePlayKey = JSON.stringify({
  type: "service_account",
  client_email: "publisher@project.iam.gserviceaccount.com",
  private_key: playPrivateKey
    .export({ type: "pkcs8", format: "pem" })
    .toString(),
})
const productionConfig = {
  ...config,
  APP_ENV: "production",
  DEV_PROFILE: "prod",
  STORE_BILLING_ENABLED: "true",
  STORE_BILLING_PRODUCTION_CHECKOUT_ENABLED: "true",
  STORE_BILLING_ENVIRONMENT: "production",
  PLAY_REFUND_REVIEW_INTAKE_ENABLED: "true",
  PLAY_REFUND_REVIEW_ACK_ENABLED: "true",
  PLAY_REFUND_REVIEW_ALERTS_ENABLED: "true",
  PLAY_REFUND_REVIEW_SUBMISSION_ENABLED: "true",
  PLAY_REFUND_REVIEW_PRODUCTION_SUBMISSION_ENABLED: "true",
  PLAY_REFUND_REVIEW_RESPONSE_POLICY_VERSION: "approved-policy-v1",
  PLAY_REFUND_REVIEW_KEY_ID: "key-v1",
  PLAY_REFUND_REVIEW_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
  PLAY_REFUND_REVIEW_ALERT_EMAILS: "operator@example.invalid",
  EMAIL_DELIVERY_MODE: "live",
  RESEND_API_KEY: "fixture-key",
  EMAIL_FROM: "EwaTrade Alerts <alerts@example.invalid>",
}

test("opens checkout only when both store verifier configurations are present", () => {
  expect(isNewStoreCheckoutConfigured(products, config, hasFixtureFile)).toBe(
    true,
  )
  expect(
    isNewStoreCheckoutConfigured(
      products.filter((product) => product.store === "app_store"),
      config,
      hasFixtureFile,
    ),
  ).toBe(false)
  expect(
    isNewStoreCheckoutConfigured(
      products,
      { ...config, GOOGLE_APPLICATION_CREDENTIALS: undefined },
      hasFixtureFile,
    ),
  ).toBe(false)
  expect(
    isNewStoreCheckoutConfigured(
      products,
      { ...config, APPLE_BUNDLE_ID: "com.other.app" },
      hasFixtureFile,
    ),
  ).toBe(false)
  expect(
    isNewStoreCheckoutConfigured(
      products,
      { ...config, APPLE_IAP_PRIVATE_KEY: "invalid" },
      hasFixtureFile,
    ),
  ).toBe(false)
  expect(isNewStoreCheckoutConfigured(products, config, () => false)).toBe(
    false,
  )
  expect(
    isNewStoreCheckoutConfigured(
      products,
      {
        ...config,
        GOOGLE_APPLICATION_CREDENTIALS: undefined,
        PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON: inlinePlayKey,
      },
      () => false,
    ),
  ).toBe(true)
})

test("sandbox checkout keeps the release bundle while production remains gated", () => {
  expect(
    isNewStoreCheckoutConfigured(
      products,
      {
        ...config,
        STORE_BILLING_ENVIRONMENT: "sandbox",
        APPLE_APP_ID: undefined,
      },
      hasFixtureFile,
    ),
  ).toBe(true)
  expect(
    isNewStoreCheckoutConfigured(
      products,
      {
        ...config,
        STORE_BILLING_ENVIRONMENT: "production",
        PLAY_REFUND_REVIEW_INTAKE_ENABLED: "true",
      },
      hasFixtureFile,
    ),
  ).toBe(false)
  expect(
    isNewStoreCheckoutConfigured(
      products,
      {
        ...config,
        APP_ENV: undefined,
      },
      hasFixtureFile,
    ),
  ).toBe(false)
  expect(
    isNewStoreCheckoutConfigured(
      products,
      {
        ...config,
        DEV_PROFILE: undefined,
      },
      hasFixtureFile,
    ),
  ).toBe(false)
  expect(
    isNewStoreCheckoutConfigured(
      products,
      {
        ...config,
        DEV_PROFILE: "prod",
      },
      hasFixtureFile,
    ),
  ).toBe(false)
  expect(
    isNewStoreCheckoutConfigured(
      products,
      {
        ...config,
        DEV_PROFILE: "preview",
        APP_ENV: "production",
      },
      hasFixtureFile,
    ),
  ).toBe(false)
  expect(
    isNewStoreCheckoutConfigured(
      products,
      {
        ...config,
        DEV_PROFILE: "preview",
        APP_ENV: "preview",
      },
      hasFixtureFile,
    ),
  ).toBe(true)
  expect(
    isNewStoreCheckoutConfigured(
      products,
      {
        ...config,
        APP_ENV: "production",
        STORE_BILLING_ENVIRONMENT: "sandbox",
      },
      hasFixtureFile,
    ),
  ).toBe(false)
  expect(
    isNewStoreCheckoutConfigured(
      products,
      {
        ...config,
        STORE_BILLING_ENVIRONMENT: "sandbox",
        APPLE_BUNDLE_ID: "com.other.app",
      },
      hasFixtureFile,
    ),
  ).toBe(false)
})

test("Production checkout needs the explicit release switch and monitored refund operations", () => {
  expect(
    isNewStoreCheckoutConfigured(products, productionConfig, hasFixtureFile),
  ).toBe(true)
  for (const changed of [
    { STORE_BILLING_ENABLED: "false" },
    { STORE_BILLING_PRODUCTION_CHECKOUT_ENABLED: "false" },
    { PLAY_REFUND_REVIEW_INTAKE_ENABLED: "false" },
    { PLAY_REFUND_REVIEW_ACK_ENABLED: "false" },
    { PLAY_REFUND_REVIEW_ALERTS_ENABLED: "false" },
    { PLAY_REFUND_REVIEW_SUBMISSION_ENABLED: "false" },
    { PLAY_REFUND_REVIEW_PRODUCTION_SUBMISSION_ENABLED: "false" },
    { PLAY_REFUND_REVIEW_RESPONSE_POLICY_VERSION: "" },
    { PLAY_REFUND_REVIEW_KEY_ID: "" },
    { PLAY_REFUND_REVIEW_ALERT_EMAILS: "" },
    { EMAIL_DELIVERY_MODE: "console" },
    { EMAIL_FROM: "malformed" },
    { RESEND_API_KEY: "" },
    { APPLE_APP_ID: "wrong" },
    { APP_ENV: "preview" },
    { DEV_PROFILE: "preview" },
  ])
    expect(
      isNewStoreCheckoutConfigured(
        products,
        { ...productionConfig, ...changed },
        hasFixtureFile,
      ),
    ).toBe(false)
})
