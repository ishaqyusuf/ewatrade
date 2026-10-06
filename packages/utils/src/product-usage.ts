export const productUsages = ["FOR_SALE", "INTERNAL_USE", "BOTH"] as const
export type ProductUsage = (typeof productUsages)[number]

export const productUsageLabels: Record<ProductUsage, string> = {
  FOR_SALE: "For sale",
  INTERNAL_USE: "Internal use",
  BOTH: "Both",
}

export function isSaleEligibleProduct(usage: ProductUsage | undefined) {
  return usage === undefined || usage === "FOR_SALE" || usage === "BOTH"
}
