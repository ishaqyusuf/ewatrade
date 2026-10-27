import {
  type VersionAvailability,
  type VersionIntent,
  versionAvailable,
} from "../../storefront-contracts/src/availability"
import {
  STOREFRONT_RUNTIME_VERSION,
  STOREFRONT_SCHEMA_VERSION,
  type StorefrontComposition,
  type TemplateManifest,
  assertCompositionSources,
  defaultSettings,
  validateComposition,
} from "../../storefront-contracts/src/manifest"
import { canvasManifests } from "./canvas/manifests"
import {
  catalogV4LegacyManifest,
  catalogV4Manifest,
} from "./catalog-v4/manifest"
import {
  commerceStudioLegacyManifest,
  commerceStudioManifest,
} from "./commerce-studio/manifest"
import { componentEditorialManifest } from "./generated/manifest"
import { reviewedComponentRegistry } from "./generated/registry"
import { marketHallManifest } from "./market-hall/manifest"
import { retailEditorialManifest } from "./retail-editorial/manifest"
import { serviceDeskManifest } from "./service-desk/manifest"

/** Each status is separate: registered source is not qualification, and neither is a release. */
export type TemplateStatus = {
  registration: "source-only" | "runtime-registered"
  qualification: "not-qualified" | "qualified" | "needs-requalification"
  release: "not-live" | "live"
}
export type TemplateEntry = {
  manifest: TemplateManifest
  status: TemplateStatus
  source: string
  availability: VersionAvailability
  components?: readonly {
    key: string
    version: string
    availability: VersionAvailability
  }[]
}

const publicIntro = reviewedComponentRegistry.find(
  (entry) =>
    entry.manifest.key === "public-intro" && entry.manifest.version === "1.0.0",
)
if (!publicIntro)
  throw new Error("Missing exact reviewed public-intro component.")

export const templateRegistry: readonly TemplateEntry[] = [
  ...canvasManifests.map(
    (manifest): TemplateEntry => ({
      manifest,
      availability: { state: "active" },
      source: "packages/storefront-templates/src/canvas",
      ...(manifest.key === "component-editorial"
        ? {
            components: [
              {
                key: "public-intro",
                version: "1.0.0",
                availability: publicIntro.availability,
              },
            ],
          }
        : {}),
      status: {
        registration: "runtime-registered",
        qualification: "qualified",
        release: "not-live",
      },
    }),
  ),
  {
    manifest: marketHallManifest,
    availability: { state: "active" },
    source: "packages/storefront-templates/src/market-hall",
    // Workshop market-hall v4 rev 22301b16-713d-4035-b215-101d55037e6f. Local qualification only; no live-release claim.
    status: {
      registration: "runtime-registered",
      qualification: "qualified",
      release: "not-live",
    },
  },
  {
    manifest: commerceStudioManifest,
    availability: { state: "active" },
    source: "packages/storefront-templates/src/commerce-studio",
    // 1.1.0: Featured section v2 adds pinned products (IDs only). Local qualification only.
    status: {
      registration: "runtime-registered",
      qualification: "qualified",
      release: "not-live",
    },
  },
  {
    manifest: commerceStudioLegacyManifest,
    availability: { state: "active" },
    source: "packages/storefront-templates/src/commerce-studio",
    // Workshop commerce-studio v7 rev 5da7748c-cecd-49a0-90bb-222bed599859 (owner-requested
    // implementation, 27 Oct 2026). Local qualification only; no live-release claim.
    status: {
      registration: "runtime-registered",
      qualification: "qualified",
      release: "not-live",
    },
  },
  {
    manifest: componentEditorialManifest,
    components: [
      {
        key: "public-intro",
        version: "1.0.0",
        availability: publicIntro.availability,
      },
    ],
    availability: { state: "active" },
    source: "packages/storefront-templates/src/generated",
    status: {
      registration: "runtime-registered",
      qualification: "qualified",
      release: "not-live",
    },
  },
  ...[retailEditorialManifest, serviceDeskManifest].map(
    (manifest): TemplateEntry => ({
      manifest,
      availability: { state: "active" },
      source: `packages/storefront-templates/src/${manifest.key}`,
      status: {
        registration: "runtime-registered",
        qualification: "qualified",
        release: "not-live",
      },
    }),
  ),
  {
    manifest: catalogV4Manifest,
    availability: { state: "active" },
    source: "packages/storefront-templates/src/catalog-v4",
    // Used by the current page; default/settings SSR parity qualified locally. No live-release claim.
    status: {
      registration: "runtime-registered",
      qualification: "qualified",
      release: "not-live",
    },
  },
  {
    manifest: catalogV4LegacyManifest,
    availability: { state: "active" },
    source: "packages/storefront-templates/src/catalog-v4",
    status: {
      registration: "runtime-registered",
      qualification: "qualified",
      release: "not-live",
    },
  },
]

