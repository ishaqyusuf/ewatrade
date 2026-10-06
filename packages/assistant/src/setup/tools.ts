import { catalogCategoryEmoji } from "@ewatrade/utils/catalog-category-emojis"
import { getCatalogCategoryPresets } from "@ewatrade/utils/catalog-category-presets"
import { listCatalogSetupHelpers } from "@ewatrade/utils/catalog-setup-helpers"
import { tool } from "ai"
import { z } from "zod"
import {
  SETUP_DRAFT_MAX_ENTITIES,
  type SetupEntityPayload,
  type SetupEntitySource,
  type SetupOpenQuestion,
  deriveSetupEntityState,
  majorAmountToMinor,
  normalizeQuantity,
  sanitizeVocabulary,
  setupCustomerPayloadSchema,
  setupEntityKey,
  setupEntityKind,
  setupFollowUpFieldSchema,
  setupProductPayloadSchema,
  setupServicePayloadSchema,
} from "./contracts"

export type SetupBusinessContext = {
  businessName: string
  storeName: string
  businessProfile: { key: string; title: string } | null
  operatingModel: string | null
  currencyCode: string
  countryCode: string | null
  existing: { catalogItems: number; customers: number }
}

export type SetupDraftEntityView = {
  key: string
  kind: "PRODUCT" | "SERVICE" | "CUSTOMER"
  state: string
  payload: unknown
  openQuestions: unknown
}

export type SetupDraftEntityWrite = {
  key: string
  kind: "PRODUCT" | "SERVICE" | "CUSTOMER"
  state: "NEEDS_INPUT" | "PROPOSED"
  payload: SetupEntityPayload
  source: SetupEntitySource
  openQuestions: SetupOpenQuestion[]
}

export type SetupToolDependencies = {
  context: SetupBusinessContext
  sourceMessageId: string | null
  readDraft: () => Promise<SetupDraftEntityView[]>
  writeEntities: (
    entities: SetupDraftEntityWrite[],
  ) => Promise<{ revision: number; changed: string[]; rejected: string[] }>
  removeEntities: (keys: string[]) => Promise<{ revision: number }>
  onDraftChanged?: (change: { revision: number; keys: string[] }) => void
}

/** Every tool result uses one envelope so the UI and model never see raw errors. */
type ToolEnvelope<T> = {
  status: "success" | "partial" | "failed"
  data?: T
  warnings: string[]
}

const quoteField = z
  .string()
  .max(240)
  .optional()
  .describe(
    "Short exact words from the owner's message that support this record.",
  )

const followUpsField = z
  .array(
    z.object({
      field: setupFollowUpFieldSchema,
      question: z.string().min(1).max(240),
    }),
  )
  .max(4)
  .optional()
  .describe(
    "Optional follow-up questions still worth asking (stock, photo, category, phone, balance).",
  )

const itemInputSchema = z.object({
  key: z
    .string()
    .max(140)
    .optional()
    .describe(
      "Existing draft key when updating an entity; omit for new items.",
    ),
  kind: z.enum(["product", "service"]),
  name: z.string().min(1).max(160),
  description: z.string().max(500).optional(),
  unitName: z
    .string()
    .max(80)
    .optional()
    .describe(
      "Products only: the unit counted in stock, e.g. Piece, Bag, Crate, Kilogram.",
    ),
  price: z
    .string()
    .max(32)
    .optional()
    .describe(
      "Selling price per unit in major currency units as digits, e.g. 2500 or 2500.50.",
    ),
  pricing: z
    .enum(["fixed", "quote"])
    .optional()
    .describe("Services only: fixed price or priced per job by quote."),
  openingStock: z
    .string()
    .max(32)
    .optional()
    .describe("Products only: quantity on hand now, in unitName units."),
  categoryKey: z.string().max(120).optional(),
  quickSetupKey: z.string().max(120).optional(),
  sellingUnits: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        containsQuantity: z
          .string()
          .max(32)
          .describe("How many unitName units are in one of this selling unit."),
        price: z.string().max(32).optional(),
      }),
    )
    .max(5)
    .optional(),
  options: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        values: z.array(z.string().min(1).max(60)).min(1).max(12),
      }),
    )
    .max(3)
    .optional(),
  quote: quoteField,
  followUps: followUpsField,
})

const customerInputSchema = z.object({
  key: z.string().max(140).optional(),
  name: z.string().min(1).max(160),
  phone: z.string().max(40).optional(),
  email: z.string().max(254).optional(),
  owesBusiness: z
    .string()
    .max(32)
    .optional()
    .describe("Amount this customer currently owes the business, major units."),
  businessOwes: z
    .string()
    .max(32)
    .optional()
    .describe(
      "Deposit or credit the business holds for this customer, major units.",
    ),
  quote: quoteField,
  followUps: followUpsField,
})

