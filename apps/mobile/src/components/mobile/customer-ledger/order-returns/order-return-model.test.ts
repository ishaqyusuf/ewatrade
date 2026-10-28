import { expect, test } from "bun:test"
import {
  type AvailableOrderReturn,
  type OrderReturnEntry,
  minorToMajorText,
  orderReturnCommandRevision,
  orderReturnConfirmationKey,
  orderReturnDraft,
  orderReturnIdentity,
  orderReturnRoute,
  returnAmount,
} from "./order-return-model"

const scope = {
  bookId: "book-1",
  accountId: "account-1",
  expectedRevision: "7",
  orderId: "order-1",
  storeId: "store-1",
  currencyCode: "NGN",
}

const entry = (change: Partial<OrderReturnEntry> = {}): OrderReturnEntry => ({
  reason: "Customer cancelled",
  credit: [{ allocationId: "alloc-1", entered: "30", capMinor: "3000" }],
  cash: {
    entered: "120",
    capMinor: "12000",
    method: "bank_transfer",
    reference: " TRF-9 ",
  },
  ...change,
})

test("an amount above the source's remaining cap is refused", () => {
  expect(returnAmount("30.01", "3000", "NGN").kind).toBe("problem")
  expect(returnAmount("30", "3000", "NGN")).toEqual({
    kind: "amount",
    minor: "3000",
  })
  expect(returnAmount("1,000", "100000", "NGN")).toEqual({
    kind: "amount",
    minor: "100000",
  })
  expect(returnAmount(" ", "3000", "NGN")).toEqual({ kind: "empty" })
  expect(returnAmount("0", "3000", "NGN").kind).toBe("problem")
  expect(returnAmount("1.234", "3000", "NGN").kind).toBe("problem")
})

test("mixed tender restores credit to its source and returns only cash", () => {
  const draft = orderReturnDraft(scope, entry())
  expect(draft).toEqual({
    kind: "ready",
    payload: {
      bookId: "book-1",
      accountId: "account-1",
      expectedRevision: "7",
      orderId: "order-1",
      storeId: "store-1",
      reason: "Customer cancelled",
      creditReturns: [{ allocationId: "alloc-1", amountMinor: "3000" }],
      cashReturn: {
        amountMinor: 12000,
        method: "bank_transfer",
        reference: "TRF-9",
      },
    },
    creditMinor: "3000",
    cashMinor: "12000",
  })
})

test("credit-only and cash-only returns omit the other side", () => {
  const credit = orderReturnDraft(scope, entry({ cash: null }))
  expect(credit.kind === "ready" && credit.payload.cashReturn).toBe(undefined)
  const cash = orderReturnDraft(
    scope,
    entry({
      credit: [{ allocationId: "alloc-1", entered: "", capMinor: "3000" }],
    }),
  )
  expect(cash.kind === "ready" && cash.payload.creditReturns).toEqual([])
})

test("nothing chosen, a missing reason or a repeated source is not ready", () => {
  expect(
    orderReturnDraft(
      scope,
      entry({
        credit: [{ allocationId: "alloc-1", entered: "", capMinor: "3000" }],
        cash: null,
      }),
    ),
  ).toEqual({ kind: "invalid", problems: {}, empty: true })
  const unexplained = orderReturnDraft(scope, entry({ reason: "  " }))
  expect(unexplained.kind === "invalid" && unexplained.problems.reason).toBe(
    "Give a reason.",
  )
  const repeated = orderReturnDraft(
    scope,
    entry({
      credit: [
        { allocationId: "alloc-1", entered: "10", capMinor: "3000" },
        { allocationId: "alloc-1", entered: "10", capMinor: "3000" },
      ],
    }),
  )
  expect(repeated.kind).toBe("invalid")
})

test("an over-cap cash amount never becomes a command", () => {
  const draft = orderReturnDraft(
    scope,
    entry({
      cash: {
        entered: "121",
        capMinor: "12000",
        method: "cash",
        reference: "",
      },
    }),
  )
  expect(draft.kind === "invalid" && Boolean(draft.problems.cash)).toBe(true)
})

test("confirmation is bound to revision, sources and amounts", () => {
  const ready = orderReturnDraft(scope, entry())
  if (ready.kind !== "ready") throw new Error("expected ready")
  const key = orderReturnConfirmationKey(ready.payload)
  const changed = [
    orderReturnDraft({ ...scope, expectedRevision: "8" }, entry()),
    orderReturnDraft(
      scope,
      entry({
        credit: [{ allocationId: "alloc-2", entered: "30", capMinor: "3000" }],
      }),
    ),
    orderReturnDraft(
      scope,
      entry({
        credit: [{ allocationId: "alloc-1", entered: "29", capMinor: "3000" }],
      }),
    ),
    orderReturnDraft(scope, entry({ cash: null })),
  ]
  for (const draft of changed) {
    if (draft.kind !== "ready") throw new Error("expected ready")
    expect(orderReturnConfirmationKey(draft.payload)).not.toBe(key)
  }
  expect(orderReturnConfirmationKey(ready.payload)).toBe(key)
})

