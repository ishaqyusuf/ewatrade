import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto"
import { z } from "zod"
import {
  bookingReviewDataSnapshot,
  bookingReviewStableJSON,
  refuseBookingReviewTransport as refuse,
} from "./general-booking-review-transport-data"

export const BOOKING_REVIEW_CHECKPOINT_MAX_CHARS = 2048
const MAX_PLAINTEXT = 1024
const DOMAIN = "ewatrade:assistant:booking-review-checkpoint:v1"
export const bookingReviewRefSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/)
  .refine((value) => {
    const bytes = Buffer.from(value, "base64url")
    return bytes.length === 32 && bytes.toString("base64url") === value
  })
const counter = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const stateSchema = z
  .object({
    v: z.literal(1),
    reviewRef: bookingReviewRefSchema,
    binding: z.string().regex(/^[a-f0-9]{64}$/),
    nextIndex: counter,
    pageCount: counter.min(1),
    expiresAt: counter,
  })
  .strict()
  .refine((state) => state.nextIndex <= state.pageCount)
export type BookingReviewCheckpointState = z.infer<typeof stateSchema>

function secretKey(secret: string, purpose: "key" | "binding") {
  if (typeof secret !== "string" || secret.length < 32) refuse("unavailable")
  return createHmac("sha256", secret)
    .update(`ewatrade:assistant:booking-review-checkpoint:${purpose}:v1`)
    .digest()
}
export function bookingReviewPrivateBinding(value: unknown, secret: string) {
  const data = bookingReviewDataSnapshot(value)
  return createHmac("sha256", secretKey(secret, "binding"))
    .update(bookingReviewStableJSON(data))
    .digest("hex")
}
export function equalBookingReviewBinding(left: string, right: string) {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right))
    return false
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"))
}
function clock(now: number) {
  if (!Number.isSafeInteger(now) || now < 0) refuse()
  return now
}
function state(raw: unknown, now: number) {
  const parsed = stateSchema.safeParse(
    bookingReviewDataSnapshot(raw, MAX_PLAINTEXT),
  )
  if (!parsed.success) refuse()
  if (parsed.data.expiresAt <= clock(now)) refuse("stale")
  return parsed.data
}
export function newBookingReviewRef() {
  return randomBytes(32).toString("base64url")
}
/** Local data-only envelope; NEVER authority, approval or single-use progress. */
export function sealBookingReviewCheckpoint(
  raw: BookingReviewCheckpointState,
  secret: string,
  now = Date.now(),
) {
  const owned = state(raw, now)
  const plaintext = bookingReviewStableJSON(owned)
  if (Buffer.byteLength(plaintext, "utf8") > MAX_PLAINTEXT) refuse("too_large")
  const key = secretKey(secret, "key")
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  cipher.setAAD(Buffer.from(DOMAIN))
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const token = [
    "bkr1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".")
  if (token.length > BOOKING_REVIEW_CHECKPOINT_MAX_CHARS) refuse("too_large")
  return token
}
export function openBookingReviewCheckpoint(
  token: string,
  secret: string,
  now = Date.now(),
): BookingReviewCheckpointState {
  if (
    typeof token !== "string" ||
    token.length > BOOKING_REVIEW_CHECKPOINT_MAX_CHARS
  )
    refuse()
  const pieces = token.split(".")
  if (pieces.length !== 4 || pieces[0] !== "bkr1") refuse()
  const decoded = pieces.slice(1).map((piece) => {
    if (!/^[A-Za-z0-9_-]+$/.test(piece)) refuse()
    const bytes = Buffer.from(piece, "base64url")
    if (bytes.toString("base64url") !== piece) refuse()
    return bytes
  })
  const [iv, tag, ciphertext] = decoded
  if (
    !iv ||
    iv.length !== 12 ||
    !tag ||
    tag.length !== 16 ||
    !ciphertext ||
    ciphertext.length > MAX_PLAINTEXT
  )
    refuse()
  const key = secretKey(secret, "key")
  let plaintext: Buffer
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv)
    decipher.setAAD(Buffer.from(DOMAIN))
    decipher.setAuthTag(tag)
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  } catch {
    refuse("unavailable")
  }
  let raw: unknown
  try {
    raw = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(plaintext),
    )
  } catch {
    refuse()
  }
  return state(raw, now)
}
