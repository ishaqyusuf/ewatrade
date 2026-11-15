import { buildInternalTenantHostname } from "@ewatrade/utils"

/** The free platform address customers use for a business's online store. */
export function storefrontUrl(slug: string) {
  return `https://${buildInternalTenantHostname({
    tenantSlug: slug,
    surface: "storefront",
    platformDomain: process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com",
  })}`
}
