export const DOMAIN_MANAGEMENT_COPY = {
  connectAction: "Connect a domain you own",
  emptyMessage:
    "Find a new .com.ng or .com, or connect a domain you already own.",
  emptyTitle: "No custom domain yet",
  findAction: "Find a domain",
  includedAddressMessage:
    "Your included Storefront address remains available while you choose a custom domain.",
  includedAddressTitle: "Free ẸwáTrade address",
  purpose:
    "Use the included Storefront address, find a new domain, or connect one you own.",
} as const

export type DomainManagementStep =
  | "list"
  | "search"
  | "owner"
  | "review"
  | "details"
  | "connect"
  | "verify"
  | "progress"

export function shouldLoadDomainList(businessId: string | null | undefined) {
  return Boolean(businessId)
}

export function shouldLoadDomainOrder(
  businessId: string | null | undefined,
  step: DomainManagementStep,
  orderId: string | null | undefined,
) {
  return Boolean(businessId) && step === "progress" && Boolean(orderId)
}

export function shouldLoadRegistrantProfile(
  businessId: string | null | undefined,
  step: DomainManagementStep,
) {
  return (
    Boolean(businessId) &&
    (step === "search" || step === "owner" || step === "review")
  )
}

export function resolveDomainBusinessId(
  localBusinessId: string | null | undefined,
  authenticatedBusinessId: string | null | undefined,
) {
  return localBusinessId ?? authenticatedBusinessId ?? null
}
