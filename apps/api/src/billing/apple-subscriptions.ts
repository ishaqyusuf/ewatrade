import {
  APIError,
  APIException,
  AppStoreServerAPIClient,
  Environment,
  ExpirationIntent,
  type JWSRenewalInfoDecodedPayload,
  type JWSTransactionDecodedPayload,
  SignedDataVerifier,
  Status,
  VerificationException,
  VerificationStatus,
} from "@apple/app-store-server-library"
import { appStoreReviewOwnerIds } from "@ewatrade/db/owner-billing"
import { appleRootCertificates } from "./apple-root-certificates"
import { requireAppleStoreIdentity } from "./store-app-identity"
import type { VerifiedStoreEntitlement } from "./store-entitlement"

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value)
    throw new Error(`Store billing configuration is incomplete: ${name}`)
  return value
}

export function resolveAppleBillingEnvironment(value: string | undefined) {
  if (value === "sandbox")
    return { sdk: Environment.SANDBOX, label: "sandbox" as const }
  if (value === "production")
    return { sdk: Environment.PRODUCTION, label: "production" as const }
  throw new Error("Apple subscription verifier environment is not configured.")
}

export function appleBillingClient(override?: "production" | "sandbox") {
  const environment = resolveAppleBillingEnvironment(
    override ?? process.env.STORE_BILLING_ENVIRONMENT,
  )
  const bundleId = required("APPLE_BUNDLE_ID")
  const appId =
    environment.label === "production"
      ? Number(required("APPLE_APP_ID"))
      : undefined
  if (appId !== undefined && (!Number.isSafeInteger(appId) || appId <= 0))
    throw new Error("Invalid Apple app identifier.")
  requireAppleStoreIdentity(bundleId, appId, environment.label === "production")
  return {
    environment: environment.label,
    verifier: new SignedDataVerifier(
      appleRootCertificates(),
      true,
      environment.sdk,
      bundleId,
      appId,
    ),
    client: new AppStoreServerAPIClient(
      required("APPLE_IAP_PRIVATE_KEY").replaceAll("\\n", "\n"),
      required("APPLE_IAP_KEY_ID"),
      required("APPLE_IAP_ISSUER_ID"),
      bundleId,
      environment.sdk,
    ),
  }
}

export type AppleBillingRuntime = {
  environment: "production" | "sandbox"
  client: Pick<
    AppStoreServerAPIClient,
    "getTransactionInfo" | "getAllSubscriptionStatuses"
  >
  verifier: Pick<
    SignedDataVerifier,
    | "verifyAndDecodeTransaction"
    | "verifyAndDecodeRenewalInfo"
    | "verifyAndDecodeNotification"
  >
}

/** Apple documents this one error as the production-to-sandbox lookup signal. */
export async function lookupAppleTransaction(
  transactionId: string,
  allowReviewSandbox: boolean,
  createRuntime: (
    environment?: "production" | "sandbox",
  ) => AppleBillingRuntime = appleBillingClient,
) {
  let runtime = createRuntime()
  try {
    return {
      runtime,
      transaction: await runtime.client.getTransactionInfo(transactionId),
    }
  } catch (error) {
    if (
      !allowReviewSandbox ||
      runtime.environment !== "production" ||
      !(error instanceof APIException) ||
      error.httpStatusCode !== 404 ||
      error.apiError !== APIError.TRANSACTION_ID_NOT_FOUND
    )
      throw error
    runtime = createRuntime("sandbox")
    return {
      runtime,
      transaction: await runtime.client.getTransactionInfo(transactionId),
    }
  }
}

/** A second, full signature/bundle/environment verification is mandatory. */
export async function verifyAppleNotification(
  signedPayload: string,
  createRuntime: (
    environment?: "production" | "sandbox",
  ) => AppleBillingRuntime = appleBillingClient,
  config: Record<string, string | undefined> = process.env,
) {
  let runtime = createRuntime()
  let notification: Awaited<
    ReturnType<SignedDataVerifier["verifyAndDecodeNotification"]>
  >
  try {
    notification =
      await runtime.verifier.verifyAndDecodeNotification(signedPayload)
  } catch (error) {
    if (
      runtime.environment !== "production" ||
      appStoreReviewOwnerIds(config).length === 0 ||
      !(error instanceof VerificationException) ||
      error.status !== VerificationStatus.INVALID_ENVIRONMENT
    )
      throw error
    runtime = createRuntime("sandbox")
    notification =
      await runtime.verifier.verifyAndDecodeNotification(signedPayload)
  }
  const signedTransaction = notification.data?.signedTransactionInfo
  const transaction = signedTransaction
    ? await runtime.verifier.verifyAndDecodeTransaction(signedTransaction)
    : undefined
  return { environment: runtime.environment, notification, transaction }
}

export function selectAppleSubscriptionStatus<
  T extends { originalTransactionId?: string | null },
