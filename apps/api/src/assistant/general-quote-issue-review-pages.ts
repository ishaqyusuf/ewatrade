import { createHash } from "node:crypto"
import { types } from "node:util"
import type { CommerceQuoteIssueReview } from "@ewatrade/db/commerce-quote-issue-review"
import { assertCommerceQuoteReviewBudget } from "@ewatrade/db/commerce-quote-review-budget"
import superjson from "superjson"
import { z } from "zod"
import { QUOTE_WIRE_MAX_BYTES } from "./general-quote-issue-wire-body"

const FORMAT = "complete_quote_review:v1" as const
const PROJECTION =
  "iso_dates_omit_only_option_line_catalogPriceEvaluationAt:v1" as const
// Fixed UTF-16 chunks bound work without repeatedly copying a giant remainder.
// A boundary never bisects a surrogate pair. Facts may span several fragments.
const FRAGMENT_UNITS = 128 * 1024
export const QUOTE_REVIEW_ENVELOPE_RESERVE_BYTES = 4096

const identity = z
  .string()
  .min(1)
  .max(191)
  .refine((s) => s.trim() === s)
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const bindingSchema = z
  .object({
    actorUserId: identity,
    tenantId: identity,
    storeId: identity,
    conversationId: identity,
    proposalId: identity,
    proposalRevision: z.number().int().positive().max(2_147_483_647),
    payloadHash: hash,
  })
  .strict()
const targetSchema = z.object({ id: identity, revision: hash }).strict()
const countsSchema = z
  .object({
    sourceLines: z.number().int().min(0).max(100),
    options: z.number().int().min(1).max(20),
    optionLines: z.array(z.number().int().min(1).max(100)).min(1).max(20),
    linkedConversations: z.number().int().min(0).max(100).nullable(),
    offerings: z.number().int().nonnegative(),
    priceSuggestions: z.number().int().nonnegative(),
    sourcePreparations: z.number().int().nonnegative(),
  })
  .strict()
const summarySchema = z
  .object({
    source: z
      .object({
        kind: z.enum(["service_request", "commerce_inquiry"]),
        id: identity,
        revision: z.number().int().positive(),
      })
      .strict(),
    operation: z.enum(["issue", "revise"]),
    currentQuote: z
      .object({
        id: identity,
        currentVersionId: identity.nullable(),
        version: z.number().int().positive().nullable(),
        status: z.string().min(1).nullable(),
      })
      .strict()
      .nullable(),
    newVersionSequence: z.number().int().positive(),
  })
  .strict()
const descriptorSchema = z
  .object({
    index: z.number().int().nonnegative(),
    pageId: hash,
    hash,
    fragmentBytes: z.number().int().positive(),
  })
  .strict()
const manifestSchema = z
  .object({
    kind: z.literal("quote_review_manifest"),
    format: z.literal(FORMAT),
    projection: z.literal(PROJECTION),
    binding: bindingSchema,
    target: targetSchema,
    summary: summarySchema,
    counts: countsSchema,
    documentBytes: z
      .number()
      .int()
      .positive()
      .max(64 * 1024 * 1024),
    contentHash: hash,
    packetId: hash,
    pages: z.array(descriptorSchema).min(1),
  })
  .strict()
const pageSchema = z
  .object({
    kind: z.literal("quote_review_page"),
    format: z.literal(FORMAT),
    packetId: hash,
    binding: bindingSchema,
    target: targetSchema,
    index: z.number().int().nonnegative(),
    pageId: hash,
    hash,
    fragment: z.string().min(1).max(FRAGMENT_UNITS),
  })
  .strict()

export type QuoteReviewBinding = z.infer<typeof bindingSchema>
export type QuoteReviewManifest = z.infer<typeof manifestSchema>
export type QuoteReviewPage = z.infer<typeof pageSchema>
type ISO<T> = T extends Date
  ? string
  : T extends readonly (infer E)[]
    ? ISO<E>[]
    : T extends object
      ? { [K in keyof T]: ISO<T[K]> }
      : T
