import { z } from "zod"

export const STOREFRONT_SCHEMA_VERSION = 1
export const STOREFRONT_RUNTIME_VERSION = 1
export const storefrontRoutes = [
  "/",
  "/about",
  "/contact",
  "/services",
] as const
export const storefrontCapabilitySchema = z.enum([
  "catalog",
  "services",
  "conversation",
  "whatsappEnquiry",
  "serviceRequest",
])
export type StorefrontCapability = z.infer<typeof storefrontCapabilitySchema>

const key = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/)
const version = z.number().int().positive()
const label = z.string().trim().min(1).max(120)
const reference = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)
const executable =
  /<\s*\/?\s*(script|iframe|object|embed|style)\b|javascript:|data:text\/html|\bon[a-z]+\s*=/i
/** Editable copy is plain text; markup and script-like content is refused at write time. */
const text = z
  .string()
  .max(4000)
  .refine(
    (value) => !executable.test(value),
    "Executable content is not allowed.",
  )

export const editableFieldSchema = z.discriminatedUnion("kind", [
  z
    .object({
      key,
      label,
      kind: z.literal("text"),
      maxLength: z.number().int().min(1).max(4000),
      default: text,
    })
    .strict(),
  z
    .object({ key, label, kind: z.literal("boolean"), default: z.boolean() })
    .strict(),
  z
    .object({
      key,
      label,
      kind: z.literal("select"),
      options: z
        .array(z.object({ value: key, label }).strict())
        .min(1)
        .max(20),
      default: key,
    })
    .strict(),
  z
    .object({
      key,
      label,
      kind: z.literal("asset"),
      default: reference.nullable(),
    })
    .strict(),
])
export type EditableField = z.infer<typeof editableFieldSchema>

const fields = z.array(editableFieldSchema).max(30)
const baseDefinition = {
  key,
  version,
  label,
  fields,
}
export const sectionSourceSchema = z
  .object({
    templateKey: key,
    templateVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    sectionKey: key,
    sectionVersion: version,
  })
  .strict()
export const blockDefinitionSchema = z.object(baseDefinition).strict()
export const sectionDefinitionSchema = z
  .object({
    ...baseDefinition,
    required: z.boolean().optional(),
    fixedFirst: z.boolean().optional(),
    fixedLast: z.boolean().optional(),
    source: sectionSourceSchema.optional(),
    allowedBlocks: z.array(key).max(20),
    resources: z
      .array(z.enum(["business", "publicCatalog", "publicServices"]))
      .max(3),
    capabilities: z.array(storefrontCapabilitySchema).max(5),
  })
  .strict()

