import { z } from "zod"
import { setupAttachmentExtractionSchema } from "../setup/attachments"
import { type GeneralAction, generalActionSchema } from "./contracts"

/** Wire claims only. Parsing or matching these values never grants authority,
 * verifies a human, signs a proposal, or proves a domain fact happened.
 */
const exactId = (max = 128) =>
  z
    .string()
    .min(1)
    .max(max)
    .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/)
const revision = z.number().int().min(1).max(2_147_483_647)
const digest = z.string().regex(/^[a-f0-9]{64}$/)
// Existing stock-count actions admit 500 sources ×48 entries. Preserve both
// quantity/unit field paths and source identity fields rather than clipping them.
export const GENERAL_MEDIA_MAX_REVIEW_FIELDS = 50_000
export const GENERAL_MEDIA_MAX_CITATIONS = 50_000
const quote = z.string().min(1).max(240)
const span = z
  .object({
    start: z.number().int().min(0).max(40_000),
    end: z.number().int().min(1).max(40_000),
  })
  .strict()
  .refine((value) => value.end > value.start && value.end - value.start <= 240)

export const generalMediaOriginSchema = z
  .object({
    actorUserId: exactId(),
    tenantId: exactId(),
    storeId: exactId(),
    conversationId: exactId(),
  })
  .strict()
export const generalMediaLocatorSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("message_span"),
      partIndex: z.number().int().min(0).max(7),
      span,
      quote,
    })
    .strict(),
  z
    .object({
      kind: z.literal("pdf_span"),
      page: z.number().int().min(1).max(20),
      span,
      quote,
    })
    .strict(),
  // Future-context locators, not permission to admit these formats to GENERAL.
  z
    .object({
      kind: z.literal("table_cell"),
      sheetName: z.string().max(120).nullable(),
      row: z.number().int().min(1).max(2_147_483_647),
      column: z.number().int().min(1).max(40),
      quote,
    })
    .strict(),
  z.object({ kind: z.literal("text_span"), span, quote }).strict(),
  z
    .object({
      kind: z.literal("image_line"),
      line: z.number().int().min(1).max(120),
      quote,
    })
    .strict(),
  z.object({ kind: z.literal("transcript_span"), span, quote }).strict(),
  z.object({ kind: z.literal("attachment_presence") }).strict(),
])

export const generalMediaCitationSchema = z
  .object({
    id: exactId(),
    // Existing GENERAL user-message IDs are opaque strings, not token/URL syntax.
    // Keep their exact admitted identity; this field never navigates anywhere.
    messageId: z.string().min(1).max(80),
    locator: generalMediaLocatorSchema,
    artifact: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("message"), textDigest: digest }).strict(),
      z
        .object({
          kind: z.literal("attachment"),
          attachmentId: exactId(64),
          processingGeneration: revision,
          contentDigest: digest,
          extractionDigest: digest,
        })
        .strict(),
    ]),
    certainty: z.enum([
      "not_assessed",
      "source_marked_uncertain",
      "source_clear",
    ]),
    coverage: z.enum(["complete", "partial", "unknown"]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      (value.artifact.kind === "message") !==
      (value.locator.kind === "message_span")
    )
      ctx.addIssue({
        code: "custom",
        message: "Keep the exact source and locator kind.",
      })
    if (
      "span" in value.locator &&
      value.locator.quote.length !==
        value.locator.span.end - value.locator.span.start
    )
      ctx.addIssue({
        code: "custom",
        message: "The quoted UTF-16 span must be exact.",
      })
    if (
      value.locator.kind === "transcript_span" &&
      value.locator.span.end > 8000
    )
      ctx.addIssue({
        code: "custom",
        message: "The stored transcript is bounded to 8000 characters.",
      })
  })
export type GeneralMediaCitation = z.infer<typeof generalMediaCitationSchema>
export type GeneralMediaOrigin = z.infer<typeof generalMediaOriginSchema>

/** A fresh server-resolved snapshot, never client-provided proof. The caller
 * must independently establish current Session/account/chat/Store/source access.
 * Private source text must not be copied into model output or analytics.
 */
export type GeneralMediaCurrentSource = {
  origin: GeneralMediaOrigin
  messageId: string
} & (
  | { kind: "message"; partIndex: number; text: string; textDigest: string }
  | {
      kind: "attachment"
      attachmentId: string
      attachmentKind: "AUDIO" | "PDF" | "IMAGE" | "SPREADSHEET" | "TEXT"
      status: string
      processingGeneration: number
      contentDigest: string
      extractionDigest: string
      retentionUntil: string
      transcript: string | null
      extraction: unknown
    }
)
function sameOrigin(left: GeneralMediaOrigin, right: GeneralMediaOrigin) {
  return (
    left.actorUserId === right.actorUserId &&
    left.tenantId === right.tenantId &&
    left.storeId === right.storeId &&
    left.conversationId === right.conversationId
  )
}
function exactSpan(
  text: string,
  value: { span: { start: number; end: number }; quote: string },
) {
  const { start, end } = value.span
  // Do not let an exact-looking citation split a UTF-16 surrogate pair.
  const splits = (at: number) =>
    at > 0 &&
    at < text.length &&
    /[\uD800-\uDBFF]/.test(text[at - 1] ?? "") &&
    /[\uDC00-\uDFFF]/.test(text[at] ?? "")
  return (
    end <= text.length &&
    !splits(start) &&
    !splits(end) &&
    text.slice(start, end) === value.quote
  )
}
export type GeneralMediaCitationAssessment =
  | {
      status: "source_matches"
      semantic: boolean
      requiresFieldReview: boolean
      coverage: "complete" | "partial" | "unknown"
    }
  | {
      status: "unavailable"
      reason:
        | "scope_changed"
        | "source_changed"
        | "source_expired"
        | "unsupported_general_source"
        | "locator_mismatch"
    }

