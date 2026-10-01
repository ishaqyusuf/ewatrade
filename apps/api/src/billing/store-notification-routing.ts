export function classifyAppleStoreNotification(input: {
  notificationType?: string
  subtype?: string
  signedTransactionInfo?: string | null
}): "test" | "reconcile" {
  if (input.notificationType === "TEST") return "test"
  if (
    input.notificationType === "CONSUMPTION_REQUEST" ||
    input.notificationType === "EXTERNAL_PURCHASE_TOKEN" ||
    (input.notificationType === "RENEWAL_EXTENSION" &&
      input.subtype === "SUMMARY")
  )
    throw new Error(
      "Unsupported Apple notification requires separate handling.",
    )
  if (!input.signedTransactionInfo)
    throw new Error(
      "Apple notification has no signed transaction to reconcile.",
    )
  return "reconcile"
}

export type GoogleNotificationKind =
  | "test"
  | "subscription"
  | "voided"
  | "refund_review"

export function requireSupportedGoogleVoidedSubscription(input: {
  productType: number
  refundType: number
}) {
  if (input.productType !== 1 || input.refundType !== 1)
    throw new Error("Unsupported Play voided subscription notification.")
}

export function classifyGoogleStoreNotification(input: {
  testNotification?: unknown
  subscriptionNotification?: unknown
  voidedPurchaseNotification?: unknown
  oneTimeProductNotification?: unknown
  pendingRefundReviewNotification?: unknown
}): GoogleNotificationKind {
  const kinds = [
    ["test", input.testNotification],
    ["subscription", input.subscriptionNotification],
    ["voided", input.voidedPurchaseNotification],
    ["one_time", input.oneTimeProductNotification],
    ["pending_refund_review", input.pendingRefundReviewNotification],
  ] as const
  const present = kinds.filter(([, notification]) => notification != null)
  if (present.length !== 1)
    throw new Error("Google notification must contain one event kind.")
  const kind = present[0]?.[0]
  if (kind === "pending_refund_review") return "refund_review"
  if (kind === "test" || kind === "subscription" || kind === "voided")
    return kind
  throw new Error(`Unsupported Google notification kind: ${kind}`)
}
