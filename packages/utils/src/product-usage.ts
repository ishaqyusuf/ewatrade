export const productUsages = ["FOR_SALE", "INTERNAL_USE", "BOTH"] as const
export type ProductUsage = (typeof productUsages)[number]

export const productUsageLabels: Record<ProductUsage, string> = {
  FOR_SALE: "For sale",
  INTERNAL_USE: "Internal use",
  BOTH: "Both",
}

export const productUsageDescriptions: Record<ProductUsage, string> = {
  FOR_SALE: "Available for customer orders.",
  INTERNAL_USE:
    "Track purchases and stock for business use. Hidden from customer orders.",
  BOTH: "Sell to customers and use within the business.",
}

export function isSaleEligibleProduct(usage: ProductUsage | undefined) {
  return usage === undefined || usage === "FOR_SALE" || usage === "BOTH"
}
