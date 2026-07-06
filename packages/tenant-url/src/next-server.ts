import { headers } from "next/headers"
import { redirect } from "next/navigation"
import {
  buildTenantHref,
  getTenantUrlHeaderNames,
  resolveTenantUrlContext,
  toInternalTenantPath,
  type TenantUrlConfig,
  type TenantUrlContext,
} from "."

export type ResolveTenantUrlContextFromHeadersOptions = {
  config: TenantUrlConfig
  domain?: string | null
  headers: Headers
}

export function resolveTenantUrlContextFromHeaders({
  config,
  domain,
  headers,
}: ResolveTenantUrlContextFromHeadersOptions): TenantUrlContext {
  const headerNames = getTenantUrlHeaderNames(config)
  const productPath = headers.get(headerNames.pathname) || "/"
  const resolved = resolveTenantUrlContext(
    {
      host: headers.get("host"),
      pathname: productPath,
      protocol: headers.get("x-forwarded-proto"),
    },
    config,
  )
  const style = headers.get(headerNames.urlStyle) || resolved.style
  const tenantSlug =
    domain || headers.get(headerNames.domain) || resolved.tenantSlug
  const externalBasePath =
    headers.get(headerNames.externalBasePath) ||
    (style === "path" && tenantSlug
      ? `/${tenantSlug}`
      : resolved.externalBasePath)
  const externalPath =
    headers.get(headerNames.externalPath) ||
    (externalBasePath && productPath !== "/"
      ? `${externalBasePath}${productPath}`
      : externalBasePath || productPath)

  return {
    ...resolved,
    style: style as TenantUrlContext["style"],
    tenantSlug,
    productPath,
    externalBasePath,
    externalPath,
    internalPath: tenantSlug
      ? toInternalTenantPath({ tenantSlug }, productPath, config)
      : resolved.internalPath,
    isPathStyleHost: style === "path",
  }
}

export type CreateTenantRedirectOptions = {
  getConfig: () => TenantUrlConfig
  isEnabled?: () => boolean
}

export function createTenantRedirect({
  getConfig,
  isEnabled = () => process.env.NODE_ENV !== "production",
}: CreateTenantRedirectOptions) {
  return async function tenantRedirect(href: string): Promise<never> {
    if (!isEnabled()) {
      redirect(href)
    }

    const requestHeaders = await headers()
    const config = getConfig()
    const context = resolveTenantUrlContextFromHeaders({
      config,
      headers: requestHeaders,
    })

    redirect(buildTenantHref(context, href, config))
  }
}
