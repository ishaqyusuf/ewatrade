import {
  buildInternalTenantHostname,
  withQaWorkspaceSuffix,
} from "@ewatrade/utils"

const PLATFORM_DOMAIN =
  process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com"
const DASHBOARD_URL =
  process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "https://ewatrade.com/dashboard"

function displayAddress(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.host + (parsed.pathname === "/" ? "" : parsed.pathname)
  } catch {
    return url.replace(/^https?:\/\//, "")
  }
}

export function getSignupAddresses(slug: string, isQa = false) {
  const canonical = withQaWorkspaceSuffix(slug || "yourname", isQa)
  return {
    storefront: buildInternalTenantHostname({
      tenantSlug: canonical,
      localProjectSlug: canonical,
      surface: "storefront",
      platformDomain: PLATFORM_DOMAIN,
    }),
    pos: buildInternalTenantHostname({
      tenantSlug: canonical,
      localProjectSlug: canonical,
      surface: "pos",
      platformDomain: PLATFORM_DOMAIN,
    }),
    dashboard: displayAddress(DASHBOARD_URL),
  }
}

export function SignupAddresses({
  slug,
  isQa = false,
}: { slug: string; isQa?: boolean }) {
  const addresses = getSignupAddresses(slug, isQa)
  return (
    <details className="signup-disclosure">
      <summary>See your other business addresses</summary>
      <dl className="signup-address-list">
        <div>
          <dt>Reserved storefront</dt>
          <dd>{addresses.storefront}</dd>
        </div>
        <div>
          <dt>POS</dt>
          <dd>{addresses.pos}</dd>
        </div>
        <div>
          <dt>Shared dashboard</dt>
          <dd>{addresses.dashboard}</dd>
        </div>
      </dl>
    </details>
  )
}