type Review = CommerceQuoteIssueReview["review"]
type Option = Review["options"][number]
export type CompleteQuoteSemanticReview = ISO<Omit<Review, "options">> & {
  options: (ISO<Omit<Option, "lines">> & {
    lines: ISO<Omit<Option["lines"][number], "catalogPriceEvaluationAt">>[]
  })[]
}
export type CompleteQuoteReviewDocument = {
  format: typeof FORMAT
  projection: typeof PROJECTION
  target: CommerceQuoteIssueReview["target"]
  review: CompleteQuoteSemanticReview
}
export type QuoteReviewUnavailable = {
  kind: "unavailable"
  reason:
    | "unsupported_review"
    | "review_too_large"
    | "envelope_too_large"
    | "stale_review"
    | "incomplete_or_invalid_pages"
}
type JSONValue =
  | null
  | boolean
  | number
  | string
  | JSONValue[]
  | { [key: string]: JSONValue }
function unavailable(
  reason: QuoteReviewUnavailable["reason"],
): QuoteReviewUnavailable {
  return { kind: "unavailable", reason }
}
function digest(text: string) {
  return createHash("sha256").update(text, "utf8").digest("hex")
}
function bytes(text: string) {
  return Buffer.byteLength(text, "utf8")
}

// The JSON byte counter intentionally ignores non-enumerable properties. Zod
// and typed field access do not, so separately forbid hidden getters BEFORE
// either can inspect a DTO. This guard executes no user accessors/serializers.
function plainData(value: unknown) {
  const pending: unknown[] = [value]
  const visited = new Set<object>()
  while (pending.length > 0) {
    const item = pending.pop()
    if (typeof item !== "object" || item === null) continue
    if (types.isProxy(item)) throw Error("Unsupported review")
    if (visited.has(item)) continue
    visited.add(item)
    const prototype = Object.getPrototypeOf(item)
    const keys = Reflect.ownKeys(item)
    if (prototype === Date.prototype) {
      if (!types.isDate(item) || keys.length > 0)
        throw Error("Unsupported review")
      continue
    }
    const array = Array.isArray(item)
    if (
      prototype !== null &&
      prototype !== (array ? Array.prototype : Object.prototype)
    )
      throw Error("Unsupported review")
    const length = array
      ? Object.getOwnPropertyDescriptor(item, "length")?.value
      : undefined
    if (array && keys.length !== length + 1) throw Error("Unsupported review")
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(item, key)
      if (typeof key !== "string" || !descriptor || !("value" in descriptor))
        throw Error("Unsupported review")
      if (array && key === "length") continue
      if (
        !descriptor.enumerable ||
        (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= length))
      )
        throw Error("Unsupported review")
      pending.push(descriptor.value)
    }
  }
}

/**
 * Exact body bytes for ONE tRPC success result, including installed SuperJSON's
 * representation and single-operation batch brackets. The additional 4096-byte
 * reserve is counted against the 1 MiB cap. This does not license multi-result
 * batches, custom response fields, compression, or future transformer changes.
 * A future route must enforce the complete outgoing body too.
 */
export function quoteReviewEnvelopeBytes(value: unknown) {
  assertCommerceQuoteReviewBudget(value, QUOTE_WIRE_MAX_BYTES)
  plainData(value)
  return bytes(
    JSON.stringify([{ result: { data: superjson.serialize(value) } }]),
  )
}
function fits(value: unknown) {
  return (
    quoteReviewEnvelopeBytes(value) + QUOTE_REVIEW_ENVELOPE_RESERVE_BYTES <=
    QUOTE_WIRE_MAX_BYTES
  )
}

