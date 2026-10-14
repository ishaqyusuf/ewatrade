import { expect, test } from "bun:test"
import {
  type RecordBusinessActivityInput,
  prepareBusinessActivity,
} from "./record"

const order: RecordBusinessActivityInput = {
  tenantId: "business",
  storeId: "store-a",
  storeIds: ["store-b", "store-a"],
  type: "order.recorded",
  source: { kind: "commercial_order", id: "order", action: "created" },
  actor: { kind: "staff", userId: "owner" },
  origin: { channel: "assistant" },
  occurredAt: "2026-10-14T09:00:00+01:00",
  payload: {
    orderId: "order",
    orderNumber: "ORD-001",
    customerLabel: null,
    amount: { minor: "90000", currencyCode: "NGN" },
    status: "CONFIRMED",
  },
}

test("replay identity stays bound to the same Business and canonical source; equivalent Store/time inputs normalize", () => {
  const first = prepareBusinessActivity(order)
  const replay = prepareBusinessActivity({
    ...order,
    storeIds: ["store-a", "store-b", "store-b"],
    occurredAt: "2026-10-14T08:00:00Z",
  })
  expect(first.businessEventKey).toBe(replay.businessEventKey)
  expect(first.payloadHash).toBe(replay.payloadHash)
  expect(first.storeIds).toEqual(["store-a", "store-b"])
  expect(
    prepareBusinessActivity({ ...order, tenantId: "other" }).businessEventKey,
  ).not.toBe(first.businessEventKey)
  expect(
    prepareBusinessActivity({
      ...order,
      source: { ...order.source, id: "another-order" },
    }).businessEventKey,
  ).not.toBe(first.businessEventKey)
})

test("same source with altered actor, scope, original facts or recorded origin is a mismatched replay", () => {
  const first = prepareBusinessActivity(order)
  for (const change of [
    { actor: { kind: "staff", userId: "someone-else" } },
    { origin: { channel: "dashboard" } },
    { storeIds: ["store-a"] },
    { occurredAt: "2026-10-14T10:00:00Z" },
    {
      payload: {
        orderId: "order",
        orderNumber: "ORD-001",
        customerLabel: null,
        amount: { minor: "100000", currencyCode: "NGN" },
        status: "CONFIRMED",
      },
    },
  ] satisfies Partial<RecordBusinessActivityInput>[]) {
    const changed = prepareBusinessActivity({ ...order, ...change })
    expect(changed.businessEventKey).toBe(first.businessEventKey)
    expect(changed.payloadHash).not.toBe(first.payloadHash)
  }
})

test("the recording boundary refuses unimplemented types and caller-supplied delivery state", () => {
  expect(() =>
    prepareBusinessActivity({
      ...order,
      type: "import.completed",
      payload: {},
    }),
  ).toThrow()
  expect(() =>
    prepareBusinessActivity({
      ...order,
      actor: { kind: "staff", userId: "owner" },
      payload: { ...(order.payload as object), email: "person@example.com" },
    }),
  ).toThrow()
  const unknownOrigin = prepareBusinessActivity({ ...order, origin: undefined })
  expect(unknownOrigin.parsed.origin.channel).toBe("unknown")
  expect(() =>
    prepareBusinessActivity({ ...order, actor: { kind: "system" } }),
  ).toThrow("confirming staff")
})

test("Finance and staff scope are derived from the actual typed original, and conflicting scope is refused", () => {
  const invitation: RecordBusinessActivityInput = {
    ...order,
    type: "staff.invited",
    payload: {
      invitationId: "invite",
      membershipId: "cashier",
      role: "CASHIER",
    },
  }
  expect(prepareBusinessActivity(invitation).parsed.subjectMembershipId).toBe(
    "cashier",
  )
  expect(() =>
    prepareBusinessActivity({ ...invitation, subjectMembershipId: "foreign" }),
  ).toThrow("subject")
  const movement: RecordBusinessActivityInput = {
    ...order,
    type: "finance.movement_recorded",
    payload: {
      movementId: "move",
      bookId: "book",
      movementKind: "TRANSFER",
      amount: { minor: "100", currencyCode: "NGN" },
      fromAccountLabel: "Cash",
      toAccountLabel: "Bank",
    },
  }
  expect(prepareBusinessActivity(movement).parsed.financeBookId).toBe("book")
  expect(() =>
    prepareBusinessActivity({ ...movement, financeBookId: "foreign" }),
  ).toThrow("Book")
})