/** Compare exact current saved data only; this result is NOT approval evidence.
 * Current GENERAL admits AUDIO/PDF semantic sources and IMAGE presence only.
 * CSV/TEXT and image analysis remain unavailable even though locators exist.
 */
export function assessGeneralMediaCitation(
  citation: GeneralMediaCitation,
  source: GeneralMediaCurrentSource,
  origin: GeneralMediaOrigin,
  now: Date,
): GeneralMediaCitationAssessment {
  if (!sameOrigin(source.origin, origin))
    return { status: "unavailable", reason: "scope_changed" }
  if (
    citation.messageId !== source.messageId ||
    citation.artifact.kind !== source.kind
  )
    return { status: "unavailable", reason: "source_changed" }
  const location = citation.locator
  if (source.kind === "message") {
    if (
      citation.artifact.kind !== "message" ||
      citation.artifact.textDigest !== source.textDigest
    )
      return { status: "unavailable", reason: "source_changed" }
    if (
      location.kind !== "message_span" ||
      location.partIndex !== source.partIndex ||
      !exactSpan(source.text, location)
    )
      return { status: "unavailable", reason: "locator_mismatch" }
    return {
      status: "source_matches",
      semantic: true,
      requiresFieldReview: citation.certainty !== "source_clear",
      coverage: "complete",
    }
  }
  if (
    citation.artifact.kind !== "attachment" ||
    citation.artifact.attachmentId !== source.attachmentId ||
    citation.artifact.processingGeneration !== source.processingGeneration ||
    citation.artifact.contentDigest !== source.contentDigest ||
    citation.artifact.extractionDigest !== source.extractionDigest ||
    source.status !== "READY"
  )
    return { status: "unavailable", reason: "source_changed" }
  if (
    !Number.isFinite(now.getTime()) ||
    !Number.isFinite(Date.parse(source.retentionUntil)) ||
    Date.parse(source.retentionUntil) <= now.getTime()
  )
    return { status: "unavailable", reason: "source_expired" }
  if (
    source.attachmentKind === "SPREADSHEET" ||
    source.attachmentKind === "TEXT"
  )
    return { status: "unavailable", reason: "unsupported_general_source" }
  if (location.kind === "attachment_presence")
    return {
      status: "source_matches",
      semantic: false,
      requiresFieldReview: false,
      coverage: "complete",
    }
  if (source.attachmentKind === "IMAGE")
    return { status: "unavailable", reason: "unsupported_general_source" }
  if (source.attachmentKind === "AUDIO") {
    const parsed = setupAttachmentExtractionSchema.safeParse(source.extraction)
    if (
      location.kind !== "transcript_span" ||
      !source.transcript ||
      !parsed.success ||
      parsed.data.type !== "transcript" ||
      !exactSpan(source.transcript, location)
    )
      return { status: "unavailable", reason: "locator_mismatch" }
    // The current processing DTO has no transcript-completeness indicator:
    // it slices provider text at 8000 characters without segment coverage.
    if (citation.coverage !== "unknown")
      return { status: "unavailable", reason: "source_changed" }
    // Current STT contracts report no numeric confidence. Transcript review is
    // always explicit; a candidate's source_clear claim cannot bypass it.
    return {
      status: "source_matches",
      semantic: true,
      requiresFieldReview: true,
      coverage: "unknown",
    }
  }
  const extraction = setupAttachmentExtractionSchema.safeParse(
    source.extraction,
  )
  if (
    source.attachmentKind !== "PDF" ||
    location.kind !== "pdf_span" ||
    !extraction.success ||
    extraction.data.type !== "pages"
  )
    return { status: "unavailable", reason: "locator_mismatch" }
  const pages = extraction.data
  const page = pages.pages.find((page) => page.page === location.page)
  if (
    new Set(pages.pages.map((page) => page.page)).size !== pages.pages.length ||
    pages.pages.some((page) => page.page > pages.totalPages) ||
    !page ||
    !exactSpan(page.text, location)
  )
    return { status: "unavailable", reason: "locator_mismatch" }
  // The actual PDF producer skips unreadable/scanned pages without setting
  // truncated. Absence is not proof that an original page was blank.
  const coverage =
    pages.truncated ||
    pages.pages.length !== pages.totalPages ||
    pages.pages.some((page) => !page.text.trim())
      ? "partial"
      : "complete"
  if (citation.coverage !== coverage)
    return { status: "unavailable", reason: "source_changed" }
  return {
    status: "source_matches",
    semantic: true,
    requiresFieldReview:
      coverage !== "complete" || citation.certainty !== "source_clear",
    coverage,
  }
}

