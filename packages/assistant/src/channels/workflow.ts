import { isExactDecimal } from "@ewatrade/utils/exact-decimal"
import { z } from "zod"
import { generalMoney } from "../general/contracts"
import { readRecordOriginSchema } from "../general/read-record-target"
import {
  WHATSAPP_PRODUCT_WORKFLOW_LIMIT,
  deriveSetupEntityState,
  isProductWorkflowDraftKey,
  setupEntityPayloadSchema,
  setupOpenQuestionSchema,
} from "../setup/contracts"
import { setupProductVariants } from "../setup/variants"
import { trustedAssistantAppOrigin } from "./conversation-links"
import { chunkWhatsAppFormattedReply, whatsAppModelText } from "./presentation"
import { chunkWhatsAppReply, whatsAppPlainText } from "./render"

/** v3 ends a draft list with one "Review N drafts" suggestion; v2/v1 rows still render as sent. */
export const WHATSAPP_WORKFLOW_RENDER_VERSION = "whatsapp-workflow-v3"
export const WHATSAPP_WORKFLOW_PRIOR_RENDER_VERSION = "whatsapp-workflow-v2"
export const WHATSAPP_WORKFLOW_LEGACY_RENDER_VERSION = "whatsapp-workflow-v1"
export type WhatsAppWorkflowRenderVersion =
  | typeof WHATSAPP_WORKFLOW_RENDER_VERSION
  | typeof WHATSAPP_WORKFLOW_PRIOR_RENDER_VERSION
  | typeof WHATSAPP_WORKFLOW_LEGACY_RENDER_VERSION
export function supportedWhatsAppWorkflowRenderVersion(
  value: string,
): value is WhatsAppWorkflowRenderVersion {
  return (
    value === WHATSAPP_WORKFLOW_RENDER_VERSION ||
    value === WHATSAPP_WORKFLOW_PRIOR_RENDER_VERSION ||
    value === WHATSAPP_WORKFLOW_LEGACY_RENDER_VERSION
  )
}
export const whatsAppWorkflowPurposeSchema = z.enum(["SETUP", "PRODUCT_CREATE"])
export type WhatsAppWorkflowPurpose = z.infer<
  typeof whatsAppWorkflowPurposeSchema
>
type Environment = Readonly<Record<string, string | undefined>>
export const WHATSAPP_WORKFLOW_RELEASE_FLAG =
  "ASSISTANT_WHATSAPP_WORKFLOWS_ENABLED"
const releaseTokens = {
  setup: "SETUP",
  product_create: "PRODUCT_CREATE",
} as const

/**
 * Explicit non-local release of named workflows, for example "setup,product_create".
 * Unset or empty releases nothing. Any unknown, empty or repeated token makes the
 * whole value invalid and releases nothing, so a typo can never widen access.
 */
export function whatsAppWorkflowRelease(env: Environment = process.env): {
  configured: boolean
  valid: boolean
  purposes: WhatsAppWorkflowPurpose[]
} {
  const raw = env[WHATSAPP_WORKFLOW_RELEASE_FLAG]
  if (raw === undefined || raw.trim() === "")
    return { configured: false, valid: true, purposes: [] }
  const tokens = raw.split(",").map((token) => token.trim())
  const valid =
    tokens.every((token) => Object.hasOwn(releaseTokens, token)) &&
    new Set(tokens).size === tokens.length
  return {
    configured: true,
    valid,
    purposes: valid
      ? tokens
          .map((token) => releaseTokens[token as keyof typeof releaseTokens])
          .sort()
      : [],
  }
}

