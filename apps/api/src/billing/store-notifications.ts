import { prisma } from "@ewatrade/db"
import { recordPlayRefundReviewCase } from "@ewatrade/db/queries"
import type { OpenAPIHono } from "@hono/zod-openapi"
import { OAuth2Client } from "google-auth-library"
import { bodyLimit } from "hono/body-limit"
import { z } from "zod"
import { appleBillingClient } from "./apple-subscriptions"
import { parsePlayRefundReviewNotification } from "./play-refund-review-notification"
import {
  encryptPlayPendingRefundToken,
  encryptPlayRefundReviewOrderId,
} from "./play-refund-review-token"
import { reconcileStoreSubscription } from "./reconcile-store-subscription"
import { requirePlayStorePackage } from "./store-app-identity"
import {
  classifyAppleStoreNotification,
  classifyGoogleStoreNotification,
  requireSupportedGoogleVoidedSubscription,
} from "./store-notification-routing"

const googleIdentity = new OAuth2Client()

type StoreNotificationDependencies = {
  verifyGoogleIdentity?: (
    token: string,
    audience: string,
  ) => Promise<{ email?: string; email_verified?: boolean } | undefined>
  reconcileSubscription?: typeof reconcileStoreSubscription
  recordRefundReview?: typeof recordPlayRefundReviewCase
}

export function registerStoreNotificationRoutes(
  app: OpenAPIHono,
  dependencies: StoreNotificationDependencies = {},
) {
  const reconcileSubscription =
    dependencies.reconcileSubscription ?? reconcileStoreSubscription
  const recordRefundReview =
    dependencies.recordRefundReview ?? recordPlayRefundReviewCase
  app.use("/webhooks/store/*", bodyLimit({ maxSize: 256 * 1024 }))
  app.post("/webhooks/store/apple", async (c) => {
    if (process.env.STORE_BILLING_ENABLED !== "true")
      return c.json({ received: false }, 503)
    try {
      const body = z
        .object({ signedPayload: z.string().min(1).max(250_000) })
        .parse(await c.req.json())
      const { verifier } = appleBillingClient()
      const notification = await verifier.verifyAndDecodeNotification(
        body.signedPayload,
      )
      const signedTransaction = notification.data?.signedTransactionInfo
      const kind = classifyAppleStoreNotification({
        notificationType: notification.notificationType,
        subtype: notification.subtype,
        signedTransactionInfo: signedTransaction,
      })
      if (kind === "test") return c.json({ received: true })
      if (!signedTransaction)
        throw new Error("Apple notification has no signed transaction.")
      const transaction =
        await verifier.verifyAndDecodeTransaction(signedTransaction)
      if (!transaction.transactionId) return c.json({ received: false }, 400)
      await reconcileSubscription(prisma, {
        store: "app_store",
        purchaseId: transaction.transactionId,
      })
      return c.json({ received: true })
    } catch {
      console.error("[store-billing] Apple notification was not acknowledged.")
      return c.json({ received: false }, 503)
    }
  })
  app.post("/webhooks/store/google", async (c) => {
    if (process.env.STORE_BILLING_ENABLED !== "true")
      return c.json({ received: false }, 503)
    const audience = process.env.PLAY_NOTIFICATION_AUDIENCE
    const serviceEmail = process.env.PLAY_NOTIFICATION_SERVICE_EMAIL
    const token = c.req.header("authorization")?.match(/^Bearer (.+)$/)?.[1]
    if (!audience || !serviceEmail || !token)
      return c.json({ received: false }, 401)
    try {
      const identity = dependencies.verifyGoogleIdentity
        ? await dependencies.verifyGoogleIdentity(token, audience)
        : (
            await googleIdentity.verifyIdToken({
              idToken: token,
              audience,
            })
          ).getPayload()
      if (!identity?.email_verified || identity.email !== serviceEmail)
        return c.json({ received: false }, 401)
    } catch {
      return c.json({ received: false }, 401)
    }
    try {
      const envelope = z
        .object({ message: z.object({ data: z.string().max(200_000) }) })
        .parse(await c.req.json())
      const event = z
        .object({
          packageName: z.string(),
          testNotification: z.unknown().optional(),
          subscriptionNotification: z
            .object({ purchaseToken: z.string().min(1).max(8192) })
            .optional(),
          voidedPurchaseNotification: z
            .object({
              purchaseToken: z.string().min(1).max(8192),
              orderId: z.string().min(1).max(256),
              productType: z.number().int(),
              refundType: z.number().int(),
            })
            .optional(),
          oneTimeProductNotification: z.unknown().optional(),
          pendingRefundReviewNotification: z.unknown().optional(),
          eventTimeMillis: z.union([z.string(), z.number()]).optional(),
        })
        .parse(
          JSON.parse(
            Buffer.from(envelope.message.data, "base64").toString("utf8"),
          ),
        )
      if (
        event.packageName !==
        requirePlayStorePackage(process.env.PLAY_PACKAGE_NAME)
      )
        return c.json({ received: false }, 400)
      const kind = classifyGoogleStoreNotification(event)
      if (kind === "test") return c.json({ received: true })
      if (kind === "refund_review") {
        const review = parsePlayRefundReviewNotification(event)
        if (process.env.PLAY_REFUND_REVIEW_INTAKE_ENABLED === "true") {
          const encrypted = encryptPlayPendingRefundToken(
            review.pendingRefundToken,
          )
          const encryptedOrder = encryptPlayRefundReviewOrderId(review.orderId)
          if (encryptedOrder.keyId !== encrypted.keyId)
            throw new Error("Play refund-review custody key changed.")
          await recordRefundReview(prisma, {
            ...review,
            encryptedPendingToken: encrypted.envelope,
            encryptedOrderId: encryptedOrder.envelope,
            encryptionKeyId: encrypted.keyId,
            orderId: review.orderId,
            obfuscatedAccountId: review.obfuscatedAccountId,
          })
          // An acknowledged push will not be retried. Keep the durable case
          // under Pub/Sub redelivery until the separately monitored operator
          // path has been accepted and explicitly activated.
          if (
            process.env.PLAY_REFUND_REVIEW_ALERTS_ENABLED === "true" &&
            process.env.PLAY_REFUND_REVIEW_ACK_ENABLED === "true"
          )
            return c.json({ received: true })
        }
        throw new Error("Play refund review needs durable operator intake.")
      }
      if (kind === "voided" && event.voidedPurchaseNotification) {
        const voided = event.voidedPurchaseNotification
        requireSupportedGoogleVoidedSubscription(voided)
        await reconcileSubscription(prisma, {
          store: "play_store",
          purchaseId: voided.purchaseToken,
          voidedOrderId: voided.orderId,
        })
      } else if (kind === "subscription" && event.subscriptionNotification) {
        await reconcileSubscription(prisma, {
          store: "play_store",
          purchaseId: event.subscriptionNotification.purchaseToken,
        })
      }
      return c.json({ received: true })
    } catch {
      console.error("[store-billing] Google notification was not acknowledged.")
      return c.json({ received: false }, 503)
    }
  })
}
