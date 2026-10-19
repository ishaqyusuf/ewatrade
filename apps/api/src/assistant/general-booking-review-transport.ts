import { types } from "node:util"
import { z } from "zod"
import {
  generalBookingReviewObservationsSchema,
  generalBookingReviewSchema,
} from "../../../../packages/assistant/src/general/booking-review"
import type { CompleteGeneralBookingAppReview } from "./general-booking-review-projection"
import {
  BOOKING_REVIEW_CHECKPOINT_MAX_CHARS,
  bookingReviewPrivateBinding,
  bookingReviewRefSchema,
  equalBookingReviewBinding,
  newBookingReviewRef,
  openBookingReviewCheckpoint,
  sealBookingReviewCheckpoint,
} from "./general-booking-review-transport-checkpoint"
import {
  bookingReviewDataSnapshot,
  bookingReviewStableJSON,
  bookingReviewTextHash,
  refuseBookingReviewTransport as refuse,
} from "./general-booking-review-transport-data"
import {
  BOOKING_REVIEW_WIRE_MAX_BYTES,
  bookingReviewEnvelopeFits,
} from "./general-booking-review-transport-envelope"

export { BookingReviewTransportError } from "./general-booking-review-transport-data"
const FORMAT = "booking_review_transport_v1" as const
const FRAGMENT_UNITS = 128 * 1024
const LOGICAL_MAX = 64 * 1024 * 1024
const id = z.string().min(1).max(191)
const revision = z.number().int().min(1).max(2_147_483_647)
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const instant = z.string().datetime()
const action = z.enum([
  "service_booking_hold",
  "service_booking_confirm",
  "service_booking_arrive",
  "service_booking_start",
  "service_booking_complete",
  "service_booking_cancel",
  "service_booking_no_show",
  "service_booking_reschedule",
])
const draft = z
  .object({
    ref: id,
    revision,
    conversationId: z.string().min(1).max(128),
    expiresAt: instant,
  })
  .strict()
const coverage = z
  .object({
    complete: z.literal(true),
    workLines: count,
    workChanges: count,
    obligations: count.nullable(),
    obligationWorkLines: count,
    productFulfillments: count,
    pendingReminders: count,
  })
  .strict()
const descriptor = z
  .object({ index: count, pageId: hash, hash, fragmentBytes: count.min(1) })
  .strict()
const manifestSchema = z
  .object({
    kind: z.literal("booking_review_manifest"),
    format: z.literal(FORMAT),
    reviewRef: bookingReviewRefSchema,
    action,
    draft,
    source: z
      .object({
        id,
        revision: count.max(2_147_483_647),
        status: z.enum([
          "SUBMITTED",
          "NEEDS_INFORMATION",
          "QUOTED",
          "DECLINED",
          "WITHDRAWN",
          "CONVERTED",
        ]),
      })
      .strict(),
    coverage,
    documentHash: hash,
    documentBytes: count.min(1).max(LOGICAL_MAX),
    pages: z.array(descriptor).min(1),
    observations: generalBookingReviewObservationsSchema,
  })
  .strict()
const token = z.string().min(1).max(BOOKING_REVIEW_CHECKPOINT_MAX_CHARS)
const pageSchema = z
  .object({
    kind: z.literal("booking_review_page"),
    format: z.literal(FORMAT),
    reviewRef: bookingReviewRefSchema,
    documentHash: hash,
    index: count,
    pageId: hash,
    hash,
    fragmentBytes: count.min(1),
    fragment: z.string().min(1).max(FRAGMENT_UNITS),
    observations: generalBookingReviewObservationsSchema,
    checkpoint: token,
  })
  .strict()
export type BookingReviewTransportManifest = z.infer<typeof manifestSchema>
export type BookingReviewTransportPage = z.infer<typeof pageSchema>
const scopeSchema = z
  .object({
    actorUserId: id,
    tenantId: id,
    storeId: id,
    conversationId: z.string().min(1).max(128),
  })
  .strict()
export type BookingReviewTransportScope = z.infer<typeof scopeSchema>
const privateSchema = z
  .object({
    canonicalTarget: z.object({ id, revision: hash }).strict(),
    row: z
      .object({
        id,
        actorUserId: id,
        tenantId: id,
        storeId: id,
        conversationId: z.string().min(1).max(128),
        action,
        actionVersion: z.literal(1),
        revision,
        roleSnapshot: z.enum([
          "OWNER",
          "ADMIN",
          "MANAGER",
          "OPERATOR",
          "CASHIER",
        ]),
        idempotencyKey: id,
        payloadHash: hash,
        targetRecordId: id,
        targetRevision: hash,
        approvalTokenHash: hash,
        expiresAt: instant,
        createdAt: instant,
        updatedAt: instant,
        status: z.literal("PENDING"),
        executedResult: z.null(),
        errorCode: z.null(),
        decidedAt: z.null(),
      })
      .strict(),
  })
  .strict()