export function whatsAppWorkflowPolicy(env: Environment = process.env) {
  const localSource = env.APP_ENV === "local" && env.NODE_ENV !== "production"
  const release = whatsAppWorkflowRelease(env)
  const released = (purpose: WhatsAppWorkflowPurpose) =>
    release.purposes.includes(purpose)
  return {
    version: "whatsapp-workflow-policy-v1",
    localSource,
    setup:
      (localSource && env.ASSISTANT_WHATSAPP_SETUP_ENABLED === "true") ||
      released("SETUP"),
    product:
      (localSource && env.ASSISTANT_WHATSAPP_PRODUCT_ENABLED === "true") ||
      released("PRODUCT_CREATE"),
    nativeWrites:
      localSource && env.ASSISTANT_WHATSAPP_WORKFLOW_WRITES_ENABLED === "true",
    // Present only when the release flag is set, so the authority fingerprint of an
    // unflagged deployment is byte-identical to the local-only policy.
    ...(release.configured
      ? { release: { valid: release.valid, purposes: release.purposes } }
      : {}),
  }
}
export function whatsAppWorkflowEnabled(
  purpose: string,
  env: Environment = process.env,
) {
  const policy = whatsAppWorkflowPolicy(env)
  return purpose === "SETUP"
    ? policy.setup
    : purpose === "PRODUCT_CREATE"
      ? policy.product
      : false
}
/**
 * Confirmed saves from a WhatsApp workflow review. A released purpose includes its
 * own confirmed save; locally the separate writes toggle still applies. The channel
 * writes toggle, owner role and exact review proof are checked by the callers.
 */
export function whatsAppWorkflowNativeWritesEnabled(
  purpose: string,
  env: Environment = process.env,
) {
  if (!whatsAppWorkflowEnabled(purpose, env)) return false
  return (
    whatsAppWorkflowPolicy(env).nativeWrites ||
    whatsAppWorkflowRelease(env).purposes.some((entry) => entry === purpose)
  )
}

const id = z.string().min(1).max(128)
export const WHATSAPP_WORKFLOW_ACTION_MAX_SELECTION = 3
export const whatsAppWorkflowReplySchema = z
  .object({
    purpose: whatsAppWorkflowPurposeSchema,
    conversationId: id,
    ownerUserId: id,
    origin: readRecordOriginSchema,
    currencyCode: z.string().min(3).max(3),
    revision: z.number().int().nonnegative(),
    parts: z.array(z.unknown()).max(80),
    requestText: z.string().max(8000),
    requiresForm: z.boolean(),
    entities: z
      .array(
        z
          .object({
            key: z.string().min(1).max(140),
            kind: z.enum(["PRODUCT", "SERVICE", "CUSTOMER", "MONEY_ACCOUNT"]),
            state: z.enum([
              "PROPOSED",
              "NEEDS_INPUT",
              "CONFIRMED",
              "COMMITTED",
              "FAILED",
              "SKIPPED",
            ]),
            payload: z.unknown(),
            openQuestions: z.unknown(),
            errorCode: z.string().nullable(),
            committedRecordId: z.string().nullable(),
          })
          .strict(),
      )
      .max(200),
  })
  .strict()
export type WhatsAppWorkflowReply = z.infer<typeof whatsAppWorkflowReplySchema>
export type WhatsAppWorkflowRenderedReply = {
  version: WhatsAppWorkflowRenderVersion
  kind: "reply" | "app_review"
  chunks: string[]
  /** v3 only: one reply button on the last chunk; its text is the typed command. */
  choices?: Array<{ title: string; text: string }>
}

export function parseWhatsAppWorkflowRequest(text: string) {
  const value = text.trim()
  const list =
    /^(?:draft list|setup list|product draft)(?: page ([1-9]\d{0,2}))?$/i.exec(
      value,
    )
  if (list) return { kind: "list" as const, page: Number(list[1] ?? "1") }
  const review = /^review draft (.{1,140})$/i.exec(value)
  return review ? { kind: "review" as const, key: review[1] ?? "" } : null
}

