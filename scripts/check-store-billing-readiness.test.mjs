import assert from "node:assert/strict"
import { generateKeyPairSync } from "node:crypto"
import { test } from "node:test"
import { storeBillingReadinessFailures } from "./check-store-billing-readiness.mjs"

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
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
const ready = {
  APP_ENV: "production",
  DEV_PROFILE: "prod",
  STORE_BILLING_ENABLED: "true",
  STORE_BILLING_PRODUCTION_CHECKOUT_ENABLED: "true",
  STORE_BILLING_ENVIRONMENT: "production",
  STORE_SUBSCRIPTION_PRODUCTS: JSON.stringify([
    { store: "app_store", productId: "growth.ios", planId: "growth" },
    { store: "play_store", productId: "growth.play", planId: "growth" },
  ]),
  APPLE_BUNDLE_ID: "com.ewatrade.app",
  APPLE_APP_ID: "6815837585",
  APPLE_IAP_KEY_ID: "test-key-id",
  APPLE_IAP_ISSUER_ID: "test-issuer-id",
  APPLE_IAP_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }),
  PLAY_PACKAGE_NAME: "com.ewatrade.app",
  PLAY_NOTIFICATION_AUDIENCE: "test-audience",
  PLAY_NOTIFICATION_SERVICE_EMAIL: "push@example.invalid",
  GOOGLE_APPLICATION_CREDENTIALS: "/test/google-credentials.json",
  PLAY_REFUND_REVIEW_ALERTS_ENABLED: "true",
  PLAY_REFUND_REVIEW_INTAKE_ENABLED: "true",
  PLAY_REFUND_REVIEW_ACK_ENABLED: "true",
  PLAY_REFUND_REVIEW_SUBMISSION_ENABLED: "true",
  PLAY_REFUND_REVIEW_PRODUCTION_SUBMISSION_ENABLED: "true",
  PLAY_REFUND_REVIEW_RESPONSE_POLICY_VERSION: "approved-policy-v1",
  PLAY_REFUND_REVIEW_KEY_ID: "test-key-v1",
  PLAY_REFUND_REVIEW_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
  PLAY_REFUND_REVIEW_ALERT_EMAILS: "operator@example.invalid",
  EMAIL_DELIVERY_MODE: "live",
  EMAIL_FROM: "alerts@example.invalid",
  RESEND_API_KEY: "fixture-key",
}
const fixtureFileExists = (file) => file.startsWith("/test/")

test("complete release billing settings pass the local shape preflight", () => {
  assert.deepEqual(storeBillingReadinessFailures(ready, fixtureFileExists), [])
})

test("serverless Play service-account JSON passes without a credential file", () => {
  assert.deepEqual(
    storeBillingReadinessFailures(
      {
        ...ready,
        GOOGLE_APPLICATION_CREDENTIALS: "",
        PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON: inlinePlayKey,
      },
      () => false,
    ),
    [],
  )
  const invalid = storeBillingReadinessFailures(
    {
      ...ready,
      PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON: "invalid-json",
    },
    fixtureFileExists,
  )
  assert(
    invalid.some((failure) =>
      failure.includes("PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON"),
    ),
  )
})

test("the release billing preflight accepts a Resend display-name sender", () => {
  assert.deepEqual(
    storeBillingReadinessFailures(
      { ...ready, EMAIL_FROM: "EwaTrade Alerts <alerts@example.invalid>" },
      fixtureFileExists,
    ),
    [],
  )
  assert(
    storeBillingReadinessFailures(
      {
        ...ready,
        EMAIL_FROM:
          "EwaTrade\r\nBcc:bad@example.invalid <alerts@example.invalid>",
      },
      fixtureFileExists,
    ).some((failure) => failure.includes("EMAIL_FROM")),
  )
})

test("mismatched app identities, missing credentials and one-store products fail", () => {
  const failures = storeBillingReadinessFailures(
    {
      ...ready,
      APPLE_APP_ID: "999",
      PLAY_PACKAGE_NAME: "com.other.app",
      GOOGLE_APPLICATION_CREDENTIALS: "/missing.json",
      STORE_SUBSCRIPTION_PRODUCTS: JSON.stringify([
        { store: "app_store", productId: "growth.ios", planId: "growth" },
      ]),
    },
    fixtureFileExists,
  )
  assert(failures.some((failure) => failure.includes("APPLE_APP_ID")))
  assert(failures.some((failure) => failure.includes("PLAY_PACKAGE_NAME")))
  assert(failures.some((failure) => failure.includes("Play Publisher")))
  assert(failures.some((failure) => failure.includes("play_store")))
})

test("duplicate products and malformed Apple key fail without exposing values", () => {
  const failures = storeBillingReadinessFailures(
    {
      ...ready,
      APPLE_IAP_PRIVATE_KEY: "private-test-value",
      STORE_SUBSCRIPTION_PRODUCTS: JSON.stringify([
        { store: "app_store", productId: "same", planId: "growth" },
        { store: "app_store", productId: "same", planId: "pro" },
      ]),
    },
    fixtureFileExists,
  )
  assert(failures.some((failure) => failure.includes("duplicate")))
  assert(failures.some((failure) => failure.includes("APPLE_IAP_PRIVATE_KEY")))
  assert(!failures.join(" ").includes("private-test-value"))
})

test("product IDs with whitespace fail before checkout is enabled", () => {
  const failures = storeBillingReadinessFailures(
    {
      ...ready,
      STORE_SUBSCRIPTION_PRODUCTS: JSON.stringify([
        { store: "app_store", productId: " growth.ios", planId: "growth" },
        { store: "play_store", productId: "growth.play", planId: "growth" },
      ]),
    },
    fixtureFileExists,
  )
  assert(failures.some((failure) => failure.includes("invalid mapping")))
})

test("production checkout needs active refund-review intake, alert and acknowledgement", () => {
  const failures = storeBillingReadinessFailures(
    {
      ...ready,
      PLAY_REFUND_REVIEW_ALERTS_ENABLED: "false",
      STORE_BILLING_PRODUCTION_CHECKOUT_ENABLED: "false",
      PLAY_REFUND_REVIEW_INTAKE_ENABLED: "false",
      PLAY_REFUND_REVIEW_ACK_ENABLED: "false",
      PLAY_REFUND_REVIEW_PRODUCTION_SUBMISSION_ENABLED: "false",
      PLAY_REFUND_REVIEW_RESPONSE_POLICY_VERSION: "",
      PLAY_REFUND_REVIEW_KEY_ID: "",
      PLAY_REFUND_REVIEW_ENCRYPTION_KEY: "",
      PLAY_REFUND_REVIEW_ALERT_EMAILS: "",
      EMAIL_DELIVERY_MODE: "console",
    },
    fixtureFileExists,
  )
  assert(failures.some((failure) => failure.includes("ALERTS_ENABLED")))
  assert(failures.some((failure) => failure.includes("PRODUCTION_CHECKOUT")))
  assert(failures.some((failure) => failure.includes("INTAKE_ENABLED")))
  assert(failures.some((failure) => failure.includes("ACK_ENABLED")))
  assert(failures.some((failure) => failure.includes("PRODUCTION_SUBMISSION")))
  assert(
    failures.some((failure) => failure.includes("RESPONSE_POLICY_VERSION")),
  )
  assert(failures.some((failure) => failure.includes("KEY_ID")))
  assert(failures.some((failure) => failure.includes("ENCRYPTION_KEY")))
  assert(failures.some((failure) => failure.includes("ALERT_EMAILS")))
  assert(failures.some((failure) => failure.includes("live Resend")))
})
