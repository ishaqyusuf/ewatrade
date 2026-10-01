import {
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier,
  Status,
} from "@apple/app-store-server-library"
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

export function appleBillingClient() {
  const environment = resolveAppleBillingEnvironment(
    process.env.STORE_BILLING_ENVIRONMENT,
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
): Promise<VerifiedStoreEntitlement> {
  const { client, environment, verifier } = appleBillingClient()
  const transaction = await client.getTransactionInfo(transactionId)
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
  if (
    !purchase.originalTransactionId ||
    !purchase.productId ||
    !purchase.appAccountToken ||
    !purchase.expiresDate ||
    !purchase.purchaseDate
  )
    throw new Error(
      "Apple subscription does not have the required account binding.",
    )
  if (
    purchase.originalTransactionId !== renewal.originalTransactionId ||
    purchase.originalTransactionId !== initial.originalTransactionId
  )
    throw new Error("Apple subscription identity mismatch.")
  const inGrace = current.status === Status.BILLING_GRACE_PERIOD
  return {
    provider: "app_store",
    purchaseId: purchase.originalTransactionId,
    productId: purchase.productId,
    accountToken: purchase.appAccountToken,
    purchasedAt: new Date(purchase.purchaseDate),
    expiresAt: new Date(
      inGrace && renewal.gracePeriodExpiresDate
        ? renewal.gracePeriodExpiresDate
        : purchase.expiresDate,
    ),
    revoked:
      Boolean(purchase.revocationDate) ||
      ![Status.ACTIVE, Status.BILLING_GRACE_PERIOD].includes(
        current.status ?? 0,
      ),
    autoRenew: renewal.autoRenewStatus === 1,
    environment,
  }
}
