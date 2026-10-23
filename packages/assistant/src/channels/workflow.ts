import { z } from "zod"
import { generalMoney } from "../general/contracts"
import { readRecordOriginSchema } from "../general/read-record-target"
import {
  setupEntityPayloadSchema,
  setupOpenQuestionSchema,
} from "../setup/contracts"
import { trustedAssistantAppOrigin } from "./conversation-links"
import { chunkWhatsAppFormattedReply, whatsAppModelText } from "./presentation"
import { chunkWhatsAppReply, whatsAppPlainText } from "./render"

export const WHATSAPP_WORKFLOW_RENDER_VERSION = "whatsapp-workflow-v2"
export const WHATSAPP_WORKFLOW_LEGACY_RENDER_VERSION = "whatsapp-workflow-v1"
export const whatsAppWorkflowPurposeSchema = z.enum(["SETUP", "PRODUCT_CREATE"])
export type WhatsAppWorkflowPurpose = z.infer<
  typeof whatsAppWorkflowPurposeSchema
>
type Environment = Readonly<Record<string, string | undefined>>
export function whatsAppWorkflowPolicy(env: Environment = process.env) {
  const localSource = env.APP_ENV === "local" && env.NODE_ENV !== "production"
  return {
    version: "whatsapp-workflow-policy-v1",
    localSource,
    setup: localSource && env.ASSISTANT_WHATSAPP_SETUP_ENABLED === "true",
    product: localSource && env.ASSISTANT_WHATSAPP_PRODUCT_ENABLED === "true",
    nativeWrites:
      localSource && env.ASSISTANT_WHATSAPP_WORKFLOW_WRITES_ENABLED === "true",
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

const id = z.string().min(1).max(128)
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
  version:
    | typeof WHATSAPP_WORKFLOW_RENDER_VERSION
    | typeof WHATSAPP_WORKFLOW_LEGACY_RENDER_VERSION
  kind: "reply" | "app_review"
  chunks: string[]
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
      lines.push("Saved product photo: review the original in EwaTrade.")
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
    rendererVersion?:
      | typeof WHATSAPP_WORKFLOW_RENDER_VERSION
      | typeof WHATSAPP_WORKFLOW_LEGACY_RENDER_VERSION
  },
): WhatsAppWorkflowRenderedReply {
  const version = options.rendererVersion ?? WHATSAPP_WORKFLOW_RENDER_VERSION
  const legacy = version === WHATSAPP_WORKFLOW_LEGACY_RENDER_VERSION
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
      (reply.entities.length > 1 ||
        reply.entities.some(
          (entity) => entity.key !== "product" || entity.kind !== "PRODUCT",
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
  const lines = [
    options.scopeLabel,
    `${reply.purpose === "SETUP" ? "Setup" : "Product"} draft revision: ${reply.revision}`,
  ]
  if (narration.length) lines.push("Assistant draft guidance:", ...narration)
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
    const page = request?.kind === "list" ? request.page : 1
    const start = (page - 1) * 4
    const selected = reply.entities.slice(start, start + 4)
    lines.push(
      selected.length
        ? `Saved drafts · page ${page}:`
        : reply.entities.length
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
    if (start + 4 < reply.entities.length)
      lines.push(`More saved drafts: Draft list page ${page + 1}`)
  }
  if (reply.requiresForm)
    lines.push(
      "This product retains richer form details. Continue its exact form in EwaTrade.",
    )
  lines.push(
    "To request an exact review: Review draft <draft key>, or Review drafts <key1>, <key2>, <key3> for up to three selected Setup drafts. Send missing or corrected details to update the saved draft. Setup can skip an area when you ask.",
    "If WhatsApp returns a complete confirmation review with its own instructions, reply to that exact message using its Confirm or Cancel command and code. A draft summary, yes or proceed never confirms anything. If no confirmation review is issued, continue in the exact saved workflow in EwaTrade. Rich or incomplete records, failed additions, retries and partial-success follow-up require app review.",
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
    }
  } catch {
    return fallback(link)
  }
}
