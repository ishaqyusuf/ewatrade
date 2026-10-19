import { types } from "node:util"

export const COMMERCE_QUOTE_REVIEW_MAX_BYTES = 64 * 1024 * 1024

export class CommerceQuoteReviewBudgetError extends Error {
  constructor(readonly reason: "too_large" | "unsupported") {
    super(
      reason === "too_large"
        ? "The complete quotation review exceeds its supported byte budget."
        : "The complete quotation review contains unsupported JSON values.",
    )
    this.name = "CommerceQuoteReviewBudgetError"
  }
}

const dateGetTime = Date.prototype.getTime
const dateToISOString = Date.prototype.toISOString
const dateToJSON = Date.prototype.toJSON
const dateValueOf = Date.prototype.valueOf
const datePrimitive = Date.prototype[Symbol.toPrimitive]
const numberToString = Number.prototype.toString

function unsupported(): never {
  throw new CommerceQuoteReviewBudgetError("unsupported")
}

function descriptorInChain(object: object, key: PropertyKey) {
  let current: object | null = object
  while (current !== null) {
    if (types.isProxy(current)) unsupported()
    const descriptor = Object.getOwnPropertyDescriptor(current, key)
    if (descriptor) return descriptor
    current = Object.getPrototypeOf(current)
  }
  return undefined
}

function assertNoCustomJSON(object: object) {
  const descriptor = descriptorInChain(object, "toJSON")
  if (
    descriptor &&
    (!("value" in descriptor) || typeof descriptor.value === "function")
  )
    unsupported()
}

type Frame =
  | { kind: "value"; value: unknown; arrayElement: boolean }
  | { kind: "array"; value: unknown[]; index: number }
  | {
      kind: "object"
      value: object
      keys: string[]
      index: number
      emitted: boolean
    }

/**
 * Counts the complete supported JSON representation without constructing it.
 * The caller chooses the whole intent/review/target document; nothing is truncated.
 * Accessors, proxies, custom serializers and non-JSON values are never executed.
 */
export function assertCommerceQuoteReviewBudget(
  value: unknown,
  maxBytes = COMMERCE_QUOTE_REVIEW_MAX_BYTES,
): number {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) unsupported()
  let bytes = 0
  function add(amount: number) {
    // Compare before addition, so even the cumulative counter cannot overflow.
    if (amount > maxBytes - bytes)
      throw new CommerceQuoteReviewBudgetError("too_large")
    bytes += amount
  }
  function string(text: string) {
    add(1)
    for (let index = 0; index < text.length; index++) {
      const unit = text.charCodeAt(index)
      if (unit === 34 || unit === 92) add(2)
      else if (unit < 32) add([8, 9, 10, 12, 13].includes(unit) ? 2 : 6)
      else if (unit < 128) add(1)
      else if (unit < 2048) add(2)
      else if (unit >= 0xd800 && unit <= 0xdbff) {
        const next = text.charCodeAt(index + 1)
        if (next >= 0xdc00 && next <= 0xdfff) {
          add(4)
          index++
        } else add(6)
      } else if (unit >= 0xdc00 && unit <= 0xdfff) add(6)
      else add(3)
    }
    add(1)
  }

  const ancestors = new Set<object>()
  const frames: Frame[] = [{ kind: "value", value, arrayElement: false }]
  while (frames.length > 0) {
    const frame = frames.pop()
    if (!frame) unsupported()
    if (frame.kind === "array") {
      if (frame.index === frame.value.length) {
        add(1)
        ancestors.delete(frame.value)
        continue
      }
      if (frame.index > 0) add(1)
      const descriptor = descriptorInChain(frame.value, String(frame.index))
      if (descriptor && !("value" in descriptor)) unsupported()
      frame.index++
      frames.push(frame, {
        kind: "value",
        value: descriptor?.value,
        arrayElement: true,
      })
      continue
    }
    if (frame.kind === "object") {
      if (frame.index === frame.keys.length) {
        add(1)
        ancestors.delete(frame.value)
        continue
      }
      const key = frame.keys[frame.index++]
      if (key === undefined) unsupported()
      const descriptor = Object.getOwnPropertyDescriptor(frame.value, key)
      if (!descriptor || !("value" in descriptor)) unsupported()
      if (descriptor.value === undefined) {
        frames.push(frame)
        continue
      }
      if (frame.emitted) add(1)
      string(key)
      add(1)
      frame.emitted = true
      frames.push(frame, {
        kind: "value",
        value: descriptor.value,
        arrayElement: false,
      })
      continue
    }

    const item = frame.value
    if (item === null) add(4)
    else if (typeof item === "string") string(item)
    else if (typeof item === "boolean") add(item ? 4 : 5)
    else if (typeof item === "number")
      add(Number.isFinite(item) ? numberToString.call(item).length : 4)
    else if (item === undefined && frame.arrayElement) add(4)
    else if (typeof item !== "object") unsupported()
    else {
      if (types.isProxy(item) || ancestors.has(item)) unsupported()
      const prototype = Object.getPrototypeOf(item)
      if (prototype === Date.prototype) {
        if (
          !types.isDate(item) ||
          ["toJSON", "toISOString", "valueOf", Symbol.toPrimitive].some((key) =>
            Object.hasOwn(item, key),
          ) ||
          Object.getOwnPropertyDescriptor(Date.prototype, "toJSON")?.value !==
            dateToJSON ||
          Object.getOwnPropertyDescriptor(Date.prototype, "valueOf")?.value !==
            dateValueOf ||
          Object.getOwnPropertyDescriptor(Date.prototype, "toISOString")
            ?.value !== dateToISOString ||
          Object.getOwnPropertyDescriptor(Date.prototype, Symbol.toPrimitive)
            ?.value !== datePrimitive
        )
          unsupported()
        const time = dateGetTime.call(item)
        if (Number.isFinite(time)) string(dateToISOString.call(item))
        else add(4)
      } else {
        assertNoCustomJSON(item)
        if (Array.isArray(item)) {
          if (prototype !== Array.prototype && prototype !== null) unsupported()
          add(1)
          ancestors.add(item)
          frames.push({ kind: "array", value: item, index: 0 })
        } else {
          if (prototype !== Object.prototype && prototype !== null)
            unsupported()
          add(1)
          ancestors.add(item)
          frames.push({
            kind: "object",
            value: item,
            keys: Object.keys(item),
            index: 0,
            emitted: false,
          })
        }
      }
    }
  }
  return bytes
}
