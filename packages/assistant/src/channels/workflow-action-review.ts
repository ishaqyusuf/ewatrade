import { isExactDecimal } from "@ewatrade/utils/exact-decimal"
import { z } from "zod"
import { generalMoney } from "../general/contracts"
import { readRecordOriginSchema } from "../general/read-record-target"
import {
  productFormSnapshotSchema,
  productRequiresForm,
} from "../product/contracts"
import {
  WHATSAPP_PRODUCT_WORKFLOW_LIMIT,
  deriveSetupEntityState,
  isProductWorkflowDraftKey,
  setupEntityPayloadSchema,
  setupOpenQuestionSchema,
} from "../setup/contracts"
import { setupProductVariants } from "../setup/variants"
import {
  WHATSAPP_ACTION_INSTRUCTION_RESERVE_UNITS,
  WHATSAPP_ACTION_REVIEW_MAX_UNITS,
  parseWhatsAppTypedAction,
  whatsAppActionCodeSchema,
} from "./action-review"
import { whatsAppPlainText } from "./render"
import {
  WHATSAPP_WORKFLOW_ACTION_MAX_SELECTION,
  whatsAppProductChatShape,
  whatsAppWorkflowPurposeSchema,
} from "./workflow"
export {
  WHATSAPP_WORKFLOW_ACTION_MAX_SELECTION,
  parseWhatsAppWorkflowReviewSelection,
  whatsAppWorkflowAppOnlyMoneyAccounts,
  whatsAppWorkflowDraftChatReady,
  whatsAppWorkflowReviewAppOnly,
  whatsAppWorkflowReviewSuggestion,
} from "./workflow"

export const WHATSAPP_WORKFLOW_ACTION_REVIEW_VERSION =
  "whatsapp-workflow-action-review-v4"
const id = z.string().min(1).max(128)
const key = z.string().min(1).max(140)
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const readyState = z.enum(["PROPOSED", "CONFIRMED"])
const selectedSource = z
  .object({
    entityId: id,
    key,
    payloadHash: hash,
    commandHash: hash,
    state: readyState,
  })
  .strict()
const sourceBase = z
  .object({
    version: z.literal("workflow-action-v1"),
    conversationId: id,
    draftId: id,
    origin: readRecordOriginSchema,
    draftRevision: z.number().int().nonnegative(),
    selection: z
      .array(selectedSource)
      .min(1)
      .max(WHATSAPP_WORKFLOW_ACTION_MAX_SELECTION),
  })
  .strict()
/** Server-created immutable source reference; no approval token or raw action code. */
export const whatsAppWorkflowActionSourceSchema = z
  .discriminatedUnion("purpose", [
    sourceBase.extend({
      purpose: z.literal("SETUP"),
      workflowContextHash: z.null(),
    }),
    sourceBase.extend({
      purpose: z.literal("PRODUCT_CREATE"),
      workflowContextHash: hash,
    }),
  ])
  .superRefine((source, context) => {
    if (
      new Set(source.selection.map((entry) => entry.key)).size !==
        source.selection.length ||
      new Set(source.selection.map((entry) => entry.entityId)).size !==
        source.selection.length
    )
      context.addIssue({
        code: "custom",
        message: "Choose distinct exact saved records.",
      })
    if (
      source.purpose === "PRODUCT_CREATE" &&
      (source.selection.length > WHATSAPP_PRODUCT_WORKFLOW_LIMIT ||
        source.selection.some((entry) => !isProductWorkflowDraftKey(entry.key)))
    )
      context.addIssue({
        code: "custom",
        message: "Product mode reviews up to three saved products.",
      })
  })
export type WhatsAppWorkflowActionSource = z.infer<
  typeof whatsAppWorkflowActionSourceSchema
