import { z } from "zod"
import { generalReviewPresentationSchema } from "../general/review-presentation"

export const WHATSAPP_ACTION_REVIEW_VERSION = "whatsapp-action-review-v1"
export const WHATSAPP_ACTION_REVIEW_MAX_UNITS = 3000
export const whatsAppActionCodeSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/)
export const whatsAppProposalSourceSchema = z
  .object({
    proposalId: z.string().min(1).max(128),
    revision: z.number().int().positive(),
    payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
export type WhatsAppProposalSource = z.infer<
  typeof whatsAppProposalSourceSchema
>

/** Server-authorized complete review facts only; never a model result or app approval DTO. */
export const whatsAppActionReviewSchema = z
  .object({
    source: whatsAppProposalSourceSchema,
    title: z.string().min(1).max(160),
    businessName: z.string().min(1).max(300),
    storeName: z.string().min(1).max(300),
    reviewLines: z.array(z.string().min(1).max(2000)).min(1).max(80),
    presentation: generalReviewPresentationSchema.optional(),
    complete: z.boolean(),
    requiresPresentation: z.boolean(),
    expiresAt: z.string().datetime(),
  })
  .strict()
export type WhatsAppActionReview = z.infer<typeof whatsAppActionReviewSchema>
export type WhatsAppActionDecision = "confirm" | "cancel"
export type WhatsAppActionCommand =
  | {
      kind: "action"
      decision: WhatsAppActionDecision
      code: string
      replyToMessageId: string
    }
  | { kind: "invalid_action" }

function quotedReplyId(value: string | undefined) {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    value.trim() === value &&
    [...value].every((point) => {
      const code = point.codePointAt(0) ?? 0
      return code >= 33 && code !== 127
    })
    ? value
    : null
}
/** Reserve approvals and proof-like input; descriptive business edits still reach canonical draft tools. */
export function parseWhatsAppTypedAction(
  text: string | undefined,
  replyToMessageId?: string,
): WhatsAppActionCommand | null {
  const value = text?.trim()
  if (!value) return null
  const match = /^(Confirm|Cancel) ([A-Za-z0-9_-]{43})$/i.exec(value)
  if (!match) {
    const confirmIntent = /^\/?confirm(?:\b|[.!?:])/i.test(value)
    const bareApproval =
      /^\/?(?:cancel|proceed|yes|save|edit)(?:[.!?:]+)?$/i.test(value)
    const shortApproval =
      /^\/?(?:cancel|proceed|yes|save|edit)(?:\s+(?:it|this|that|please|now)){1,3}[.!?]*$/i.test(
        value,
      )
    const proofLike =
      /[A-Za-z0-9_+/=-]{40,}/.test(value) ||
      /\bewa-wa-(?:action|workflow|voice)(?:-|:)/i.test(value) ||
      /^\/?(?:cancel|proceed|yes|save|edit)\s+(?:[A-Za-z0-9_+/=-]{20,}|\d{6,})(?:\s|[.!?:]|$)/i.test(
        value,
      )
    return confirmIntent || bareApproval || shortApproval || proofLike
      ? { kind: "invalid_action" }
      : null
  }
  const quoted = quotedReplyId(replyToMessageId)
  if (!quoted || !whatsAppActionCodeSchema.safeParse(match[2]).success)
    return { kind: "invalid_action" }
  return {
    kind: "action",
    decision: match[1]?.toLowerCase() as WhatsAppActionDecision,
    code: match[2] ?? "",
    replyToMessageId: quoted,
  }
}
export function whatsAppActionButtonId(
  code: string,
  decision: WhatsAppActionDecision,
) {
  return `ewa-wa-action-v1:${whatsAppActionCodeSchema.parse(code)}:${z.enum(["confirm", "cancel"]).parse(decision)}`
}
/** Sender/binding/proposal/expiry authority is revalidated by the owning transaction, not this parser. */
export function parseWhatsAppActionButton(
  value: string | undefined,
  replyToMessageId?: string,
): WhatsAppActionCommand | null {
  if (!value) return null
  if (!/^ewa-wa-action/i.test(value)) return null
  const match = /^ewa-wa-action-v1:([A-Za-z0-9_-]{43}):(confirm|cancel)$/.exec(
    value,
  )
  const quoted = quotedReplyId(replyToMessageId)
  if (!match || !quoted) return { kind: "invalid_action" }
  return {
    kind: "action",
    decision: match[2] as WhatsAppActionDecision,
    code: match[1] ?? "",
    replyToMessageId: quoted,
  }
}
function exactPlainText(value: string) {
  // Never silently alter material facts to fit the channel. Existing clipped display facts need app review.
  return (
    !value.includes("…") &&
    !/https?:\/\/|www\.|\]\(|```/i.test(value) &&
    [...value].every((point) => {
      const code = point.codePointAt(0) ?? 0
      return (
        code === 9 ||
        code === 10 ||
        code === 13 ||
        (code >= 32 &&
          code !== 127 &&
          !(code >= 0x202a && code <= 0x202e) &&
          !(code >= 0x2066 && code <= 0x2069))
      )
    })
  )
}
function presentationLines(
  presentation: NonNullable<WhatsAppActionReview["presentation"]>,
) {
  const output = [presentation.summary.party]
  if (presentation.summary.context) output.push(presentation.summary.context)
  if (presentation.summary.amount)
    output.push(
      `${presentation.summary.amountLabel ? `${presentation.summary.amountLabel}: ` : ""}${presentation.summary.amount}`,
    )
  for (const fact of presentation.facts ?? [])
    output.push(`${fact.label ? `${fact.label}: ` : ""}${fact.value}`)
  if (presentation.table) {
    const table = presentation.table
    // A malformed row can otherwise relabel money/units by shifting columns.
    if (table.rows.some((row) => row.cells.length !== table.columns.length))
      return null
    for (const [index, row] of table.rows.entries()) {
      output.push(
        `${index + 1}. ${row.cells.map((cell, column) => `${table.columns[column]?.label}: ${cell}`).join(" · ")}`,
      )
      if (row.detail) output.push(row.detail)
    }
    if (table.total) output.push(`${table.total.label}: ${table.total.value}`)
  }
  for (const section of presentation.sections ?? []) {
    output.push(section.title)
    if (section.summary) output.push(section.summary)
    for (const row of section.rows ?? []) {
      output.push(`${row.label}: ${row.value}`)
      if (row.detail) output.push(row.detail)
    }
    for (const chip of section.chips ?? [])
      output.push(`${chip.label}${chip.isNew ? " (new)" : ""}`)
    if (section.note) output.push(section.note)
  }
  if (presentation.note) output.push(presentation.note)
  return output
}
export type WhatsAppRenderedActionReview =
  | {
      kind: "review"
      version: typeof WHATSAPP_ACTION_REVIEW_VERSION
      body: string
      source: WhatsAppProposalSource
    }
  | {
      kind: "app_review"
      version: typeof WHATSAPP_ACTION_REVIEW_VERSION
      body: string
    }
const appReview = (): WhatsAppRenderedActionReview => ({
  kind: "app_review",
  version: WHATSAPP_ACTION_REVIEW_VERSION,
  body: "Open this exact saved draft in EwaTrade to review its complete details. No WhatsApp confirmation is available for this review.",
})

export const WHATSAPP_ACTION_INSTRUCTION_RESERVE_UNITS = 500

/** Token-free canonical body: safe for the immutable outbox; dispatch appends opaque actions. */
export function renderWhatsAppActionReviewBody(
  input: unknown,
  options: { now?: number; maxUnits?: number } = {},
): WhatsAppRenderedActionReview {
  const parsed = whatsAppActionReviewSchema.safeParse(input)
  const max = options.maxUnits ?? WHATSAPP_ACTION_REVIEW_MAX_UNITS
  const now = options.now ?? Date.now()
  if (
    !parsed.success ||
    !Number.isInteger(max) ||
    max <= WHATSAPP_ACTION_INSTRUCTION_RESERVE_UNITS ||
    max > WHATSAPP_ACTION_REVIEW_MAX_UNITS ||
    !Number.isFinite(now)
  )
    return appReview()
  const review = parsed.data
  if (
    !review.complete ||
    (review.requiresPresentation && !review.presentation) ||
    Date.parse(review.expiresAt) <= now
  )
    return appReview()
  const presented = review.presentation
    ? presentationLines(review.presentation)
    : []
  if (!presented) return appReview()
  const facts = [
    review.title,
    `Business: ${review.businessName}`,
    `Store: ${review.storeName}`,
    `Draft revision: ${review.source.revision}`,
    ...presented,
    ...review.reviewLines,
    `Review expires: ${review.expiresAt} (UTC).`,
  ]
  if (facts.some((fact) => !exactPlainText(fact))) return appReview()
  const body = facts.join("\n\n")
  if (body.length > max - WHATSAPP_ACTION_INSTRUCTION_RESERVE_UNITS)
    return appReview()
  return {
    kind: "review",
    version: WHATSAPP_ACTION_REVIEW_VERSION,
    body,
    source: review.source,
  }
}

/** Dispatch-only: raw codes are appended after the token-free outbox has been claimed. */
export function appendWhatsAppActionReviewInstructions(
  review: WhatsAppRenderedActionReview,
  options: { confirmCode: string; cancelCode: string; maxUnits?: number },
): WhatsAppRenderedActionReview {
  if (review.kind !== "review") return review
  const confirm = whatsAppActionCodeSchema.safeParse(options.confirmCode)
  const cancel = whatsAppActionCodeSchema.safeParse(options.cancelCode)
  const max = options.maxUnits ?? WHATSAPP_ACTION_REVIEW_MAX_UNITS
  if (
    !confirm.success ||
    !cancel.success ||
    confirm.data === cancel.data ||
    !Number.isInteger(max) ||
    max <= WHATSAPP_ACTION_INSTRUCTION_RESERVE_UNITS ||
    max > WHATSAPP_ACTION_REVIEW_MAX_UNITS ||
    review.version !== WHATSAPP_ACTION_REVIEW_VERSION ||
    !whatsAppProposalSourceSchema.safeParse(review.source).success ||
    !exactPlainText(review.body)
  )
    return appReview()
  const body = [
    review.body,
    "Nothing changes until you explicitly confirm this exact review.",
    `Reply to this message with Confirm ${confirm.data}`,
    `Or reply Cancel ${cancel.data}`,
    "To edit, open this saved draft in EwaTrade; the edited draft requires a new review.",
  ].join("\n\n")
  if (body.length > max) return appReview()
  return { ...review, body }
}

/** Direct-dispatch compatibility; never persist the returned body with raw action codes. */
export function renderWhatsAppActionReview(
  input: unknown,
  options: {
    confirmCode: string
    cancelCode: string
    now?: number
    maxUnits?: number
  },
): WhatsAppRenderedActionReview {
  return appendWhatsAppActionReviewInstructions(
    renderWhatsAppActionReviewBody(input, options),
    options,
  )
}
