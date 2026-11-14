export const productUsages = [
  "FOR_SALE",
  "INTERNAL_USE",
  "BOTH",
  "RETURNABLE",
] as const
export type ProductUsage = (typeof productUsages)[number]

export const productUsageLabels: Record<ProductUsage, string> = {
  FOR_SALE: "For sale",
  INTERNAL_USE: "Internal use",
  BOTH: "Both",
  RETURNABLE: "Returnable",
}

export const productUsageDescriptions: Record<ProductUsage, string> = {
  FOR_SALE: "Available for customer orders.",
  INTERNAL_USE:
    "Track purchases and stock for business use. Hidden from customer orders.",
  BOTH: "Sell to customers and use within the business.",
  RETURNABLE:
    "Goes out with orders and comes back, like crates or gas cylinders. Not sold.",
}

/** Only these usages can be sold; anything else (including new usages) is refused. */
export function isSaleEligibleProduct(usage: ProductUsage | undefined) {
  return usage === undefined || usage === "FOR_SALE" || usage === "BOTH"
}

/** Business-use stock (purchases, internal use) applies to these usages only. */
export function isInternalUseProduct(usage: ProductUsage | undefined) {
  return usage === "INTERNAL_USE" || usage === "BOTH"
}

/** Crates, cylinders and similar items tracked in the returnables ledger. */
export function isReturnableProduct(usage: ProductUsage | undefined) {
  return usage === "RETURNABLE"
}
