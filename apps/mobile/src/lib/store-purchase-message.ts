/** Display-only native outcomes; none of these authorize an entitlement. */
export function storePurchaseErrorMessage(code: string | undefined) {
  if (code === "user-cancelled")
    return "Purchase cancelled. No new subscription or business coverage was granted."
  if (code === "pending" || code === "deferred-payment")
    return STORE_PURCHASE_PENDING_MESSAGE
  return "The purchase did not complete. Check your store purchase history before trying again."
}

export const STORE_PURCHASE_PENDING_MESSAGE =
  "Awaiting store approval. No verified subscription or business coverage has been granted."