function itemPayload(
  input: z.infer<typeof itemInputSchema>,
  warnings: string[],
): SetupEntityPayload | null {
  const priceMinor = majorAmountToMinor(input.price) ?? undefined
  if (input.price && priceMinor === undefined)
    warnings.push(`Price "${input.price}" for ${input.name} was not a number.`)
  if (input.kind === "service") {
    const { payload, warnings: vocabulary } = sanitizeVocabulary({
      kind: "service" as const,
      name: input.name,
      description: input.description,
      pricing: input.pricing ?? "fixed",
      priceMinor,
      categoryKey: input.categoryKey,
      quickSetupKey: input.quickSetupKey,
    })
    warnings.push(...vocabulary)
    const parsed = setupServicePayloadSchema.safeParse(payload)
    return parsed.success ? parsed.data : null
  }
  const openingStock = normalizeQuantity(input.openingStock) ?? undefined
  if (input.openingStock && openingStock === undefined)
    warnings.push(
      `Stock "${input.openingStock}" for ${input.name} was not a quantity.`,
    )
  const { payload, warnings: vocabulary } = sanitizeVocabulary({
    kind: "product" as const,
    name: input.name,
    description: input.description,
    unitName: input.unitName?.trim() || "Piece",
    priceMinor,
    openingStock,
    categoryKey: input.categoryKey,
    quickSetupKey: input.quickSetupKey,
    sellingUnits: input.sellingUnits?.flatMap((unit) => {
      const containsQuantity = normalizeQuantity(unit.containsQuantity)
      if (!containsQuantity || Number(containsQuantity) <= 0) {
        warnings.push(`Selling unit ${unit.name} needs a positive quantity.`)
        return []
      }
      return [
        {
          name: unit.name,
          containsQuantity,
          priceMinor: majorAmountToMinor(unit.price) ?? undefined,
        },
      ]
    }),
    options: input.options,
  })
  warnings.push(...vocabulary)
  const parsed = setupProductPayloadSchema.safeParse(payload)
  return parsed.success ? parsed.data : null
}

function customerPayload(
  input: z.infer<typeof customerInputSchema>,
  warnings: string[],
): SetupEntityPayload | null {
  const owes = majorAmountToMinor(input.owesBusiness)
  const credit = majorAmountToMinor(input.businessOwes)
  if (owes && credit)
    warnings.push(
      `${input.name} cannot both owe and be owed; keeping the debt.`,
    )
  const opening = owes
    ? { direction: "owes_business" as const, amountMinor: owes }
    : credit
      ? { direction: "business_owes" as const, amountMinor: credit }
      : undefined
  const parsed = setupCustomerPayloadSchema.safeParse({
    kind: "customer",
    name: input.name,
    phone: input.phone?.trim() || undefined,
    email: input.email?.trim() || undefined,
    opening,
  })
  if (!parsed.success)
    warnings.push(`Customer ${input.name} has invalid contact details.`)
  return parsed.success ? parsed.data : null
}

