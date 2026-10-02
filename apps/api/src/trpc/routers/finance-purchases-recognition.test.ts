import { expect, test } from "bun:test"
import { createCallerFactory } from "../init"
import { financeRouter } from "./finance"

const createCaller = createCallerFactory(financeRouter)
const effectiveAt = "2026-09-16T12:00:00.000Z"
const base = {
  bookId: "book",
  clientCommandId: "command",
  recognitionId: "recognition",
  effectiveAt,
  reference: "source-1",
}
const registration = {
  bookId: "book",
  clientCommandId: "register",
  supplierId: "supplier",
  storeId: "store",
  description: "Agreed goods",
  agreedAt: effectiveAt,
  lines: [
    {
      balanceSourceId: "balance",
      enteredInventoryUnitId: "unit",
      expectedConfigurationVersionId: "version",
      enteredQuantity: "1",
      amountMinor: "1000",
      description: "Cases",
      categories: [{ name: "Restock" }],
    },
  ],
}

function callerFor(role: string) {
  let effects = 0
  const db = new Proxy(
    {},
    {
      get() {
        return async () => {
          effects += 1
          throw new Error("Unexpected database access")
        }
      },
    },
  )
  const caller = createCaller({
    db,
    requestHeaders: new Headers(),
    requestId: "purchase-recognition-test",
    session: {
      session: { id: "session", token: "token" },
      user: { id: "actor" },
    },
    tenantContext: {
      tenant: { id: "tenant", qaPurgeStartedAt: null },
      membership: { id: "membership", role },
    },
  } as never)
  return { caller, effects: () => effects }
}

test("all new purchase sources deny Manager before database access", async () => {
  const { caller, effects } = callerFor("MANAGER")
  for (const action of [
    () => caller.registerPurchase(registration),
    () =>
      caller.recognizePurchase({
        ...base,
        stage: "INVOICE",
        invoiceAmountMinor: "1000",
      }),
    () =>
      caller.reversePurchaseRecognition({
        bookId: "book",
        clientCommandId: "reverse",
        recognitionId: "recognition",
        eventId: "event",
        effectiveAt,
        reason: "Incorrect invoice",
      }),
    () =>
      caller.purchaseRecognition({
        bookId: "book",
        recognitionId: "recognition",
      }),
  ])
    await expect(action()).rejects.toMatchObject({ code: "FORBIDDEN" })
  expect(effects()).toBe(0)
})

test("stage inputs cannot mix invoice, ownership, physical stock or invented sources", async () => {
  const { caller, effects } = callerFor("OWNER")
  for (const input of [
    { ...base, stage: "INVOICE" },
    {
      ...base,
      stage: "INVOICE",
      invoiceAmountMinor: "1000",
      receipts: [{ lineId: "line", expectedBalanceRevision: 0 }],
    },
    { ...base, stage: "OWNERSHIP", invoiceAmountMinor: "1000" },
    { ...base, stage: "OWNERSHIP", dueAt: effectiveAt },
    { ...base, stage: "RECEIPT" },
    {
      ...base,
      stage: "RECEIPT",
      receipts: [
        { lineId: "line", expectedBalanceRevision: 0 },
        { lineId: "line", expectedBalanceRevision: 0 },
      ],
    },
    {
      ...base,
      stage: "RECEIPT",
      receipts: [{ lineId: "line", expectedBalanceRevision: 2_147_483_647 }],
    },
    { ...base, stage: "OWNERSHIP", actorUserId: "foreign" },
    {
      ...base,
      stage: "INVOICE",
      invoiceAmountMinor: "1000",
      journalEntryId: "invented",
    },
    {
      ...base,
      stage: "RECEIPT",
      receipts: [
        {
          lineId: "line",
          expectedBalanceRevision: 0,
          stockMovementId: "existing",
        },
      ],
    },
  ])
    await expect(
      caller.recognizePurchase(input as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  expect(effects()).toBe(0)
})

test("agreement registration rejects duplicated goods, invented stock sources and cost overflow", async () => {
  const { caller, effects } = callerFor("OWNER")
  const line = registration.lines[0]
  if (!line) throw new Error("Missing fixture line")
  for (const input of [
    { ...registration, lines: [line, line] },
    { ...registration, tenantId: "foreign" },
    { ...registration, lines: [{ ...line, stockMovementId: "existing" }] },
    { ...registration, lines: [{ ...line, expectedBalanceRevision: 0 }] },
    {
      ...registration,
      lines: [
        { ...line, amountMinor: "100000000000000" },
        { ...line, balanceSourceId: "other", amountMinor: "1" },
      ],
    },
  ])
    await expect(caller.registerPurchase(input as never)).rejects.toMatchObject(
      { code: "BAD_REQUEST" },
    )
  expect(effects()).toBe(0)
})