/** Exact design pins only. No latest-version substitution while reading a release. */
export function getTemplateManifest(
  input: unknown,
  intent: VersionIntent = "inspect",
): TemplateManifest {
  const template = (
    input as { template?: { key?: unknown; version?: unknown } } | null
  )?.template
  const entry = templateRegistry.find(
    ({ manifest }) =>
      manifest.key === template?.key && manifest.version === template?.version,
  )
  if (
    !entry ||
    !versionAvailable(entry, intent) ||
    (intent === "new-use" && !listSelectableTemplates().includes(entry))
  )
    throw new Error("This storefront design version isn't available.")
  if (input && typeof input === "object" && "pages" in input) {
    assertCompositionSources(input as StorefrontComposition, (pin) =>
      getTemplateManifest({ template: pin }, intent),
    )
  }
  return entry.manifest
}

/** Every selectable exact pin, ordered independently of registry insertion order. */
export function listSelectableTemplates(
  registry: readonly TemplateEntry[] = templateRegistry,
) {
  return registry
    .filter(
      (entry) =>
        entry.status.registration === "runtime-registered" &&
        entry.status.qualification === "qualified" &&
        entry.manifest.runtimeVersion === STOREFRONT_RUNTIME_VERSION &&
        versionAvailable(entry, "new-use"),
    )
    .sort((left, right) => {
      const key = left.manifest.key.localeCompare(right.manifest.key)
      if (key) return key
      const a = left.manifest.version.split(".").map(BigInt)
      const b = right.manifest.version.split(".").map(BigInt)
      for (let index = 0; index < 3; index++) {
        if (a[index] !== b[index])
          return (a[index] ?? BigInt(0)) > (b[index] ?? BigInt(0)) ? -1 : 1
      }
      return 0
    })
}

/** The theme a template accepts: optional controls it doesn't declare are dropped. */
export function themeForTemplate(
  theme: StorefrontComposition["theme"],
  manifest: TemplateManifest,
): StorefrontComposition["theme"] {
  const next = { ...theme }
  for (const control of ["width", "density"] as const)
    if (!manifest.themeControls?.includes(control)) delete next[control]
  return next
}

/** Explicit replacement affects only an unsaved draft and preserves its theme. */
export function replaceDraftTemplate(
  current: StorefrontComposition,
  target: { key: string; version: string },
) {
  const manifest = getTemplateManifest({ template: target }, "new-use")
  return validateComposition(
    {
      ...defaultComposition(manifest),
      theme: themeForTemplate(current.theme, manifest),
    },
    manifest,
  )
}

/** Named direct migration; no implicit upgrade or release mutation. */
export function migrateCatalogCoverDraft(current: StorefrontComposition) {
  if (
    current.template.key !== "catalog-v4" ||
    current.template.version !== "1.0.0"
  )
    throw new Error("Catalog cover migration requires catalog-v4@1.0.0.")
  validateComposition(current, getTemplateManifest(current))
  const manifest = getTemplateManifest(
    { template: { key: "catalog-v4", version: "1.1.0" } },
    "new-use",
  )
  const next = structuredClone(current)
  next.template.version = manifest.version
  for (const page of next.pages)
    for (const section of page.sections)
      if (section.type === "catalog-header") {
        section.version = 2
        section.settings.cover = null
      }
  return validateComposition(next, manifest)
}

/** Named direct migration to 1.1.0: copy kept, Featured gains an empty pin list. */
export function migrateCommerceStudioFeaturedDraft(
  current: StorefrontComposition,
) {
  if (
    current.template.key !== commerceStudioLegacyManifest.key ||
    current.template.version !== commerceStudioLegacyManifest.version
  )
    throw new Error(
      "Featured pinning migration requires commerce-studio@1.0.0.",
    )
  validateComposition(current, getTemplateManifest(current))
  const manifest = getTemplateManifest(
    {
      template: {
        key: commerceStudioManifest.key,
        version: commerceStudioManifest.version,
      },
    },
    "new-use",
  )
  const featured = manifest.sections.find(
    (section) => section.key === "commerce-studio-featured",
  )
  if (!featured?.source) throw new Error("Featured section unavailable.")
  const next = structuredClone(current)
  next.template.version = manifest.version
  for (const page of next.pages)
    for (const section of page.sections)
      if (section.type === featured.key) {
        section.version = featured.version
        section.source = structuredClone(featured.source)
        section.settings.pinned = []
      }
  return validateComposition(next, manifest)
}

