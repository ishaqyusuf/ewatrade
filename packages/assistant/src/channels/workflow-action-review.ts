import { isExactDecimal } from "@ewatrade/utils/exact-decimal"
import { z } from "zod"
import { generalMoney } from "../general/contracts"
import { readRecordOriginSchema } from "../general/read-record-target"
import {
  productCreationReady,
  productFormSnapshotSchema,
  productRequiresForm,
} from "../product/contracts"
import {
  deriveSetupEntityState,
  setupEntityPayloadSchema,
  setupOpenQuestionSchema,
} from "../setup/contracts"
import {
  WHATSAPP_ACTION_INSTRUCTION_RESERVE_UNITS,
  WHATSAPP_ACTION_REVIEW_MAX_UNITS,
  parseWhatsAppTypedAction,
  whatsAppActionCodeSchema,
} from "./action-review"
import { whatsAppPlainText } from "./render"
import { whatsAppWorkflowPurposeSchema } from "./workflow"

export const WHATSAPP_WORKFLOW_ACTION_REVIEW_VERSION =
  "whatsapp-workflow-action-review-v2"
export const WHATSAPP_WORKFLOW_ACTION_MAX_SELECTION = 3
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
      (source.selection.length !== 1 || source.selection[0]?.key !== "product")
    )
      context.addIssue({
        code: "custom",
        message: "Product mode reviews one saved product.",
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
      snapshot.storeId !== review.source.origin.storeId ||
      productRequiresForm(snapshot) ||
      snapshot.photoAssetIds.length ||
      snapshot.illustrationId ||
      !productCreationReady(review.records[0]?.payload, snapshot) ||
      review.records[0]?.payload.kind !== "product" ||
      (snapshot.category && !review.records[0].categoryLabel)
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
    const facts = simpleRecordLines(
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
  if (!lines.every(exact)) return appReview()
  const body = lines.join("\n")
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
      source.purpose === "PRODUCT_CREATE"
        ? "Save product"
        : count > 1
          ? `Save all ${count}`
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