/** Exact existing UI routes; navigation never supplies approval or switches scope. */
export function workflowConversationAppLink(
  input: Pick<WhatsAppWorkflowReply, "purpose" | "conversationId" | "origin">,
  options: {
    trustedAppOrigin: string
    currentScope: { tenantId: string; storeId: string }
  },
) {
  const origin = trustedAssistantAppOrigin(options.trustedAppOrigin)
  if (
    !origin ||
    !id.safeParse(input.conversationId).success ||
    !whatsAppWorkflowPurposeSchema.safeParse(input.purpose).success ||
    input.origin.tenantId !== options.currentScope.tenantId ||
    input.origin.storeId !== options.currentScope.storeId
  )
    return undefined
  const url = new URL(
    input.purpose === "SETUP" ? "/assistant" : "/catalog",
    origin,
  )
  if (input.purpose === "SETUP") {
    url.searchParams.set("setup", "assistant")
    url.searchParams.set("setupConversation", input.conversationId)
  } else {
    url.searchParams.set("catalogItem", "create")
    url.searchParams.set("catalogCreateKind", "product")
    url.searchParams.set("catalogCreateMode", "chat")
    url.searchParams.set("catalogConversation", input.conversationId)
  }
  return url.href
}

function entityLines(
  entity: WhatsAppWorkflowReply["entities"][number],
  currency: string,
) {
  const parsed = setupEntityPayloadSchema.safeParse(entity.payload)
  const questions = z
    .array(setupOpenQuestionSchema)
    .max(40)
    .safeParse(entity.openQuestions ?? [])
  if (
    !parsed.success ||
    !questions.success ||
    parsed.data.kind.toUpperCase() !== entity.kind
  )
    return null
  const payload = parsed.data
  const lines = [
    `Draft key: ${entity.key}`,
    `${payload.name} · ${entity.kind} · ${entity.state}`,
  ]
  if (entity.errorCode)
    lines.push(`App follow-up required: ${entity.errorCode}`)
  if (payload.kind === "product") {
    lines.push(
      `Use: ${payload.usage ?? "FOR_SALE"}`,
      `Counting unit: ${payload.unitName}`,
      `Price per ${payload.unitName}: ${payload.priceMinor === undefined ? "Not supplied" : generalMoney(payload.priceMinor, currency)}`,
      `Opening stock: ${payload.openingStock === undefined ? "Not supplied" : `${payload.openingStock} ${payload.unitName}`}`,
    )
    if (payload.description) lines.push(`Description: ${payload.description}`)
    for (const unit of payload.sellingUnits ?? [])
      lines.push(
        `Selling unit ${unit.name}: ${unit.containsQuantity} ${payload.unitName}; price ${unit.priceMinor === undefined ? "Not supplied" : generalMoney(unit.priceMinor, currency)}`,
      )
    for (const option of payload.options ?? [])
      lines.push(`${option.name}: ${option.values.join(", ")}`)
    for (const variant of payload.variants ?? []) {
      lines.push(
        `Variant: ${variant.selections.map((selection) => `${selection.optionName}=${selection.value}`).join(", ")}`,
        `Price per ${payload.unitName}: ${variant.priceMinor === undefined ? "Not supplied" : generalMoney(variant.priceMinor, currency)}`,
        `Opening stock: ${variant.openingStock === undefined ? "Not supplied" : `${variant.openingStock} ${payload.unitName}`}`,
      )
      for (const price of variant.sellingUnitPrices ?? [])
        lines.push(
          `Price per ${price.unitName}: ${generalMoney(price.priceMinor, currency)}`,
        )
      for (const stock of variant.stockByUnit ?? [])
        lines.push(`Entered stock: ${stock.quantity} ${stock.unitName}`)
    }
    if (payload.photoAttachmentId)
      lines.push("Photo: the one you sent, saved with the product.")
  } else if (payload.kind === "service") {
    lines.push(
      `Pricing: ${payload.pricing}`,
      `Price: ${payload.priceMinor === undefined ? "Not supplied" : generalMoney(payload.priceMinor, currency)}`,
    )
    if (payload.description) lines.push(`Description: ${payload.description}`)
  } else if (payload.kind === "customer") {
    if (payload.phone) lines.push(`Phone: ${payload.phone}`)
    if (payload.email) lines.push(`Email: ${payload.email}`)
    if (payload.opening)
      lines.push(
        `${payload.opening.direction === "owes_business" ? "Customer owes business" : "Business owes customer"}: ${generalMoney(payload.opening.amountMinor, currency)}`,
      )
  } else {
    lines.push(`Account kind: ${payload.purpose}`)
    if (payload.bankName) lines.push(`Bank: ${payload.bankName}`)
    lines.push(
      `Opening balance: ${payload.openingBalanceMinor === undefined ? "Not supplied" : generalMoney(payload.openingBalanceMinor, currency)}`,
      "Opening balances use the Finance Book start date. Review its date and account in EwaTrade.",
    )
  }
  if ("categoryKey" in payload && payload.categoryKey)
    lines.push(`Category reference: ${payload.categoryKey}`)
  if ("quickSetupKey" in payload && payload.quickSetupKey)
    lines.push(`Unit setup reference: ${payload.quickSetupKey}`)
  for (const question of questions.data)
    lines.push(
      `${question.required ? "Required" : "Optional"}: ${question.question}`,
    )
  return lines.every((line) => whatsAppPlainText(line) === line) ? lines : null
}