const inputSchema = z
  .object({
    kind: z.literal("complete"),
    review: generalBookingReviewSchema,
    observations: generalBookingReviewObservationsSchema,
    privateBinding: privateSchema,
  })
  .strict()
type Owned = z.infer<typeof inputSchema>
class Packet {
  readonly #brand = true
  isPacket() {
    return this.#brand
  }
}
export type BookingReviewTransportPacket = Packet
type State = Owned & {
  text: string
  documentHash: string
  descriptors: z.infer<typeof descriptor>[]
  fragments: string[]
}
const packets = new WeakMap<Packet, State>()
function parse<T>(schema: z.ZodType<T>, raw: unknown, max = LOGICAL_MAX): T {
  const parsed = schema.safeParse(bookingReviewDataSnapshot(raw, max))
  if (!parsed.success) refuse()
  return parsed.data
}
function owned(packet: Packet) {
  const data = packets.get(packet)
  if (!data) refuse("unavailable")
  return data
}
function fragmentId(documentHash: string, index: number, fragmentHash: string) {
  return bookingReviewTextHash(
    `${FORMAT}:${documentHash}:${index}:${fragmentHash}`,
  )
}
function requireFits(value: unknown) {
  if (!bookingReviewEnvelopeFits(value)) refuse("too_large")
}
function manifest(s: State, reviewRef: string): BookingReviewTransportManifest {
  return {
    kind: "booking_review_manifest",
    format: FORMAT,
    reviewRef,
    action: s.review.action,
    draft: structuredClone(s.review.draft),
    source: structuredClone(s.review.source),
    coverage: structuredClone(s.review.coverage),
    documentHash: s.documentHash,
    documentBytes: Buffer.byteLength(s.text, "utf8"),
    pages: structuredClone(s.descriptors),
    observations: structuredClone(s.observations),
  }
}
function page(s: State, reviewRef: string, index: number, checkpoint: string) {
  const d = s.descriptors[index]
  const fragment = s.fragments[index]
  if (!d || fragment === undefined) refuse()
  return {
    kind: "booking_review_page" as const,
    format: FORMAT,
    reviewRef,
    documentHash: s.documentHash,
    ...d,
    fragment,
    observations: structuredClone(s.observations),
    checkpoint,
  }
}
/** SERVER ONLY. Supply the actual current reader result, never client authority.
 * Admission/copy is synchronous before parsing/hashing/crypto. Private graph,
 * text and pages live only behind a per-request WeakMap handle: no TX/callback.
 * This materializes complete strings/pages; 64 MiB is NOT peak-memory proof.
 * Reconstruct per fresh request; Begin alone mints the random review reference.
 */
