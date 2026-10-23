import {
  type StorefrontAction,
  type StorefrontActionAdapter,
  runStorefrontAction,
} from "../../storefront-contracts/src/actions"
import {
  type VersionPolicyEntry,
  versionAvailable,
} from "../../storefront-contracts/src/availability"
import {
  type StorefrontCapability,
  type StorefrontComposition,
  type TemplateManifest,
  assertCompositionSources,
  validateComposition,
} from "../../storefront-contracts/src/manifest"
import {
  type CatalogQuery,
  STOREFRONT_RESOURCE_LIMITS,
  type StorefrontCapabilities,
  type StorefrontResourceLoader,
  type StorefrontResources,
  type StorefrontScope,
  catalogQuerySchema,
  publicCatalogItemSchema,
  storefrontQueryKey,
} from "../../storefront-contracts/src/resources"
import { validateDesignAssets } from "./design-assets"

/** Runtime consumes registrations supplied by its host; it never imports templates. */
export type RuntimeTemplateEntry = VersionPolicyEntry & {
  manifest: TemplateManifest
  status: {
    registration: "source-only" | "runtime-registered"
    qualification: "not-qualified" | "qualified" | "needs-requalification"
  }
}

/**
 * Supplied by the host's trusted server boundary (verified host, session, active
 * release pointer or scoped draft). Takes no request input: scope is never chosen
 * by the caller. Returns null when no Site/release may be shown.
 */
export type TrustedSiteResolver = () => Promise<{
  scope: StorefrontScope
  composition: unknown
} | null>

export type StorefrontRefusal =
  | "unavailable"
  | "template-unavailable"
  | "invalid-composition"
  | "over-limit"
  | "invalid-resources"

/** Public render snapshot. Holds only public DTOs: no tenant/store IDs, provider keys or private reasons. */
export type StorefrontClientSnapshot = {
  mode: StorefrontScope["mode"]
  locale: string
  currencyCode: string
  composition: StorefrontComposition
  resources: StorefrontResources
  capabilities: StorefrontCapabilities
}

export type StorefrontLoad =
  | { status: "refused"; reason: StorefrontRefusal; detail?: string }
  | {
      status: "ready"
      scope: StorefrontScope
      manifest: TemplateManifest
      queryKey: ReturnType<typeof storefrontQueryKey>
      /** Previews are private and never indexed; live pages may use shared caches. */
      cacheControl: "public" | "private, no-store"
      robots: "index" | "noindex"
      snapshot: StorefrontClientSnapshot
    }

/** Live renders need a runtime-registered, qualified template; previews may use source-only registrations. */
export function resolveTemplate(
  mode: StorefrontScope["mode"],
  template: { key: string; version: string },
  registry: readonly RuntimeTemplateEntry[] = [],
) {
  const entry = registry.find(
    (candidate) =>
      candidate.manifest.key === template.key &&
      candidate.manifest.version === template.version,
  )
  if (!entry || !versionAvailable(entry, "render")) return null
  if (
    mode === "live" &&
    (entry.status.registration !== "runtime-registered" ||
      entry.status.qualification !== "qualified")
  ) {
    return null
  }
  return entry
}

/** Resources and capabilities the composition's visible sections actually declare. */
export function declaredAccess(
  manifest: TemplateManifest,
  composition: StorefrontComposition,
) {
  const resources = new Set<string>()
  const capabilities = new Set<StorefrontCapability>()
  for (const page of composition.pages) {
    for (const section of page.sections) {
      if (!section.visible) continue
      const definition = manifest.sections.find(
        (entry) => entry.key === section.type,
      )
      for (const resource of definition?.resources ?? [])
        resources.add(resource)
      for (const capability of definition?.capabilities ?? [])
        capabilities.add(capability)
    }
  }
  return { resources, capabilities }
}

/** Refuses (does not truncate) a load beyond the per-render caps or carrying non-public item fields. */
export function checkResourceLimits(
  resources: StorefrontResources,
): string | null {
  const limits = STOREFRONT_RESOURCE_LIMITS
  const { items, categories } = resources.catalog
  if (items.length > limits.catalogItems) return "catalogItems"
  if (categories.length > limits.categories) return "categories"
  const allItems = resources.catalog.highlightedItem
    ? [...items, resources.catalog.highlightedItem]
    : items
  if (allItems.some((item) => item.options.length > limits.optionsPerItem))
    return "optionsPerItem"
  if (Object.keys(resources.assets).length > limits.assets) return "assets"
  return null
}

