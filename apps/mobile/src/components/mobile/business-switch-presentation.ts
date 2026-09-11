import { getMobileRoleLabel, normalizeMobileRole } from "@/lib/mobile-roles"
import type { RetailOpsBusiness } from "@/store/businessStore"

export const BUSINESS_SWITCH_COPY = {
  description: "Choose where you want to manage orders, stock, and staff.",
  title: "Workspaces",
} as const

export function getBusinessSwitchRowPresentation(
  business: RetailOpsBusiness,
  currentBusinessId: string | null | undefined,
) {
  const selected = business.id === currentBusinessId
  const roleOrType = business.role
    ? normalizeMobileRole(business.role) === "ADMIN"
      ? "Admin"
      : getMobileRoleLabel(business.role)
    : (business.type ?? "Business")

  return {
    badgeLabel: selected ? "Current" : "Choose",
    canActivate: !selected,
    detail: `${roleOrType} · ${business.currency ?? "NGN"}`,
    metadata: [business.category, business.country, business.salesMethod]
      .filter(Boolean)
      .join(" · "),
    selected,
  }
}