>(
  groups:
    | readonly { lastTransactions?: readonly T[] | null }[]
    | null
    | undefined,
  originalTransactionId: string,
): T {
  const matches =
    groups
      ?.flatMap((group) => group.lastTransactions ?? [])
      .filter((item) => item.originalTransactionId === originalTransactionId) ??
    []
  if (matches.length !== 1 || !matches[0])
    throw new Error("Apple subscription status is missing or ambiguous.")
  return matches[0]
}

export async function verifyAppleSubscription(
  transactionId: string,
  allowReviewSandbox = false,
  createRuntime: (
    environment?: "production" | "sandbox",
  ) => AppleBillingRuntime = appleBillingClient,
): Promise<VerifiedStoreEntitlement> {
  const {
    runtime: { client, environment, verifier },
    transaction,
  } = await lookupAppleTransaction(
    transactionId,
    allowReviewSandbox,
    createRuntime,
  )
  if (!transaction.signedTransactionInfo)
    throw new Error("Apple transaction was not found.")
  const initial = await verifier.verifyAndDecodeTransaction(
    transaction.signedTransactionInfo,
  )
  if (!initial.originalTransactionId)
    throw new Error("Apple transaction has no original identifier.")
  const status = await client.getAllSubscriptionStatuses(transactionId)
  const current = selectAppleSubscriptionStatus(
    status.data,
    initial.originalTransactionId,
  )
  if (!current?.signedTransactionInfo || !current.signedRenewalInfo)
    throw new Error("Apple subscription status was not found.")
  const purchase = await verifier.verifyAndDecodeTransaction(
    current.signedTransactionInfo,
  )
  const renewal = await verifier.verifyAndDecodeRenewalInfo(
    current.signedRenewalInfo,
  )
  if (purchase.originalTransactionId !== initial.originalTransactionId)
    throw new Error("Apple subscription identity mismatch.")
  return projectAppleSubscription(
    current.status,
    purchase,
    renewal,
    environment,
  )
}

/** Only called with Apple's verified transaction and renewal payloads. */
export function projectAppleSubscription(
  status: number | undefined,
  purchase: JWSTransactionDecodedPayload,
  renewal: JWSRenewalInfoDecodedPayload,
  environment: VerifiedStoreEntitlement["environment"],
): VerifiedStoreEntitlement {
  if (
    !purchase.originalTransactionId ||
    !purchase.productId ||
    !purchase.appAccountToken ||
    purchase.expiresDate === undefined ||
    purchase.purchaseDate === undefined
  )
    throw new Error(
      "Apple subscription does not have the required account binding.",
    )
  if (purchase.originalTransactionId !== renewal.originalTransactionId)
    throw new Error("Apple subscription identity mismatch.")
  const inGrace = status === Status.BILLING_GRACE_PERIOD
  const validDate = (value: number) =>
    Number.isFinite(new Date(value).getTime()) && value > 0
  if (
    !validDate(purchase.expiresDate) ||
    !validDate(purchase.purchaseDate) ||
    purchase.purchaseDate >= purchase.expiresDate
  )
    throw new Error("Invalid Apple subscription dates.")
  if (
    inGrace &&
    !purchase.revocationDate &&
    (!renewal.gracePeriodExpiresDate ||
      !validDate(renewal.gracePeriodExpiresDate) ||
      renewal.gracePeriodExpiresDate < purchase.expiresDate)
  )
    throw new Error("Apple grace expiry is missing or invalid.")
  // Courtesy is anchored to the last paid expiry, never observation/delivery time.
  // A verified billing failure is required; cancellation, revocation, missing
  // status and verifier/network failure cannot manufacture five days of access.
  const courtesy =
    !purchase.revocationDate &&
    [Status.BILLING_RETRY, Status.BILLING_GRACE_PERIOD].includes(status ?? 0) &&
    renewal.isInBillingRetryPeriod === true &&
    renewal.expirationIntent === ExpirationIntent.BILLING_ERROR &&
    renewal.autoRenewStatus === 1
  const expiresAt = Math.max(
    purchase.expiresDate,
    inGrace && !purchase.revocationDate
      ? (renewal.gracePeriodExpiresDate ?? 0)
      : 0,
    courtesy ? purchase.expiresDate + 5 * 24 * 60 * 60 * 1000 : 0,
  )
  if (!validDate(expiresAt))
    throw new Error("Invalid Apple subscription dates.")
  return {
    provider: "app_store",
    purchaseId: purchase.originalTransactionId,
    productId: purchase.productId,
    accountToken: purchase.appAccountToken,
    purchasedAt: new Date(purchase.purchaseDate),
    expiresAt: new Date(expiresAt),
    revoked:
      Boolean(purchase.revocationDate) ||
      (!courtesy &&
        ![Status.ACTIVE, Status.BILLING_GRACE_PERIOD].includes(status ?? 0)),
    autoRenew: renewal.autoRenewStatus === 1,
    environment,
  }
}
