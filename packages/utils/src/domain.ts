export const TENANT_SURFACES = ["storefront", "pos", "dashboard"] as const

export type TenantSurface = (typeof TENANT_SURFACES)[number]

export type TenantHostnameRecord = {
  hostname: string
  surface: TenantSurface
  isPrimary?: boolean
  isCustom?: boolean
  verifiedAt?: Date | string | null
}

export type TenantHostLookup = Partial<Record<TenantSurface, TenantHostnameRecord[]>>

export type DomainResolutionResult =
  | {
      kind: "marketing"
      hostname: string
      surface: null
      tenantSlug: null
      isCustomDomain: false
      isLocalhost: boolean
    }
  | {
      kind: "tenant"
      hostname: string
      surface: TenantSurface
      tenantSlug: string | null
      isCustomDomain: boolean
      isLocalhost: boolean
    }

export type ResolveTenantDomainOptions = {
  platformDomain: string
  marketingHosts?: string[]
  localProjectSlug?: string
}

const SURFACE_PREFIX_BY_KIND: Record<Exclude<TenantSurface, "storefront">, string> = {
  pos: "pos",
  dashboard: "dashboard"
}

const SURFACE_SUFFIX_BY_KIND: Record<Exclude<TenantSurface, "storefront">, string> = {
  pos: "-pos",
  dashboard: "-dashboard"
}

const LOCAL_SURFACE_LABELS: Record<TenantSurface, string> = {
  storefront: "storefront",
  pos: "pos",
  dashboard: "dashboard"
}

function uniqueHostnames(values: Array<string | null | undefined>) {
  return [...new Set(values.map(normalizeHostname).filter(Boolean))]
}

function getPlatformDomainHost(platformDomain: string) {
  return normalizeHostname(platformDomain).split(":")[0] ?? ""
}

function getPlatformDomainPort(platformDomain: string) {
  const normalized = normalizeHostname(platformDomain)
  const match = normalized.match(/:(\d+)$/)

  return match?.[1] ?? null
}

function getLocalProjectSlug(options: ResolveTenantDomainOptions) {
  return (options.localProjectSlug ?? "ewatrade").trim().toLowerCase()
}

function getLocalSurfaceHostname(params: {
  surface: TenantSurface
  platformDomain: string
  localProjectSlug: string
}) {
  const platformHost = getPlatformDomainHost(params.platformDomain)
  const platformPort = getPlatformDomainPort(params.platformDomain)
  const hostname = `${params.localProjectSlug}-${LOCAL_SURFACE_LABELS[params.surface]}.${platformHost}`

  return platformPort ? `${hostname}:${platformPort}` : hostname
}

export function normalizeHostname(input: string | null | undefined) {
  if (!input) {
    return ""
  }

  return input.trim().toLowerCase().replace(/\.$/, "")
}

export function stripPort(hostname: string) {
  return normalizeHostname(hostname).replace(/:\d+$/, "")
}

export function isLocalHostname(hostname: string) {
  const normalized = stripPort(hostname)

  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".127.0.0.1")
  )
}

export function getHostnameLabels(hostname: string) {
  return stripPort(hostname)
    .split(".")
    .map((label) => label.trim())
    .filter(Boolean)
}

export function getApexDomain(hostname: string) {
  const normalized = stripPort(hostname)

  if (!normalized || isLocalHostname(normalized)) {
    return normalized
  }

  const labels = getHostnameLabels(normalized)

  if (labels.length <= 2) {
    return normalized
  }

  return labels.slice(-2).join(".")
}

export function isPlatformHostname(hostname: string, platformDomain: string) {
  const normalizedHostname = normalizeHostname(hostname)
  const normalizedPlatformDomain = normalizeHostname(platformDomain)
  const hostnameWithoutPort = stripPort(normalizedHostname)
  const platformWithoutPort = stripPort(normalizedPlatformDomain)

  if (normalizedHostname === normalizedPlatformDomain) {
    return true
  }

  if (
    isLocalHostname(normalizedPlatformDomain) &&
    hostnameWithoutPort === platformWithoutPort
  ) {
    return true
  }

  return hostnameWithoutPort.endsWith(`.${platformWithoutPort}`)
}