/** Display-only canonical draft summary. Tool outputs are never treated as execute or approval authority. */
export function renderWhatsAppWorkflowReply(
  input: unknown,
  options: {
    actorUserId: string
    currentScope: { tenantId: string; storeId: string }
    scopeLabel: string
    trustedAppOrigin: string
    rendererVersion?: WhatsAppWorkflowRenderVersion
  },
): WhatsAppWorkflowRenderedReply {
  const version = options.rendererVersion ?? WHATSAPP_WORKFLOW_RENDER_VERSION
  const legacy = version === WHATSAPP_WORKFLOW_LEGACY_RENDER_VERSION
  const suggests = version === WHATSAPP_WORKFLOW_RENDER_VERSION
  const narrationText = legacy ? whatsAppPlainText : whatsAppModelText
  const fallback = (savedLink?: string): WhatsAppWorkflowRenderedReply => ({
    version,
    kind: "app_review",
    chunks: [
      `This workflow reply is unavailable. Open the original business and Store in EwaTrade to continue your saved draft. Nothing was confirmed in WhatsApp.${savedLink ? `\n\nOpen this saved workflow in EwaTrade:\n${savedLink}` : ""}`,
    ],
  })
  const parsed = whatsAppWorkflowReplySchema.safeParse(input)
  if (!parsed.success) return fallback()
  const reply = parsed.data
  if (
    reply.ownerUserId !== options.actorUserId ||
    reply.origin.tenantId !== options.currentScope.tenantId ||
    reply.origin.storeId !== options.currentScope.storeId ||
    (reply.purpose === "PRODUCT_CREATE" &&
      (reply.entities.length > WHATSAPP_PRODUCT_WORKFLOW_LIMIT ||
        reply.entities.some(
          (entity) =>
            !isProductWorkflowDraftKey(entity.key) || entity.kind !== "PRODUCT",
        )))
  )
    return fallback()
  const link = workflowConversationAppLink(reply, options)
  if (!link) return fallback()
  const narration: string[] = []
  for (const part of reply.parts) {
    if (
      !part ||
      typeof part !== "object" ||
      !("type" in part) ||
      typeof part.type !== "string"
    )
      return fallback(link)
    if (part.type === "text" && "text" in part && typeof part.text === "string")
      narration.push(narrationText(part.text))
    else if (
      part.type !== "step-start" &&
      !(
        /^tool-setup_(get_context|search_quick_setups|search_categories|draft_upsert_items|draft_upsert_customers|draft_upsert_money_accounts|set_area|draft_remove)$/.test(
          part.type,
        ) &&
        "state" in part &&
        ["output-available", "output-error"].includes(String(part.state))
      )
    )
      return fallback(link)
  }
  const request = parseWhatsAppWorkflowRequest(reply.requestText)
  const suggestion =
    suggests && request?.kind !== "review"
      ? whatsAppWorkflowReviewSuggestion(reply.entities, reply.purpose)
      : undefined
  const lines = [
    options.scopeLabel,
    `${reply.purpose === "SETUP" ? "Setup" : "Product"} draft revision: ${reply.revision}`,
  ]
  if (narration.length)
    lines.push(...(suggests ? [] : ["Assistant draft guidance:"]), ...narration)
  if (request?.kind === "review") {
    const entity = reply.entities.find((entry) => entry.key === request.key)
    const detail = entity && entityLines(entity, reply.currencyCode)
    if (!detail)
      lines.push(
        "That exact draft is unavailable. Use Draft list to choose a current draft key.",
      )
    else
      lines.push(
        "Selected saved draft (nothing added by this summary):",
        ...detail,
      )
  } else {
    // A Product chat lists only what is still a draft, after its saved count.
    const saved =
      reply.purpose === "PRODUCT_CREATE"
        ? reply.entities.filter((entity) => entity.state === "COMMITTED").length
        : 0
    const listed =
      reply.purpose === "PRODUCT_CREATE"
        ? reply.entities.filter((entity) => entity.state !== "COMMITTED")
        : reply.entities
    if (saved)
      lines.push(
        `${saved} of ${WHATSAPP_PRODUCT_WORKFLOW_LIMIT} products saved in this chat.`,
      )
    const page = request?.kind === "list" ? request.page : 1
    const start = (page - 1) * 4
    const selected = listed.slice(start, start + 4)
    lines.push(
      selected.length
        ? `Saved drafts · page ${page}:`
        : listed.length
          ? "That draft page is unavailable."
          : "No saved draft records yet.",
    )
    for (const entity of selected) {
      const payload = setupEntityPayloadSchema.safeParse(entity.payload)
      if (!payload.success || !entityLines(entity, reply.currencyCode))
        return fallback(link)
      lines.push(
        `${payload.data.name} · ${entity.kind} · ${entity.state}\nDraft key: ${entity.key}${entity.errorCode ? `\nApp follow-up required: ${entity.errorCode}` : ""}`,
      )
    }
    if (start + 4 < listed.length)
      lines.push(`More saved drafts: Draft list page ${page + 1}`)
  }
  if (reply.requiresForm)
    lines.push(
      "This product retains richer form details. Continue its exact form in EwaTrade.",
    )
  if (suggests) {
    if (suggestion) {
      lines.push(
        `Ready to review: ${suggestion.names.join(", ")}.\nTap ${suggestion.title}, or send: ${suggestion.text}`,
      )
      if (suggestion.readyCount > suggestion.keys.length)
        lines.push(
          `${suggestion.readyCount - suggestion.keys.length} more ready. To choose others, send Review drafts with up to 3 draft keys.`,
        )
    } else lines.push("To review, send Review drafts with up to 3 draft keys.")
    lines.push(
      "Send corrections here to update the saved draft. Nothing is saved until you confirm a review; a draft summary, yes or proceed never confirms anything.",
    )
    if (
      reply.purpose === "SETUP" &&
      whatsAppWorkflowAppOnlyMoneyAccounts(reply.entities).length
    )
      lines.push("Money accounts are confirmed in EwaTrade.")
  } else
    lines.push(
      "To request an exact review: Review draft <draft key>, or Review drafts <key1>, <key2>, <key3> for up to three selected Setup drafts. Send missing or corrected details to update the saved draft. Setup can skip an area when you ask.",
      "If WhatsApp returns a complete confirmation review with its own instructions, reply to that exact message using its Confirm or Cancel command and code. A draft summary, yes or proceed never confirms anything. If no confirmation review is issued, continue in the exact saved workflow in EwaTrade. Rich or incomplete records, failed additions, retries and partial-success follow-up require app review.",
    )
  lines.push(
    "Open this saved workflow in EwaTrade; select the original business and Store:",
    link,
  )
  // Canonical draft facts must fit exactly. Refuse rather than truncate quantities, units or prices.
  const plain = `${lines.slice(0, -1).map(narrationText).join("\n\n")}\n\n${link}`
  try {
    return {
      version,
      kind: "reply",
      chunks: legacy
        ? chunkWhatsAppReply(plain)
        : chunkWhatsAppFormattedReply(plain, 3000),
      ...(suggestion
        ? { choices: [{ title: suggestion.title, text: suggestion.text }] }
        : {}),
    }
  } catch {
    return fallback(link)
  }
}

