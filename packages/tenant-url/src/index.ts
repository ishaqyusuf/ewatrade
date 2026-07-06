export type TenantUrlStyle =
  | "subdomain"
  | "path"
  | "internal"
  | "custom-domain"
  | "root"
  | "unknown"

export type TenantUrlConfig = {
  internalPrefix?: string
  appRootDomain: string
  projectSlug?: string
  headerPrefix?: string
  pathStyleHosts?: string[]
  enablePathStyleHosts?: boolean
  tenantSlugPattern?: RegExp
  reservedPaths?: string[]
}

export type TenantUrlInput = {
  host?: string | null
  pathname?: string | null
  protocol?: string | null
}

export type TenantUrlContext = {
  host: string
  protocol: "http" | "https" | ""
  style: TenantUrlStyle
  tenantSlug: string | null
  productPath: string
  externalBasePath: string
  externalPath: string
  internalPath: string
  isAppRootHost: boolean
  isPathStyleHost: boolean
  customDomainLookupHost: string | null
}

export type BuildTenantAppUrlOptions = {
  tenantSlug: string
  path?: string
  currentHost?: string | null
  currentProtocol?: string | null
  targetRootDomain: string
  targetPort?: number | string | null
  pathStyleHosts?: string[]
  enablePathStyleHosts?: boolean
  defaultProtocol?: "http" | "https"
}

export type TenantUrlHeaderNames = {
  domain: string
  pathname: string
  urlStyle: string
  externalBasePath: string
  externalPath: string
  accountId: string
}

const defaultReservedPaths = [
  "api",
  "_next",
  "_static",
  "__nextjs",
  "_vercel",
  "favicon.ico",
  "fonts",
  "signup",
  "sign-up",
]

const defaultTenantSlugPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i

export const DASHBOARD_SUBDOMAIN_PREFIX = "dashboard."
export const DASHBOARD_SUBDOMAIN_SUFFIX = ".dashboard"

function getEnvProjectSlug() {
  if (typeof process === "undefined") return ""
  return (
    process.env.TENANT_URL_PROJECT_SLUG ||
    process.env.NEXT_PUBLIC_TENANT_URL_PROJECT_SLUG ||
    ""
  )
}

function normalizeProjectSlug(slug?: string | null) {
  const normalized = (slug || getEnvProjectSlug() || "ewatrade")
    .trim()
    .toLowerCase()
    .replace(/^x-/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return normalized || "ewatrade"
}

export function getTenantUrlHeaderPrefix(
  config?: Pick<TenantUrlConfig, "projectSlug" | "headerPrefix">,
) {
  if (config?.headerPrefix) {
    const normalized = config.headerPrefix
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")

    return normalized.startsWith("x-") ? normalized : `x-${normalized}`
  }

  return `x-${normalizeProjectSlug(config?.projectSlug)}`
}

export function getTenantUrlHeaderNames(
  config?: Pick<TenantUrlConfig, "projectSlug" | "headerPrefix">,
): TenantUrlHeaderNames {
  const prefix = getTenantUrlHeaderPrefix(config)

  return {
    domain: `${prefix}-domain`,
    pathname: `${prefix}-pathname`,
    urlStyle: `${prefix}-url-style`,
    externalBasePath: `${prefix}-external-base-path`,
    externalPath: `${prefix}-external-path`,
    accountId: `${prefix}-saas-account-id`,
  }
}

export function normalizeHost(host?: string | null) {
  const value = host?.trim()
  if (!value) return ""

  try {
    const url = new URL(value.includes("://") ? value : `http://${value}`)
    return url.host.toLowerCase()
  } catch {
    return value
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .toLowerCase()
  }
}

export function stripPort(host: string) {
  if (host.startsWith("[")) return host.replace(/]:\d+$/, "]")
  return host.replace(/:\d+$/, "")
}

function normalizeProtocol(protocol?: string | null) {
  const value = protocol?.trim().replace(/:$/, "").toLowerCase()
  return value === "https" ? "https" : value === "http" ? "http" : ""
}

function normalizePrefix(prefix: string) {
  const trimmed = prefix.trim().replace(/\/+$/, "")
  return trimmed ? (trimmed.startsWith("/") ? trimmed : `/${trimmed}`) : ""
}

function normalizePath(pathname?: string | null) {
  const raw = pathname?.trim() || "/"
  const withoutUrl = raw.includes("://") ? new URL(raw).pathname : raw
  const path = withoutUrl.startsWith("/") ? withoutUrl : `/${withoutUrl}`
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path
}

