import { createPrivateKey } from "node:crypto"
import { statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { verifyBundledAppleRoots } from "./verify-apple-roots.mjs"

const releasePackage = "com.ewatrade.app"
const releaseAppleAppId = "6815837585"

function present(value) {
  return typeof value === "string" && value.trim().length > 0
}

function validEmailSender(value) {
  const sender = value?.trim() ?? ""
  const address = "[^\\s@<>,]+@[^\\s@<>,]+\\.[^\\s@<>,]+"
  return (
    new RegExp(`^${address}$`).test(sender) ||
    new RegExp(`^[^<>\\r\\n,]{1,100} <${address}>$`).test(sender)
  )
}

function fileExists(file) {
  try {
    return statSync(file).isFile()
  } catch {
    return false
  }
}

function validPlayPublisherJson(value) {
  if (!present(value) || value.length > 24_576) return false
  try {
    const key = JSON.parse(value)
    if (
      !key ||
      typeof key !== "object" ||
      Array.isArray(key) ||
      key.type !== "service_account" ||
      typeof key.client_email !== "string" ||
      key.client_email.length > 320 ||
      !/^[^\s@]+@[^\s@]+\.gserviceaccount\.com$/.test(key.client_email) ||
      typeof key.private_key !== "string"
    )
      return false
    const privateKey = createPrivateKey(key.private_key)
    return (
      privateKey.asymmetricKeyType === "rsa" &&
      (privateKey.asymmetricKeyDetails?.modulusLength ?? 0) >= 2048
    )
  } catch {
    return false
  }
}

function productFailures(source) {
  let products
  try {
    products = JSON.parse(source ?? "")
  } catch {
    return ["STORE_SUBSCRIPTION_PRODUCTS must be valid JSON."]
  }
  if (!Array.isArray(products) || products.length === 0 || products.length > 30)
    return ["STORE_SUBSCRIPTION_PRODUCTS must contain 1–30 mappings."]
  const identities = new Set()
  const stores = new Set()
  for (const product of products) {
    if (
      !product ||
      !["app_store", "play_store"].includes(product.store) ||
      !present(product.productId) ||
      product.productId.length > 200 ||
      /\s/u.test(product.productId) ||
      !["starter", "growth", "pro"].includes(product.planId) ||
      Object.keys(product).sort().join(",") !== "planId,productId,store"
    )
      return ["STORE_SUBSCRIPTION_PRODUCTS has an invalid mapping."]
    const identity = `${product.store}:${product.productId}`
    if (identities.has(identity))
      return ["STORE_SUBSCRIPTION_PRODUCTS has a duplicate mapping."]
    identities.add(identity)
    stores.add(product.store)
  }
  return ["app_store", "play_store"]
    .filter((store) => !stores.has(store))
    .map((store) => `STORE_SUBSCRIPTION_PRODUCTS needs a ${store} mapping.`)
}

export function storeBillingReadinessFailures(config, hasFile = fileExists) {
  const failures = []
  if (config.APP_ENV !== "production" || config.DEV_PROFILE !== "prod")
    failures.push("Run with the production environment profile.")
  if (config.STORE_BILLING_ENABLED !== "true")
    failures.push("STORE_BILLING_ENABLED is not enabled.")
  if (config.STORE_BILLING_PRODUCTION_CHECKOUT_ENABLED !== "true")
    failures.push("STORE_BILLING_PRODUCTION_CHECKOUT_ENABLED is not enabled.")
  if (config.STORE_BILLING_ENVIRONMENT !== "production")
    failures.push("STORE_BILLING_ENVIRONMENT must be production.")
  failures.push(...productFailures(config.STORE_SUBSCRIPTION_PRODUCTS))

  if (config.APPLE_BUNDLE_ID !== releasePackage)
    failures.push("APPLE_BUNDLE_ID must match the registered release bundle.")
  if (config.APPLE_APP_ID !== releaseAppleAppId)
    failures.push("APPLE_APP_ID must match the App Store Connect app.")
  for (const name of ["APPLE_IAP_KEY_ID", "APPLE_IAP_ISSUER_ID"]) {
    if (!present(config[name])) failures.push(`${name} is missing.`)
  }
  try {
    const key = createPrivateKey(
      (config.APPLE_IAP_PRIVATE_KEY ?? "").replaceAll("\\n", "\n"),
    )
    if (
      key.asymmetricKeyType !== "ec" ||
      key.asymmetricKeyDetails?.namedCurve !== "prime256v1"
    )
      throw new Error("wrong key type")
  } catch {
    failures.push("APPLE_IAP_PRIVATE_KEY must be a P-256 private key.")
  }
  try {
    verifyBundledAppleRoots()
  } catch {
    failures.push("Bundled Apple root certificates are invalid.")
  }

  if (config.PLAY_PACKAGE_NAME !== releasePackage)
    failures.push(
      "PLAY_PACKAGE_NAME must match the registered release package.",
    )
  for (const name of [
    "PLAY_NOTIFICATION_AUDIENCE",
    "PLAY_NOTIFICATION_SERVICE_EMAIL",
  ]) {
    if (!present(config[name])) failures.push(`${name} is missing.`)
  }
  const inlinePlayKey = config.PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON
  if (inlinePlayKey !== undefined && inlinePlayKey !== "") {
    if (!validPlayPublisherJson(inlinePlayKey))
      failures.push("PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON is invalid.")
  } else if (
    !present(config.GOOGLE_APPLICATION_CREDENTIALS) ||
    !hasFile(config.GOOGLE_APPLICATION_CREDENTIALS)
  )
    failures.push(
      "Play Publisher needs an inline service account or local ADC file.",
    )
  if (config.PLAY_REFUND_REVIEW_ALERTS_ENABLED !== "true")
    failures.push("PLAY_REFUND_REVIEW_ALERTS_ENABLED is not enabled.")
  if (config.PLAY_REFUND_REVIEW_INTAKE_ENABLED !== "true")
    failures.push("PLAY_REFUND_REVIEW_INTAKE_ENABLED is not enabled.")
  if (config.PLAY_REFUND_REVIEW_ACK_ENABLED !== "true")
    failures.push("PLAY_REFUND_REVIEW_ACK_ENABLED is not enabled.")
  if (config.PLAY_REFUND_REVIEW_SUBMISSION_ENABLED !== "true")
    failures.push("PLAY_REFUND_REVIEW_SUBMISSION_ENABLED is not enabled.")
  if (config.PLAY_REFUND_REVIEW_PRODUCTION_SUBMISSION_ENABLED !== "true")
    failures.push(
      "PLAY_REFUND_REVIEW_PRODUCTION_SUBMISSION_ENABLED is not enabled.",
    )
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(
      config.PLAY_REFUND_REVIEW_RESPONSE_POLICY_VERSION ?? "",
    )
  )
    failures.push("PLAY_REFUND_REVIEW_RESPONSE_POLICY_VERSION is invalid.")
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(config.PLAY_REFUND_REVIEW_KEY_ID ?? ""))
    failures.push("PLAY_REFUND_REVIEW_KEY_ID is invalid.")
  const custodyKey = config.PLAY_REFUND_REVIEW_ENCRYPTION_KEY ?? ""
  if (
    !/^[A-Za-z0-9+/]{43}=$/.test(custodyKey) ||
    Buffer.from(custodyKey, "base64").length !== 32 ||
    Buffer.from(custodyKey, "base64").toString("base64") !== custodyKey
  )
    failures.push("PLAY_REFUND_REVIEW_ENCRYPTION_KEY must be 32 bytes.")
  const recipients = (config.PLAY_REFUND_REVIEW_ALERT_EMAILS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
  if (
    recipients.length === 0 ||
    recipients.length > 5 ||
    recipients.some((email) => !/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email))
  )
    failures.push("PLAY_REFUND_REVIEW_ALERT_EMAILS needs 1–5 valid recipients.")
  if (config.EMAIL_DELIVERY_MODE !== "live" || !present(config.RESEND_API_KEY))
    failures.push("Play refund-review alerts require live Resend delivery.")
  if (!validEmailSender(config.EMAIL_FROM))
    failures.push("EMAIL_FROM must be a valid alert sender.")
  return failures
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const failures = storeBillingReadinessFailures(process.env)
  if (failures.length) {
    console.error("Store billing configuration is not ready:")
    for (const failure of failures) console.error(`- ${failure}`)
    process.exitCode = 1
  } else {
    console.log(
      "Store billing configuration preflight passed; provider sandbox and signed-device verification are still required.",
    )
  }
}
