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
  "whatsapp-workflow-action-review-v1"
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
function simpleRecordLines(
  record: WhatsAppWorkflowActionReview["records"][number],
  currency: string,
) {
  const payload = record.payload
  if (
    record.errorCode ||
    record.committedRecordId ||
    record.openQuestions.some((question) => question.required) ||
    deriveSetupEntityState(payload, record.openQuestions).state !== "PROPOSED"
  )
    return null
  const lines = [
    `Draft key: ${record.key}`,
    `Add ${payload.kind}: ${payload.name}`,
  ]
  if (
    payload.kind === "money_account" ||
    (payload.kind === "customer" && payload.opening)
  )
    return null
  if (payload.kind === "product" || payload.kind === "service") {
    if (
      payload.illustrationId ||
      (payload.categoryKey && !record.categoryLabel)
    )
      return null
    if (record.categoryLabel) lines.push(`Category: ${record.categoryLabel}`)
    if (payload.description) lines.push(`Description: ${payload.description}`)
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
    lines.push(
      `Use: ${payload.usage ?? "FOR_SALE"}`,
      `Counting unit: ${payload.unitName}`,
      `Price per ${payload.unitName}: ${payload.priceMinor === undefined ? "Not sold; no selling price" : generalMoney(payload.priceMinor, currency)}`,
      payload.openingStock === undefined
        ? "Opening stock: not supplied; no opening stock entry requested"
        : `Opening stock: ${payload.openingStock} ${payload.unitName}`,
      "One product with one counting unit; stock is recorded only as shown.",
    )
  } else if (payload.kind === "service") {
    if (payload.pricing === "quote" && payload.priceMinor !== undefined)
      return null
    lines.push(
      payload.pricing === "quote"
        ? "Price: quote required for each job"
        : `Fixed price: ${generalMoney(payload.priceMinor ?? 0, currency)}`,
      "Service: no product stock movement.",
    )
  } else {
    lines.push(
      `Phone: ${payload.phone ?? "Not supplied"}`,
      `Email: ${payload.email ?? "Not supplied"}`,
      "Customer directory record only; no opening debt or credit.",
    )
  }
  for (const question of record.openQuestions)
    lines.push(`Optional follow-up: ${question.question}`)
  return lines.every(exact) ? lines : null
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
  const lines = [
    `Add selected ${review.source.purpose === "SETUP" ? "Setup records" : "product"}`,
    `Business: ${review.businessName}`,
    `Store: ${review.storeName}`,
    `Draft revision: ${review.source.draftRevision}`,
    `Currency: ${review.currencyCode}`,
    `Selected records: ${review.records.length}`,
  ]
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
    const facts = simpleRecordLines(record, review.currencyCode)
    if (!facts) return appReview()
    lines.push(...facts)
  }
  lines.push(
    "Only the exact listed records are selected. Other drafts will not be added. Confirmation records business data; it does not send or collect money.",
    `Review expires: ${review.expiresAt} (UTC).`,
  )
  if (!lines.every(exact)) return appReview()
  const body = lines.join("\n\n")
  return body.length <= max - WHATSAPP_ACTION_INSTRUCTION_RESERVE_UNITS
    ? {
        kind: "review",
        version: WHATSAPP_WORKFLOW_ACTION_REVIEW_VERSION,
        source: review.source,
        body,
      }
    : appReview()
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
  const body = `${review.body}\n\nReply to this review with Confirm ${mode} ${codes.confirmCode} to add only these selected records, or Cancel ${mode} ${codes.cancelCode} to cancel this review.`
  return body.length <= WHATSAPP_ACTION_REVIEW_MAX_UNITS
    ? { ...review, body }
    : appReview()
}