export function createSetupAssistantTools(deps: SetupToolDependencies) {
  const stage = async (
    candidates: Array<{
      key?: string
      payload: SetupEntityPayload | null
      name: string
      quote?: string
      followUps?: Array<{ field: SetupOpenQuestion["field"]; question: string }>
    }>,
    warnings: string[],
  ): Promise<ToolEnvelope<unknown>> => {
    const current = await deps.readDraft()
    const writes: SetupDraftEntityWrite[] = []
    for (const candidate of candidates) {
      if (!candidate.payload) {
        warnings.push(
          `${candidate.name} was not added; its details were invalid.`,
        )
        continue
      }
      const key =
        candidate.key && current.some((entity) => entity.key === candidate.key)
          ? candidate.key
          : setupEntityKey(candidate.payload.kind, candidate.payload.name)
      const derived = deriveSetupEntityState(
        candidate.payload,
        (candidate.followUps ?? []).map((entry) => ({
          ...entry,
          required: false,
        })),
      )
      writes.push({
        key,
        kind: setupEntityKind(candidate.payload),
        state: derived.state,
        payload: candidate.payload,
        source: { messageId: deps.sourceMessageId, quote: candidate.quote },
        openQuestions: derived.questions,
      })
    }
    const newKeys = writes.filter(
      (write) => !current.some((entity) => entity.key === write.key),
    ).length
    if (current.length + newKeys > SETUP_DRAFT_MAX_ENTITIES)
      return {
        status: "failed",
        warnings: [
          `The setup draft holds at most ${SETUP_DRAFT_MAX_ENTITIES} records. Ask the owner to import larger lists later.`,
        ],
      }
    if (writes.length === 0) return { status: "failed", warnings }
    const result = await deps.writeEntities(writes)
    if (result.rejected.length > 0)
      warnings.push(
        `Already created and unchanged: ${result.rejected.join(", ")}.`,
      )
    deps.onDraftChanged?.({ revision: result.revision, keys: result.changed })
    return {
      status: warnings.length > 0 ? "partial" : "success",
      data: {
        staged: writes
          .filter((write) => result.changed.includes(write.key))
          .map((write) => ({
            key: write.key,
            name: write.payload.name,
            state: write.state,
            stillToAsk: write.openQuestions.map(
              (question) => question.question,
            ),
          })),
      },
      warnings,
    }
  }

  return {
    setup_get_context: tool({
      description:
        "Read the business profile and the current setup draft (records already staged, their keys and what is still missing). Call this before updating existing records.",
      inputSchema: z.object({}),
      execute: async (): Promise<ToolEnvelope<unknown>> => {
        const draft = await deps.readDraft()
        return {
          status: "success",
          data: {
            business: deps.context,
            draft: draft.map((entity) => ({
              key: entity.key,
              kind: entity.kind,
              state: entity.state,
              payload: entity.payload,
              openQuestions: entity.openQuestions,
            })),
          },
          warnings: [],
        }
      },
    }),
    setup_search_quick_setups: tool({
      description:
        "Search EwaTrade's ready-made product/service setups for typical units, pack sizes and options (e.g. eggs by tray, feed by bag). Use the result to choose unitName, sellingUnits and quickSetupKey.",
      inputSchema: z.object({
        kind: z.enum(["product", "service"]),
        query: z.string().min(1).max(80),
      }),
      execute: async ({ kind, query }): Promise<ToolEnvelope<unknown>> => {
        const helpers = listCatalogSetupHelpers({ kind, query }).slice(0, 6)
        return {
          status: "success",
          data: helpers.map((helper) => ({
            quickSetupKey: helper.key,
            title: helper.title,
            description: helper.description,
            ...(helper.kind === "product"
              ? {
                  units: helper.setup.units.map((unit) => ({
                    name: unit.name,
                    factorToBaseUnit: unit.factor,
                  })),
                  options: helper.setup.optionGroups,
                }
              : {
                  pricing:
                    helper.setup.pricingPolicy === "fixed" ? "fixed" : "quote",
                  options: helper.setup.optionGroups,
                }),
          })),
          warnings: [],
        }
      },
    }),
    setup_search_categories: tool({
      description:
        "Find EwaTrade category keys (with their emoji) for products or services. Only use keys returned here.",
      inputSchema: z.object({
        kind: z.enum(["product", "service"]),
        query: z.string().max(80).optional(),
      }),
      execute: async ({ kind, query }): Promise<ToolEnvelope<unknown>> => {
        const presets = getCatalogCategoryPresets({
          businessProfileKey: deps.context.businessProfile?.key ?? null,
          kind,
          query: query ?? "",
          all: Boolean(query),
        })
        return {
          status: "success",
          data: presets.slice(0, 8).flatMap((preset) => [
            {
              categoryKey: preset.key,
              label: preset.label,
              emoji: catalogCategoryEmoji(preset.key),
            },
            ...preset.subcategories.slice(0, 8).map((child) => ({
              categoryKey: child.key,
              label: `${preset.label} › ${child.label}`,
              emoji: catalogCategoryEmoji(child.key),
            })),
          ]),
          warnings: [],
        }
      },
    }),
    setup_draft_upsert_items: tool({
      description:
        "Stage products or services in the owner's setup draft. Nothing is created in the business until the owner confirms. Re-send an item with its key to update it.",
      inputSchema: z.object({ items: z.array(itemInputSchema).min(1).max(25) }),
      execute: async ({ items }) => {
        const warnings: string[] = []
        return stage(
          items.map((item) => ({
            key: item.key,
            name: item.name,
            payload: itemPayload(item, warnings),
            quote: item.quote,
            followUps: item.followUps,
          })),
          warnings,
        )
      },
    }),
    setup_draft_upsert_customers: tool({
      description:
        "Stage customers (and what they owe or are owed today) in the setup draft. Nothing is created until the owner confirms.",
      inputSchema: z.object({
        customers: z.array(customerInputSchema).min(1).max(25),
      }),
      execute: async ({ customers }) => {
        const warnings: string[] = []
        return stage(
          customers.map((customer) => ({
            key: customer.key,
            name: customer.name,
            payload: customerPayload(customer, warnings),
            quote: customer.quote,
            followUps: customer.followUps,
          })),
          warnings,
        )
      },
    }),
    setup_draft_remove: tool({
      description:
        "Remove staged records the owner no longer wants. Records already created in the business cannot be removed here.",
      inputSchema: z.object({
        keys: z.array(z.string().max(140)).min(1).max(25),
      }),
      execute: async ({ keys }): Promise<ToolEnvelope<unknown>> => {
        const result = await deps.removeEntities(keys)
        deps.onDraftChanged?.({ revision: result.revision, keys })
        return { status: "success", data: { removed: keys }, warnings: [] }
      },
    }),
  }
}

export type SetupAssistantTools = ReturnType<typeof createSetupAssistantTools>
