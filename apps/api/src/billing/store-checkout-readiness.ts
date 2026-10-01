import { createPrivateKey } from "node:crypto"
import { statSync } from "node:fs"
import { isPlayRefundReviewSubmissionEnabled } from "@ewatrade/db/queries"
import { isValidEmailSender } from "@ewatrade/email"
import { appleRootCertificates } from "./apple-root-certificates"
import { isPlayPublisherCredentialConfigured } from "./google-publisher-credentials"
import { assertPlayRefundReviewCustodyConfigured } from "./play-refund-review-token"
import {
  requireAppleStoreIdentity,
  requirePlayStorePackage,
} from "./store-app-identity"
import type { getStoreProducts } from "./store-products"

type StoreProducts = ReturnType<typeof getStoreProducts>

function hasFile(file: string) {
  try {
    return statSync(file).isFile()
  } catch {
    return false
  }
}

function present(value: string | undefined) {
  return Boolean(value?.trim())
}

function productionOperationsConfigured(config: NodeJS.ProcessEnv) {
  const recipients = (config.PLAY_REFUND_REVIEW_ALERT_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean)
  if (
    config.STORE_BILLING_ENABLED !== "true" ||
    config.STORE_BILLING_PRODUCTION_CHECKOUT_ENABLED !== "true" ||
    config.PLAY_REFUND_REVIEW_INTAKE_ENABLED !== "true" ||
    config.PLAY_REFUND_REVIEW_ACK_ENABLED !== "true" ||
    config.PLAY_REFUND_REVIEW_ALERTS_ENABLED !== "true" ||
    !isPlayRefundReviewSubmissionEnabled(config) ||
    config.EMAIL_DELIVERY_MODE !== "live" ||
    !present(config.RESEND_API_KEY) ||
    !isValidEmailSender(config.EMAIL_FROM) ||
    recipients.length === 0 ||
    recipients.length > 5 ||
    recipients.some((email) => !/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email))
  )
    return false
  try {
    assertPlayRefundReviewCustodyConfigured(config)
    return true
  } catch {
    return false
  }
}

export function isNewStoreCheckoutConfigured(
  products: StoreProducts,
  config: NodeJS.ProcessEnv = process.env,
  fileExists: (file: string) => boolean = hasFile,
) {
  const environment = config.STORE_BILLING_ENVIRONMENT
  const profile = config.DEV_PROFILE
  const sandbox =
    environment === "sandbox" &&
    ["local", "dev", "preview"].includes(profile ?? "") &&
    config.APP_ENV === profile
  const production =
    environment === "production" &&
    config.APP_ENV === "production" &&
    profile === "prod" &&
    productionOperationsConfigured(config)
  if (!sandbox && !production) return false
  if (
    !products.some((product) => product.store === "app_store") ||
    !products.some((product) => product.store === "play_store")
  )
    return false
  try {
    requireAppleStoreIdentity(
      config.APPLE_BUNDLE_ID ?? "",
      production ? Number(config.APPLE_APP_ID) : undefined,
      production,
    )
    requirePlayStorePackage(config.PLAY_PACKAGE_NAME)
    const key = createPrivateKey(
      (config.APPLE_IAP_PRIVATE_KEY ?? "").replaceAll("\\n", "\n"),
    )
    if (
      key.asymmetricKeyType !== "ec" ||
      key.asymmetricKeyDetails?.namedCurve !== "prime256v1"
    )
      return false
    appleRootCertificates()
  } catch {
    return false
  }
  if (
    !present(config.APPLE_IAP_KEY_ID) ||
    !present(config.APPLE_IAP_ISSUER_ID) ||
    !present(config.PLAY_NOTIFICATION_AUDIENCE) ||
    !present(config.PLAY_NOTIFICATION_SERVICE_EMAIL) ||
    !isPlayPublisherCredentialConfigured(config, fileExists)
  )
    return false
  return true
}