export function createGeneralBookingReviewTransportPacket(
  input: CompleteGeneralBookingAppReview,
): BookingReviewTransportPacket {
  const s = parse(inputSchema, input)
  const r = s.privateBinding.row
  const d = s.review.draft
  const t = s.privateBinding.canonicalTarget
  const targetId =
    s.review.details.kind === "hold"
      ? s.review.source.id
      : s.review.details.kind === "confirm"
        ? s.review.details.before.holdId
        : s.review.details.before.id
  if (
    r.id !== d.ref ||
    r.revision !== d.revision ||
    r.action !== s.review.action ||
    r.conversationId !== d.conversationId ||
    r.expiresAt !== d.expiresAt ||
    t.id !== targetId ||
    t.id !== r.targetRecordId ||
    t.revision !== r.targetRevision
  )
    refuse("unavailable")
  const text = bookingReviewStableJSON(s.review)
  const documentHash = bookingReviewTextHash(text)
  const state: State = {
    ...s,
    text,
    documentHash,
    descriptors: [],
    fragments: [],
  }
  // Fixed maximum UTF-16 chunk; exact envelope check includes worst-case token.
  // Native facts can cross fragment boundaries, never disappear at a row cap.
  for (let start = 0; start < text.length; ) {
    let end = Math.min(start + FRAGMENT_UNITS, text.length)
    const left = text.charCodeAt(end - 1)
    const right = text.charCodeAt(end)
    if (left >= 0xd800 && left <= 0xdbff && right >= 0xdc00 && right <= 0xdfff)
      end--
    const fragment = text.slice(start, end)
    const index = state.fragments.length
    const hash = bookingReviewTextHash(fragment)
    state.fragments.push(fragment)
    state.descriptors.push({
      index,
      hash,
      pageId: fragmentId(documentHash, index, hash),
      fragmentBytes: Buffer.byteLength(fragment, "utf8"),
    })
    requireFits(page(state, "A".repeat(43), index, "A".repeat(2048)))
    start = end
  }
  // Whole manifest plus checkpoint, not only independently small descriptors.
  requireFits({
    manifest: manifest(state, "A".repeat(43)),
    checkpoint: "A".repeat(2048),
  })
  const handle = new Packet()
  packets.set(handle, state)
  return handle
}
function authorize(
  packet: Packet,
  scope: BookingReviewTransportScope,
  now: number,
) {
  const s = owned(packet)
  const current = parse(scopeSchema, scope, 8192)
  const row = s.privateBinding.row
  if (
    current.actorUserId !== row.actorUserId ||
    current.tenantId !== row.tenantId ||
    current.storeId !== row.storeId ||
    current.conversationId !== row.conversationId ||
    !Number.isSafeInteger(now) ||
    now < 0 ||
    Date.parse(row.expiresAt) <= now
  )
    refuse("stale")
  return s
}
function binding(s: State, reviewRef: string, secret: string) {
  return bookingReviewPrivateBinding(
    {
      format: FORMAT,
      reviewRef,
      privateBinding: s.privateBinding,
      documentHash: s.documentHash,
      documentBytes: Buffer.byteLength(s.text, "utf8"),
      coverage: s.review.coverage,
      descriptors: s.descriptors,
    },
    secret,
  )
}
function checkpoint(
  s: State,
  ref: string,
  nextIndex: number,
  secret: string,
  now: number,
) {
  return sealBookingReviewCheckpoint(
    {
      v: 1,
      reviewRef: ref,
      binding: binding(s, ref, secret),
      nextIndex,
      pageCount: s.descriptors.length,
      expiresAt: Date.parse(s.privateBinding.row.expiresAt),
    },
    secret,
    now,
  )
}
/** Actual fresh authority remains the caller's job on EVERY operation. */
export function beginGeneralBookingReviewTransport(
  packet: Packet,
  serverScope: BookingReviewTransportScope,
  secret: string,
  now?: number,
) {
  const at = now ?? Date.now()
  const s = authorize(packet, serverScope, at)
  const ref = newBookingReviewRef()
  const response = {
    manifest: manifest(s, ref),
    checkpoint: checkpoint(s, ref, 0, secret, at),
  }
  requireFits(response)
  authorize(packet, serverScope, now ?? Date.now())
  return response
}
const progressSchema = z
  .object({
    reviewRef: bookingReviewRefSchema,
    index: count,
    checkpoint: token,
  })
  .strict()
function verify(
  s: State,
  ref: string,
  token: string,
  secret: string,
  now: number,
) {
  const prior = openBookingReviewCheckpoint(token, secret, now)
  if (
    prior.reviewRef !== ref ||
    prior.pageCount !== s.descriptors.length ||
    prior.expiresAt !== Date.parse(s.privateBinding.row.expiresAt) ||
    !equalBookingReviewBinding(prior.binding, binding(s, ref, secret))
  )
    refuse("stale")
  return prior
}
export function readGeneralBookingReviewTransportPage(
  packet: Packet,
  raw: z.infer<typeof progressSchema>,
  serverScope: BookingReviewTransportScope,
  secret: string,
  now?: number,
): BookingReviewTransportPage {
  const at = now ?? Date.now()
  const input = parse(progressSchema, raw, 8192)
  const s = authorize(packet, serverScope, at)
  const prior = verify(s, input.reviewRef, input.checkpoint, secret, at)
  if (input.index !== prior.nextIndex || input.index >= prior.pageCount)
    refuse("stale")
  const response = page(
    s,
    input.reviewRef,
    input.index,
    checkpoint(s, input.reviewRef, input.index + 1, secret, at),
  )
  requireFits(response)
  authorize(packet, serverScope, now ?? Date.now())
  return response
}
const completionSchema = z
  .object({
    reviewRef: bookingReviewRefSchema,
    finalCheckpoint: token,
    acknowledged: z.literal(true),
  })
  .strict()
