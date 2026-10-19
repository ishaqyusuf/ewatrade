import { createHash } from "node:crypto"
import { types } from "node:util"
import {
  COMMERCE_QUOTE_REVIEW_MAX_BYTES,
  CommerceQuoteReviewBudgetError,
  assertCommerceQuoteReviewBudget,
} from "@ewatrade/db/commerce-quote-review-budget"

export class BookingReviewTransportError extends Error {
  constructor(
    readonly reason: "invalid_input" | "too_large" | "unavailable" | "stale",
  ) {
    super("This complete booking review is unavailable. Review it again.")
    this.name = "BookingReviewTransportError"
  }
}
export function refuseBookingReviewTransport(
  reason: BookingReviewTransportError["reason"] = "invalid_input",
): never {
  throw new BookingReviewTransportError(reason)
}

/** Admission precedes cloning, typed property reads, Zod or hashing. No caller
 * accessor/proxy/custom JSON is executed, including hidden known properties. */
export function bookingReviewDataSnapshot(
  value: unknown,
  maxBytes = COMMERCE_QUOTE_REVIEW_MAX_BYTES,
): unknown {
  try {
    assertCommerceQuoteReviewBudget(value, maxBytes)
  } catch (error) {
    if (error instanceof CommerceQuoteReviewBudgetError)
      refuseBookingReviewTransport(
        error.reason === "too_large" ? "too_large" : "invalid_input",
      )
    throw error
  }
  const pending = [value]
  const seen = new Set<object>()
  while (pending.length) {
    const item = pending.pop()
    if (item === null || typeof item === "string" || typeof item === "boolean")
      continue
    if (typeof item === "number" && Number.isFinite(item)) continue
    if (typeof item !== "object" || types.isProxy(item))
      refuseBookingReviewTransport()
    if (seen.has(item)) continue
    seen.add(item)
    const array = Array.isArray(item)
    const prototype = Object.getPrototypeOf(item)
    if (
      prototype !== null &&
      prototype !== (array ? Array.prototype : Object.prototype)
    )
      refuseBookingReviewTransport()
    const keys = Reflect.ownKeys(item)
    const length = array
      ? Object.getOwnPropertyDescriptor(item, "length")?.value
      : undefined
    if (array && keys.length !== length + 1) refuseBookingReviewTransport()
    for (const key of keys) {
      const d = Object.getOwnPropertyDescriptor(item, key)
      if (typeof key !== "string" || !d || !("value" in d))
        refuseBookingReviewTransport()
      if (array && key === "length") continue
      if (
        !d.enumerable ||
        (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= length))
      )
        refuseBookingReviewTransport()
      pending.push(d.value)
    }
  }
  return structuredClone(value)
}

/** Only admitted plain JSON may reach deterministic serialization. */
export function bookingReviewStableJSON(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map(bookingReviewStableJSON).join(",")}]`
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${bookingReviewStableJSON(Reflect.get(value, key))}`,
      )
      .join(",")}}`
  return JSON.stringify(value)
}
export const bookingReviewTextHash = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex")
