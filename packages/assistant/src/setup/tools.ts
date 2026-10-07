import { catalogCategoryEmoji } from "@ewatrade/utils/catalog-category-emojis"
import { getCatalogCategoryPresets } from "@ewatrade/utils/catalog-category-presets"
import { listCatalogSetupHelpers } from "@ewatrade/utils/catalog-setup-helpers"
import { tool } from "ai"
import { z } from "zod"
import {
  SETUP_AREAS,
  type SetupArea,
  type SetupAreaMark,
  nextSetupArea,
  summarizeSetupAreas,
} from "./areas"
import {
  SETUP_DRAFT_MAX_ENTITIES,
  type SetupEntityKind,
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
  setupMoneyAccountPayloadSchema,
  setupProductPayloadSchema,
  setupServicePayloadSchema,
} from "./contracts"

export type SetupBusinessContext = {
  businessName: string
  storeName: string
  businessProfile: { key: string; title: string } | null
  operatingModel: string | null
  /** Onboarding order channels, e.g. walk_in, phone_whatsapp. */
  orderChannels?: string[]
  currencyCode: string
  countryCode: string | null
  existing: { catalogItems: number; customers: number }
  /**
   * Photos, files and voice notes can be sent (ASSISTANT_SETUP_MEDIA_ENABLED).
   * Absent means off: the owner types everything.
   */
  mediaEnabled?: boolean
}

export type SetupDraftEntityView = {
  key: string
  kind: SetupEntityKind
  state: string
  payload: unknown
  openQuestions: unknown
}

export type SetupDraftEntityWrite = {
  key: string
  kind: SetupEntityKind
  state: "NEEDS_INPUT" | "PROPOSED"
  payload: SetupEntityPayload
  source: SetupEntitySource
  openQuestions: SetupOpenQuestion[]
}

/** Attachments sent in this conversation that records may cite. */
export type SetupKnownAttachment = {
  id: string
  kind: "IMAGE" | "AUDIO" | "PDF" | "SPREADSHEET" | "TEXT"
  /** For photos: what the photo read found it to be. */
  imageKind?: "document" | "product_photo" | "other" | null
}

export type SetupToolDependencies = {
  context: SetupBusinessContext
  sourceMessageId: string | null
  knownAttachments?: SetupKnownAttachment[]
  /** Re-checks membership and conversation state before every draft write. */
  authorize?: () => Promise<boolean>
  readDraft: () => Promise<SetupDraftEntityView[]>
  writeEntities: (
    entities: SetupDraftEntityWrite[],
  ) => Promise<{ revision: number; changed: string[]; rejected: string[] }>
  removeEntities: (keys: string[]) => Promise<{ revision: number }>
  /** Explicit DONE/SKIPPED marks per setup area. */
  readAreaMarks?: () => Promise<unknown>
  markArea?: (
    area: SetupArea,
    mark: SetupAreaMark | null,
  ) => Promise<{ revision: number }>
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

const provenanceFields = {
  sourceAttachmentId: z
    .string()
    .max(64)
    .optional()
    .describe(
      "attachmentId of the file, photo or voice note this record was read from.",
    ),
  sourceLocation: z
    .string()
    .max(40)
    .optional()
    .describe('Where in that attachment, e.g. "row 4", "page 2", "line 7".'),
  uncertain: z
    .boolean()
    .optional()
    .describe(
      "True when the source line or cell was hard to read or ambiguous.",
    ),
}

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
    .describe(
      "Products only: quantity on hand now, in unitName units. Leave it out for products with options: stock is counted per option in Inventory.",
    ),
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
    .optional()
    .describe(
      "Products only: choices the customer picks, e.g. Size: Small, Large. Every combination becomes its own variant at the same price (at most 36).",
    ),
  photoAttachmentId: z
    .string()
    .max(64)
    .optional()
    .describe(
      "Products only: attachmentId of a product photo the owner sent for this item.",
    ),
  usage: z
    .enum(["sell", "use", "both"])
    .optional()
    .describe(
      "Products only. sell (default): sold to customers. use: used in the business but not sold, e.g. feed, packaging, fuel; needs no selling price. both: used and also sold.",
    ),
  quote: quoteField,
  followUps: followUpsField,
  ...provenanceFields,
})

const finishedAreaField = z
  .enum(SETUP_AREAS)
  .optional()
  .describe(
    'Set when the owner said this is everything for one area, e.g. "that\'s all I sell" -> "sell", "no more customers" -> "customers". Marks that area done.',
  )

const moneyAccountInputSchema = z.object({
  key: z.string().max(140).optional(),
  name: z
    .string()
    .min(1)
    .max(100)
    .describe('How the owner names it, e.g. "Shop cash", "GTBank", "Opay".'),
  purpose: z
    .enum(["cash", "bank"])
    .describe(
      "cash: money kept in hand or a till. bank: a bank or mobile money account.",
    ),
  bankName: z.string().max(60).optional(),
  balance: z
    .string()
    .max(32)
    .optional()
    .describe(
      "Money in it right now, major units as digits. Leave out if not said.",
    ),
  quote: quoteField,
  followUps: followUpsField,
  ...provenanceFields,
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
  ...provenanceFields,
})

