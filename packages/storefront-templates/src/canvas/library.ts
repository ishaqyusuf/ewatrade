import {
  type SectionInstance,
  type StorefrontComposition,
  type TemplateManifest,
  defaultSettings,
  validateComposition,
} from "../../../storefront-contracts/src/manifest"
import {
  canvasEditableManifests,
  isCanvasManifest,
  portableFamily,
  portableSectionKind,
} from "./catalog"

export function isCanvasComposition(value: StorefrontComposition) {
  return isCanvasManifest(value.template)
}
export function canvasManifest(key: string) {
  const manifest = canvasEditableManifests.find((entry) => entry.key === key)
  if (!manifest) throw new Error("Canvas template unavailable.")
  return manifest
}
export function canvasDefaults(
  manifest: TemplateManifest,
): StorefrontComposition {
  return validateComposition(
    {
      schemaVersion: 1,
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
          const definition = manifest.sections.find(
            (section) => section.key === type,
          )
          if (!definition) throw new Error("Section definition unavailable.")
          return {
            id: `${page.key}-${type}`,
            type,
            version: definition.version,
            visible: true,
            settings: defaultSettings(definition.fields),
            blocks: [],
            ...(definition.source ? { source: definition.source } : {}),
          }
        }),
      })),
    },
    manifest,
  )
}
export type SectionExcerpt = ReturnType<typeof buildSectionLibrary>[number]
/** Catalog is derived from reviewed template blueprints, never a second hand-maintained list. */
export function buildSectionLibrary(
  manifests: readonly TemplateManifest[] = canvasEditableManifests,
) {
  const seen = new Set<string>()
  return manifests.flatMap((manifest) =>
    manifest.pages.flatMap((page) =>
      (page.defaultSections ?? page.allowedSections).flatMap((type) => {
        const definition = manifest.sections.find((entry) => entry.key === type)
        // Blueprints may reuse another template's sections; each lists only under its own source.
        if (
          !definition?.source ||
          definition.source.templateKey !== manifest.key ||
          definition.fixedFirst ||
          definition.fixedLast
        )
          return []
        const id = `${definition.source.templateKey}@${definition.source.templateVersion}:${type}@${definition.version}`
        const kind = portableSectionKind(type)
        if (!kind || seen.has(id)) return []
        seen.add(id)
        return [
          {
            id,
            definition,
            template: {
              key: manifest.key,
              version: manifest.version,
              name: manifest.name,
            },
            title: `${definition.label} • ${manifest.name}`,
            kind,
            family: portableFamily(manifest.key),
            pageKey: page.key,
          },
        ]
      }),
    ),
  )
}
export function insertSectionExcerpt(
  composition: StorefrontComposition,
  pageKey: string,
  excerpt: SectionExcerpt,
  id: string,
) {
  const next = structuredClone(composition)
  const page = next.pages.find((entry) => entry.key === pageKey)
  const manifest = canvasManifest(next.template.key)
  if (!page || page.sections.length >= 32)
    throw new Error("This page has reached its section limit.")
  const section: SectionInstance = {
    id,
    type: excerpt.definition.key,
    version: excerpt.definition.version,
    visible: true,
    settings: defaultSettings(excerpt.definition.fields),
    blocks: [],
    source: structuredClone(excerpt.definition.source),
  }
  const footer = page.sections.findIndex(
    (entry) => entry.type === "studio-footer",
  )
  if (footer < 0) throw new Error("This page needs its fixed footer.")
  page.sections.splice(footer, 0, section)
  return validateComposition(next, manifest)
}
/** Existing pins remain intact; upgrading makes an unsaved copy and never writes a Site. */
export function upgradeCanvasDraft(composition: StorefrontComposition) {
  if (isCanvasComposition(composition)) return composition
  const manifest = canvasManifest(composition.template.key)
  const next = canvasDefaults(manifest)
  next.theme = structuredClone(composition.theme)
  const old = composition.pages[0]?.sections ?? []
  const intro = old.find((section) => /header|intro/.test(section.type))
  const home = canvasPage(next, "home")
  const first = home.sections.find(
    (section) => portableSectionKind(section.type) === "intro",
  )
  if (intro && first) {
    for (const field of ["headline", "tagline", "cover"] as const) {
      const value =
        intro.settings[field] ??
        (field === "tagline" ? intro.settings.description : undefined)
      if (value !== undefined) first.settings[field] = value
    }
  }
  const collection = old.find((section) =>
    /catalog$|collection|offerings/.test(section.type),
  )
  const target = home.sections.find(
    (section) => portableSectionKind(section.type) === "collection",
  )
  if (collection && target)
    for (const field of ["heading", "show-categories", "request-heading"])
      if (collection.settings[field] !== undefined)
        target.settings[field] = collection.settings[field]
  const contact = old.find((section) => section.type === "contact")
  const contactTarget = home.sections.find(
    (section) => portableSectionKind(section.type) === "contact",
  )
  if (contact && contactTarget) contactTarget.visible = contact.visible
  return validateComposition(next, manifest)
}

export function canvasPage(composition: StorefrontComposition, key: string) {
  const page = composition.pages.find((entry) => entry.key === key)
  if (!page) throw new Error("Page unavailable.")
  return page
}
export function canvasSection(
  composition: StorefrontComposition,
  pageKey: string,
  id: string,
) {
  const section = canvasPage(composition, pageKey).sections.find(
    (entry) => entry.id === id,
  )
  if (!section) throw new Error("Section unavailable.")
  return section
}