/** Checked transport progress ONLY. No approval token, mutation or human-read
 * proof. Root must reread fresh authority/parent in its owning TX, issue actual
 * existing localV1, compare saved hash/expiry and retain explicit Confirm. */
export function completeGeneralBookingReviewTransport(
  packet: Packet,
  raw: z.infer<typeof completionSchema>,
  serverScope: BookingReviewTransportScope,
  secret: string,
  now?: number,
) {
  const at = now ?? Date.now()
  const input = parse(completionSchema, raw, 8192)
  const s = authorize(packet, serverScope, at)
  const prior = verify(s, input.reviewRef, input.finalCheckpoint, secret, at)
  if (prior.nextIndex !== s.descriptors.length) refuse("stale")
  authorize(packet, serverScope, now ?? Date.now())
  return {
    reviewRef: input.reviewRef,
    draftRef: s.review.draft.ref,
    revision: s.review.draft.revision,
  }
}
/** Expected manifest MUST be from the authenticated server, not a client claim.
 * Parses every complete safe fact/count; never grants execution authority. */
export function assembleGeneralBookingReviewTransport(
  expectedManifest: BookingReviewTransportManifest,
  rawPages: readonly BookingReviewTransportPage[],
) {
  const m = parse(
    manifestSchema,
    expectedManifest,
    BOOKING_REVIEW_WIRE_MAX_BYTES,
  )
  requireFits({ manifest: m, checkpoint: "A".repeat(2048) })
  // Validate only array descriptors initially: don't clone 64 MiB untrusted pages
  // before individually bounding each actual page and cumulative fragment bytes.
  if (
    typeof rawPages !== "object" ||
    rawPages === null ||
    types.isProxy(rawPages) ||
    !Array.isArray(rawPages) ||
    Object.getPrototypeOf(rawPages) !== Array.prototype
  )
    refuse()
  const length = Object.getOwnPropertyDescriptor(rawPages, "length")
  if (!length || !("value" in length) || length.value !== m.pages.length)
    refuse()
  const keys = Reflect.ownKeys(rawPages)
  if (keys.length !== m.pages.length + 1) refuse()
  for (const key of keys) {
    const slot = Object.getOwnPropertyDescriptor(rawPages, key)
    if (
      typeof key !== "string" ||
      !slot ||
      !("value" in slot) ||
      (key !== "length" &&
        (!slot.enumerable ||
          !/^(0|[1-9]\d*)$/.test(key) ||
          Number(key) >= m.pages.length))
    )
      refuse()
  }
  let total = 0
  const fragments: string[] = []
  for (let index = 0; index < m.pages.length; index++) {
    const slot = Object.getOwnPropertyDescriptor(rawPages, String(index))
    if (!slot || !("value" in slot)) refuse()
    const p = parse(pageSchema, slot.value, BOOKING_REVIEW_WIRE_MAX_BYTES)
    requireFits(p)
    const d = m.pages[index]
    if (
      !d ||
      d.index !== index ||
      p.index !== index ||
      p.reviewRef !== m.reviewRef ||
      p.documentHash !== m.documentHash ||
      p.pageId !== d.pageId ||
      p.hash !== d.hash ||
      p.fragmentBytes !== d.fragmentBytes ||
      Buffer.byteLength(p.fragment, "utf8") !== d.fragmentBytes ||
      bookingReviewTextHash(p.fragment) !== d.hash ||
      fragmentId(m.documentHash, index, d.hash) !== d.pageId ||
      d.fragmentBytes > m.documentBytes - total
    )
      refuse()
    total += d.fragmentBytes
    fragments.push(p.fragment)
  }
  if (total !== m.documentBytes) refuse()
  const text = fragments.join("")
  if (bookingReviewTextHash(text) !== m.documentHash) refuse()
  let decoded: unknown
  try {
    decoded = JSON.parse(text)
  } catch {
    refuse()
  }
  const document = parse(generalBookingReviewSchema, decoded)
  if (
    bookingReviewStableJSON(document) !== text ||
    document.action !== m.action ||
    bookingReviewStableJSON(document.draft) !==
      bookingReviewStableJSON(m.draft) ||
    bookingReviewStableJSON(document.source) !==
      bookingReviewStableJSON(m.source) ||
    bookingReviewStableJSON(document.coverage) !==
      bookingReviewStableJSON(m.coverage)
  )
    refuse()
  return document
}
