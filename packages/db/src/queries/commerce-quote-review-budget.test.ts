import { expect, test } from "bun:test"
import {
  COMMERCE_QUOTE_REVIEW_MAX_BYTES,
  CommerceQuoteReviewBudgetError,
  assertCommerceQuoteReviewBudget,
} from "./commerce-quote-review-budget"

function actualJSONBytes(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value), "utf8")
}
function rejects(
  value: unknown,
  reason: "too_large" | "unsupported",
  budget?: number,
) {
  try {
    assertCommerceQuoteReviewBudget(value, budget)
    throw Error("Expected a budget refusal")
  } catch (error) {
    expect(error).toBeInstanceOf(CommerceQuoteReviewBudgetError)
    expect(error).toMatchObject({ reason })
  }
}

test("default aggregate budget is exactly64MiB", () => {
  expect(COMMERCE_QUOTE_REVIEW_MAX_BYTES).toBe(64 * 1024 * 1024)
})

test("small supported values count exactly like JSON.stringify UTF8, including escaping and surrogate behavior", () => {
  const controls = Array.from({ length: 32 }, (_, index) =>
    String.fromCharCode(index),
  ).join("")
  const representatives: unknown[] = [
    null,
    true,
    false,
    0,
    -0,
    1.25,
    -1.25,
    1e-7,
    1e21,
    Number.MIN_VALUE,
    Number.MAX_VALUE,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    "",
    '"\\/\b\t\n\f\r',
    controls,
    "ASCII é Ā 中 \u2028\u2029 😀",
    "\ud800",
    "\udfff",
    "\ud800x\udfff",
    "\ud800\udc00",
    "\ud800\ud800\udc00\udfff",
    [],
    [undefined, undefined, null, true, false, Number.NaN],
    {},
    { omitted: undefined, present: null },
    { 'escaped"\\\n\u0001中😀\ud800': ["\udfff", undefined, "é"] },
    { z: 1, 12: "integer key", 2: { nested: [1, true, null] }, a: undefined },
    Object.assign(Object.create(null), {
      plain: "null prototype",
      omitted: undefined,
    }),
    new Date("2026-10-15T12:34:56.789Z"),
    new Date("+010000-01-01T00:00:00Z"),
    new Date(Number.NaN),
    { date: new Date("2026-10-15T12:34:56.789Z"), after: "é" },
  ]
  for (const value of representatives) {
    const expected = actualJSONBytes(value)
    expect(assertCommerceQuoteReviewBudget(value)).toBe(expected)
    expect(assertCommerceQuoteReviewBudget(value, expected)).toBe(expected)
    expect(assertCommerceQuoteReviewBudget(value, expected + 1)).toBe(expected)
    rejects(value, "too_large", expected - 1)
  }
})

test("all BMP code units and mixed proper/lone surrogates match real well-formed JSON escaping", () => {
  // Small bounded samples; no giant serialization is used by the counter itself.
  for (let start = 0; start < 65_536; start += 128) {
    const text = Array.from({ length: 128 }, (_, offset) =>
      String.fromCharCode(start + offset),
    ).join("")
    expect(assertCommerceQuoteReviewBudget({ [text]: text })).toBe(
      actualJSONBytes({ [text]: text }),
    )
  }
})

test("omitted keys, sparse arrays and ignored symbol/nonenumerable keys retain JSON semantics without callbacks", () => {
  let callbacks = 0
  const object = { kept: "value", omitted: undefined, toJSON: "ordinary data" }
  Object.defineProperty(object, "invisible", {
    get() {
      callbacks++
      throw Error("Not invoked")
    },
  })
  Object.defineProperty(object, Symbol("ignored"), {
    enumerable: true,
    get() {
      callbacks++
      throw Error("Not invoked")
    },
  })
  const array = new Array(4)
  array[2] = object
  Object.defineProperty(array, "ignoredExtra", {
    enumerable: true,
    get() {
      callbacks++
      throw Error("Not invoked")
    },
  })
  expect(assertCommerceQuoteReviewBudget(array)).toBe(actualJSONBytes(array))
  expect(callbacks).toBe(0)
})

test("cycles and unsupported values refuse; repeated ordinary references are supported", () => {
  const cyclic: { self?: unknown } = {}
  cyclic.self = cyclic
  const cyclicArray: unknown[] = []
  cyclicArray.push(cyclicArray)
  const leaf = { text: "same original object" }
  expect(assertCommerceQuoteReviewBudget([leaf, leaf, { leaf }])).toBe(
    actualJSONBytes([leaf, leaf, { leaf }]),
  )
  for (const value of [
    undefined,
    () => "unsafe",
    Symbol("unsafe"),
    BigInt(1),
    new Map(),
    new Set(),
    new String("boxed"),
    /expression/,
    Object.create(Date.prototype),
    cyclic,
    cyclicArray,
    { nested: BigInt(1) },
    { nested: () => "unsafe" },
    [Symbol("unsafe")],
  ])
    rejects(value, "unsupported")
})

test("accessors, custom serializers and proxy traps are refused without invocation", () => {
  let callbacks = 0
  function callback(): never {
    callbacks++
    throw Error("Must not execute")
  }
  const getter = Object.defineProperty({}, "value", {
    enumerable: true,
    get: callback,
  })
  const array = Object.defineProperty([], "0", { get: callback })
  const serializerGetter = Object.defineProperty({}, "toJSON", {
    get: callback,
  })
  const customDate = new Date("2026-10-15T00:00:00Z")
  Object.defineProperty(customDate, "toJSON", { value: callback })
  const changedPrimitive = new Date("2026-10-15T00:00:00Z")
  Object.defineProperty(changedPrimitive, "valueOf", { value: callback })
  const proxy = new Proxy(
    {},
    {
      get: callback,
      ownKeys: callback,
      getPrototypeOf: callback,
      getOwnPropertyDescriptor: callback,
    },
  )
  for (const value of [
    getter,
    array,
    serializerGetter,
    { toJSON: callback },
    customDate,
    changedPrimitive,
    proxy,
  ])
    rejects(value, "unsupported")
  expect(callbacks).toBe(0)
})

test("small custom limits stop enormous repeated-reference documents before later unsupported nodes", () => {
  let shared: unknown = { text: "中\u0001😀".repeat(20) }
  for (let index = 0; index < 50; index++) shared = [shared, shared]
  // Logical JSON size is exponential; serializing it would be inappropriate.
  rejects([shared, () => "must not reach"], "too_large", 256)
  const first = { text: "\u0001".repeat(100) }
  rejects([first, BigInt(1)], "too_large", 100)
})

test("iterative traversal supports deeply nested valid documents without a recursive stack limit", () => {
  let value: unknown = null
  for (let index = 0; index < 20_000; index++) value = [value]
  expect(assertCommerceQuoteReviewBudget(value, 40_004)).toBe(40_004)
  rejects(value, "too_large", 40_003)
})

test("invalid budget configuration refuses instead of disabling the bound", () => {
  for (const budget of [
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ])
    rejects(null, "unsupported", budget)
  rejects(null, "too_large", 0)
})