function splitPath(pathname: string) {
  return pathname.split("/").filter(Boolean)
}

function joinPath(...parts: (string | null | undefined)[]) {
  const path = parts
    .filter(Boolean)
    .join("/")
    .replace(/\/+/g, "/")
  return path.startsWith("/") ? path : `/${path}`
}

function getRootDomainCandidates(appRootDomain: string) {
  const normalizedRootDomain = normalizeHost(appRootDomain)
  const rootCandidates = new Set<string>([
    normalizedRootDomain,
    stripPort(normalizedRootDomain),
  ])

  if (normalizedRootDomain.includes(".localhost")) {
    rootCandidates.add("localhost")
  }

  return [...rootCandidates].filter(Boolean)
}

function hostCandidates(host: string) {
  const normalizedHost = normalizeHost(host)
  return [normalizedHost, stripPort(normalizedHost)].filter(Boolean)
}

export function isAppRootDomainHost(host: string, appRootDomain: string) {
  const roots = getRootDomainCandidates(appRootDomain)
  return hostCandidates(host).some((candidateHost) =>
    roots.some((root) => candidateHost === root),
  )
}

export function extractTenantSubdomain(host: string, appRootDomain: string) {
  const roots = getRootDomainCandidates(appRootDomain)

  for (const candidateHost of hostCandidates(host)) {
    for (const root of roots) {
      if (candidateHost === root) return ""
      const suffix = `.${root}`
      if (candidateHost.endsWith(suffix)) {
        return candidateHost.slice(0, -suffix.length)
      }
    }
  }

  return ""
}

export function stripDashboardPrefix(subdomain: string) {
  let normalizedSubdomain = subdomain

  if (normalizedSubdomain.startsWith(DASHBOARD_SUBDOMAIN_PREFIX)) {
    normalizedSubdomain = normalizedSubdomain.slice(
      DASHBOARD_SUBDOMAIN_PREFIX.length,
    )
  }

  if (normalizedSubdomain.endsWith(DASHBOARD_SUBDOMAIN_SUFFIX)) {
    normalizedSubdomain = normalizedSubdomain.slice(
      0,
      -DASHBOARD_SUBDOMAIN_SUFFIX.length,
    )
  }

  return normalizedSubdomain
}

export function getCustomDomainLookupHost(host: string) {
  const normalizedHost = stripPort(normalizeHost(host))

  if (normalizedHost.startsWith(DASHBOARD_SUBDOMAIN_PREFIX)) {
    return normalizedHost.slice(DASHBOARD_SUBDOMAIN_PREFIX.length)
  }

  return normalizedHost
}

export function getCanonicalTenantSlugFromHost(
  host: string,
  appRootDomain: string,
) {
  return stripDashboardPrefix(extractTenantSubdomain(host, appRootDomain))
}

function isIpHost(host: string) {
  const bareHost = stripPort(host).replace(/^\[|\]$/g, "")
  const isIpv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(bareHost)
  const isIpv6 = bareHost.includes(":")
  return isIpv4 || isIpv6
}

function isBareLocalhostHost(host: string) {
  return stripPort(normalizeHost(host)) === "localhost"
}

function getPort(host: string) {
  if (host.startsWith("[")) return host.match(/]:(\d+)$/)?.[1] ?? ""
  return host.match(/:(\d+)$/)?.[1] ?? ""
}

function withPort(host: string, port?: number | string | null) {
  const normalizedHost = normalizeHost(host)
  const normalizedPort = port?.toString().trim()

  if (!normalizedHost || !normalizedPort || getPort(normalizedHost)) {
    return normalizedHost
  }

  return `${normalizedHost}:${normalizedPort}`
}

function isPathStyleHost(host: string, config: TenantUrlConfig) {
  if (config.enablePathStyleHosts === false) return false

  const normalizedHost = normalizeHost(host)
  const bareHost = stripPort(normalizedHost)
  const configured = new Set(
    (config.pathStyleHosts ?? ["localhost", "127.0.0.1"])
      .map((candidate) => stripPort(normalizeHost(candidate)))
      .filter(Boolean),
  )

  return (
    bareHost === "localhost" ||
    isIpHost(normalizedHost) ||
    configured.has(bareHost)
  )
}

