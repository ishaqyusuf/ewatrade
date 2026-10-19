import { expect, test } from "bun:test"
import {
  type NativeOrderAction,
  isNativeOrderAction,
  nativeOrderCandidate,
  replacementInputs,
} from "./native-order-values"

const replacement = {
  action: "order_replace",
  orderId: "original-order",
  reason: "Correct quantities",
  changes: [
    { orderLineId: "fixed-line", quantity: "2", unitPriceMinor: 12345 },
    { orderLineId: "total-line", enteredTotalMinor: 50000 },
  ],
} as const
const draft = { ...replacement, changes: [...replacement.changes] }
const sources = [
  { id: "fixed-line", snapshot: { pricingPolicy: "fixed" } },
  { id: "total-line", snapshot: { pricingPolicy: "order_total" } },
]
test("replacement editor converts both pricing policies exactly and preserves selected identities", () => {
  expect(replacementInputs(draft)).toEqual([
    { quantity: "2", amount: "123.45" },
    { quantity: "", amount: "500" },
  ])
  expect(
    nativeOrderCandidate(draft, {
      reason: "Customer corrected the order",
      changes: [
        { quantity: "1.25", amount: "2,345.67" },
        { quantity: "3", amount: "0" },
      ],
      sources,
    }),
  ).toEqual({
    ok: true,
    payload: {
      ...draft,
      reason: "Customer corrected the order",
      changes: [
        { orderLineId: "fixed-line", quantity: "1.25", unitPriceMinor: 234567 },
        { orderLineId: "total-line", quantity: "3", enteredTotalMinor: 0 },
      ],
    },
  })
})
test("blank replacement fields keep original facts while a real changed field remains required", () => {
  const result = nativeOrderCandidate(draft, {
    reason: draft.reason,
    changes: [
      { quantity: " 2 ", amount: "" },
      { quantity: "", amount: "450" },
    ],
    sources,
  })
  expect(result).toEqual({
    ok: true,
    payload: {
      ...draft,
      changes: [
        { orderLineId: "fixed-line", quantity: "2", unitPriceMinor: undefined },
        {
          orderLineId: "total-line",
          quantity: undefined,
          enteredTotalMinor: 45000,
        },
      ],
    },
  })
  expect(
    nativeOrderCandidate(draft, {
      reason: draft.reason,
      changes: [
        { quantity: "", amount: "" },
        { quantity: "", amount: "450" },
      ],
      sources,
    }).ok,
  ).toBe(false)
})
test("missing, duplicate, quote-only or incomplete originals cannot decide a price field", () => {
  for (const unavailable of [
    undefined,
    [],
    [sources[0]],
    [...sources, sources[0]],
    [{ ...sources[0], snapshot: null }, sources[1]],
    [
      { ...sources[0], snapshot: { pricingPolicy: "quote_required" } },
      sources[1],
    ],
  ]) {
    expect(
      nativeOrderCandidate(draft, {
        reason: draft.reason,
        changes: replacementInputs(draft),
        sources: unavailable,
      }),
    ).toEqual({
      ok: false,
      error: "Reload the original order items before saving.",
    })
  }
})
test("missing edit rows, invalid money and exact quantity limits fail before re-review", () => {
  expect(
    nativeOrderCandidate(draft, { reason: draft.reason, changes: [], sources })
      .ok,
  ).toBe(false)
  for (const amount of ["abc", "-1", "1000001.00", "1.001"]) {
    expect(
      nativeOrderCandidate(draft, {
        reason: draft.reason,
        changes: [
          { quantity: "2", amount },
          { quantity: "", amount: "400" },
        ],
        sources,
      }).ok,
    ).toBe(false)
  }
  for (const quantity of ["0", "-1", "1e3", "0.0000001"]) {
    expect(
      nativeOrderCandidate(draft, {
        reason: draft.reason,
        changes: [
          { quantity, amount: "" },
          { quantity: "", amount: "400" },
        ],
        sources,
      }).ok,
    ).toBe(false)
  }
})
const returned = {
  action: "product_line_return",
  orderLineId: "original-line",
  quantity: "1.25",
  disposition: "restock",
  destinationBalanceSourceId: "reviewed-balance",
  reason: "Returned unopened",
} as const
test("return edits retain exact smallest units and the reviewed destination", () => {
  expect(
    nativeOrderCandidate(returned, {
      reason: returned.reason,
      quantity: "0.000001",
    }),
  ).toEqual({
    ok: true,
    payload: { ...returned, quantity: "0.000001" },
  })
  expect(
    nativeOrderCandidate(returned, {
      reason: returned.reason,
      destination: "original",
    }),
  ).toEqual({
    ok: true,
    payload: { ...returned, destinationBalanceSourceId: undefined },
  })
})
test("every non-restock disposition removes the destination without promising a refund", () => {
  for (const disposition of ["damaged", "quarantine", "no_restock"] as const) {
    const result = nativeOrderCandidate(returned, {
      reason: "Inspect return",
      disposition,
    })
    expect(result).toEqual({
      ok: true,
      payload: {
        ...returned,
        disposition,
        reason: "Inspect return",
        destinationBalanceSourceId: undefined,
      },
    })
  }
})
test("return fields refuse empty/zero amounts and excess precision", () => {
  for (const quantity of ["", " ", "0", "0.000000", "1e3", "-1", "0.0000001"]) {
    expect(
      nativeOrderCandidate(returned, { reason: returned.reason, quantity }).ok,
    ).toBe(false)
  }
  expect(nativeOrderCandidate(returned, { reason: " " }).ok).toBe(false)
})
for (const initial of [
  {
    action: "product_line_fulfill",
    orderLineId: "selected-line",
    reason: "Packed",
  },
  {
    action: "product_batch_fulfill",
    orderId: "selected-order",
    reason: "Packed all",
  },
  {
    action: "service_line_authorize",
    orderLineId: "selected-service",
    reason: "Approved",
  },
  {
    action: "service_line_fulfill",
    orderLineId: "selected-service",
    reason: "Performed",
  },
] as const satisfies readonly NativeOrderAction[]) {
  test(`${initial.action} changes only reason and preserves the server-owned selection`, () => {
    expect(isNativeOrderAction(initial)).toBe(true)
    expect(
      nativeOrderCandidate(initial, {
        reason: "Reviewed change",
        quantity: "999",
      }),
    ).toEqual({
      ok: true,
      payload: { ...initial, reason: "Reviewed change" },
    })
    expect(nativeOrderCandidate(initial, { reason: " " }).ok).toBe(false)
  })
}
test("unknown money/refund/authority fields in a draft never enter a native candidate", () => {
  expect(
    isNativeOrderAction({ action: "customer_create", name: "Customer" }),
  ).toBe(false)
  expect(
    nativeOrderCandidate({ ...returned, refundMinor: 100 } as never, {
      reason: returned.reason,
    }).ok,
  ).toBe(false)
  expect(
    nativeOrderCandidate({ ...returned, actorUserId: "other" } as never, {
      reason: returned.reason,
    }).ok,
  ).toBe(false)
})