>
export const whatsAppWorkflowActionReviewSchema = z
  .object({
    source: whatsAppWorkflowActionSourceSchema,
    businessName: z.string().min(1).max(300),
    storeName: z.string().min(1).max(300),
    currencyCode: z.string().length(3),
    expiresAt: z.iso.datetime(),
    /** Canonical actual snapshot is required for PRODUCT_CREATE; richer details stay app-review. */
    productSnapshot: productFormSnapshotSchema.optional(),
    /**
     * Setup money accounts are never confirmed from chat. The review only names the
     * draft's open accounts and links the exact saved workflow where they are confirmed.
     */
    appOnly: z
      .object({
        moneyAccounts: z.array(z.string().min(1).max(160)).min(1).max(20),
        link: z.url().max(2000),
      })
      .strict()
      .optional(),
    records: z
      .array(
        selectedSource
          .extend({
            payload: setupEntityPayloadSchema,
            openQuestions: z.array(setupOpenQuestionSchema).max(40),
            errorCode: z.string().nullable(),
            committedRecordId: z.string().nullable(),
            /** Actual category label from the canonical prepared command, never a model label. */
            categoryLabel: z.string().min(1).max(400).optional(),
            /**
             * Product photo the owner sent: "added" when the private Catalog copy is
             * bound to the reviewed command, "skipped" when it cannot be added.
             */
            photo: z.enum(["added", "skipped"]).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(WHATSAPP_WORKFLOW_ACTION_MAX_SELECTION),
  })
  .strict()
export type WhatsAppWorkflowActionReview = z.infer<
  typeof whatsAppWorkflowActionReviewSchema
>
export type WhatsAppWorkflowActionCommand =
  | {
      kind: "workflow_action"
      purpose: "SETUP" | "PRODUCT_CREATE"
      decision: "confirm" | "cancel"
      code: string
      replyToMessageId: string
    }
  | { kind: "invalid_workflow_action" }
const modePurpose = (mode: string) =>
  mode.toLowerCase() === "setup"
    ? ("SETUP" as const)
    : ("PRODUCT_CREATE" as const)
const purposeMode = (purpose: "SETUP" | "PRODUCT_CREATE") =>
  purpose === "SETUP" ? "setup" : "product"

/** Parse before the generic action guard. Bare yes/proceed never becomes workflow approval. */
export function parseWhatsAppTypedWorkflowAction(
  text: string | undefined,
  replyToMessageId?: string,
): WhatsAppWorkflowActionCommand | null {
  const value = text?.trim()
  if (
    !value ||
    !/^\/?(?:confirm|cancel)\s+(?:setup|product)(?:\b|[.!?:])/i.test(value)
  )
    return null
  const match = /^(Confirm|Cancel) (setup|product) ([A-Za-z0-9_-]{43})$/i.exec(
    value,
  )
  if (!match) {
    const draftRequest =
      /^cancel (setup|product) draft(?: ([\p{L}\p{N}][^\r\n]{0,139}))?$/iu.exec(
        value,
      )
    const codeLikeLabel =
      /(?:^|[\s:])(?:[A-Za-z0-9_+/=-]{20,}|\d{6,})(?=$|[\s.!?:])/.test(
        draftRequest?.[2] ?? "",
      )
    if (
      draftRequest &&
      !codeLikeLabel &&
      !parseWhatsAppTypedAction(value) &&
      whatsAppPlainText(value) === value
    )
      return null
    return { kind: "invalid_workflow_action" }
  }
  const common = parseWhatsAppTypedAction(
    `${match[1]} ${match[3]}`,
    replyToMessageId,
  )
  return common?.kind === "action"
    ? {
        ...common,
        kind: "workflow_action",
        purpose: modePurpose(match[2] ?? ""),
      }
    : { kind: "invalid_workflow_action" }
}
export function whatsAppWorkflowActionButtonId(
  purpose: "SETUP" | "PRODUCT_CREATE",
  code: string,
  decision: "confirm" | "cancel",
) {
  whatsAppWorkflowPurposeSchema.parse(purpose)
  return `ewa-wa-workflow-v1:${purposeMode(purpose)}:${whatsAppActionCodeSchema.parse(code)}:${z.enum(["confirm", "cancel"]).parse(decision)}`
}
export function parseWhatsAppWorkflowActionButton(
  value: string | undefined,
  replyToMessageId?: string,
): WhatsAppWorkflowActionCommand | null {
  if (!value || !/^ewa-wa-workflow/i.test(value)) return null
  const match =
    /^ewa-wa-workflow-v1:(setup|product):([A-Za-z0-9_-]{43}):(confirm|cancel)$/.exec(
      value,
    )
  return match
    ? parseWhatsAppTypedWorkflowAction(
        `${match[3]} ${match[1]} ${match[2]}`,
        replyToMessageId,
      )
    : { kind: "invalid_workflow_action" }
}

/**
 * Photo cards: before a Product review, each sent photo comes back to the owner
 * with its product's lines as the caption, so the mapping is seen, not described.
 * Outbox rows of this kind hold only the attachment id and caption.
 */
export const WHATSAPP_PRODUCT_PHOTO_KIND = "workflow_product_photo"
export const whatsAppProductPhotoContentSchema = z
  .object({
    attachmentId: z.string().min(1).max(64),
    caption: z.string().min(1).max(1024),
  })
  .strict()
/** One caption per reviewed product whose sent photo will be saved with it. */
export function whatsAppProductPhotoCards(
  review: WhatsAppWorkflowActionReview,
) {
  if (review.source.purpose !== "PRODUCT_CREATE") return []
  const numbered = review.records.length > 1
  return review.records.flatMap((record, index) => {
    const attachmentId =
      record.payload.kind === "product"
        ? record.payload.photoAttachmentId
        : undefined
    if (!attachmentId || record.photo !== "added") return []
    const lines = productRecordLines(
      record,
      review.currencyCode,
      numbered ? index + 1 : null,
    )
    const caption = lines?.join("\n")
    return caption && caption.length <= 1024 ? [{ attachmentId, caption }] : []
  })
}

export type WhatsAppWorkflowRenderedActionReview =
  | {
      kind: "review"
      version: typeof WHATSAPP_WORKFLOW_ACTION_REVIEW_VERSION
      source: WhatsAppWorkflowActionSource
      body: string
    }
  | {
      kind: "app_review"
      version: typeof WHATSAPP_WORKFLOW_ACTION_REVIEW_VERSION
      body: string
    }
const appReview = (): WhatsAppWorkflowRenderedActionReview => ({
  kind: "app_review",
  version: WHATSAPP_WORKFLOW_ACTION_REVIEW_VERSION,
  body: "Open this exact saved workflow in EwaTrade to review and add its records. No WhatsApp workflow confirmation is available for this selection.",
})
function exact(value: string) {
  return !value.includes("…") && whatsAppPlainText(value) === value
}
/** WhatsApp emphasis only around text that cannot break or inject its own markers. */
function mark(value: string, marker: "*" | "_") {
  return /[*_~`]/.test(value) ? value : `${marker}${value}${marker}`
}
/** Whole amounts drop ".00" (₦8,900); any other amount keeps its exact minor units. */
function reviewMoney(minor: number, currency: string) {
  const text = generalMoney(minor, currency)
  return Number.isInteger(minor) && minor % 100 === 0
    ? text.replace(/\.00$/, "")
    : text
}
const usageLabel = {
  FOR_SALE: null,
  INTERNAL_USE: "Shop use only, not for sale",
  BOTH: "For sale and shop use",
} as const
function simpleRecordLines(
  record: WhatsAppWorkflowActionReview["records"][number],
  currency: string,
  number: number | null,
) {
  const payload = record.payload
  if (
    record.errorCode ||
    record.committedRecordId ||
    record.openQuestions.some((question) => question.required) ||
    deriveSetupEntityState(payload, record.openQuestions).state !== "PROPOSED"
  )
    return null
  if (
    payload.kind === "money_account" ||
    (payload.kind === "customer" && payload.opening)
  )
    return null
  const facts: string[] = []
  const details: string[] = []
  if (payload.kind === "product" || payload.kind === "service") {
    if (
      payload.illustrationId ||
      (payload.categoryKey && !record.categoryLabel)
    )
      return null
  }
  if (payload.kind === "product") {
    if (
      payload.photoAttachmentId ||
      payload.options?.length ||
      payload.variants?.length ||
      payload.sellingUnits?.length ||
      (payload.openingStock !== undefined &&
        (!isExactDecimal(payload.openingStock, { maxScale: 2 }) ||
          payload.openingStock.startsWith("-")))
    )
      return null
    // The price names the counting unit once; stock repeats it only when no price does.
    facts.push(
      payload.priceMinor === undefined
        ? "no selling price"
        : `${reviewMoney(payload.priceMinor, currency)} per ${payload.unitName}`,
      payload.openingStock === undefined
        ? "no opening stock"
        : payload.priceMinor === undefined
          ? `${payload.openingStock} ${payload.unitName} in stock`
          : `${payload.openingStock} in stock`,
    )
    const usage = usageLabel[payload.usage ?? "FOR_SALE"]
    if (usage) details.push(usage)
  } else if (payload.kind === "service") {
    if (payload.pricing === "quote" && payload.priceMinor !== undefined)
      return null
    facts.push(
      "service",
      payload.pricing === "quote"
        ? "priced per job"
        : `${reviewMoney(payload.priceMinor ?? 0, currency)} fixed price`,
    )
  } else
    facts.push(
      "customer",
      payload.phone ?? "no phone",
      payload.email ?? "no email",
    )
  if (
    (payload.kind === "product" || payload.kind === "service") &&
    record.categoryLabel
  )
    details.push(`Category: ${record.categoryLabel}`)
  if (
    (payload.kind === "product" || payload.kind === "service") &&
    payload.description
  )
    details.push(`Description: ${payload.description}`)
  for (const question of record.openQuestions)
    details.push(`Optional, later: ${question.question}`)
  const lines = [
    `${number === null ? "" : `${number}. `}${mark(payload.name, "*")} · ${facts.join(" · ")}`,
    ...details.map((line) => `- ${line}`),
  ]
  return lines.every(exact) ? lines : null
}
/** Options, packs and the sent photo of a WhatsApp Product draft, one row per option. */
function productRecordLines(
  record: WhatsAppWorkflowActionReview["records"][number],
  currency: string,
  number: number | null,
) {
  const payload = record.payload
  if (
    payload.kind !== "product" ||
    record.errorCode ||
    record.committedRecordId ||
    record.openQuestions.some((question) => question.required) ||
    deriveSetupEntityState(payload, record.openQuestions).state !==
      "PROPOSED" ||
    !whatsAppProductChatShape(payload) ||
    (payload.categoryKey && !record.categoryLabel) ||
    Boolean(payload.photoAttachmentId) !== Boolean(record.photo)
  )
    return null
  const unit = payload.unitName
  const price = (minor: number | undefined, per: string) =>
    minor === undefined ? null : `${reviewMoney(minor, currency)} per ${per}`
  const packs = (
    rows: Array<{
      name: string
      containsQuantity: string
      priceMinor?: number
    }>,
  ) =>
    rows.map((pack) =>
      pack.priceMinor === undefined
        ? `${pack.name} of ${pack.containsQuantity} ${unit}, no price`
        : `${reviewMoney(pack.priceMinor, currency)} per ${pack.name} of ${pack.containsQuantity}`,
    )
  // The price names the counting unit once; stock repeats it only when no price does.
  const stock = (value: string | undefined, priceMinor: number | undefined) =>
    value === undefined
      ? "no opening stock"
      : priceMinor === undefined
        ? `${value} ${unit} in stock`
        : `${value} in stock`
  const photo =
    record.photo === "added"
      ? "with your photo"
      : record.photo === "skipped"
        ? "photo can't be added here"
        : null
  const head = `${number === null ? "" : `${number}. `}${mark(payload.name, "*")}`
  const lines: string[] = []
  const options = payload.options?.length || payload.variants?.length
  const [single] = setupProductVariants(payload)
  if (!options)
    lines.push(
      [
        head,
        price(payload.priceMinor, unit) ?? "no selling price",
        ...packs(single?.sellingUnits ?? []),
        stock(payload.openingStock, payload.priceMinor),
        photo,
      ]
        .filter(Boolean)
        .join(" · "),
    )
  else {
    lines.push([head, photo].filter(Boolean).join(" · "))
    for (const row of setupProductVariants(payload))
      lines.push(
        `- ${[
          row.label,
          price(row.priceMinor, unit) ?? "no selling price",
          ...packs(row.sellingUnits),
          stock(row.openingStock, row.priceMinor),
        ].join(" · ")}`,
      )
  }
  const usage = usageLabel[payload.usage ?? "FOR_SALE"]
  if (usage) lines.push(`- ${usage}`)
  if (record.categoryLabel) lines.push(`- Category: ${record.categoryLabel}`)
  if (payload.description) lines.push(`- Description: ${payload.description}`)
  for (const question of record.openQuestions)
    lines.push(`- Optional, later: ${question.question}`)
  return lines.every(exact) ? lines : null
}
const kindNoun = {
  product: "product",
  service: "service",
  customer: "customer",
  money_account: "account",
} as const
function reviewHeader(review: WhatsAppWorkflowActionReview) {
  const kinds = new Set(review.records.map((record) => record.payload.kind))
  const [only] = kinds
  const noun =
    review.source.purpose === "PRODUCT_CREATE"
      ? "product"
      : kinds.size === 1 && only
        ? kindNoun[only]
        : "setup"
  const count = review.records.length
  return count === 1
    ? `🧾 *${noun[0]?.toUpperCase()}${noun.slice(1)} draft*`
    : `🧾 *${count} ${noun} drafts*`
}
function expiryLabel(expiresAt: string) {
  const at = new Date(expiresAt)
  return `${String(at.getUTCHours()).padStart(2, "0")}:${String(at.getUTCMinutes()).padStart(2, "0")} UTC`
}

/** Only canonical complete supported selections render. Hash computation and authority remain server-owned. */
export function renderWhatsAppWorkflowActionReviewBody(
  input: unknown,
  options: { now?: number; maxUnits?: number } = {},
): WhatsAppWorkflowRenderedActionReview {
  const parsed = whatsAppWorkflowActionReviewSchema.safeParse(input)
  const now = options.now ?? Date.now()
  const max = options.maxUnits ?? WHATSAPP_ACTION_REVIEW_MAX_UNITS
  if (
    !parsed.success ||
    !Number.isFinite(now) ||
    !Number.isInteger(max) ||
    max > WHATSAPP_ACTION_REVIEW_MAX_UNITS ||
    max <= WHATSAPP_ACTION_INSTRUCTION_RESERVE_UNITS
  )
    return appReview()
  const review = parsed.data
  if (
    Date.parse(review.expiresAt) <= now ||
    review.records.length !== review.source.selection.length
  )
    return appReview()
  if (review.source.purpose === "PRODUCT_CREATE") {
    const snapshot = review.productSnapshot
    if (
      !snapshot ||
      review.appOnly ||
      snapshot.storeId !== review.source.origin.storeId ||
      productRequiresForm(snapshot) ||
      snapshot.photoAssetIds.length ||
      snapshot.illustrationId ||
      review.records.some(
        (record) =>
          record.payload.kind !== "product" ||
          (snapshot.category && !record.categoryLabel),
      )
    )
      return appReview()
  } else if (review.productSnapshot) return appReview()
  const numbered = review.records.length > 1
  const lines = [reviewHeader(review)]
  for (const [index, record] of review.records.entries()) {
    const source = review.source.selection[index]
    if (
      !source ||
      source.entityId !== record.entityId ||
      source.key !== record.key ||
      source.payloadHash !== record.payloadHash ||
      source.commandHash !== record.commandHash ||
      source.state !== record.state
    )
      return appReview()
    const facts =
      review.source.purpose === "PRODUCT_CREATE"
        ? productRecordLines(
            record,
            review.currencyCode,
            numbered ? index + 1 : null,
          )
        : record.photo
          ? null
          : simpleRecordLines(
              record,
              review.currencyCode,
              numbered ? index + 1 : null,
            )
    if (!facts) return appReview()
    lines.push(...facts)
  }
  const stocked = review.records.some(
    (record) =>
      record.payload.kind === "product" &&
      record.payload.openingStock !== undefined,
  )
  lines.push(
    "",
    `${review.businessName} · ${review.storeName}`,
    mark(
      [
        stocked ? `Stock goes to ${review.storeName}.` : null,
        review.source.purpose === "SETUP"
          ? `Only ${numbered ? `these ${review.records.length}` : "this one"} will be saved; other drafts stay as drafts.`
          : null,
        "Nothing is saved until you confirm.",
      ]
        .filter(Boolean)
        .join(" "),
      "_",
    ),
    `_To change ${numbered ? "one" : "it"}, send the fix by name. This review expires ${expiryLabel(review.expiresAt)}._`,
  )
  if (review.appOnly)
    lines.push(
      "",
      `Money accounts: ${review.appOnly.moneyAccounts.join(", ")} — confirm these in EwaTrade`,
    )
  if (!lines.every(exact)) return appReview()
  // The link is checked as a URL above; plain-text cleaning would omit it.
  const body = review.appOnly
    ? `${lines.join("\n")}\n${review.appOnly.link}`
    : lines.join("\n")
  return body.length <= max - WHATSAPP_ACTION_INSTRUCTION_RESERVE_UNITS
    ? {
        kind: "review",
        version: WHATSAPP_WORKFLOW_ACTION_REVIEW_VERSION,
        source: review.source,
        body,
      }
    : appReview()
}
/** Reply-button titles (each at most 20 characters); the ids carry the exact proof. */
export function whatsAppWorkflowActionButtonTitles(
  source: WhatsAppWorkflowActionSource,
) {
  const count = source.selection.length
  return {
    confirm:
      count > 1
        ? `Save all ${count}`
        : source.purpose === "PRODUCT_CREATE"
          ? "Save product"
          : "Save",
    cancel: "Cancel",
  }
}
/** Dispatch-only memory: persist the body/source above, never these raw codes or instructions. */
export function appendWhatsAppWorkflowActionInstructions(
  review: WhatsAppWorkflowRenderedActionReview,
  codes: { confirmCode: string; cancelCode: string },
): WhatsAppWorkflowRenderedActionReview {
  if (
    review.kind !== "review" ||
    !whatsAppActionCodeSchema.safeParse(codes.confirmCode).success ||
    !whatsAppActionCodeSchema.safeParse(codes.cancelCode).success ||
    codes.confirmCode === codes.cancelCode
  )
    return appReview()
  const mode = purposeMode(review.source.purpose)
  const body = `${review.body}\n\nTo save, reply to this message with \`Confirm ${mode} ${codes.confirmCode}\`. To cancel, reply \`Cancel ${mode} ${codes.cancelCode}\`.`
  return body.length <= WHATSAPP_ACTION_REVIEW_MAX_UNITS
    ? { ...review, body }
    : appReview()
}
