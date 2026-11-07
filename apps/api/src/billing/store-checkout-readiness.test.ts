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

test("Apple production checkout is independent of Play refund operations while Play remains gated", () => {
  const appleOnly = {
    ...config,
    APP_ENV: "production",
    DEV_PROFILE: "prod",
    STORE_BILLING_ENABLED: "true",
    STORE_BILLING_PRODUCTION_CHECKOUT_ENABLED: "true",
    STORE_BILLING_ENVIRONMENT: "production",
    PLAY_PACKAGE_NAME: undefined,
    PLAY_NOTIFICATION_AUDIENCE: undefined,
    PLAY_NOTIFICATION_SERVICE_EMAIL: undefined,
    GOOGLE_APPLICATION_CREDENTIALS: undefined,
  }
  expect(
    isNewStoreCheckoutConfigured(
      products,
      appleOnly,
      hasFixtureFile,
      "app_store",
    ),
  ).toBe(true)
  expect(
    isNewStoreCheckoutConfigured(
      products,
      appleOnly,
      hasFixtureFile,
      "play_store",
    ),
  ).toBe(false)
  expect(
    isNewStoreCheckoutConfigured(products, appleOnly, hasFixtureFile),
  ).toBe(false)
  expect(
    isNewStoreCheckoutConfigured(
      products,
      { ...productionConfig, PLAY_REFUND_REVIEW_ACK_ENABLED: "false" },
      hasFixtureFile,
      "play_store",
    ),
  ).toBe(false)
  for (const change of [
    { STORE_BILLING_ENABLED: "false" },
    { STORE_BILLING_PRODUCTION_CHECKOUT_ENABLED: "false" },
    { APP_ENV: "preview" },
    { DEV_PROFILE: "local" },
    { APPLE_IAP_PRIVATE_KEY: "invalid" },
    { APPLE_APP_ID: "wrong" },
  ]) {
    expect(
      isNewStoreCheckoutConfigured(
        products,
        { ...appleOnly, ...change },
        hasFixtureFile,
        "app_store",
      ),
    ).toBe(false)
  }
})

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

test("Android checkout does not require Apple products or Apple private credentials", () => {
  const playProducts = products.filter(
    (product) => product.store === "play_store",
  )
  const playConfig = {
    ...productionConfig,
    APPLE_BUNDLE_ID: undefined,
    APPLE_APP_ID: undefined,
    APPLE_IAP_KEY_ID: undefined,
    APPLE_IAP_ISSUER_ID: undefined,
    APPLE_IAP_PRIVATE_KEY: undefined,
  }
  expect(
    isNewStoreCheckoutConfigured(
      playProducts,
      playConfig,
      hasFixtureFile,
      "play_store",
    ),
  ).toBe(true)
  // The same configuration must not advertise an Apple or legacy combined checkout.
  expect(
    isNewStoreCheckoutConfigured(
      playProducts,
      playConfig,
      hasFixtureFile,
      "app_store",
    ),
  ).toBe(false)
  expect(
    isNewStoreCheckoutConfigured(playProducts, playConfig, hasFixtureFile),
  ).toBe(false)

  for (const changed of [
    { STORE_BILLING_ENABLED: "false" },
    { STORE_BILLING_PRODUCTION_CHECKOUT_ENABLED: "false" },
    { PLAY_PACKAGE_NAME: "com.other.app" },
    { PLAY_NOTIFICATION_AUDIENCE: "" },
    { PLAY_NOTIFICATION_SERVICE_EMAIL: "" },
    { GOOGLE_APPLICATION_CREDENTIALS: undefined },
    { PLAY_REFUND_REVIEW_ALERTS_ENABLED: "false" },
    { PLAY_REFUND_REVIEW_ACK_ENABLED: "false" },
    { PLAY_REFUND_REVIEW_INTAKE_ENABLED: "false" },
    { PLAY_REFUND_REVIEW_PRODUCTION_SUBMISSION_ENABLED: "false" },
    { APP_ENV: "preview" },
    { STORE_BILLING_ENVIRONMENT: "sandbox" },
  ])
    expect(
      isNewStoreCheckoutConfigured(
        playProducts,
        { ...playConfig, ...changed },
        hasFixtureFile,
        "play_store",
      ),
    ).toBe(false)
  expect(
    isNewStoreCheckoutConfigured([], playConfig, hasFixtureFile, "play_store"),
  ).toBe(false)
})

test("review-only Apple checkout uses authenticated allowlisted owner without opening public or Google checkout", () => {
  const ownerId = "review-owner-123"
  const review = {
    ...productionConfig,
    OWNER_BILLING_ENABLED: "true",
    STORE_BILLING_PRODUCTION_CHECKOUT_ENABLED: "false",
    APP_STORE_REVIEW_SANDBOX_ENABLED: "true",
    APP_STORE_REVIEW_OWNER_IDS: JSON.stringify([ownerId]),
  }
  expect(
    isNewStoreCheckoutConfigured(
      products,
      review,
      hasFixtureFile,
      "app_store",
      ownerId,
    ),
  ).toBe(true)
  expect(
    isNewStoreCheckoutConfigured(
      products,
      review,
      hasFixtureFile,
      "app_store",
      "other-owner-123",
    ),
  ).toBe(false)
  expect(
    isNewStoreCheckoutConfigured(products, review, hasFixtureFile, "app_store"),
  ).toBe(false)
  expect(
    isNewStoreCheckoutConfigured(
      products,
      review,
      hasFixtureFile,
      "play_store",
      ownerId,
    ),
  ).toBe(false)
  expect(
    isNewStoreCheckoutConfigured(
      products,
      review,
      hasFixtureFile,
      undefined,
      ownerId,
    ),
  ).toBe(false)
  for (const changed of [
    { OWNER_BILLING_ENABLED: "false" },
    { STORE_BILLING_ENABLED: "false" },
    { APP_STORE_REVIEW_SANDBOX_ENABLED: "false" },
    { APPLE_APP_ID: "wrong" },
    { APPLE_IAP_PRIVATE_KEY: "invalid" },
    { DEV_PROFILE: "preview" },
  ]) {
    expect(
      isNewStoreCheckoutConfigured(
        products,
        { ...review, ...changed },
        hasFixtureFile,
        "app_store",
        ownerId,
      ),
    ).toBe(false)
  }
})
