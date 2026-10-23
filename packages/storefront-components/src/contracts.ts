import {
  type StorefrontAction,
  storefrontActionSchema,
} from "@ewatrade/storefront-contracts/actions"
import {
  sectionDefinitionSchema,
  themeSchema,
} from "@ewatrade/storefront-contracts/manifest"
import {
  type PublicAsset,
  publicCatalogItemSchema,
  publicCatalogOptionSchema,
} from "@ewatrade/storefront-contracts/resources"
import { z } from "zod"

export const COMPONENT_SDK_VERSION = "1.0.0" as const
export const COMPONENT_LIMITS = Object.freeze({
  sourceBytes: 65_536,
  stylesheetBytes: 16_384,
  manifestBytes: 16_384,
  sourceNodes: 10_000,
  catalogItems: 50,
  assets: 32,
  actionIntents: 50,
  wallTimeMs: 20_000,
  memoryBytes: 536_870_912,
  outputBytes: 1_048_576,
  workspaceBytes: 32 * 1024 * 1024,
  inputBytes: 262_144,
})
export const COMPONENT_TOKENS = [
  "--sf-component-accent",
  "--sf-component-background",
  "--sf-component-font",
  "--sf-component-radius",
  "--sf-component-space-1",
  "--sf-component-space-2",
  "--sf-component-space-3",
  "--sf-component-space-4",
] as const
export const COMPONENT_DEPENDENCIES = Object.freeze({
  react: "19.1.0",
  "react-dom": "19.1.0",
  scheduler: "0.26.0",
  "@ewatrade/storefront-components": COMPONENT_SDK_VERSION,
})
export const COMPONENT_IMPORTS = [
  "react",
  "@ewatrade/storefront-components/sdk",
] as const
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)
const digest = z.string().regex(/^[a-f0-9]{64}$/)
const semver = z.string().regex(/^\d+\.\d+\.\d+$/)
const copy = z.string().max(4000)

/** A component owns one presentation section. Domain scope and arbitrary files are absent. */
export const componentManifestSchema = z
  .object({
    sdkVersion: z.literal(COMPONENT_SDK_VERSION),
    runtimeVersion: z.literal(1),
    key: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
    version: semver,
    name: z.string().trim().min(1).max(120),
    section: sectionDefinitionSchema.refine(
      (value) => value.allowedBlocks.length === 0,
      "Component blocks must be registered separately.",
    ),
    assetRefs: z.array(id).max(COMPONENT_LIMITS.assets),
    tokens: z.array(z.enum(COMPONENT_TOKENS)).max(COMPONENT_TOKENS.length),
  })
  .strict()
  .superRefine((value, context) => {
    for (const [name, entries] of [
      ["assetRefs", value.assetRefs],
      ["tokens", value.tokens],
      ["fields", value.section.fields.map((field) => field.key)],
    ] as const) {
      if (new Set(entries).size !== entries.length)
        context.addIssue({ code: "custom", message: `Duplicate ${name}.` })
    }
    if (value.section.key !== value.key)
      context.addIssue({
        code: "custom",
        message: "Section and component keys must match.",
      })
    for (const field of value.section.fields) {
      if (field.kind === "text" && field.default.length > field.maxLength)
        context.addIssue({
          code: "custom",
          message: "Text default exceeds the field limit.",
        })
      if (
        field.kind === "select" &&
        (!field.options.some((option) => option.value === field.default) ||
          new Set(field.options.map((option) => option.value)).size !==
            field.options.length)
      )
        context.addIssue({
          code: "custom",
          message: "Select defaults and option keys must be valid.",
        })
      if (
        field.kind === "asset" &&
        field.default !== null &&
        !value.assetRefs.includes(field.default)
      )
        context.addIssue({
          code: "custom",
          message: "Asset default is not declared.",
        })
    }
  })
export type ComponentManifest = z.infer<typeof componentManifestSchema>
export const componentSourceSchema = z
  .object({
    manifest: componentManifestSchema,
    source: z
      .string()
      .min(1)
      .refine(
        (value) =>
          new TextEncoder().encode(value).length <=
          COMPONENT_LIMITS.sourceBytes,
        "Component source exceeds its byte limit.",
      ),
    stylesheet: z
      .string()
      .refine(
        (value) =>
          new TextEncoder().encode(value).length <=
          COMPONENT_LIMITS.stylesheetBytes,
        "Component CSS exceeds its byte limit.",
      ),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      new TextEncoder().encode(JSON.stringify(value.manifest)).length >
      COMPONENT_LIMITS.manifestBytes
    )
      context.addIssue({
        code: "custom",
        message: "Component manifest exceeds its byte limit.",
      })
  })
export type ComponentSource = z.infer<typeof componentSourceSchema>

const boundedOptionSchema = publicCatalogOptionSchema.extend({
  id,
  name: z.string().max(240),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
})
const boundedItemSchema = publicCatalogItemSchema.extend({
  id,
  name: z.string().max(240),
  description: copy.nullable(),
  category: z
    .object({ id, name: z.string().max(240) })
    .strict()
    .nullable(),
  illustrationId: id,
  photoUrl: z.string().max(2048).optional(),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  options: z.array(boundedOptionSchema).max(20),
})
const approvedAssetSchema = z
  .object({ id, url: z.string().max(8192), alt: z.string().max(240) })
  .strict()
const dataSchema = z
  .object({
    business: z
      .object({ name: copy, slug: id, description: copy.nullable() })
      .strict()
      .optional(),
    catalog: z
      .array(boundedItemSchema)
      .max(COMPONENT_LIMITS.catalogItems)
      .optional(),
    services: z
      .array(boundedItemSchema)
      .max(COMPONENT_LIMITS.catalogItems)
      .optional(),
  })
  .strict()