const segment = z.union([
  z
    .string()
    .min(1)
    .max(80)
    .regex(/^[A-Za-z][A-Za-z0-9_]*$/)
    .refine(
      (value) => !["__proto__", "prototype", "constructor"].includes(value),
    ),
  z.number().int().min(0).max(10_000),
])
export const generalMediaFieldPathSchema = z.array(segment).min(1).max(8)
const planRef = z
  .object({ planId: exactId(), revision, stepId: exactId() })
  .strict()
export const generalMediaReviewBindingSchema = z
  .object({
    origin: generalMediaOriginSchema,
    proposalId: exactId(),
    proposalRevision: revision,
    payloadHash: digest,
    target: z
      .object({
        id: z.string().min(1).max(191),
        revision: z.string().min(1).max(500),
      })
      .strict(),
    sourceSetDigest: digest,
    fieldSetDigest: digest,
    plan: planRef.optional(),
  })
  .strict()
const fieldReview = z
  .object({
    id: exactId(),
    path: generalMediaFieldPathSchema,
    valueDigest: digest,
    citationIds: z.array(exactId()).min(1).max(8),
    uncertainty: z.enum(["none", "uncertain", "conflicting", "inferred"]),
  })
  .strict()
function hasField(action: GeneralAction, path: Array<string | number>) {
  let value: unknown = action
  for (const segment of path) {
    if (!value || typeof value !== "object") return false
    const property = Object.getOwnPropertyDescriptor(value, String(segment))
    if (!property || !("value" in property)) return false
    value = property.value
  }
  return value !== undefined
}
export const generalMediaFieldReviewSchema = z
  .object({
    binding: generalMediaReviewBindingSchema,
    payload: generalActionSchema,
    citations: z
      .array(generalMediaCitationSchema)
      .min(1)
      .max(GENERAL_MEDIA_MAX_CITATIONS),
    fields: z.array(fieldReview).min(1).max(GENERAL_MEDIA_MAX_REVIEW_FIELDS),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = new Set(value.citations.map((citation) => citation.id))
    if (
      ids.size !== value.citations.length ||
      new Set(value.fields.map((field) => field.id)).size !==
        value.fields.length ||
      new Set(value.fields.map((field) => JSON.stringify(field.path))).size !==
        value.fields.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Keep distinct source and field identities.",
      })
    const citations = new Map(
      value.citations.map((citation) => [citation.id, citation]),
    )
    for (const field of value.fields) {
      if (
        !hasField(value.payload, field.path) ||
        new Set(field.citationIds).size !== field.citationIds.length ||
        field.citationIds.some((id) => !ids.has(id))
      )
        ctx.addIssue({
          code: "custom",
          message:
            "Every reviewed field needs its actual action field and exact citations.",
        })
      if (
        field.citationIds.every(
          (id) => citations.get(id)?.locator.kind === "attachment_presence",
        ) &&
        !["attachmentId", "attachmentIds"].includes(String(field.path[0]))
      )
        ctx.addIssue({
          code: "custom",
          message:
            "Attachment presence cannot substantiate an extracted business value.",
        })
    }
  })
export const generalMediaAcknowledgementClaimSchema = z
  .object({
    binding: generalMediaReviewBindingSchema,
    fields: z
      .array(z.object({ fieldId: exactId(), valueDigest: digest }).strict())
      .min(1)
      .max(GENERAL_MEDIA_MAX_REVIEW_FIELDS),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      new Set(value.fields.map((field) => field.fieldId)).size !==
      value.fields.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Acknowledge each exact field once.",
      })
  })
export type GeneralMediaFieldReview = z.infer<
  typeof generalMediaFieldReviewSchema
>
export type GeneralMediaAcknowledgementClaim = z.infer<
  typeof generalMediaAcknowledgementClaimSchema
>

/** Presentation comparison only. Even complete claims require fresh server
 * source resolution, actual human/session binding and signed proposal checks.
 * Actual source assessment may require MORE fields than the candidate claims.
 */
export function generalMediaUnacknowledgedFields(
  review: GeneralMediaFieldReview,
  claim: GeneralMediaAcknowledgementClaim | null,
) {
  const bindingMatches =
    claim !== null &&
    JSON.stringify(review.binding) === JSON.stringify(claim.binding)
  const citations = new Map(
    review.citations.map((citation) => [citation.id, citation]),
  )
  const fields = new Map(
    bindingMatches
      ? claim.fields.map((field) => [field.fieldId, field.valueDigest])
      : [],
  )
  return review.fields
    .filter((field) => {
      const required =
        field.uncertainty !== "none" ||
        field.citationIds.some((id) => {
          const citation = citations.get(id)
          return (
            !citation ||
            citation.coverage !== "complete" ||
            citation.certainty !== "source_clear" ||
            citation.locator.kind === "transcript_span"
          )
        })
      return required && fields.get(field.id) !== field.valueDigest
    })
    .map((field) => field.id)
}
