type CheckoutIntent = {
  checkoutUrl: string | null
  intent: { status: string }
  message: string
}

/** A redirect opens checkout; only verified provider facts can grant a plan. */
export function openSubscriptionCheckout(
  result: CheckoutIntent,
  actions: {
    navigate: (url: string) => void
    notify: (message: string) => void
    error: (message: string) => void
  },
) {
  if (result.checkoutUrl) {
    let url: URL
    try {
      url = new URL(result.checkoutUrl)
      if (url.protocol !== "https:" || url.username || url.password)
        throw new Error("Invalid checkout URL")
    } catch {
      actions.error("Checkout could not be opened. Please try again.")
      return
    }
    actions.navigate(url.toString())
    return
  }
  if (result.intent.status === "active_plan") actions.notify(result.message)
  else actions.error(result.message)
}
