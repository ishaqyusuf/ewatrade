import { z } from "zod"
import {
  type StorefrontComposition,
  type TemplateManifest,
  compositionSchema,
  themeSchema,
  validateComposition,
} from "./manifest"
import type { StorefrontCapabilities, StorefrontResources } from "./resources"

const factText = z.string().max(2000)
const sourceReference = z.string().min(1).max(200)
const operationalCopy =
  /(?:[₦$€£]\s*\d|\b(?:NGN|USD|EUR|GBP)\s*\d|\b\d[\d.,]*\s*(?:NGN|USD|EUR|GBP)\b|\b(?:in stock|out of stock|five[- ]star|\d(?:\.\d)?\s*stars?|rated\s+\d|book now|booking confirmed|instant checkout)\b)/i
export const storefrontDesignBriefSchema = z
  .object({
    version: z.literal(1),
    baseRevision: z.number().int().nonnegative(),
    desiredJourney: z.enum(["browse", "request"]),
    /** Merchant styling intent only; never a source of business facts or authority. */
    refinement: z.string().trim().max(500).default(""),
    business: z
      .object({
        name: z.string().min(1).max(240),
        description: factText.nullable(),
      })
      .strict(),
    catalog: z
      .array(
        z
          .object({
            id: z.string().max(128),
            name: z.string().max(240),
            kind: z.enum(["PRODUCT", "SERVICE"]),
            category: z.string().max(120).nullable(),
            optionCount: z.number().int().min(0).max(20),
          })
          .strict(),
      )
      .max(50),
    assets: z
      .array(
        z
          .object({ id: z.string().max(128), label: z.string().max(240) })
          .strict(),
      )
      .max(64),
    capabilities: z
      .object({
        catalog: z.boolean(),
        services: z.boolean(),
        conversation: z.boolean(),
        whatsappEnquiry: z.boolean(),
        serviceRequest: z.boolean(),
      })
      .strict(),
    theme: themeSchema,
    sources: z
      .array(z.object({ reference: sourceReference, text: factText }).strict())
      .max(102),
  })
  .strict()
export type StorefrontDesignBrief = z.infer<typeof storefrontDesignBriefSchema>

/** Explicit public-facts projection. No prices, stock, contacts, tokens or internal scope. */
export function createStorefrontDesignBrief(input: {
  resources: StorefrontResources
  capabilities: StorefrontCapabilities
  composition: StorefrontComposition
  baseRevision: number
  desiredJourney: "browse" | "request"
  refinement?: string
}): StorefrontDesignBrief {
  const { business, catalog, assets } = input.resources
  const sources = [{ reference: "business.name", text: business.name }]
  if (business.description)
    sources.push({
      reference: "business.description",
      text: business.description,
    })
  for (const item of catalog.items)
    sources.push({ reference: `catalog.${item.id}.name`, text: item.name })
  for (const category of catalog.categories)
    sources.push({
      reference: `category.${category.id}.name`,
      text: category.name,
    })
  return storefrontDesignBriefSchema.parse({
    version: 1,
    baseRevision: input.baseRevision,
    desiredJourney: input.desiredJourney,
    refinement: input.refinement ?? "",
    business: { name: business.name, description: business.description },
    catalog: catalog.items.map((item) => ({
      id: item.id,
      name: item.name,
      kind: item.kind,
      category: item.category?.name ?? null,
      optionCount: item.options.length,
    })),
    assets: Object.values(assets).map((asset) => ({
      id: asset.id,
      label: asset.alt,
    })),
    capabilities: Object.fromEntries(
      Object.entries(input.capabilities).map(([key, value]) => [
        key,
        value.available,
      ]),
    ),
    theme: input.composition.theme,
    sources,
  })
}

export const designRationale = {
  "brand-led": "Gives the business introduction more space.",
  "collection-first": "Brings the collection into view sooner.",
  "request-led": "Leads with available services and their request options.",
  "compact-intro": "Uses a shorter introduction before the catalog.",
  "illustration-led":
    "Uses a bundled illustration to establish the page rhythm.",
} as const
export const missingDesignAssets = {
  "business-photography-unavailable":
    "Business photography is not available to this design run.",
  "using-bundled-illustrations":
    "Uses the available bundled decorative illustrations.",
} as const

export const storefrontDesignOutputSchema = z
  .object({
    baseRevision: z.number().int().nonnegative(),
    directions: z
      .array(
        z
          .object({
            id: z.enum(["01", "02", "03"]),
            rationale: z
              .array(
                z.enum([
                  "brand-led",
                  "collection-first",
                  "request-led",
                  "compact-intro",
                  "illustration-led",
                ]),
              )
              .min(1)
              .max(3),
            missingAssets: z
              .array(
                z.enum([
                  "business-photography-unavailable",
                  "using-bundled-illustrations",
                ]),
              )
              .max(2),
            sourceReferences: z.array(sourceReference).max(102),
            composition: compositionSchema,
          })
          .strict(),
      )
      .length(3),
  })
  .strict()
export type StorefrontDesignOutput = z.infer<
  typeof storefrontDesignOutputSchema
>