// The iterative budget counter runs BEFORE this traversal, so getters, proxies,
// cycles and custom serializers cannot execute. Refuse credentials even on a
// fabricated/widened DTO; do not silently drop fields from the review.
function canonical(value: unknown, path: (string | number)[] = []): JSONValue {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value))
    return value.map((entry, index) => canonical(entry, [...path, index]))
  if (typeof value !== "object" || value === null)
    throw Error("Unsupported review")
  const entries: [string, JSONValue][] = []
  for (const key of Object.keys(value).sort()) {
    if (/(token|password|secret|credential|authorization|cookie)/i.test(key))
      throw Error("Unsupported review")
    if (
      path.length === 5 &&
      path[0] === "review" &&
      path[1] === "options" &&
      typeof path[2] === "number" &&
      path[3] === "lines" &&
      typeof path[4] === "number" &&
      key === "catalogPriceEvaluationAt"
    )
      continue
    const item: unknown = Reflect.get(value, key)
    if (item !== undefined) entries.push([key, canonical(item, [...path, key])])
  }
  return Object.fromEntries(entries)
}
function stable(value: unknown) {
  return JSON.stringify(canonical(value))
}
function details(review: Review | CompleteQuoteSemanticReview) {
  return {
    summary: summarySchema.parse({
      source: {
        kind: review.source.kind,
        id: review.source.id,
        revision: review.source.revision,
      },
      operation: review.operation.kind,
      currentQuote:
        review.currentQuote === null
          ? null
          : {
              id: review.currentQuote.id,
              currentVersionId: review.currentQuote.currentVersionId,
              version: review.currentQuote.currentVersion?.version ?? null,
              status: review.currentQuote.currentVersion?.status ?? null,
            },
      newVersionSequence: review.effects.newVersionSequence,
    }),
    counts: countsSchema.parse({
      sourceLines: review.source.lines.length,
      options: review.options.length,
      optionLines: review.options.map((option) => option.lines.length),
      linkedConversations: review.effects.linkedConversations?.length ?? null,
      offerings: review.evidence.offerings.length,
      priceSuggestions: review.evidence.priceSuggestions.length,
      sourcePreparations: review.evidence.sourcePreparations.length,
    }),
  }
}
function packetIdentity(
  manifest: Omit<QuoteReviewManifest, "kind" | "packetId" | "pages">,
) {
  return digest(stable(manifest))
}
function pageIdentity(packetId: string, index: number, hash: string) {
  return digest(`${FORMAT}:${packetId}:${index}:${hash}`)
}

/**
 * Pure server-side construction, NOT an endpoint, authority check, signature or
 * durable snapshot. Supply the ACTUAL complete parent read and trusted proposal
 * binding. The parent remains responsible for its complete intent+review budget.
 * This boundary independently budgets the provided DTO before copying it.
 * Every business field is retained; Dates are ISO UTC strings. The single named
 * observation-clock omission is exactly the parent's digest exclusion.
 */