type Provenance = {
  sourceAttachmentId?: string
  sourceLocation?: string
  uncertain?: boolean
}

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
    photoAttachmentId: input.photoAttachmentId,
    usage:
      input.usage === "use"
        ? ("INTERNAL_USE" as const)
        : input.usage === "both"
          ? ("BOTH" as const)
          : undefined,
  })
  warnings.push(...vocabulary)
  const parsed = setupProductPayloadSchema.safeParse(payload)
  return parsed.success ? parsed.data : null
}

function moneyAccountPayload(
  input: z.infer<typeof moneyAccountInputSchema>,
  warnings: string[],
): SetupEntityPayload | null {
  const openingBalanceMinor =
    input.balance === undefined
      ? undefined
      : (majorAmountToMinor(input.balance) ?? undefined)
  if (input.balance && openingBalanceMinor === undefined)
    warnings.push(
      `Balance "${input.balance}" for ${input.name} was not an amount.`,
    )
  const parsed = setupMoneyAccountPayloadSchema.safeParse({
    kind: "money_account",
    name: input.name.trim(),
    purpose: input.purpose === "bank" ? "BANK" : "CASH",
    bankName: input.bankName?.trim() || undefined,
    openingBalanceMinor,
  })
  if (!parsed.success)
    warnings.push(`${input.name} has invalid account details.`)
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

const NOT_AUTHORIZED: ToolEnvelope<never> = {
  status: "failed",
  warnings: [
    "The setup list can no longer be changed in this conversation. Tell the owner to reopen setup.",
  ],
}

export function createSetupAssistantTools(deps: SetupToolDependencies) {
  const authorized = async () => (deps.authorize ? deps.authorize() : true)
  const known = new Map(
    (deps.knownAttachments ?? []).map((attachment) => [
      attachment.id,
      attachment,
    ]),
  )
  /** Only attachments actually sent here may be cited; product photos must be photos. */
  const checkedProvenance = (
    candidate: {
      name: string
      payload: SetupEntityPayload | null
    } & Provenance,
    warnings: string[],
  ) => {
    let payload = candidate.payload
    if (
      payload?.kind === "product" &&
      payload.photoAttachmentId &&
      known.get(payload.photoAttachmentId)?.kind !== "IMAGE"
    ) {
      warnings.push(
        `The photo for ${candidate.name} was not found and was left out.`,
      )
      payload = { ...payload, photoAttachmentId: undefined }
    }
    const attachmentId =
      candidate.sourceAttachmentId && known.has(candidate.sourceAttachmentId)
        ? candidate.sourceAttachmentId
        : undefined
    if (candidate.sourceAttachmentId && !attachmentId)
      warnings.push(
        `Unknown attachment ${candidate.sourceAttachmentId} was ignored.`,
      )
    return {
      payload,
      attachmentId,
      location: attachmentId ? candidate.sourceLocation : undefined,
      uncertain: candidate.uncertain || undefined,
    }
  }
  const stage = async (
    candidates: Array<
      {
        key?: string
        payload: SetupEntityPayload | null
        name: string
        quote?: string
        followUps?: Array<{
          field: SetupOpenQuestion["field"]
          question: string
        }>
      } & Provenance
    >,
    warnings: string[],
  ): Promise<ToolEnvelope<unknown>> => {
    const current = await deps.readDraft()
    const writes: SetupDraftEntityWrite[] = []
    for (const raw of candidates) {
      const provenance = checkedProvenance(raw, warnings)
      const candidate = { ...raw, payload: provenance.payload }
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
        source: {
          messageId: deps.sourceMessageId,
          quote: candidate.quote,
          ...(provenance.attachmentId
            ? { attachmentId: provenance.attachmentId }
            : {}),
          ...(provenance.location ? { location: provenance.location } : {}),
          ...(provenance.uncertain ? { uncertain: true } : {}),
        },
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
    if (!(await authorized())) return NOT_AUTHORIZED
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

  const areaState = async () => {
    const areas = summarizeSetupAreas(
      await (deps.readAreaMarks?.() ?? Promise.resolve(null)),
      await deps.readDraft(),
    )
    return { areas, nextArea: nextSetupArea(areas)?.area ?? null }
  }
  /**
   * Marks an area done on the staging call that adds its last records, so the
   * mark does not rest on a separate setup_set_area call the model can skip.
   */
  const finishArea = async (
    result: ToolEnvelope<unknown>,
    area: SetupArea | undefined,
  ): Promise<ToolEnvelope<unknown>> => {
    if (!area || result.status === "failed" || !deps.markArea) return result
    if (!(await authorized())) return NOT_AUTHORIZED
    const marked = await deps.markArea(area, "DONE")
    deps.onDraftChanged?.({ revision: marked.revision, keys: [] })
    return {
      ...result,
      data: { ...(result.data as object), ...(await areaState()) },
    }
  }

  return {
    setup_get_context: tool({
      description:
        "Read the business profile and the current setup draft (records already staged, their keys and what is still missing). Call this before updating existing records.",
      inputSchema: z.object({}),
      execute: async (): Promise<ToolEnvelope<unknown>> => {
        const [draft, marks] = await Promise.all([
          deps.readDraft(),
          deps.readAreaMarks?.() ?? Promise.resolve(null),
        ])
        const areas = summarizeSetupAreas(marks, draft)
        return {
          status: "success",
          data: {
            business: deps.context,
            areas,
            nextArea: nextSetupArea(areas)?.area ?? null,
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
    setup_set_area: tool({
      description:
        'Record that the owner finished ("done") or does not want ("skipped") one setup area. Call it in the same turn the owner says so, before you introduce the next area; when you are staging records in that turn, set finishedArea on that call instead. Use "open" to reopen an area. Areas: sell, use, customers, money.',
      inputSchema: z.object({
        area: z.enum(SETUP_AREAS),
        status: z.enum(["done", "skipped", "open"]),
      }),
      execute: async ({ area, status }): Promise<ToolEnvelope<unknown>> => {
        if (!deps.markArea)
          return {
            status: "failed",
            warnings: ["Areas cannot be changed here."],
          }
        if (!(await authorized())) return NOT_AUTHORIZED
        const result = await deps.markArea(
          area,
          status === "done" ? "DONE" : status === "skipped" ? "SKIPPED" : null,
        )
        deps.onDraftChanged?.({ revision: result.revision, keys: [] })
        return { status: "success", data: await areaState(), warnings: [] }
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
      inputSchema: z.object({
        items: z.array(itemInputSchema).min(1).max(25),
        finishedArea: finishedAreaField,
      }),
      execute: async ({ items, finishedArea }) => {
        const warnings: string[] = []
        const result = await stage(
          items.map((item) => ({
            key: item.key,
            name: item.name,
            payload: itemPayload(item, warnings),
            quote: item.quote,
            followUps: item.followUps,
            sourceAttachmentId: item.sourceAttachmentId,
            sourceLocation: item.sourceLocation,
            uncertain: item.uncertain,
          })),
          warnings,
        )
        return finishArea(result, finishedArea)
      },
    }),
    setup_draft_upsert_customers: tool({
      description:
        "Stage customers (and what they owe or are owed today) in the setup draft. Nothing is created until the owner confirms.",
      inputSchema: z.object({
        customers: z.array(customerInputSchema).min(1).max(25),
        finishedArea: finishedAreaField,
      }),
      execute: async ({ customers, finishedArea }) => {
        const warnings: string[] = []
        const result = await stage(
          customers.map((customer) => ({
            key: customer.key,
            name: customer.name,
            payload: customerPayload(customer, warnings),
            quote: customer.quote,
            followUps: customer.followUps,
            sourceAttachmentId: customer.sourceAttachmentId,
            sourceLocation: customer.sourceLocation,
            uncertain: customer.uncertain,
          })),
          warnings,
        )
        return finishArea(result, finishedArea)
      },
    }),
    setup_draft_upsert_money_accounts: tool({
      description:
        "Stage where the business keeps its money: each cash pocket and each bank or mobile money account, with the balance in it now if the owner said. The first cash pocket is added to Shop cash, the cash account Finance already keeps for the business. Nothing is created until the owner confirms.",
      inputSchema: z.object({
        accounts: z.array(moneyAccountInputSchema).min(1).max(15),
        finishedArea: finishedAreaField,
      }),
      execute: async ({ accounts, finishedArea }) => {
        const warnings: string[] = []
        const result = await stage(
          accounts.map((account) => ({
            key: account.key,
            name: account.name,
            payload: moneyAccountPayload(account, warnings),
            quote: account.quote,
            followUps: account.followUps,
            sourceAttachmentId: account.sourceAttachmentId,
            sourceLocation: account.sourceLocation,
            uncertain: account.uncertain,
          })),
          warnings,
        )
        return finishArea(result, finishedArea)
      },
    }),
    setup_draft_remove: tool({
      description:
        "Remove staged records the owner no longer wants. Records already created in the business cannot be removed here.",
      inputSchema: z.object({
        keys: z.array(z.string().max(140)).min(1).max(25),
      }),
      execute: async ({ keys }): Promise<ToolEnvelope<unknown>> => {
        if (!(await authorized())) return NOT_AUTHORIZED
        const result = await deps.removeEntities(keys)
        deps.onDraftChanged?.({ revision: result.revision, keys })
        return { status: "success", data: { removed: keys }, warnings: [] }
      },
    }),
  }
}

export type SetupAssistantTools = ReturnType<typeof createSetupAssistantTools>