/** Human-readable, exact composition differences; never compares copied operational facts. */
export function storefrontDesignChanges(
  before: StorefrontComposition,
  after: StorefrontComposition,
  manifests: readonly TemplateManifest[],
) {
  const oldManifest = manifests.find(
    (entry) =>
      entry.key === before.template.key &&
      entry.version === before.template.version,
  )
  const manifest = manifests.find(
    (entry) =>
      entry.key === after.template.key &&
      entry.version === after.template.version,
  )
  if (!oldManifest || !manifest)
    throw new Error("An unavailable design version was proposed.")
  const changes: Array<{ label: string; before: string; after: string }> = []
  const add = (label: string, old: string, next: string) => {
    if (old !== next) changes.push({ label, before: old, after: next })
  }
  const display = (value: unknown) =>
    value === null
      ? "None"
      : value === undefined
        ? "Not included"
        : value === ""
          ? "Business profile or template default"
          : value === true
            ? "On"
            : value === false
              ? "Off"
              : String(value)
  add(
    "Template",
    `${oldManifest.name} ${oldManifest.version}`,
    `${manifest.name} ${manifest.version}`,
  )
  for (const key of ["font", "accent", "background", "radius"] as const)
    add(
      key === "font"
        ? "Font"
        : key === "radius"
          ? "Corners"
          : key === "accent"
            ? "Accent"
            : "Background",
      before.theme[key],
      after.theme[key],
    )
  const oldSections = before.pages.flatMap((page) => page.sections)
  const sections = after.pages.flatMap((page) => page.sections)
  const order = (list: typeof sections, source: TemplateManifest) =>
    list
      .filter((entry) => entry.visible)
      .map(
        (entry) =>
          source.sections.find((definition) => definition.key === entry.type)
            ?.label ?? entry.type,
      )
      .join(" → ") || "None"
  add(
    "Visible section order",
    order(oldSections, oldManifest),
    order(sections, manifest),
  )
  for (const section of sections) {
    const previous = oldSections.find((entry) => entry.type === section.type)
    const definition = manifest.sections.find(
      (entry) => entry.key === section.type,
    )
    add(
      definition?.label ?? section.type,
      previous ? (previous.visible ? "Shown" : "Hidden") : "Not included",
      section.visible ? "Shown" : "Hidden",
    )
    for (const field of definition?.fields ?? [])
      add(
        `${definition?.label ?? section.type} · ${field.label}`,
        display(previous?.settings[field.key]),
        display(section.settings[field.key]),
      )
  }
  for (const section of oldSections.filter(
    (entry) => !sections.some((next) => next.type === entry.type),
  ))
    add(
      oldManifest.sections.find((entry) => entry.key === section.type)?.label ??
        section.type,
      section.visible ? "Shown" : "Hidden",
      "Not included",
    )
  return changes
}

/** Bounded structural distinction: palette changes and footer-only changes do not qualify. */
export function storefrontDesignSignature(
  composition: StorefrontComposition,
  manifest: TemplateManifest,
) {
  return JSON.stringify([
    composition.template.key,
    composition.pages.map((page) =>
      page.sections
        .filter((section) => section.visible && section.type !== "contact")
        .map((section) => [
          section.type,
          ...(manifest.sections
            .find((entry) => entry.key === section.type)
            ?.fields.filter((field) => field.kind === "asset")
            .map((field) => section.settings[field.key] !== null) ?? []),
        ]),
    ),
  ])
}

/** Model data never publishes. Rejects new facts, raw assets, unknown versions and shallow recolors. */
export function validateStorefrontDesignOutput(
  input: unknown,
  brief: StorefrontDesignBrief,
  manifests: readonly TemplateManifest[],
) {
  const output = storefrontDesignOutputSchema.parse(input)
  if (output.baseRevision !== brief.baseRevision)
    throw new Error("The design brief revision changed.")
  if (new Set(output.directions.map((entry) => entry.id)).size !== 3)
    throw new Error("Three unique directions are required.")
  const sources = new Map(
    brief.sources.map((source) => [source.reference, source.text]),
  )
  const assets = new Set(brief.assets.map((asset) => asset.id))
  const signatures = new Set<string>()
  for (const direction of output.directions) {
    if (direction.sourceReferences.some((reference) => !sources.has(reference)))
      throw new Error("Unknown public source reference.")
    const manifest = manifests.find(
      (manifest) =>
        manifest.key === direction.composition.template.key &&
        manifest.version === direction.composition.template.version,
    )
    if (!manifest)
      throw new Error("An unavailable design version was proposed.")
    const composition = validateComposition(direction.composition, manifest)
    for (const page of composition.pages)
      for (const section of page.sections) {
        const settings = [
          {
            values: section.settings,
            fields:
              manifest.sections.find((entry) => entry.key === section.type)
                ?.fields ?? [],
          },
          ...section.blocks.map((block) => ({
            values: block.settings,
            fields:
              manifest.blocks.find((entry) => entry.key === block.type)
                ?.fields ?? [],
          })),
        ]
        for (const { values, fields } of settings)
          for (const field of fields) {
            const value = values[field.key]
            if (
              field.kind === "asset" &&
              value !== null &&
              !assets.has(String(value))
            )
              throw new Error("An unavailable image was proposed.")
            if (
              field.kind !== "text" ||
              value === field.default ||
              value === ""
            )
              continue
            if (typeof value === "string" && operationalCopy.test(value))
              throw new Error(
                "Prices, stock, ratings and unsupported actions cannot be saved as generated design copy.",
              )
            if (
              !direction.sourceReferences.some(
                (reference) => sources.get(reference) === value,
              )
            )
              throw new Error(
                "Design copy must cite an exact approved public fact.",
              )
          }
      }
    signatures.add(storefrontDesignSignature(composition, manifest))
  }
  if (signatures.size !== 3)
    throw new Error("The proposals must differ in layout, not just color.")
  return output
}