const available: AvailableOrderReturn = {
  status: "AVAILABLE",
  orderId: "order-1",
  orderNumber: "ORD-1",
  storeId: "store-1",
  customerId: "customer-1",
  customerName: "Ada",
  currencyCode: "NGN",
  bookId: "book-1",
  accountId: "account-1",
  accountRevision: "7",
  orderPaidMinor: "15000",
  ordinaryCashMaxMinor: "12000",
  ordinaryCashRemainingMinor: "12000",
  creditMaxMinor: "3000",
  reservedCreditMinor: "0",
  canReturn: true,
  creditSources: [
    {
      allocationId: "alloc-1",
      originalAllocationId: "alloc-1",
      creditEntryId: "entry-1",
      remainingMinor: "3000",
      sourceKind: "BILLED",
      effectiveAt: new Date("2026-10-20T10:00:00Z"),
    },
  ],
}

const read = {
  ask: false,
  allowed: true,
  status: "success" as const,
  forbidden: false,
  fetchedAfterMount: true,
  data: available,
}

test("only a fresh Owner/Admin review with held credit opens sources", () => {
  expect(orderReturnRoute(read)).toEqual({ kind: "sources", review: available })
  expect(orderReturnRoute({ ...read, ask: true }).kind).toBe("ordinary")
  expect(orderReturnRoute({ ...read, allowed: false }).kind).toBe("ordinary")
  expect(orderReturnRoute({ ...read, allowed: null }).kind).toBe("loading")
  expect(orderReturnRoute({ ...read, fetchedAfterMount: false }).kind).toBe(
    "loading",
  )
  expect(
    orderReturnRoute({ ...read, status: "pending", data: undefined }).kind,
  ).toBe("loading")
})

test("a failed review is never treated as no credit", () => {
  expect(
    orderReturnRoute({ ...read, status: "error", data: undefined }).kind,
  ).toBe("error")
  expect(
    orderReturnRoute({
      ...read,
      status: "error",
      forbidden: true,
      data: undefined,
    }).kind,
  ).toBe("ordinary")
})

test("known no credit keeps the ordinary refund; unsafe states stop", () => {
  expect(
    orderReturnRoute({ ...read, data: { ...available, creditSources: [] } })
      .kind,
  ).toBe("ordinary")
  const unavailable = (
    reason: Extract<
      Parameters<typeof orderReturnRoute>[0]["data"],
      { status: "UNAVAILABLE" }
    >["reason"],
  ) =>
    orderReturnRoute({
      ...read,
      data: {
        status: "UNAVAILABLE",
        reason,
        orderId: "order-1",
        orderNumber: "ORD-1",
      },
    }).kind
  expect(unavailable("CUSTOMER_ACCOUNT_REQUIRED")).toBe("ordinary")
  expect(unavailable("CUSTOMER_REQUIRED")).toBe("ordinary")
  expect(unavailable("FINANCE_BOOK_REQUIRED")).toBe("ordinary")
  expect(unavailable("SOURCE_RECONCILIATION_REQUIRED")).toBe("unavailable")
  expect(unavailable("CLOSED_PERIOD")).toBe("unavailable")
  expect(unavailable("SOURCE_LIMIT_EXCEEDED")).toBe("unavailable")
})

test("a new revision or source cap is a new review", () => {
  const key = orderReturnIdentity(available)
  expect(orderReturnIdentity({ ...available })).toBe(key)
  expect(orderReturnIdentity({ ...available, accountRevision: "8" })).not.toBe(
    key,
  )
  expect(
    orderReturnIdentity({
      ...available,
      creditSources: available.creditSources.map((source) => ({
        ...source,
        remainingMinor: "2000",
      })),
    }),
  ).not.toBe(key)
  expect(
    orderReturnIdentity({ ...available, ordinaryCashMaxMinor: "11000" }),
  ).not.toBe(key)
})

test("minor units become editable major amounts exactly", () => {
  expect(minorToMajorText("3000")).toBe("30")
  expect(minorToMajorText("3050")).toBe("30.5")
  expect(minorToMajorText("3005")).toBe("30.05")
  expect(minorToMajorText("99999999999999")).toBe("999999999999.99")
})

test("unresolved retry retains its original reviewed revision; unrelated commands do not", () => {
  expect(orderReturnCommandRevision("8", null)).toBe("8")
  expect(
    orderReturnCommandRevision("8", {
      operation: "returnOrderFunds",
      recoveryMetadata: { expectedSnapshotSequence: "7" },
    }),
  ).toBe("7")
  expect(
    orderReturnCommandRevision("8", {
      operation: "recordReceipt",
      recoveryMetadata: { expectedSnapshotSequence: "7" },
    }),
  ).toBe("8")
  expect(
    orderReturnCommandRevision("8", { operation: "returnOrderFunds" }),
  ).toBe("8")
})