/** Explicit user-selected keys only. Omitted keys, wildcards and duplicate selections never mean all. */
export function parseWhatsAppWorkflowReviewSelection(text: string | undefined) {
  const value = text?.trim()
  if (!value || !/^review drafts?(?:\b|[.!?:])/i.test(value)) return null
  const match = /^review (draft|drafts) (.+)$/i.exec(value)
  if (!match) return { kind: "invalid_workflow_selection" as const }
  const keys = (match[2] ?? "").split(",").map((entry) => entry.trim())
  if (
    (match[1]?.toLowerCase() === "draft" && keys.length !== 1) ||
    !keys.length ||
    keys.length > WHATSAPP_WORKFLOW_ACTION_MAX_SELECTION ||
    keys.some(
      (entry) =>
        !/^[\p{L}\p{N}][\p{L}\p{N}:._-]{0,139}$/u.test(entry) ||
        /^(?:all|everything)$/i.test(entry),
    ) ||
    new Set(keys).size !== keys.length
  )
    return { kind: "invalid_workflow_selection" as const }
  return { kind: "review_selection" as const, keys }
}

export type WhatsAppWorkflowDraftView = {
  key: string
  kind: string
  state: string
  payload: unknown
  openQuestions: unknown
  errorCode: string | null
  committedRecordId: string | null
}
/**
 * Saved drafts a chat review can show and save exactly as they are. Money accounts,
 * openings, photos, options and other richer records always stay in EwaTrade.
 */