export function createGeneralQuoteIssueReviewPacket(
  parent: CommerceQuoteIssueReview,
  binding: QuoteReviewBinding,
  previousManifest?: unknown,
):
  | {
      kind: "available"
      manifest: QuoteReviewManifest
      pages: QuoteReviewPage[]
    }
  | QuoteReviewUnavailable {
  try {
    assertCommerceQuoteReviewBudget({ parent, binding })
    plainData({ parent, binding })
    const ownedBinding = bindingSchema.parse(binding)
    const target = targetSchema.parse(parent.target)
    const review = parent.review
    if (
      target.id !== review.source.id ||
      ownedBinding.actorUserId !== review.authority.actor.userId ||
      ownedBinding.tenantId !== review.source.tenantId ||
      ownedBinding.storeId !== review.source.storeId ||
      ownedBinding.tenantId !== review.authority.store.tenantId ||
      ownedBinding.storeId !== review.authority.store.id
    )
      return unavailable("unsupported_review")
    const metadata = details(review)
    const document = { format: FORMAT, projection: PROJECTION, target, review }
    const documentBytes = assertCommerceQuoteReviewBudget(document)
    const text = stable(document)
    if (bytes(text) > 64 * 1024 * 1024) return unavailable("review_too_large")
    const base = {
      format: FORMAT,
      projection: PROJECTION,
      binding: ownedBinding,
      target,
      ...metadata,
      documentBytes: bytes(text),
      contentHash: digest(text),
    }
    // The pre-copy count includes the omitted observation clocks; text may be
    // smaller, but never larger than the complete supported document budget.
    if (bytes(text) > documentBytes) return unavailable("unsupported_review")
    const packetId = packetIdentity(base)
    const pages: QuoteReviewPage[] = []
    const descriptors: QuoteReviewManifest["pages"] = []
    for (let start = 0; start < text.length; ) {
      let end = Math.min(text.length, start + FRAGMENT_UNITS)
      const last = text.charCodeAt(end - 1)
      const next = text.charCodeAt(end)
      if (
        end < text.length &&
        last >= 0xd800 &&
        last <= 0xdbff &&
        next >= 0xdc00 &&
        next <= 0xdfff
      )
        end--
      const fragment = text.slice(start, end)
      const hash = digest(fragment)
      const index = pages.length
      const pageId = pageIdentity(packetId, index, hash)
      const page: QuoteReviewPage = {
        kind: "quote_review_page",
        format: FORMAT,
        packetId,
        binding: ownedBinding,
        target,
        index,
        pageId,
        hash,
        fragment,
      }
      if (!fits(page)) return unavailable("envelope_too_large")
      pages.push(page)
      descriptors.push({ index, pageId, hash, fragmentBytes: bytes(fragment) })
      start = end
    }
    const manifest = manifestSchema.parse({
      kind: "quote_review_manifest",
      ...base,
      packetId,
      pages: descriptors,
    })
    if (!fits(manifest)) return unavailable("envelope_too_large")
    if (previousManifest !== undefined) {
      assertCommerceQuoteReviewBudget(previousManifest, QUOTE_WIRE_MAX_BYTES)
      plainData(previousManifest)
      const previous = manifestSchema.parse(previousManifest)
      if (stable(previous) !== stable(manifest))
        return unavailable("stale_review")
    }
    return { kind: "available", manifest, pages }
  } catch (error) {
    if (
      error instanceof Error &&
      "reason" in error &&
      error.reason === "too_large"
    )
      return unavailable("review_too_large")
    return unavailable("unsupported_review")
  }
}

/** Recompute from a fresh parent read for EVERY page; no cached approval basis. */
export function readGeneralQuoteIssueReviewPage(
  parent: CommerceQuoteIssueReview,
  binding: QuoteReviewBinding,
  expectedManifest: unknown,
  pageId: string,
): QuoteReviewPage | QuoteReviewUnavailable {
  const packet = createGeneralQuoteIssueReviewPacket(
    parent,
    binding,
    expectedManifest,
  )
  if (packet.kind === "unavailable") return packet
  return (
    packet.pages.find((page) => page.pageId === pageId) ??
    unavailable("incomplete_or_invalid_pages")
  )
}

/**
 * The expected manifest MUST come from the authenticated server review owner,
 * never from the page set or editable model/client input. Hashes are integrity,
 * not authentication. Success means complete review transport only: it issues
 * no approval token and cannot authorize/confirm a quotation. A future confirm
 * must independently validate signed proposal and freshly compare parent target.
 */
