import {
  type StorefrontContentBrief,
  type StorefrontContentContext,
  type StorefrontContentField,
  type StorefrontContentGuidance,
  type StorefrontContentProfile,
  storefrontContentBriefSchema,
  storefrontContentContextSources,
} from "@ewatrade/storefront-contracts/content"
import type {
  EditableField,
  StorefrontComposition,
  TemplateManifest,
} from "@ewatrade/storefront-contracts/manifest"
import { templateRegistry } from "./registry"

/** Writing policy is separately versioned; existing immutable render manifests stay intact. */
const templateWriting: Record<
  string,
  {
    description: string
    voice: string
    intro: [number, number]
    story: [number, number]
    heading: [number, number]
  }
> = {
  "catalog-v4": {
    description:
      "Introduce a mixed catalog clearly. Let the catalog supply product and service facts; keep labels concise.",
    voice:
      "Clear, practical and easy to scan. Lead with what the business offers.",
    intro: [18, 36],
    story: [30, 55],
    heading: [2, 5],
  },
  "retail-editorial": {
    description:
      "A quiet, brand-led story. Short headlines sit beside imagery; supporting copy adds concrete detail.",
    voice:
      "Warm, considered and specific. Describe supplied materials and making without unsupported claims.",
    intro: [16, 28],
    story: [35, 55],
    heading: [3, 6],
  },
  "service-desk": {
    description:
      "Help customers understand the listed work and the existing request action without promising a price or turnaround.",
    voice:
      "Direct, reassuring and useful. Explain services in ordinary language.",
    intro: [20, 38],
    story: [30, 50],
    heading: [2, 6],
  },
  "component-editorial": {
    description:
      "Compose a focused collection story with reusable sections. Each section keeps its source writing guidance.",
    voice:
      "Specific, calm and welcoming. Prefer concrete business facts to slogans.",
    intro: [16, 30],
    story: [35, 55],
    heading: [3, 6],
  },
  "market-hall": {
    description:
      "Introduce the current collection and its featured products. Keep copy compact beside the price board.",
    voice:
      "Lively, concise and grounded in the actual collection. Leave prices and stock to the catalog.",
    intro: [16, 30],
    story: [30, 50],
    heading: [2, 5],
  },
  "service-concierge": {
    description:
      "Guide visitors from a clear service introduction to an informed enquiry. Use only supplied service details.",
    voice:
      "Thoughtful, approachable and precise. Reassure through clarity, without invented guarantees.",
    intro: [22, 38],
    story: [35, 60],
    heading: [3, 7],
  },
  "commerce-studio": {
    description:
      "Write a compact introduction, collection headings and business story around the existing shop and services.",
    voice:
      "Warm, confident and plain-spoken. Keep merchandising copy specific and let commerce controls explain actions.",
    intro: [18, 32],
    story: [35, 60],
    heading: [2, 6],
  },
}

function guidance(
  manifest: TemplateManifest,
  sectionType: string,
  sectionLabel: string,
  field: Extract<EditableField, { kind: "text" }>,
  blockType: string | null,
): StorefrontContentGuidance {
  const writing = templateWriting[manifest.key]
  if (!writing) throw new Error("This template has no writing profile.")
  const name = `${sectionType} ${sectionLabel}`.toLowerCase()
  const key = field.key.toLowerCase()
  const manual =
    /^(?:quote|name|author|customer|question|answer|price|stock|phone|email|address|hours|contact|link|cta|button|duration|turnaround)(?:-|$)/.test(
      key,
    ) ||
    (/(?:testimonial|review|quote)/.test(name) && key !== "heading") ||
    (/(?:contact|details)/.test(name) && !/heading|headline|title/.test(key))
  const story =
    /story|about/.test(name) && /tagline|body|description|text/.test(key)
  const intro = /tagline|lede|description|body|text/.test(key)
  const short = /phrase|prefix|eyebrow|kicker/.test(key)
  const range: readonly [number, number] = short
    ? [2, 5]
    : story
      ? writing.story
      : intro
        ? writing.intro
        : /headline|title/.test(key)
          ? [3, 7]
          : writing.heading
  const purpose = manual
    ? "Keep this merchant-provided fact, customer statement or existing action under direct manual control. AI does not generate it."
    : story
      ? "Tell the business story using its supplied description and offerings. Leave missing history, team size and claims out."
      : intro
        ? `Explain what customers can find in ${sectionLabel.toLowerCase()}, using the business description and actual offerings.`
        : short
          ? "A brief lead-in or rotating phrase. Preserve the meaning and grammar of the surrounding text."
          : `Introduce ${sectionLabel.toLowerCase()} clearly in the source template's voice. Avoid unsupported claims.`
  return {
    sectionType,
    blockType,
    key: field.key,
    label: field.label,
    purpose,
    minWords: range[0],
    maxWords: range[1],
    maxLength: field.maxLength,
    generation: manual ? "manual" : "draft",
  }
}

export function getStorefrontContentProfile(
  manifest: TemplateManifest,
): StorefrontContentProfile | null {
  const writing = templateWriting[manifest.key]
  if (!writing) return null
  return {
    template: { key: manifest.key, version: manifest.version },
    version: 1,
    name: manifest.name,
    description: writing.description,
    voice: writing.voice,
    areas: manifest.sections.flatMap((section) => [
      ...section.fields
        .filter(
          (field): field is Extract<EditableField, { kind: "text" }> =>
            field.kind === "text",
        )
        .map((field) =>
          guidance(manifest, section.key, section.label, field, null),
        ),
      ...manifest.blocks
        .filter((block) => section.allowedBlocks.includes(block.key))
        .flatMap((block) =>
          block.fields
            .filter(
              (field): field is Extract<EditableField, { kind: "text" }> =>
                field.kind === "text",
            )
            .map((field) =>
              guidance(
                manifest,
                section.key,
                `${section.label} ${block.label}`,
                field,
                block.key,
              ),
            ),
        ),
    ]),
  }
}

