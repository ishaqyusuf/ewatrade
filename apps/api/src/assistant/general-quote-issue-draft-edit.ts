import {
  type QuoteIssueIntent,
  quoteIssueIntent,
  quoteIssueOptionIntent,
} from "@ewatrade/assistant/general/quote-issue-intent"
import {
  CommerceQuoteReviewBudgetError,
  assertCommerceQuoteReviewBudget,
} from "@ewatrade/db/commerce-quote-review-budget"
import { z } from "zod"
import {
  QUOTE_WIRE_MAX_BYTES,
  readQuoteWireJSON,
} from "./general-quote-issue-wire-body"

const MAX_REVISION = 2_147_483_647
const draftRef = z
  .string()
  .min(1)
  .max(191)
  .refine(
    (value) => value === value.trim(),
    "Keep the exact saved draft reference.",
  )
const revision = z.number().int().safe().min(1).max(MAX_REVISION)
const optionIndex = z.number().int().min(0).max(19)

/** Schema only. Use the parsing helper to enforce the encoded request budget. */
export const generalQuoteIssueDraftEditRequest = z
  .object({
    draftRef,
    expectedRevision: revision,
    edit: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("set_option"),
          index: optionIndex,
          option: quoteIssueOptionIntent,
        })
        .strict(),
      z
        .object({ kind: z.literal("remove_option"), index: optionIndex })
        .strict(),
      z
        .object({
          kind: z.literal("move_option"),
          fromIndex: optionIndex,
          toIndex: optionIndex,
        })
        .strict(),
      z
        .object({
          kind: z.literal("set_expiry"),
          expiresAt: quoteIssueIntent.shape.expiresAt.unwrap().nullable(),
        })
        .strict(),
    ]),
  })
  .strict()

export type GeneralQuoteIssueDraftEditRequest = z.infer<
  typeof generalQuoteIssueDraftEditRequest
>

export class GeneralQuoteIssueDraftEditError extends Error {
  constructor(
    readonly reason:
      | "request_too_large"
      | "unsupported_request"
      | "invalid_edit"
      | "invalid_current"
      | "stale_draft"
      | "revision_exhausted",
  ) {
    super(
      "The quotation draft could not be edited. Keep the draft and review it again.",
    )
    this.name = "GeneralQuoteIssueDraftEditError"
  }
}

// HTTP JSON.parse already provides plain data. Direct unknown callers must not
// smuggle a hidden known-field getter that Zod could read but JSON would omit.
function assertPlainRequestData(raw: unknown) {
  const pending = [raw]
  const visited = new Set<object>()
  while (pending.length) {
    const value = pending.pop()
    if (value === null || typeof value !== "object") continue
    if (types.isProxy(value))
      throw new GeneralQuoteIssueDraftEditError("unsupported_request")
    if (visited.has(value)) continue
    visited.add(value)
    const array = Array.isArray(value)
    const prototype = Object.getPrototypeOf(value)
    if (
      prototype !== null &&
      prototype !== (array ? Array.prototype : Object.prototype)
    )
      throw new GeneralQuoteIssueDraftEditError("unsupported_request")
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (
        typeof key !== "string" ||
        !descriptor ||
        !("value" in descriptor) ||
        (!descriptor.enumerable && !(array && key === "length"))
      )
        throw new GeneralQuoteIssueDraftEditError("unsupported_request")
      pending.push(descriptor.value)
    }
  }
}

/**
 * Bounds the unnormalized single POST SuperJSON JSON envelope, {json: request},
 * before Zod can trim text or normalize quantities. No batch/HTTP-byte admission
 * is implied: the caller must use readQuoteWireJSON on the actual raw body,
 * including its actual envelope, whitespace and metadata, before deserialization.
 */
export function parseGeneralQuoteIssueDraftEditRequest(
  raw: unknown,
): GeneralQuoteIssueDraftEditRequest {
  try {
    assertCommerceQuoteReviewBudget({ json: raw }, QUOTE_WIRE_MAX_BYTES)
  } catch (error) {
    if (error instanceof CommerceQuoteReviewBudgetError)
      throw new GeneralQuoteIssueDraftEditError(
        error.reason === "too_large"
          ? "request_too_large"
          : "unsupported_request",
      )
    throw error
  }
  assertPlainRequestData(raw)
  const parsed = generalQuoteIssueDraftEditRequest.safeParse(raw)
  if (!parsed.success) throw new GeneralQuoteIssueDraftEditError("invalid_edit")
  return parsed.data
}