/**
 * Item IDs a composition pins through manifest `catalog-items` fields, in page order.
 * Empty for templates that declare no such field, so their loads never change.
 */
export function pinnedCatalogItemIds(composition: StorefrontComposition) {
  let manifest: TemplateManifest
  try {
    manifest = getTemplateManifest(composition, "render")
  } catch {
    // The release load refuses unavailable pins itself; pinning never decides that.
    return []
  }
  const ids: string[] = []
  for (const page of composition.pages)
    for (const section of page.sections) {
      if (!section.visible) continue
      const definition = manifest.sections.find(
        (entry) => entry.key === section.type,
      )
      for (const field of definition?.fields ?? [])
        if (field.kind === "catalog-items") {
          const value = section.settings[field.key]
          if (Array.isArray(value)) ids.push(...value)
        }
    }
  return [...new Set(ids)]
}

type DraftUpgrade = {
  from: { key: string; version: string }
  to: string
  /** Plain-language change, shown next to the version in Studio. */
  summary: string
  migrate: (current: StorefrontComposition) => StorefrontComposition
}
/** Every named, explicit draft migration between versions of one template. */
export const draftUpgrades: readonly DraftUpgrade[] = [
  {
    from: { key: "catalog-v4", version: "1.0.0" },
    to: "1.1.0",
    summary: "Adds an optional cover illustration.",
    migrate: migrateCatalogCoverDraft,
  },
  {
    from: { key: "commerce-studio", version: "1.0.0" },
    to: "1.1.0",
    summary: "Adds pinned featured products.",
    migrate: migrateCommerceStudioFeaturedDraft,
  },
]

/** The newer version this draft can explicitly move to, when its target is selectable. */
export function availableDraftUpgrade(current: StorefrontComposition) {
  const upgrade = draftUpgrades.find(
    (entry) =>
      entry.from.key === current.template.key &&
      entry.from.version === current.template.version,
  )
  if (!upgrade) return null
  try {
    getTemplateManifest(
      { template: { key: upgrade.from.key, version: upgrade.to } },
      "new-use",
    )
  } catch {
    return null
  }
  return { version: upgrade.to, summary: upgrade.summary }
}

/** Draft-only: returns an unsaved copy; the caller saves it through the CAS draft command. */
export function upgradeDraftVersion(current: StorefrontComposition) {
  const upgrade = draftUpgrades.find(
    (entry) =>
      entry.from.key === current.template.key &&
      entry.from.version === current.template.version,
  )
  if (!upgrade || !availableDraftUpgrade(current))
    throw new Error("No newer version is available for this design.")
  return upgrade.migrate(current)
}

export function sectionPolicy(manifest: TemplateManifest, type: string) {
  const section = manifest.sections.find((entry) => entry.key === type)
  return {
    required:
      section?.required ||
      (manifest.key === "catalog-v4" &&
        (type === "catalog-header" || type === "catalog")),
    fixedFirst:
      section?.fixedFirst ||
      (manifest.key === "catalog-v4" && type === "catalog-header"),
    fixedLast: section?.fixedLast ?? false,
  }
}

export function defaultComposition(
  manifest: TemplateManifest,
): StorefrontComposition {
  return validateComposition(
    {
      schemaVersion: STOREFRONT_SCHEMA_VERSION,
      template: { key: manifest.key, version: manifest.version },
      theme: {
        font: "system",
        accent: "#171717",
        background: "#ffffff",
        radius: "small",
      },
      pages: manifest.pages.map((page) => ({
        key: page.key,
        sections: (page.defaultSections ?? page.allowedSections).map((type) => {
          const section = manifest.sections.find((entry) => entry.key === type)
          if (!section) throw new Error(`Unknown template section ${type}.`)
          return {
            id: `${page.key}-${type}`,
            type,
            version: section.version,
            visible: true,
            settings: defaultSettings(section.fields),
            blocks: [],
            ...(section.source ? { source: section.source } : {}),
          }
        }),
      })),
    },
    manifest,
  )
}

/** Sorted, timestamp-free so repeated runs produce identical output. */
export function templateInventory() {
  return [...templateRegistry]
    .sort(
      (a, b) =>
        a.manifest.key.localeCompare(b.manifest.key) ||
        a.manifest.version.localeCompare(b.manifest.version),
    )
    .map(({ manifest, status, source, availability, components }) => ({
      key: manifest.key,
      version: manifest.version,
      schemaVersion: manifest.schemaVersion,
      businessTypes: manifest.businessTypes,
      routes: manifest.pages.map((page) => page.path),
      sections: manifest.sections.map(
        (section) => `${section.key}@${section.version}`,
      ),
      source,
      availability,
      ...(components ? { components } : {}),
      ...status,
    }))
}
