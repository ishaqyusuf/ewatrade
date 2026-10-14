import { expect, test } from "bun:test"
import {
  type CollectionIntentSnapshot,
  type CollectionSourceSnapshot,
  type ProviderSettlementEvent,
  decideHeldResolution,
  decideManualReceipt,
  decideOpenCollection,
  decideProviderSettlement,
} from "./collection-intent"

const now = new Date("2026-10-12T12:00:00.000Z")
const hours = (n: number) => new Date(now.getTime() + n * 60 * 60 * 1000)
const order: CollectionSourceSnapshot = {
  kind: "commercial_order",
  id: "order-1042",
  tenantId: "tenant-a",
  storeId: "store-a",
  customerId: "customer-amina",
  currencyCode: "NGN",
  totalMinor: 520_000,
  paidMinor: 20_000,
  status: "open",
}
const intent: CollectionIntentSnapshot = {
  id: "intent-1",
  tenantId: "tenant-a",
  sourceKind: "commercial_order",
  sourceId: "order-1042",
  provider: "paystack",
  providerReference: "col_abc",
  amountMinor: 500_000,
  currencyCode: "NGN",
  status: "PENDING",
  expiresAt: hours(24),
}
const staff = {
  kind: "staff" as const,
  userId: "amina-u",
  storeIds: ["store-a"],
  canAcceptPayment: true,
}
const open = (overrides: Partial<Parameters<typeof decideOpenCollection>[0]>) =>
  decideOpenCollection({
    source: order,
    openIntents: [],
    actor: staff,
    amountMinor: 500_000,
    currencyCode: "ngn",
    provider: "paystack",
    expiresAt: hours(24),
    now,
    ...overrides,
  })

test("staff may link the full or a partial balance, never more", () => {
  expect(open({})).toEqual({
    ok: true,
    amountMinor: 500_000,
    currencyCode: "NGN",
    expiresAt: hours(24),
  })
  expect(open({ amountMinor: 200_000 })).toMatchObject({
    ok: true,
    amountMinor: 200_000,
  })
  // The full total after a partial manual payment would overcollect.
  expect(open({ amountMinor: 520_000 })).toMatchObject({
    ok: false,
    code: "AMOUNT_MISMATCH",
  })
  for (const amountMinor of [0, -1, 0.5, Number.NaN])
    expect(open({ amountMinor })).toMatchObject({ code: "INVALID_AMOUNT" })
  expect(open({ currencyCode: "USD" })).toMatchObject({
    code: "CURRENCY_MISMATCH",
  })
  expect(open({ source: { ...order, paidMinor: 520_000 } })).toMatchObject({
    code: "ALREADY_SETTLED",
  })
  expect(open({ source: { ...order, status: "cancelled" } })).toMatchObject({
    code: "SOURCE_UNAVAILABLE",
  })
})

test("only people who can accept payment for the order create links", () => {
  expect(open({ actor: { ...staff, canAcceptPayment: false } })).toMatchObject({
    code: "FORBIDDEN",
  })
  expect(open({ actor: { ...staff, storeIds: ["store-b"] } })).toMatchObject({
    code: "OUT_OF_SCOPE",
  })
  // A customer link pays its own order, in full only.
  expect(
    open({ actor: { kind: "customer_link", sourceId: "order-other" } }),
  ).toMatchObject({ code: "OUT_OF_SCOPE" })
  expect(
    open({
      actor: { kind: "customer_link", sourceId: "order-1042" },
      amountMinor: 200_000,
    }),
  ).toMatchObject({ code: "AMOUNT_MISMATCH" })
  expect(
    open({ actor: { kind: "customer_link", sourceId: "order-1042" } }).ok,
  ).toBe(true)
})

test("one open link per order with a real, bounded expiry", () => {
  expect(open({ openIntents: [intent] })).toMatchObject({
    code: "OPEN_INTENT_EXISTS",
  })
  // An expired or failed link no longer blocks a new one.
  expect(open({ openIntents: [{ ...intent, expiresAt: hours(-1) }] }).ok).toBe(
    true,
  )
  expect(open({ openIntents: [{ ...intent, status: "FAILED" }] }).ok).toBe(true)
  expect(open({ expiresAt: hours(73) })).toMatchObject({
    code: "INVALID_EXPIRY",
  })
  expect(
    open({ expiresAt: new Date(now.getTime() + 5 * 60 * 1000) }),
  ).toMatchObject({ code: "INVALID_EXPIRY" })
  expect(open({ expiresAt: new Date(Number.NaN) })).toMatchObject({
    code: "INVALID_EXPIRY",
  })
  expect(open({ now: new Date(Number.NaN) })).toMatchObject({
    code: "INVALID_TIME",
  })
})

test("manual receipts are positive whole amounts and wait for open links", () => {
  const manual = (
    amountMinor: number,
    openIntents: CollectionIntentSnapshot[] = [],
  ) => decideManualReceipt({ source: order, openIntents, amountMinor, now })
  expect(manual(500_000, [intent])).toMatchObject({
    code: "OPEN_INTENT_EXISTS",
  })
  expect(manual(500_000, [{ ...intent, status: "EXPIRED" }])).toEqual({
    ok: true,
  })
  expect(manual(500_001)).toMatchObject({ code: "AMOUNT_MISMATCH" })
  for (const amountMinor of [-1, 0, 0.5, Number.NaN])
    expect(manual(amountMinor)).toMatchObject({ code: "INVALID_AMOUNT" })
})

