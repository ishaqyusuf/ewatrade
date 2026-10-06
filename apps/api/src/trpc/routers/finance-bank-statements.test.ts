import { expect, test } from "bun:test"
import {
  financeBankCorrectionSourceSchema,
  financeBankMatchSchema,
  financeBankStatementImportSchema,
  financeBankUnmatchSchema,
} from "../../schemas/finance-bank-statements"
import { createCallerFactory } from "../init"
import { financeRouter } from "./finance"

const imported = {
  bookId: "book",
  accountId: "bank",
  clientCommandId: "import",
  expectedRevision: "0",
  currencyCode: "NGN",
  reference: "Original bank statement",
  startsAt: new Date("2025-01-01T00:00:00Z"),
  endsAt: new Date("2025-01-31T23:59:59.999Z"),
  openingBalanceMinor: "0",
  closingBalanceMinor: "100",
  csv: "Id,Date,Amount,Description\n1,2025-01-02,100,Deposit",
  columns: {
    transactionId: "Id",
    date: "Date",
    amount: "Amount",
    description: "Description",
  },
  units: "MINOR" as const,
}
const matched = {
  bookId: "book",
  accountId: "bank",
  clientCommandId: "match",
  expectedRevision: "1",
  expectedSnapshotSequence: "2",
  reason: "Review original source",
  bankRowIds: ["bank-row"],
  journalLineIds: ["journal-line"],
}
const released = {
  bookId: "book",
  accountId: "bank",
  clientCommandId: "release",
  expectedRevision: "2",
  expectedSnapshotSequence: "2",
  reason: "Correct prior review",
  matchId: "original-match",
}

test("bank source lookup accepts only exact Book, bank account and journal entry identities", () => {
  const input = { bookId: "book", accountId: "bank", entryId: "journal" }
  expect(financeBankCorrectionSourceSchema.parse(input)).toEqual(input)
  for (const field of [
    "tenantId",
    "actorUserId",
    "sourceKind",
    "sourceId",
    "paymentId",
    "billId",
    "amountMinor",
    "target",
  ])
    expect(
      financeBankCorrectionSourceSchema.safeParse({
        ...input,
        [field]: "caller",
      }).success,
    ).toBe(false)
  for (const field of ["bookId", "accountId", "entryId"])
    expect(
      financeBankCorrectionSourceSchema.safeParse({ ...input, [field]: "" })
        .success,
    ).toBe(false)
})
const correctionSource = {
  bookId: "book",
  accountId: "bank",
  entryId: "journal-entry",
}

test("strict bank commands accept source identities but reject injected actor, financial posting and review verdict authority", () => {
  expect(financeBankStatementImportSchema.parse(imported)).toEqual(imported)
  expect(financeBankMatchSchema.parse(matched)).toEqual(matched)
  expect(financeBankUnmatchSchema.parse(released)).toEqual(released)
  expect(financeBankCorrectionSourceSchema.parse(correctionSource)).toEqual(
    correctionSource,
  )
  for (const [schema, input] of [
    [financeBankStatementImportSchema, imported],
    [financeBankMatchSchema, matched],
    [financeBankUnmatchSchema, released],
  ] as const) {
    for (const field of [
      "tenantId",
      "actorUserId",
      "lines",
      "journalAmountMinor",
      "canClose",
      "operationallyReconciled",
    ])
      expect(schema.safeParse({ ...input, [field]: "caller" }).success).toBe(
        false,
      )
    expect(
      schema.safeParse({ ...input, expectedRevision: undefined }).success,
    ).toBe(false)
  }
  for (const field of ["tenantId", "actorUserId", "sourceKind", "sourceId"])
    expect(
      financeBankCorrectionSourceSchema.safeParse({
        ...correctionSource,
        [field]: "caller",
      }).success,
    ).toBe(false)
  expect(
    financeBankMatchSchema.safeParse({
      ...matched,
      expectedSnapshotSequence: undefined,
    }).success,
  ).toBe(false)
  expect(
    financeBankMatchSchema.safeParse({ ...matched, bankRowIds: [] }).success,
  ).toBe(false)
  expect(
    financeBankMatchSchema.safeParse({
      ...matched,
      bankRowIds: Array(51).fill("row"),
    }).success,
  ).toBe(false)
})

test("registered bank import/read/match/unmatch/history deny Manager before database access", async () => {
  let access = 0
  const db = new Proxy(
    {},
    {
      get() {
        access++
        throw new Error("No Manager bank access")
      },
    },
  )
  const caller = createCallerFactory(financeRouter)({
    db,
    requestHeaders: new Headers(),
    requestId: "bank-test",
    session: {
      session: { id: "session", token: "token" },
      user: { id: "actor" },
    },
    tenantContext: {
      tenant: { id: "tenant", qaPurgeStartedAt: null },
      membership: { id: "membership", role: "MANAGER" },
    },
  } as never)
  await expect(caller.bankStatements.import(imported)).rejects.toMatchObject({
    code: "FORBIDDEN",
  })
  await expect(caller.bankStatements.match(matched)).rejects.toMatchObject({
    code: "FORBIDDEN",
  })
  await expect(caller.bankStatements.unmatch(released)).rejects.toMatchObject({
    code: "FORBIDDEN",
  })
  await expect(
    caller.bankStatements.get({ bookId: "book", statementId: "statement" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  await expect(
    caller.bankStatements.list({ bookId: "book" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  await expect(
    caller.bankStatements.history({ bookId: "book", accountId: "bank" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  await expect(
    caller.bankStatements.resolveCorrectionSource({
      bookId: "book",
      accountId: "bank",
      entryId: "journal",
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  await expect(
    caller.bankStatements.resolveCorrectionSource(correctionSource),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  expect(access).toBe(0)
})