export const templateManifestSchema = z
  .object({
    schemaVersion: z.literal(STOREFRONT_SCHEMA_VERSION),
    runtimeVersion: z.literal(STOREFRONT_RUNTIME_VERSION),
    key,
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    name: label,
    description: z.string().min(1).max(500),
    businessTypes: z.array(key).min(1).max(20),
    pages: z
      .array(
        z
          .object({
            key,
            path: z.enum(storefrontRoutes),
            label,
            allowedSections: z.array(key).min(1).max(32),
            defaultSections: z.array(key).min(1).max(32).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(4),
    sections: z.array(sectionDefinitionSchema).min(1).max(32),
    blocks: z.array(blockDefinitionSchema).max(32),
  })
  .strict()
export type TemplateManifest = z.infer<typeof templateManifestSchema>
export type SectionDefinition = z.infer<typeof sectionDefinitionSchema>

export const themeSchema = z
  .object({
    font: z.enum(["system", "serif"]).default("system"),
    accent: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default("#171717"),
    background: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default("#ffffff"),
    radius: z.enum(["none", "small", "rounded"]).default("small"),
  })
  .strict()
const settings = z.record(key, z.union([text, z.boolean(), z.null()]))
const blockInstanceSchema = z
  .object({
    id: reference,
    type: key,
    version,
    settings,
  })
  .strict()
export const sectionInstanceSchema = z
  .object({
    id: reference,
    type: key,
    version,
    visible: z.boolean(),
    settings,
    blocks: z.array(blockInstanceSchema).max(50),
    source: sectionSourceSchema.optional(),
    binding: z
      .object({
        resource: z.enum(["business", "publicCatalog", "publicServices"]),
        selection: z.enum(["all", "featured"]).default("all"),
      })
      .strict()
      .optional(),
  })
  .strict()

export const compositionSchema = z
  .object({
    schemaVersion: z.literal(STOREFRONT_SCHEMA_VERSION),
    template: z
      .object({ key, version: z.string().regex(/^\d+\.\d+\.\d+$/) })
      .strict(),
    theme: themeSchema,
    pages: z
      .array(
        z
          .object({
            key,
            sections: z.array(sectionInstanceSchema).max(32),
          })
          .strict(),
      )
      .min(1)
      .max(4),
  })
  .strict()
export type StorefrontComposition = z.infer<typeof compositionSchema>
export type SectionInstance = z.infer<typeof sectionInstanceSchema>

function unique(values: string[], label: string) {
  if (new Set(values).size !== values.length)
    throw new Error(`Duplicate ${label}.`)
}

export function defineTemplate(input: unknown): TemplateManifest {
  const manifest = templateManifestSchema.parse(input)
  unique(
    manifest.pages.map((page) => page.key),
    "page key",
  )
  unique(
    manifest.pages.map((page) => page.path),
    "page path",
  )
  unique(
    manifest.sections.map((section) => section.key),
    "section key",
  )
  unique(
    manifest.blocks.map((block) => block.key),
    "block key",
  )
  if (!manifest.pages.some((page) => page.path === "/")) {
    throw new Error("A template must declare its home page.")
  }
  for (const page of manifest.pages) {
    unique(page.allowedSections, "allowed section")
    for (const type of page.allowedSections) {
      if (!manifest.sections.some((section) => section.key === type)) {
        throw new Error(`Unknown section ${type}.`)
      }
    }
    if (page.defaultSections) {
      unique(page.defaultSections, "default section")
      if (
        page.defaultSections.some(
          (type) => !page.allowedSections.includes(type),
        )
      )
        throw new Error("A default section must be allowed on its page.")
    }
  }
  for (const definition of [...manifest.sections, ...manifest.blocks]) {
    unique(
      definition.fields.map((field) => field.key),
      "field key",
    )
    for (const field of definition.fields) {
      if (field.kind === "text" && field.default.length > field.maxLength) {
        throw new Error(`Invalid default for ${field.key}.`)
      }
      if (field.kind === "select") {
        unique(
          field.options.map((option) => option.value),
          "select option",
        )
        if (!field.options.some((option) => option.value === field.default)) {
          throw new Error(`Invalid default for ${field.key}.`)
        }
      }
    }
  }
  for (const section of manifest.sections) {
    if (
      section.source &&
      (section.source.sectionKey !== section.key ||
        section.source.sectionVersion !== section.version)
    )
      throw new Error(
        "Section source must match its declared type and version.",
      )
    for (const type of section.allowedBlocks) {
      if (!manifest.blocks.some((block) => block.key === type)) {
        throw new Error(`Unknown block ${type}.`)
      }
    }
  }
  return manifest
}

function validateSettings(
  values: Record<string, string | boolean | null>,
  definitions: EditableField[],
) {
  for (const fieldKey of Object.keys(values)) {
    if (!definitions.some((field) => field.key === fieldKey)) {
      throw new Error(`Unknown editable field ${fieldKey}.`)
    }
  }
  for (const field of definitions) {
    const value = values[field.key]
    const valid =
      field.kind === "text"
        ? typeof value === "string" &&
          value.length <= field.maxLength &&
          !executable.test(value)
        : field.kind === "boolean"
          ? typeof value === "boolean"
          : field.kind === "asset"
            ? value === null || reference.safeParse(value).success
            : field.options.some((option) => option.value === value)
    if (!valid) throw new Error(`Invalid value for ${field.key}.`)
  }
}

/** Used at every draft/proposal write; settings are data, never executable code. */
export function validateComposition(
  input: unknown,
  manifest: TemplateManifest,
): StorefrontComposition {
  const value = compositionSchema.parse(input)
  if (
    value.template.key !== manifest.key ||
    value.template.version !== manifest.version
  ) {
    throw new Error("Template version is unavailable.")
  }
  unique(
    value.pages.map((page) => page.key),
    "composition page",
  )
  if (value.pages.length !== manifest.pages.length)
    throw new Error("Missing template page.")
  const instanceIds: string[] = []
  for (const page of value.pages) {
    const pageDefinition = manifest.pages.find(
      (entry) => entry.key === page.key,
    )
    if (!pageDefinition) throw new Error(`Unsupported page ${page.key}.`)
    for (const definition of manifest.sections.filter((entry) =>
      pageDefinition.allowedSections.includes(entry.key),
    )) {
      const matches = page.sections.filter(
        (entry) => entry.type === definition.key,
      )
      if (definition.required && (matches.length !== 1 || !matches[0]?.visible))
        throw new Error(`${definition.label} must remain visible.`)
      if (definition.fixedFirst && page.sections[0]?.type !== definition.key)
        throw new Error(`${definition.label} must stay first.`)
      if (definition.fixedLast && page.sections.at(-1)?.type !== definition.key)
        throw new Error(`${definition.label} must stay last.`)
    }
    for (const section of page.sections) {
      instanceIds.push(section.id)
      const definition = manifest.sections.find(
        (entry) => entry.key === section.type,
      )
      if (
        !definition ||
        !pageDefinition.allowedSections.includes(section.type) ||
        definition.version !== section.version
      ) {
        throw new Error(`Unsupported section ${section.type}.`)
      }
      if (JSON.stringify(section.source) !== JSON.stringify(definition.source))
        throw new Error("Section source must match its reviewed template pin.")
      validateSettings(section.settings, definition.fields)
      if (
        section.binding &&
        !definition.resources.includes(section.binding.resource)
      ) {
        throw new Error("Resource binding is not allowed for this section.")
      }
      for (const block of section.blocks) {
        instanceIds.push(block.id)
        const blockDefinition = manifest.blocks.find(
          (entry) => entry.key === block.type,
        )
        if (
          !blockDefinition ||
          !definition.allowedBlocks.includes(block.type) ||
          blockDefinition.version !== block.version
        ) {
          throw new Error(`Unsupported block ${block.type}.`)
        }
        validateSettings(block.settings, blockDefinition.fields)
      }
    }
  }
  unique(instanceIds, "composition instance ID")
  return value
}

/** Host supplies its exact registry policy; portable copy cannot choose authority. */
export function assertCompositionSources(
  composition: StorefrontComposition,
  resolve: (pin: { key: string; version: string }) => TemplateManifest | null,
) {
  for (const page of composition.pages)
    for (const section of page.sections) {
      if (!section.source) continue
      const source = section.source
      const manifest = resolve({
        key: source.templateKey,
        version: source.templateVersion,
      })
      const definition = manifest?.sections.find(
        (entry) => entry.key === source.sectionKey,
      )
      if (
        !definition ||
        source.sectionKey !== section.type ||
        definition.version !== source.sectionVersion ||
        definition.version !== section.version
      )
        throw new Error(
          "This section's source template version is unavailable.",
        )
    }
}

export function defaultSettings(definitions: EditableField[]) {
  return Object.fromEntries(
    definitions.map((field) => [field.key, field.default]),
  )
}