test("provider money settles its own source once and is otherwise held", () => {
  const event: ProviderSettlementEvent = {
    provider: "paystack",
    providerReference: "col_abc",
    amountMinor: 500_000,
    currencyCode: "NGN",
    status: "paid",
  }
  const decide = (
    overrides: {
      intent?: Partial<CollectionIntentSnapshot>
      source?: Partial<CollectionSourceSnapshot>
      event?: Partial<ProviderSettlementEvent>
    } = {},
  ) =>
    decideProviderSettlement({
      intent: { ...intent, ...overrides.intent },
      source: { ...order, ...overrides.source },
      event: { ...event, ...overrides.event },
    })
  expect(decide()).toEqual({ action: "settle", amountMinor: 500_000 })
  // A different order with a matching balance is not this intent's source.
  expect(decide({ source: { id: "order-other" } })).toEqual({
    action: "hold_for_reconciliation",
    reason: "source_mismatch",
  })
  expect(decide({ source: { tenantId: "tenant-b" } })).toEqual({
    action: "hold_for_reconciliation",
    reason: "source_mismatch",
  })
  expect(decide({ intent: { status: "PAID" } })).toEqual({
    action: "already_settled",
  })
  // The race the prescription path loses today: a manual payment landed first.
  expect(decide({ source: { paidMinor: 520_000 } })).toEqual({
    action: "hold_for_reconciliation",
    reason: "source_already_settled",
  })
  expect(
    decide({ intent: { status: "EXPIRED", expiresAt: hours(-2) } }),
  ).toEqual({ action: "settle", amountMinor: 500_000 })
  expect(decide({ event: { amountMinor: 499_999 } })).toEqual({
    action: "hold_for_reconciliation",
    reason: "amount_mismatch",
  })
  // The order's own currency must match, not just the intent and event.
  expect(decide({ source: { currencyCode: "USD" } })).toEqual({
    action: "hold_for_reconciliation",
    reason: "currency_mismatch",
  })
  expect(decide({ event: { currencyCode: null } })).toEqual({
    action: "hold_for_reconciliation",
    reason: "currency_mismatch",
  })
  expect(decide({ event: { providerReference: "col_other" } })).toEqual({
    action: "hold_for_reconciliation",
    reason: "provider_mismatch",
  })
  expect(decide({ source: { status: "cancelled" } })).toEqual({
    action: "hold_for_reconciliation",
    reason: "source_unavailable",
  })
  expect(decide({ event: { status: "failed" } })).toEqual({
    action: "mark_failed",
  })
  expect(
    decide({ intent: { status: "PAID" }, event: { status: "failed" } }),
  ).toEqual({ action: "ignore_failure", reason: "intent_not_open" })
})

test("held money is given back manually or kept as the order customer's credit", () => {
  const both = { canAcceptPayment: true, canRefund: true }
  const held = {
    intentId: "intent-1",
    tenantId: "tenant-a",
    sourceKind: "commercial_order" as const,
    sourceId: "order-1042",
    amountMinor: 500_000,
    currencyCode: "NGN",
    resolved: false,
  }
  // Another business's order and customer never receive this money.
  for (const source of [
    { ...order, tenantId: "tenant-b" },
    { ...order, id: "order-other" },
  ])
    for (const choice of [
      { kind: "manual_refund", method: "cash" },
      { kind: "customer_credit" },
    ] as const)
      expect(
        decideHeldResolution({ held, source, choice, actor: both }),
      ).toMatchObject({ ok: false, code: "SOURCE_MISMATCH" })
  expect(
    decideHeldResolution({
      held,
      source: order,
      choice: { kind: "manual_refund", method: "cash" },
      actor: both,
    }),
  ).toEqual({
    ok: true,
    effect: "manual_refund",
    method: "cash",
    amountMinor: 500_000,
  })
  expect(
    decideHeldResolution({
      held,
      source: order,
      choice: { kind: "customer_credit" },
      actor: both,
    }),
  ).toEqual({
    ok: true,
    effect: "customer_credit",
    customerId: "customer-amina",
    amountMinor: 500_000,
    currencyCode: "NGN",
  })
  expect(
    decideHeldResolution({
      held,
      source: { ...order, customerId: null },
      choice: { kind: "customer_credit" },
      actor: both,
    }),
  ).toMatchObject({ code: "NO_CUSTOMER" })
  expect(
    decideHeldResolution({
      held,
      source: order,
      choice: { kind: "manual_refund", method: "cash" },
      actor: { canAcceptPayment: true, canRefund: false },
    }),
  ).toMatchObject({ code: "FORBIDDEN" })
  expect(
    decideHeldResolution({
      held: { ...held, resolved: true },
      source: order,
      choice: { kind: "manual_refund", method: "cash" },
      actor: both,
    }),
  ).toMatchObject({ code: "ALREADY_SETTLED" })
  expect(
    decideHeldResolution({
      held: { ...held, currencyCode: "USD" },
      source: order,
      choice: { kind: "customer_credit" },
      actor: both,
    }),
  ).toMatchObject({ code: "CURRENCY_MISMATCH" })
})