export type GeneralQuoteIssueDraft = Readonly<{
  /** Loaded from the authenticated, exact owned server draft; never a capability. */
  draftRef: string
  revision: number
  intent: unknown
}>

export type GeneralQuoteIssueDraftEditResult = {
  draftRef: string
  revision: number
  intent: QuoteIssueIntent
}

/**
 * Pure composition, with source/operation fixed by the trusted saved intent.
 * The caller still owes fresh authority/exact owner lookup, atomic revision CAS,
 * invalidating every prior review/approval, and a new full canonical review before
 * signing/confirmation. This does not mint identities, persist or execute a Quote.
 */
export function applyGeneralQuoteIssueDraftEdit(
  current: GeneralQuoteIssueDraft,
  raw: unknown,
): GeneralQuoteIssueDraftEditResult {
  const request = parseGeneralQuoteIssueDraftEditRequest(raw)
  if (
    !draftRef.safeParse(current.draftRef).success ||
    !revision.safeParse(current.revision).success
  )
    throw new GeneralQuoteIssueDraftEditError("invalid_current")
  if (
    current.draftRef !== request.draftRef ||
    current.revision !== request.expectedRevision
  )
    throw new GeneralQuoteIssueDraftEditError("stale_draft")
  if (current.revision === MAX_REVISION)
    throw new GeneralQuoteIssueDraftEditError("revision_exhausted")
  const saved = quoteIssueIntent.safeParse(current.intent)
  if (!saved.success)
    throw new GeneralQuoteIssueDraftEditError("invalid_current")
  const intent = saved.data
  const options = [...intent.options]
  const edit = request.edit
  if (edit.kind === "set_option") {
    if (edit.index > options.length)
      throw new GeneralQuoteIssueDraftEditError("invalid_edit")
    options[edit.index] = edit.option
  } else if (edit.kind === "remove_option") {
    if (edit.index >= options.length)
      throw new GeneralQuoteIssueDraftEditError("invalid_edit")
    options.splice(edit.index, 1)
  } else if (edit.kind === "move_option") {
    if (edit.fromIndex >= options.length || edit.toIndex >= options.length)
      throw new GeneralQuoteIssueDraftEditError("invalid_edit")
    const [option] = options.splice(edit.fromIndex, 1)
    if (!option) throw new GeneralQuoteIssueDraftEditError("invalid_edit")
    options.splice(edit.toIndex, 0, option)
  }
  const { expiresAt: _previousExpiry, ...withoutExpiry } = intent
  const candidate = {
    ...withoutExpiry,
    ...(edit.kind === "set_expiry"
      ? edit.expiresAt === null
        ? {}
        : { expiresAt: edit.expiresAt }
      : intent.expiresAt === undefined
        ? {}
        : { expiresAt: intent.expiresAt }),
    options,
  }
  // Includes the source-specific Inquiry-line/Service-attestation rules, not
  // merely the option shape or a second independent business-rule implementation.
  const next = quoteIssueIntent.safeParse(candidate)
  if (!next.success) throw new GeneralQuoteIssueDraftEditError("invalid_edit")
  return {
    draftRef: current.draftRef,
    revision: current.revision + 1,
    intent: next.data,
  }
}
import { types } from "node:util"

/**
 * Actual raw-body admission followed by one strict single-POST JSON envelope.
 * All editable values are ordinary JSON/ISO strings: no SuperJSON metadata,
 * batches or extra envelope fields are accepted. This is not an installed route,
 * authentication, persistence, compare-and-swap, approval invalidation or execution.
 */
export async function readAndApplyGeneralQuoteIssueDraftEdit(
  request: Request,
  current: GeneralQuoteIssueDraft,
): Promise<GeneralQuoteIssueDraftEditResult> {
  // Keep the caller's exact saved revision/intent stable while the body streams.
  // This copy does not replace the caller's later database revision CAS.
  let snapshot: GeneralQuoteIssueDraft
  try {
    snapshot = {
      draftRef: current.draftRef,
      revision: current.revision,
      intent: structuredClone(current.intent),
    }
  } catch {
    throw new GeneralQuoteIssueDraftEditError("invalid_current")
  }
  const body = await readQuoteWireJSON(request)
  const envelope = z.object({ json: z.unknown() }).strict().safeParse(body)
  if (!envelope.success)
    throw new GeneralQuoteIssueDraftEditError("invalid_edit")
  return applyGeneralQuoteIssueDraftEdit(snapshot, envelope.data.json)
}