export function whatsAppWorkflowDraftChatReady(
  entity: WhatsAppWorkflowDraftView,
  purpose: "SETUP" | "PRODUCT_CREATE",
) {
  if (
    !["PROPOSED", "CONFIRMED"].includes(entity.state) ||
    entity.errorCode ||
    entity.committedRecordId
  )
    return false
  const parsed = setupEntityPayloadSchema.safeParse(entity.payload)
  const questions = z
    .array(setupOpenQuestionSchema)
    .max(40)
    .safeParse(entity.openQuestions ?? [])
  if (
    !parsed.success ||
    !questions.success ||
    parsed.data.kind.toUpperCase() !== entity.kind ||
    questions.data.some((question) => question.required) ||
    deriveSetupEntityState(parsed.data, questions.data).state !== "PROPOSED"
  )
    return false
  const payload = parsed.data
  if (purpose === "PRODUCT_CREATE")
    return (
      payload.kind === "product" &&
      isProductWorkflowDraftKey(entity.key) &&
      whatsAppProductChatShape(payload)
    )
  if (payload.kind === "money_account") return false
  if (payload.kind === "customer") return !payload.opening
  if (payload.illustrationId) return false
  if (payload.kind === "service")
    return !(payload.pricing === "quote" && payload.priceMinor !== undefined)
  return simpleProduct(payload)
}
type ProductPayload = Extract<
  z.infer<typeof setupEntityPayloadSchema>,
  { kind: "product" }
>
/** One Product review shows at most this many option rows; larger products finish in the app. */
export const WHATSAPP_PRODUCT_VARIANT_MAX = 10
/** Packs a Product review can show per row; more finish in the app. */
export const WHATSAPP_PRODUCT_PACK_MAX = 3
const exactStock = (value: string | undefined) =>
  value === undefined ||
  (isExactDecimal(value, { maxScale: 2 }) && !value.startsWith("-"))