export function getTenantSurfaceLabel(surface: TenantSurface) {
  switch (surface) {
    case "storefront":
      return "storefront"
    case "pos":
      return "point-of-sale"
    case "dashboard":
      return "dashboard"
  }
}

export function buildInternalTenantHostname(params: {
  tenantSlug: string
  surface: TenantSurface
  platformDomain: string
  localProjectSlug?: string
}) {
  const tenantSlug = params.tenantSlug.trim().toLowerCase()
  const platformDomain = normalizeHostname(params.platformDomain)

  if (isLocalHostname(platformDomain)) {
    return getLocalSurfaceHostname({
      surface: params.surface,
      platformDomain,
      localProjectSlug: (params.localProjectSlug ?? "ewatrade").trim().toLowerCase()
    })
  }

  if (params.surface === "storefront") {
    return `${tenantSlug}.${platformDomain}`
  }

  return `${tenantSlug}${SURFACE_SUFFIX_BY_KIND[params.surface]}.${platformDomain}`
}

export function buildCustomTenantHostname(params: {
  customDomain: string
  surface: TenantSurface
}) {
  const customDomain = normalizeHostname(params.customDomain)

  if (params.surface === "storefront") {
    return customDomain
  }

  return `${SURFACE_PREFIX_BY_KIND[params.surface]}.${customDomain}`
}

export function getTenantDomain(
  hostnames: TenantHostLookup | TenantHostnameRecord[],
  surface: TenantSurface,
  options?: {
    preferCustom?: boolean
    requireVerified?: boolean
  }
) {
  const records = Array.isArray(hostnames)
    ? hostnames.filter((record) => record.surface === surface)
    : hostnames[surface] ?? []

  const normalizedRecords = records.filter((record) => {
    if (!record.hostname) {
      return false
    }

    if (options?.requireVerified && !record.verifiedAt) {
      return false
    }

    return true
  })

  const preferred = normalizedRecords
    .slice()
    .sort((left, right) => {
      const leftCustomScore = options?.preferCustom && left.isCustom ? 1 : 0
      const rightCustomScore = options?.preferCustom && right.isCustom ? 1 : 0

      if (leftCustomScore !== rightCustomScore) {
        return rightCustomScore - leftCustomScore
      }

      const leftPrimaryScore = left.isPrimary ? 1 : 0
      const rightPrimaryScore = right.isPrimary ? 1 : 0

      if (leftPrimaryScore !== rightPrimaryScore) {
        return rightPrimaryScore - leftPrimaryScore
      }

      return normalizeHostname(left.hostname).localeCompare(
        normalizeHostname(right.hostname)
      )
    })
    .at(0)

  return preferred ? normalizeHostname(preferred.hostname) : null
}

export function getTenantDomainsBySurface(hostnames: TenantHostnameRecord[]) {
  return {
    storefront: getTenantDomain(hostnames, "storefront"),
    pos: getTenantDomain(hostnames, "pos"),
    dashboard: getTenantDomain(hostnames, "dashboard")
  }
}

export function extractTenantSlugFromPlatformHostname(
  hostname: string,
  platformDomain: string
) {
  const normalizedHostname = stripPort(hostname)
  const normalizedPlatformDomain = stripPort(platformDomain)

  if (isLocalHostname(normalizedPlatformDomain)) {
    return null
  }

  if (
    normalizedHostname === normalizedPlatformDomain ||
    !normalizedHostname.endsWith(`.${normalizedPlatformDomain}`)
  ) {
    return null
  }

  const subdomain = normalizedHostname
    .slice(0, -(normalizedPlatformDomain.length + 1))
    .trim()

  if (!subdomain) {
    return null
  }

  if (subdomain.endsWith(SURFACE_SUFFIX_BY_KIND.pos)) {
    return subdomain.slice(0, -SURFACE_SUFFIX_BY_KIND.pos.length) || null
  }

  if (subdomain.endsWith(SURFACE_SUFFIX_BY_KIND.dashboard)) {
    return subdomain.slice(0, -SURFACE_SUFFIX_BY_KIND.dashboard.length) || null
  }

  return subdomain
}