const manifestsDefault = () => templateRegistry.map((entry) => entry.manifest)
export function storefrontContentFields(
  composition: StorefrontComposition,
  pageKey: string,
  manifests: readonly TemplateManifest[] = manifestsDefault(),
): StorefrontContentField[] {
  const page = composition.pages.find((entry) => entry.key === pageKey)
  if (!page) throw new Error("That storefront page is unavailable.")
  const destination = manifests.find(
    (manifest) =>
      manifest.key === composition.template.key &&
      manifest.version === composition.template.version,
  )
  if (!destination) throw new Error("That template version is unavailable.")
  return page.sections
    .filter((section) => section.visible)
    .flatMap((section) => {
      const pin = section.source
        ? {
            key: section.source.templateKey,
            version: section.source.templateVersion,
          }
        : composition.template
      const source = manifests.find(
        (manifest) =>
          manifest.key === pin.key && manifest.version === pin.version,
      )
      const profile = source ? getStorefrontContentProfile(source) : null
      if (!source || !profile) return []
      const definition = destination.sections.find(
        (entry) =>
          entry.key === section.type && entry.version === section.version,
      )
      if (!definition) return []
      const areas = profile.areas.filter(
        (area) =>
          area.sectionType === (section.source?.sectionKey ?? section.type) &&
          area.generation === "draft",
      )
      const rows = (
        blockId: string | null,
        blockType: string | null,
        settings: typeof section.settings,
        fields: readonly EditableField[],
      ) =>
        areas
          .filter((area) => area.blockType === blockType)
          .flatMap((area) => {
            const declared = fields.find(
              (field) => field.key === area.key && field.kind === "text",
            )
            const current = settings[area.key]
            if (
              !declared ||
              declared.kind !== "text" ||
              typeof current !== "string" ||
              declared.maxLength !== area.maxLength
            )
              return []
            return [
              {
                id: `${page.key}:${section.id}:${blockId ?? "section"}:${area.key}`,
                pageKey: page.key,
                sectionId: section.id,
                blockId,
                key: area.key,
                label: area.label,
                sectionLabel: definition.label,
                current,
                defaultValue: declared.default,
                profile: { ...pin },
                purpose: area.purpose,
                minWords: area.minWords,
                maxWords: area.maxWords,
                maxLength: area.maxLength,
              },
            ]
          })
      return [
        ...rows(null, null, section.settings, definition.fields),
        ...section.blocks.flatMap((block) => {
          const declared = destination.blocks.find(
            (entry) =>
              entry.key === block.type && entry.version === block.version,
          )
          return declared
            ? rows(block.id, block.type, block.settings, declared.fields)
            : []
        }),
      ]
    })
}

export function createStorefrontContentBrief(input: {
  composition: StorefrontComposition
  pageKey: string
  fieldIds: readonly string[]
  context: StorefrontContentContext
  contextOrigin: "business" | "merchant-draft"
  baseRevision: number
  instructions: string
  previous?: StorefrontContentBrief["previous"]
  manifests?: readonly TemplateManifest[]
}): StorefrontContentBrief {
  const manifests = input.manifests ?? manifestsDefault()
  if (new Set(input.fieldIds).size !== input.fieldIds.length)
    throw new Error("Choose each content area only once.")
  const available = storefrontContentFields(
    input.composition,
    input.pageKey,
    manifests,
  )
  const fields = input.fieldIds.map((id) => {
    const field = available.find((entry) => entry.id === id)
    if (!field)
      throw new Error("A selected content area is no longer available.")
    return field
  })
  const previous = input.previous ?? []
  if (
    new Set(previous.map((draft) => draft.id)).size !== previous.length ||
    previous.some((draft) => !input.fieldIds.includes(draft.id))
  )
    throw new Error("Previous content must belong to the selected areas.")
  const used = new Set(
    fields.map((field) => `${field.profile.key}@${field.profile.version}`),
  )
  const profiles = manifests
    .filter((manifest) => used.has(`${manifest.key}@${manifest.version}`))
    .flatMap((manifest) => {
      const profile = getStorefrontContentProfile(manifest)
      if (!profile) return []
      const { areas: _, ...summary } = profile
      return [summary]
    })
  return storefrontContentBriefSchema.parse({
    version: 1,
    baseRevision: input.baseRevision,
    composition: input.composition,
    pageKey: input.pageKey,
    context: input.context,
    contextOrigin: input.contextOrigin,
    sources: storefrontContentContextSources(input.context),
    profiles,
    fields,
    instructions: input.instructions,
    previous,
  })
}

/** Refuse queued work when its exact writing policies or field provenance changed. */
export function assertStorefrontContentBrief(
  brief: StorefrontContentBrief,
  manifests: readonly TemplateManifest[],
) {
  const current = createStorefrontContentBrief({
    ...brief,
    fieldIds: brief.fields.map((field) => field.id),
    manifests,
  })
  if (JSON.stringify(current) !== JSON.stringify(brief))
    throw new Error("The content guidance changed. Generate a fresh draft.")
}