/**
 * A WhatsApp Product draft the chat can review and save exactly: options, packs
 * and one sent photo are allowed within these bounds. Library pictures stay in
 * the app, where the owner can see them.
 */
export function whatsAppProductChatShape(payload: ProductPayload) {
  if (
    payload.illustrationId ||
    (payload.sellingUnits?.length ?? 0) > WHATSAPP_PRODUCT_PACK_MAX ||
    !exactStock(payload.openingStock)
  )
    return false
  if (!payload.options?.length && !payload.variants?.length) return true
  const rows = setupProductVariants(payload)
  return (
    rows.length > 0 &&
    rows.length <= WHATSAPP_PRODUCT_VARIANT_MAX &&
    rows.every((row) => exactStock(row.openingStock))
  )
}
function simpleProduct(payload: ProductPayload) {
  return !(
    payload.illustrationId ||
    payload.photoAttachmentId ||
    payload.options?.length ||
    payload.variants?.length ||
    payload.sellingUnits?.length ||
    (payload.openingStock !== undefined &&
      (!isExactDecimal(payload.openingStock, { maxScale: 2 }) ||
        payload.openingStock.startsWith("-")))
  )
}
/**
 * Suggest, never start: names the first ready drafts in saved order. The returned
 * text is exactly the typed `Review drafts` command for those keys.
 */
export function whatsAppWorkflowReviewSuggestion(
  entities: readonly WhatsAppWorkflowDraftView[],
  purpose: "SETUP" | "PRODUCT_CREATE",
) {
  const ready = entities.filter((entity) =>
    whatsAppWorkflowDraftChatReady(entity, purpose),
  )
  const chosen = ready.slice(0, WHATSAPP_WORKFLOW_ACTION_MAX_SELECTION)
  if (!chosen.length) return undefined
  const keys = chosen.map((entity) => entity.key)
  const text = `Review drafts ${keys.join(", ")}`
  const parsed = parseWhatsAppWorkflowReviewSelection(text)
  if (
    parsed?.kind !== "review_selection" ||
    parsed.keys.join("\n") !== keys.join("\n")
  )
    return undefined
  return {
    keys,
    names: chosen.map(
      (entity) => setupEntityPayloadSchema.parse(entity.payload).name,
    ),
    readyCount: ready.length,
    title: keys.length === 1 ? "Review draft" : `Review ${keys.length} drafts`,
    text,
  }
}
/** Open setup money accounts, named for the app-only line of a Setup review. */
export function whatsAppWorkflowAppOnlyMoneyAccounts(
  entities: readonly WhatsAppWorkflowDraftView[],
) {
  return entities.flatMap((entity) => {
    if (entity.kind !== "MONEY_ACCOUNT" || entity.committedRecordId) return []
    const parsed = setupEntityPayloadSchema.safeParse(entity.payload)
    return parsed.success &&
      parsed.data.kind === "money_account" &&
      whatsAppPlainText(parsed.data.name) === parsed.data.name &&
      !parsed.data.name.includes("…")
      ? [parsed.data.name]
      : []
  })
}
/** Same app-only part for staging, issue and consumption, so the review body is stable. */
export function whatsAppWorkflowReviewAppOnly(
  input: {
    purpose: "SETUP" | "PRODUCT_CREATE"
    conversationId: string
    origin: { tenantId: string; storeId: string }
    entities: readonly WhatsAppWorkflowDraftView[]
  },
  options: {
    trustedAppOrigin: string
    currentScope: { tenantId: string; storeId: string }
  },
) {
  if (input.purpose !== "SETUP") return undefined
  const moneyAccounts = whatsAppWorkflowAppOnlyMoneyAccounts(
    input.entities,
  ).slice(0, 20)
  if (!moneyAccounts.length) return undefined
  const link = workflowConversationAppLink(input, options)
  return link ? { moneyAccounts, link } : undefined
}