export function assembleGeneralQuoteIssueReview(
  expectedManifest: QuoteReviewManifest,
  rawPages: unknown,
):
  | {
      kind: "complete"
      target: CommerceQuoteIssueReview["target"]
      binding: QuoteReviewBinding
      document: CompleteQuoteReviewDocument
    }
  | QuoteReviewUnavailable {
  try {
    assertCommerceQuoteReviewBudget(expectedManifest, QUOTE_WIRE_MAX_BYTES)
    plainData(expectedManifest)
    const manifest = manifestSchema.parse(expectedManifest)
    if (
      !fits(manifest) ||
      typeof rawPages !== "object" ||
      rawPages === null ||
      types.isProxy(rawPages) ||
      !Array.isArray(rawPages)
    )
      return unavailable("incomplete_or_invalid_pages")
    const length = Object.getOwnPropertyDescriptor(rawPages, "length")
    if (
      !length ||
      !("value" in length) ||
      length.value !== manifest.pages.length ||
      Object.getPrototypeOf(rawPages) !== Array.prototype
    )
      return unavailable("incomplete_or_invalid_pages")
    const { kind: _kind, packetId, pages: descriptors, ...base } = manifest
    if (packetIdentity(base) !== packetId)
      return unavailable("incomplete_or_invalid_pages")
    let totalBytes = 0
    const fragments: string[] = []
    for (let index = 0; index < descriptors.length; index++) {
      // Validate/budget one page at a time, before copying untrusted strings.
      const slot = Object.getOwnPropertyDescriptor(rawPages, String(index))
      if (!slot || !("value" in slot))
        return unavailable("incomplete_or_invalid_pages")
      assertCommerceQuoteReviewBudget(slot.value, QUOTE_WIRE_MAX_BYTES)
      plainData(slot.value)
      const page = pageSchema.parse(slot.value)
      const descriptor = descriptors[index]
      if (
        !descriptor ||
        descriptor.index !== index ||
        page.index !== index ||
        !fits(page) ||
        page.packetId !== packetId ||
        stable(page.binding) !== stable(manifest.binding) ||
        stable(page.target) !== stable(manifest.target) ||
        page.hash !== descriptor.hash ||
        digest(page.fragment) !== descriptor.hash ||
        page.pageId !== descriptor.pageId ||
        page.pageId !== pageIdentity(packetId, index, descriptor.hash) ||
        bytes(page.fragment) !== descriptor.fragmentBytes
      )
        return unavailable("incomplete_or_invalid_pages")
      totalBytes += descriptor.fragmentBytes
      if (totalBytes > manifest.documentBytes)
        return unavailable("incomplete_or_invalid_pages")
      fragments.push(page.fragment)
    }
    if (totalBytes !== manifest.documentBytes)
      return unavailable("incomplete_or_invalid_pages")
    const text = fragments.join("")
    if (digest(text) !== manifest.contentHash)
      return unavailable("incomplete_or_invalid_pages")
    const parsed: unknown = JSON.parse(text)
    assertCommerceQuoteReviewBudget(parsed)
    if (stable(parsed) !== text)
      return unavailable("incomplete_or_invalid_pages")
    // This is a cryptographic provenance boundary, not a permissive JSON DTO
    // parser: the exact bytes are pinned to the separately trusted manifest
    // emitted ONLY from the actual typed parent. Self-signed/forged manifests
    // are expressly unsupported. No partial document escapes before this check.
    const document = parsed as CompleteQuoteReviewDocument
    const metadata = details(document.review)
    if (
      document.format !== FORMAT ||
      document.projection !== PROJECTION ||
      stable(document.target) !== stable(manifest.target) ||
      stable(metadata.counts) !== stable(manifest.counts) ||
      stable(metadata.summary) !== stable(manifest.summary) ||
      document.review.source.id !== manifest.target.id ||
      document.review.source.tenantId !== manifest.binding.tenantId ||
      document.review.source.storeId !== manifest.binding.storeId ||
      document.review.authority.actor.userId !== manifest.binding.actorUserId ||
      document.review.authority.store.id !== manifest.binding.storeId ||
      document.review.authority.store.tenantId !== manifest.binding.tenantId
    )
      return unavailable("incomplete_or_invalid_pages")
    return {
      kind: "complete",
      target: manifest.target,
      binding: manifest.binding,
      document,
    }
  } catch {
    return unavailable("incomplete_or_invalid_pages")
  }
}
