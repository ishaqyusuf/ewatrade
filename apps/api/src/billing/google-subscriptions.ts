import { z } from "zod"
import { getPlayPublisherClient } from "./google-publisher-credentials"
import { requirePlayStorePackage } from "./store-app-identity"
import type { VerifiedStoreEntitlement } from "./store-entitlement"

const subscriptionSchema = z.object({
  subscriptionState: z.string(),
  linkedPurchaseToken: z.string().min(1).optional(),
  startTime: z.string(),
  testPurchase: z.object({}).optional(),
  externalAccountIdentifiers: z.object({
    obfuscatedExternalAccountId: z.string().min(1),
  }),
  lineItems: z
    .array(
      z.object({
        productId: z.string().min(1),
        expiryTime: z.string(),
        latestSuccessfulOrderId: z.string().min(1).optional(),
        autoRenewingPlan: z
          .object({ autoRenewEnabled: z.boolean() })
          .optional(),
      }),
    )
    .min(1),
})

function requireBillingEnvironment(value: string | undefined) {
  if (value !== "sandbox" && value !== "production")
    throw new Error(
      "Google subscription verifier environment is not configured.",
    )
  return value
}

export function projectGoogleSubscription(
  response: unknown,
  purchaseToken: string,
  configuredEnvironment: string | undefined,
): VerifiedStoreEntitlement {
  const expectedEnvironment = requireBillingEnvironment(configuredEnvironment)
  const subscription = subscriptionSchema.parse(response)
  const environment = subscription.testPurchase ? "sandbox" : "production"
  if (environment !== expectedEnvironment)
    throw new Error(
      "Google subscription environment does not match the verifier.",
    )
  // One base-plan line is supported; reject ambiguity instead of granting the wrong plan.
  if (subscription.lineItems.length !== 1)
    throw new Error("Subscription requires manual reconciliation.")
  const line = subscription.lineItems[0]
  if (!line) throw new Error("Subscription has no current product.")
  const entitledStates = [
    "SUBSCRIPTION_STATE_ACTIVE",
    "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
    "SUBSCRIPTION_STATE_CANCELED",
  ]
  return {
    provider: "play_store",
    purchaseId: purchaseToken,
    linkedPurchaseId: subscription.linkedPurchaseToken,
    latestOrderId: line.latestSuccessfulOrderId,
    productId: line.productId,
    accountToken:
      subscription.externalAccountIdentifiers.obfuscatedExternalAccountId,
    purchasedAt: new Date(subscription.startTime),
    expiresAt: new Date(line.expiryTime),
    revoked: !entitledStates.includes(subscription.subscriptionState),
    autoRenew: line.autoRenewingPlan?.autoRenewEnabled ?? false,
    environment,
  }
}

export async function verifyGoogleSubscription(
  purchaseToken: string,
): Promise<VerifiedStoreEntitlement> {
  const environment = requireBillingEnvironment(
    process.env.STORE_BILLING_ENVIRONMENT,
  )
  const packageName = requirePlayStorePackage(process.env.PLAY_PACKAGE_NAME)
  const client = await getPlayPublisherClient()
  const response = await client.request({
    url: `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
    timeout: 15_000,
  })
  return projectGoogleSubscription(response.data, purchaseToken, environment)
}
