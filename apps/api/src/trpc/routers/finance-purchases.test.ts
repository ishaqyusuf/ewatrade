import { expect, test } from "bun:test"
import { CatalogError } from "@ewatrade/db/queries"
import { createCallerFactory } from "../init"
import { financeRouter } from "./finance"

const createCaller = createCallerFactory(financeRouter)
const effectiveAt = "2026-09-16T12:00:00.000Z"
const purchase = {
  bookId: "book-1",
  clientCommandId: "purchase-1",
  supplierId: "supplier-1",
  storeId: "store-1",
  description: "Received inventory",
  incurredAt: "2026-09-15T12:00:00.000Z",
  lines: [
    {
      balanceSourceId: "balance-1",
      enteredInventoryUnitId: "unit-1",
      expectedConfigurationVersionId: "version-1",
      expectedBalanceRevision: 0,
      enteredQuantity: "1.25",
      categories: [{ name: "Restock" }],
      amountMinor: "2000",
      description: "Received cases",
    },
  ],
}

function guardedCaller(role: string, failure?: Error) {
  let effects = 0
  const db = new Proxy(
    {},
    {
      get() {
        return async () => {
          effects += 1
          throw failure ?? new Error("Database access was not expected")
        }
      },
    },
  )
  const caller = createCaller({
    db,
    requestHeaders: new Headers(),
    requestId: "finance-purchase-test",
    session: {
      session: { id: "session-1", token: "session-token" },
      user: { id: "session-actor" },
    },
    tenantContext: {
      tenant: { id: "session-tenant", qaPurgeStartedAt: null },
      membership: { id: "membership-1", role },
    },
  } as never)
  return { caller, effects: () => effects }
}

test("all purchase procedures deny Manager before any database access", async () => {
  const { caller, effects } = guardedCaller("MANAGER")
  const commands = [
    () => caller.recordPurchase(purchase),
    () =>
      caller.payPurchase({
        bookId: "book-1",
        clientCommandId: "payment-1",
        billId: "bill-1",
        moneyAccountId: "bank-1",
        amountMinor: "600",
        description: "Part payment",
        effectiveAt,
      }),
    () =>
      caller.reversePurchasePayment({
        bookId: "book-1",
        clientCommandId: "reversal-1",
        paymentId: "payment-1",
        reason: "Entered twice",
        effectiveAt,
      }),
    () =>
      caller.allocateSupplierAdvance({
        bookId: "book-1",
        clientCommandId: "allocate-1",
        billId: "bill-1",
        advanceEntryId: "advance-1",
        amountMinor: "700",
        description: "Apply advance",
        effectiveAt,
      }),
    () =>
      caller.releaseSupplierAllocation({
        bookId: "book-1",
        clientCommandId: "release-1",
        allocationId: "allocation-1",
        amountMinor: "200",
        reason: "Return to advance",
        effectiveAt,
      }),
    () => caller.purchase({ bookId: "book-1", billId: "bill-1" }),
    () => caller.purchases({ bookId: "book-1" }),
  ]
  for (const command of commands) {
    await expect(command()).rejects.toMatchObject({ code: "FORBIDDEN" })
  }
  expect(effects()).toBe(0)
})

test("purchase stock conflicts remain actionable API errors", async () => {
  for (const [error, code] of [
    [
      new CatalogError("REVISION_CONFLICT", "Refresh changed stock"),
      "CONFLICT",
    ],
    [
      new CatalogError("STALE_CONFIGURATION", "Refresh changed units"),
      "CONFLICT",
    ],
    [
      new CatalogError("INVALID_STOCK_OPERATION", "Check the receipt"),
      "BAD_REQUEST",
    ],
  ] as const) {
    const { caller, effects } = guardedCaller("OWNER", error)
    await expect(caller.recordPurchase(purchase)).rejects.toMatchObject({
      code,
      message: error.message,
    })
    expect(effects()).toBe(1)
  }
})

test("purchase API rejects invented authority, source identities and cost snapshots", async () => {
  const { caller, effects } = guardedCaller("OWNER")
  const originalLine = purchase.lines[0]
  if (!originalLine) throw new Error("Missing test line")
  const invalidInputs = [
    { ...purchase, actorUserId: "foreign-actor" },
    { ...purchase, tenantId: "foreign-tenant" },
    { ...purchase, journalEntryId: "invented-journal" },
    {
      ...purchase,
      lines: [{ ...originalLine, stockOperationId: "old-stock" }],
    },
    { ...purchase, lines: [{ ...originalLine, unitCostMinor: "1" }] },
  ]
  for (const input of invalidInputs) {
    await expect(caller.recordPurchase(input as never)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
  }
  await expect(
    caller.payPurchase({
      bookId: "book-1",
      clientCommandId: "pay-1",
      billId: "bill-1",
      moneyAccountId: "bank-1",
      amountMinor: "600",
      description: "Part payment",
      effectiveAt,
      tenantId: "foreign-tenant",
    } as never),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  await expect(
    caller.purchases({
      bookId: "book-1",
      actorUserId: "foreign-actor",
    } as never),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  expect(effects()).toBe(0)
})

test("purchase API rejects ambiguous stock lines and invalid financial bounds", async () => {
  const { caller, effects } = guardedCaller("OWNER")
  const line = purchase.lines[0]
  if (!line) throw new Error("Missing test line")
  const invalidInputs = [
    { ...purchase, lines: [line, line] },
    { ...purchase, dueAt: "2026-09-14T12:00:00.000Z" },
    { ...purchase, lines: [{ ...line, categories: [] }] },
    { ...purchase, lines: [{ ...line, enteredQuantity: "0" }] },
    {
      ...purchase,
      lines: [{ ...line, expectedBalanceRevision: 2_147_483_648 }],
    },
    { ...purchase, lines: [{ ...line, amountMinor: "100000000000001" }] },
    {
      ...purchase,
      lines: [
        { ...line, amountMinor: "100000000000000" },
        { ...line, balanceSourceId: "balance-2", amountMinor: "1" },
      ],
    },
  ]
  for (const input of invalidInputs) {
    await expect(caller.recordPurchase(input)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
  }
  expect(effects()).toBe(0)
})