export function inferTenantSurfaceFromHostname(
  hostname: string,
  platformDomain: string,
  localProjectSlug = "ewatrade"
): TenantSurface | null {
  const normalizedHostname = normalizeHostname(hostname)
  const normalizedPlatformDomain = normalizeHostname(platformDomain)
  const hostnameWithoutPort = stripPort(normalizedHostname)
  const platformWithoutPort = stripPort(normalizedPlatformDomain)

  if (isLocalHostname(normalizedPlatformDomain)) {
    const localStorefrontHost = stripPort(
      getLocalSurfaceHostname({
        surface: "storefront",
        platformDomain: normalizedPlatformDomain,
        localProjectSlug
      })
    )
    const localPosHost = stripPort(
      getLocalSurfaceHostname({
        surface: "pos",
        platformDomain: normalizedPlatformDomain,
        localProjectSlug
      })
    )
    const localDashboardHost = stripPort(
      getLocalSurfaceHostname({
        surface: "dashboard",
        platformDomain: normalizedPlatformDomain,
        localProjectSlug
      })
    )

    if (
      hostnameWithoutPort === platformWithoutPort ||
      hostnameWithoutPort === localStorefrontHost
    ) {
      return "storefront"
    }

    if (hostnameWithoutPort === localPosHost) {
      return "pos"
    }

    if (hostnameWithoutPort === localDashboardHost) {
      return "dashboard"
    }
  }

  if (
    hostnameWithoutPort !== platformWithoutPort &&
    hostnameWithoutPort.endsWith(`.${platformWithoutPort}`)
  ) {
    const subdomain = hostnameWithoutPort.slice(0, -(platformWithoutPort.length + 1))

    if (subdomain.endsWith(SURFACE_SUFFIX_BY_KIND.pos)) {
      return "pos"
    }

    if (subdomain.endsWith(SURFACE_SUFFIX_BY_KIND.dashboard)) {
      return "dashboard"
    }

    return "storefront"
  }

  const labels = getHostnameLabels(normalizedHostname)

  if (labels[0] === SURFACE_PREFIX_BY_KIND.pos) {
    return "pos"
  }

  if (labels[0] === SURFACE_PREFIX_BY_KIND.dashboard) {
    return "dashboard"
  }

  return null
}

export function isMarketingHostname(
  hostname: string,
  options: ResolveTenantDomainOptions
) {
  const normalizedHostname = normalizeHostname(hostname)
  const platformDomain = normalizeHostname(options.platformDomain)
  const localProjectSlug = getLocalProjectSlug(options)

  const marketingHosts = uniqueHostnames([
    platformDomain,
    isLocalHostname(platformDomain) ? `${localProjectSlug}-marketing.${platformDomain}` : null,
    `www.${platformDomain}`,
    ...(options.marketingHosts ?? [])
  ])

  return marketingHosts.includes(normalizedHostname)
}

export function matchTenantHostname(
  hostname: string,
  hostnames: TenantHostnameRecord[]
) {
  const normalizedHostname = normalizeHostname(hostname)

  return (
    hostnames.find(
      (record) => normalizeHostname(record.hostname) === normalizedHostname
    ) ?? null
  )
}

export function resolveTenantDomain(
  hostname: string,
  options: ResolveTenantDomainOptions
): DomainResolutionResult {
  const normalizedHostname = normalizeHostname(hostname)
  const isLocalhost = isLocalHostname(normalizedHostname)
  const localProjectSlug = getLocalProjectSlug(options)

  if (isMarketingHostname(normalizedHostname, options)) {
    return {
      kind: "marketing",
      hostname: normalizedHostname,
      surface: null,
      tenantSlug: null,
      isCustomDomain: false,
      isLocalhost
    }
  }

  const surface =
    inferTenantSurfaceFromHostname(
      normalizedHostname,
      options.platformDomain,
      localProjectSlug
    ) ?? "storefront"

  const tenantSlug = isPlatformHostname(normalizedHostname, options.platformDomain)
    ? extractTenantSlugFromPlatformHostname(normalizedHostname, options.platformDomain)
    : null

  return {
    kind: "tenant",
    hostname: normalizedHostname,
    surface,
    tenantSlug,
    isCustomDomain: !isPlatformHostname(normalizedHostname, options.platformDomain),
    isLocalhost
  }
}