function restrictToDeclared(
  loaded: {
    resources: StorefrontResources
    capabilities: StorefrontCapabilities
  },
  declared: ReturnType<typeof declaredAccess>,
) {
  const catalogDeclared =
    declared.resources.has("publicCatalog") ||
    declared.resources.has("publicServices")
  const contactDeclared = [
    "conversation",
    "whatsappEnquiry",
    "serviceRequest",
  ].some((capability) =>
    declared.capabilities.has(capability as StorefrontCapability),
  )
  const capabilities = { ...loaded.capabilities }
  for (const capability of Object.keys(
    capabilities,
  ) as StorefrontCapability[]) {
    if (!declared.capabilities.has(capability)) {
      capabilities[capability] = {
        available: false,
        reason: "Not used by this storefront.",
      }
    }
  }
  const resources: StorefrontResources = {
    ...loaded.resources,
    catalog: catalogDeclared
      ? loaded.resources.catalog
      : {
          items: [],
          highlightedItem: null,
          categories: [],
          category: null,
          nextCursor: null,
          hasHiddenItems: false,
        },
    contact: contactDeclared
      ? loaded.resources.contact
      : { chatToken: null, whatsAppPhone: null },
  }
  return { resources, capabilities }
}

/**
 * Server boundary for one render: trusted scope → registered template → validated
 * composition → one batched resource load → declared-access filter → caps.
 * Request input is limited to catalog query state.
 */
export async function loadStorefront(
  deps: {
    resolveSite: TrustedSiteResolver
    loadResources: StorefrontResourceLoader
    registry: readonly RuntimeTemplateEntry[]
  },
  query: unknown = {},
): Promise<StorefrontLoad> {
  const parsedQuery = catalogQuerySchema.safeParse(query)
  const catalogQuery: CatalogQuery = parsedQuery.success ? parsedQuery.data : {}
  const site = await deps.resolveSite()
  if (!site) return { status: "refused", reason: "unavailable" }
  const { scope } = site
  const template = (
    site.composition as {
      template?: { key?: unknown; version?: unknown }
    } | null
  )?.template
  const entry =
    typeof template?.key === "string" && typeof template.version === "string"
      ? resolveTemplate(
          scope.mode,
          { key: template.key, version: template.version },
          deps.registry,
        )
      : null
  if (!entry) return { status: "refused", reason: "template-unavailable" }
  let composition: StorefrontComposition
  try {
    composition = validateComposition(site.composition, entry.manifest)
    assertCompositionSources(
      composition,
      (pin) =>
        resolveTemplate(scope.mode, pin, deps.registry)?.manifest ?? null,
    )
    validateDesignAssets(composition, entry.manifest)
  } catch (error) {
    return {
      status: "refused",
      reason: "invalid-composition",
      detail: error instanceof Error ? error.message : undefined,
    }
  }
  const loaded = restrictToDeclared(
    await deps.loadResources(scope, catalogQuery),
    declaredAccess(entry.manifest, composition),
  )
  const exceeded = checkResourceLimits(loaded.resources)
  if (exceeded)
    return { status: "refused", reason: "over-limit", detail: exceeded }
  const { items, highlightedItem } = loaded.resources.catalog
  const publicItems = [...items, ...(highlightedItem ? [highlightedItem] : [])]
  if (
    !publicItems.every(
      (item) => publicCatalogItemSchema.safeParse(item).success,
    )
  ) {
    return { status: "refused", reason: "invalid-resources" }
  }
  return {
    status: "ready",
    scope,
    manifest: entry.manifest,
    queryKey: storefrontQueryKey(scope, catalogQuery),
    cacheControl: scope.mode === "preview" ? "private, no-store" : "public",
    robots: scope.mode === "preview" ? "noindex" : "index",
    snapshot: {
      mode: scope.mode,
      locale: scope.locale,
      currencyCode: scope.currencyCode,
      composition,
      ...loaded,
    },
  }
}

/**
 * Server action entry: re-resolves trusted scope and current capabilities rather than
 * trusting client flags. Preview never reaches the live adapter.
 */
export async function handleStorefrontAction(
  deps: {
    resolveSite: TrustedSiteResolver
    loadResources: StorefrontResourceLoader
    live: StorefrontActionAdapter
    registry: readonly RuntimeTemplateEntry[]
  },
  input: StorefrontAction | unknown,
) {
  const load = await loadStorefront(deps)
  if (load.status !== "ready") {
    return {
      status: "unavailable" as const,
      message: "This is not available right now.",
    }
  }
  return runStorefrontAction(
    load.scope.mode,
    load.snapshot.capabilities,
    input,
    deps.live,
  )
}