export type ComponentData = z.infer<typeof dataSchema> & {
  assets: Readonly<Record<string, PublicAsset>>
}
export type Immutable<T> = T extends readonly (infer Item)[]
  ? readonly Immutable<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]: Immutable<T[Key]> }
    : T
export type ComponentSettings = Readonly<
  Record<string, string | boolean | null>
>
export type ComponentInput = {
  componentKey: string
  settings: ComponentSettings
  data: Immutable<ComponentData>
  theme: Readonly<z.infer<typeof themeSchema>>
  actions: readonly StorefrontAction[]
}
const projectedInputs = new WeakMap<object, string>()
/** Build fixtures must originate in this trusted projection, not a type assertion or JSON payload. */
export function assertComponentInputForManifest(
  value: ComponentInput,
  manifest: ComponentManifest,
) {
  if (projectedInputs.get(value) !== JSON.stringify(manifest))
    throw new Error("COMPONENT_TRUSTED_INPUT_REQUIRED")
}
function freeze<T>(value: T): Immutable<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value as Immutable<T>
}

/** Pure host projection: never accepts database rows, client-chosen scope or asset URLs. */
export function createComponentInput(input: {
  manifest: unknown
  settings: unknown
  data: unknown
  theme: unknown
  availableActions: unknown
  approvedAssets: ReadonlyMap<string, PublicAsset>
}): ComponentInput {
  const manifest = componentManifestSchema.parse(input.manifest)
  const settings = z
    .record(z.string(), z.union([z.string(), z.boolean(), z.null()]))
    .parse(input.settings)
  const fields = manifest.section.fields
  if (
    Object.keys(settings).some(
      (key) => !fields.some((field) => field.key === key),
    )
  )
    throw new Error("COMPONENT_UNKNOWN_SETTING")
  for (const field of fields) {
    const value = settings[field.key]
    const valid =
      field.kind === "text"
        ? typeof value === "string" &&
          value.length <= field.maxLength &&
          !/<\s*\/?\s*(script|iframe|object|embed|style)\b|javascript:|data:text\/html|\bon[a-z]+\s*=/i.test(
            value,
          )
        : field.kind === "boolean"
          ? typeof value === "boolean"
          : field.kind === "select"
            ? field.options.some((option) => option.value === value)
            : value === null ||
              (typeof value === "string" && manifest.assetRefs.includes(value))
    if (!valid) throw new Error("COMPONENT_INVALID_SETTING")
  }
  const data = dataSchema.parse(input.data)
  const declared = new Set(manifest.section.resources)
  const assets: Record<string, PublicAsset> = {}
  for (const ref of manifest.assetRefs) {
    const asset = input.approvedAssets.get(ref)
    if (!asset || asset.id !== ref)
      throw new Error("COMPONENT_UNAPPROVED_ASSET")
    assets[ref] = Object.freeze(approvedAssetSchema.parse(asset))
  }
  const capabilities = new Set(manifest.section.capabilities)
  const actionCapability = {
    openItem: "catalog",
    openConversation: "conversation",
    openServiceRequest: "serviceRequest",
    whatsappEnquiry: "whatsappEnquiry",
  } as const
  const actions = z
    .array(storefrontActionSchema)
    .max(COMPONENT_LIMITS.actionIntents)
    .parse(input.availableActions)
    .filter((action) => capabilities.has(actionCapability[action.type]))
  const result = Object.freeze({
    componentKey: manifest.key,
    settings: Object.freeze(settings),
    theme: Object.freeze(themeSchema.parse(input.theme)),
    actions: Object.freeze(actions.map((action) => Object.freeze(action))),
    data: freeze({
      ...(declared.has("business") && data.business
        ? { business: Object.freeze(data.business) }
        : {}),
      ...(declared.has("publicCatalog") ? { catalog: data.catalog ?? [] } : {}),
      ...(declared.has("publicServices")
        ? {
            services: (data.services ?? []).filter(
              (item) => item.kind === "SERVICE",
            ),
          }
        : {}),
      assets: Object.freeze(assets),
    }),
  })
  if (
    new TextEncoder().encode(JSON.stringify(result)).length >
    COMPONENT_LIMITS.inputBytes
  )
    throw new Error("COMPONENT_PUBLIC_INPUT_TOO_LARGE")
  projectedInputs.set(result, JSON.stringify(manifest))
  return result
}

/** Separate artifact contract; these records never masquerade as SiteDesignRun results. */
export const componentArtifactProvenanceSchema = z
  .object({
    kind: z.literal("storefront-component-artifact"),
    artifactId: id,
    sdkVersion: z.literal(COMPONENT_SDK_VERSION),
    componentKey: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
    componentVersion: semver,
    sourceRevision: z.string().regex(/^[a-f0-9]{40}$/),
    inputHash: digest,
    sourceHash: digest,
    stylesheetHash: digest,
    manifestHash: digest,
    dependencyLockHash: digest,
    sdkSourceHash: digest,
    buildRecipeHash: digest,
    compilerImage: z.string().regex(/^[a-z0-9./_-]+@sha256:[a-f0-9]{64}$/),
    compilerVersion: z.string().min(1).max(40),
    generation: z
      .object({
        provider: z.string().min(1).max(40),
        model: z.string().min(1).max(120),
        promptVersion: id,
        requestId: id,
        actualTokens: z.number().int().nonnegative().nullable(),
      })
      .strict()
      .nullable(),
    createdAt: z.string().datetime(),
  })
  .strict()
export type ComponentArtifactProvenance = z.infer<
  typeof componentArtifactProvenanceSchema
>
