import assert from "node:assert/strict"
import { generateKeyPairSync } from "node:crypto"
import { test } from "node:test"
import {
  storeBillingReadinessFailures,
  storeReleaseBillingReadinessFailures,
} from "./check-store-billing-readiness.mjs"

const freeProfile = { APP_ENV: "production", DEV_PROFILE: "prod" }
const freeScope = { softwarePlanPurchases: false }

test("free launch needs no payment credentials but requires closed checkout", () => {
  for (const store of [undefined, "play_store", "app_store"])
    assert.deepEqual(
      storeReleaseBillingReadinessFailures(
        freeProfile,
        freeScope,
        () => {
          throw Error("Free launch must not inspect payment credentials")
        },
        store,
      ),
      [],
    )
  for (const flag of [
    "STORE_BILLING_ENABLED",
    "STORE_BILLING_PRODUCTION_CHECKOUT_ENABLED",
    "OWNER_BILLING_ENABLED",
  ])
    for (const value of ["true", "TRUE", "1", " false "])
      assert.ok(
        storeReleaseBillingReadinessFailures(
          { ...freeProfile, [flag]: value },
          freeScope,
        ).some((failure) => failure.includes(flag)),
      )
})

test("missing or ambiguous release scope cannot bypass paid readiness", () => {
  for (const scope of [
    undefined,
    null,
    {},
    [],
    { softwarePlanPurchases: "false" },
    { softwarePlanPurchases: false, extra: true },
  ])
    assert.ok(storeReleaseBillingReadinessFailures(freeProfile, scope).length)
  assert.ok(
    storeReleaseBillingReadinessFailures(
      { APP_ENV: "preview", DEV_PROFILE: "preview" },
      freeScope,
    ).length,
  )
  assert.ok(
    storeReleaseBillingReadinessFailures(
      freeProfile,
      freeScope,
      () => false,
      "unknown",
    ).length,
  )
})

test("paid release scope preserves every original billing requirement", () => {
  for (const store of [undefined, "play_store", "app_store"])
    assert.deepEqual(
      storeReleaseBillingReadinessFailures(
        freeProfile,
        { softwarePlanPurchases: true },
        () => false,
        store,
      ),
      storeBillingReadinessFailures(freeProfile, () => false, store),
    )
})

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

test("iOS readiness requires Apple setup without activating Play refund operations", () => {
  const appleOnly = Object.fromEntries(
    Object.entries(ready).filter(
      ([name]) =>
        !name.startsWith("PLAY_") &&
        !name.startsWith("GOOGLE_") &&
        !name.startsWith("EMAIL_") &&
        name !== "RESEND_API_KEY",
    ),
  )
  appleOnly.STORE_SUBSCRIPTION_PRODUCTS = JSON.stringify([
    { store: "app_store", productId: "growth.ios", planId: "growth" },
  ])
  const noPlayFiles = () => {
    throw new Error("iOS must not inspect Play credentials")
  }
  assert.deepEqual(
    storeBillingReadinessFailures(appleOnly, noPlayFiles, "app_store"),
    [],
  )
  for (const [name, value] of [
    ["APPLE_BUNDLE_ID", "com.other.app"],
    ["APPLE_IAP_PRIVATE_KEY", ""],
    ["APPLE_IAP_ISSUER_ID", ""],
    ["STORE_SUBSCRIPTION_PRODUCTS", "[]"],
    ["STORE_BILLING_PRODUCTION_CHECKOUT_ENABLED", "false"],
  ])
    assert.ok(
      storeBillingReadinessFailures(
        { ...appleOnly, [name]: value },
        noPlayFiles,
        "app_store",
      ).length,
      `${name} remains required for iOS`,
    )
  assert.ok(
    storeBillingReadinessFailures(appleOnly, () => false, "play_store").some(
      (failure) => failure.includes("PLAY_REFUND_REVIEW"),
    ),
  )
  assert.ok(
    storeBillingReadinessFailures(appleOnly, () => false).some((failure) =>
      failure.includes("PLAY_REFUND_REVIEW"),
    ),
  )
})

test("Android readiness requires Play products and credentials without Apple setup", () => {
  const androidOnly = {
    ...ready,
    APPLE_BUNDLE_ID: "",
    APPLE_APP_ID: "",
    APPLE_IAP_KEY_ID: "",
    APPLE_IAP_ISSUER_ID: "",
    APPLE_IAP_PRIVATE_KEY: "",
    STORE_SUBSCRIPTION_PRODUCTS: JSON.stringify([
      { store: "play_store", productId: "growth.play", planId: "growth" },
    ]),
  }
  assert.deepEqual(
    storeBillingReadinessFailures(androidOnly, fixtureFileExists, "play_store"),
    [],
  )
  assert(
    storeBillingReadinessFailures(androidOnly, fixtureFileExists).length > 0,
  )
  for (const [name, value] of [
    ["PLAY_PACKAGE_NAME", "com.other.app"],
    ["GOOGLE_APPLICATION_CREDENTIALS", ""],
    ["PLAY_NOTIFICATION_AUDIENCE", ""],
    ["STORE_BILLING_PRODUCTION_CHECKOUT_ENABLED", "false"],
    ["PLAY_REFUND_REVIEW_INTAKE_ENABLED", "false"],
  ]) {
    assert(
      storeBillingReadinessFailures(
        { ...androidOnly, [name]: value },
        fixtureFileExists,
        "play_store",
      ).length > 0,
      `${name} must still be required for Android`,
    )
  }
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