function isReservedPathSegment(segment: string, config: TenantUrlConfig) {
  const internalPrefix = normalizePrefix(config.internalPrefix ?? "").replace(
    /^\//,
    "",
  )
  const reserved = new Set([
    ...defaultReservedPaths,
    ...(config.reservedPaths ?? []),
    ...(internalPrefix ? [internalPrefix] : []),
  ])
  return reserved.has(segment.toLowerCase())
}

function isValidTenantSlug(slug: string, config: TenantUrlConfig) {
  return (config.tenantSlugPattern ?? defaultTenantSlugPattern).test(slug)
}

function parseInternalPath(pathname: string, config: TenantUrlConfig) {
  const prefix = normalizePrefix(config.internalPrefix ?? "")
  const segments = splitPath(pathname)
  const prefixSegment = prefix.replace(/^\//, "")

  if (!prefixSegment || segments[0] !== prefixSegment || !segments[1]) {
    return null
  }

  const tenantSlug = segments[1]
  const productPath = joinPath(...segments.slice(2))

  return {
    tenantSlug,
    productPath: productPath === "/" ? "/" : productPath,
  }
}

export function isTenantInternalPath(
  pathname: string,
  config: Pick<TenantUrlConfig, "internalPrefix"> = {},
) {
  return parseInternalPath(normalizePath(pathname), {
    internalPrefix: config.internalPrefix ?? "",
    appRootDomain: "",
  })
}

export function toInternalTenantPath(
  context: Pick<TenantUrlContext, "tenantSlug">,
  productPath = "/",
  config: Pick<TenantUrlConfig, "internalPrefix"> = {},
) {
  const normalizedProductPath = normalizePath(productPath)
  if (!context.tenantSlug) return normalizedProductPath
  return joinPath(
    normalizePrefix(config.internalPrefix ?? ""),
    context.tenantSlug,
    normalizedProductPath === "/" ? "" : normalizedProductPath,
  )
}

export function resolveTenantUrlContext(
  input: TenantUrlInput,
  config: TenantUrlConfig,
): TenantUrlContext {
  const host = normalizeHost(input.host)
  const pathname = normalizePath(input.pathname)
  const protocol = normalizeProtocol(input.protocol)
  const appRootDomain = normalizeHost(config.appRootDomain)
  const internal = parseInternalPath(pathname, config)
  const appRootHost = isAppRootDomainHost(host, appRootDomain)
  const pathHost = isPathStyleHost(host, config)

  if (internal && isValidTenantSlug(internal.tenantSlug, config)) {
    const externalBasePath = pathHost ? `/${internal.tenantSlug}` : ""
    const externalPath =
      pathHost && internal.productPath !== "/"
        ? joinPath(externalBasePath, internal.productPath)
        : externalBasePath || internal.productPath

    return {
      host,
      protocol,
      style: pathHost ? "path" : "internal",
      tenantSlug: internal.tenantSlug,
      productPath: internal.productPath,
      externalBasePath,
      externalPath,
      internalPath: pathname,
      isAppRootHost: appRootHost,
      isPathStyleHost: pathHost,
      customDomainLookupHost: null,
    }
  }

  if (pathHost) {
    const [tenantSegment, ...rest] = splitPath(pathname)
    const hasTenantSegment =
      tenantSegment &&
      !isReservedPathSegment(tenantSegment, config) &&
      isValidTenantSlug(tenantSegment, config)

    if (hasTenantSegment) {
      const productPath = rest.length ? joinPath(...rest) : "/"
      const externalBasePath = `/${tenantSegment}`

      return {
        host,
        protocol,
        style: "path",
        tenantSlug: tenantSegment,
        productPath,
        externalBasePath,
        externalPath: pathname,
        internalPath: toInternalTenantPath(
          { tenantSlug: tenantSegment },
          productPath,
          config,
        ),
        isAppRootHost: appRootHost,
        isPathStyleHost: true,
        customDomainLookupHost: null,
      }
    }
  }

  const canonicalSlug = getCanonicalTenantSlugFromHost(host, appRootDomain)

  if (canonicalSlug && isValidTenantSlug(canonicalSlug, config)) {
    return {
      host,
      protocol,
      style: "subdomain",
      tenantSlug: canonicalSlug,
      productPath: pathname,
      externalBasePath: "",
      externalPath: pathname,
      internalPath: toInternalTenantPath(
        { tenantSlug: canonicalSlug },
        pathname,
        config,
      ),
      isAppRootHost: appRootHost,
      isPathStyleHost: false,
      customDomainLookupHost: null,
    }
  }

  const customDomainLookupHost =
    host && !appRootHost ? getCustomDomainLookupHost(host) : null

  return {
    host,
    protocol,
    style: appRootHost
      ? "root"
      : customDomainLookupHost
        ? "custom-domain"
        : "unknown",
    tenantSlug: null,
    productPath: pathname,
    externalBasePath: "",
    externalPath: pathname,
    internalPath: pathname,
    isAppRootHost: appRootHost,
    isPathStyleHost: pathHost,
    customDomainLookupHost,
  }
}

function splitHref(href: string) {
  const match = href.match(/^([^?#]*)(\?[^#]*)?(#.*)?$/)
  return {
    pathname: match?.[1] ?? "",
    search: match?.[2] ?? "",
    hash: match?.[3] ?? "",
  }
}

function isExternalHref(href: string) {
  return /^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith("//")
}

export function buildTenantHref(
  context: TenantUrlContext,
  href: string,
  options: Pick<TenantUrlConfig, "internalPrefix"> = {},
) {
  if (!href) return href
  if (isExternalHref(href)) return href

  const baseProductPath = context.productPath || "/"

  if (href.startsWith("?") || href.startsWith("#")) {
    return `${context.externalPath || context.externalBasePath || baseProductPath}${href}`
  }

  const { pathname, search, hash } = splitHref(href)
  const normalizedPathname = normalizePath(pathname || "/")
  const internal = isTenantInternalPath(normalizedPathname, options)
  const productPath = internal
    ? internal.productPath
    : normalizedPathname || baseProductPath

  if (context.style === "path" && context.tenantSlug) {
    if (
      normalizedPathname === context.externalBasePath ||
      normalizedPathname.startsWith(`${context.externalBasePath}/`)
    ) {
      return `${normalizedPathname}${search}${hash}`
    }

    return `${joinPath(context.externalBasePath, productPath)}${search}${hash}`
  }

  return `${productPath}${search}${hash}`
}

export function buildTenantRedirectUrl(
  context: TenantUrlContext,
  href: string,
  requestUrl: string | URL,
  options: Pick<TenantUrlConfig, "internalPrefix"> = {},
) {
  return new URL(buildTenantHref(context, href, options), requestUrl)
}

export function buildTenantAppUrl({
  tenantSlug,
  path = "/",
  currentHost,
  currentProtocol,
  targetRootDomain,
  targetPort,
  pathStyleHosts,
  enablePathStyleHosts = true,
  defaultProtocol = "http",
}: BuildTenantAppUrlOptions) {
  const normalizedCurrentHost = normalizeHost(currentHost)
  const targetRootHost = withPort(targetRootDomain, targetPort)
  const protocol = normalizeProtocol(currentProtocol) || defaultProtocol
  const normalizedPath = normalizePath(path)
  const appPath = normalizedPath === "/" ? "" : normalizedPath
  const currentHostUsesPathStyle =
    enablePathStyleHosts &&
    normalizedCurrentHost &&
    isPathStyleHost(normalizedCurrentHost, {
      appRootDomain: targetRootHost,
      pathStyleHosts,
      enablePathStyleHosts,
    })

  if (enablePathStyleHosts && isBareLocalhostHost(normalizedCurrentHost)) {
    const localhostRootHost = withPort(
      "localhost",
      targetPort ?? getPort(normalizedCurrentHost),
    )
    return `${protocol}://${tenantSlug}.${localhostRootHost}${appPath}`
  }

  if (currentHostUsesPathStyle) {
    const pathStyleHost = withPort(stripPort(normalizedCurrentHost), targetPort)
    return `${protocol}://${pathStyleHost}${joinPath(tenantSlug, appPath)}`
  }

  return `${protocol}://${tenantSlug}.${targetRootHost}${appPath}`
}

export function createTenantLinkAdapter<LinkComponent>(
  context: TenantUrlContext,
  Link: LinkComponent,
  options: Pick<TenantUrlConfig, "internalPrefix"> = {},
) {
  return function TenantLinkAdapter(props: Record<string, unknown>) {
    const href = props.href
    const nextProps = {
      ...props,
      href:
        typeof href === "string" ? buildTenantHref(context, href, options) : href,
    }

    return (Link as (props: Record<string, unknown>) => unknown)(nextProps)
  }
}
