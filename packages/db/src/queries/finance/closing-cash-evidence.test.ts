import { expect, test } from "bun:test"
import { Prisma } from "../../../generated/prisma/client"
import { getFinanceClosingCashEvidenceInTransaction as evidence } from "./closing-cash-evidence"
import { financePayloadHash } from "./rules"

function fixture() {
  const through = new Date("2025-12-31T23:59:59.999Z")
  const count = {
    id: "count",
    bookId: "book",
    accountId: "cash",
    asOf: through,
    snapshotSequence: 3n,
    expectedBalanceMinor: 100n,
    observedBalanceMinor: 100n,
    actorUserId: "original-owner",
    reference: "Physical count",
    createdAt: new Date("2026-01-01T00:00:00Z"),
  }
  const command = {
    id: "command",
    bookId: "book",
    kind: "CASH_COUNT",
    actorUserId: count.actorUserId,
    result: { id: count.id },
    payloadHash: financePayloadHash({
      accountId: count.accountId,
      asOf: count.asOf,
      observedBalanceMinor: count.observedBalanceMinor,
      reference: count.reference,
    }),
  }
  const input = {
    bookId: "book",
    through,
    snapshotSequence: 7n,
    now: new Date("2026-01-02T00:00:00Z"),
    accounts: [
      {
        accountId: "cash",
        kind: "ASSET",
        purpose: "CASH",
        name: "Till",
        closingBalanceMinor: "100",
      },
    ],
  }
  const state = {
    counts: [count],
    commands: [command],
    basis: [{ id: count.id, expectedMinor: "100" }],
  }
  const reads: unknown[] = []
  const tx = {
    financeReconciliation: {
      findMany: async (query: unknown) => {
        reads.push(query)
        return state.counts
      },
    },
    financeCommand: {
      findMany: async (query: unknown) => {
        reads.push(query)
        return state.commands
      },
    },
    $queryRaw: async (query: Prisma.Sql) => {
      reads.push(query)
      return state.basis
    },
  }
  return { tx: tx as never, input, count, command, state, reads }
}

test("an earlier count still reconciles after unrelated postings only with original command and actual ledger proof", async () => {
  const f = fixture()
  const result = await evidence(f.tx, f.input)
  expect(result.status).toBe("PASS")
  expect(result.scope).toBe("REGISTERED_CASH_ACCOUNTS")
  expect(result.snapshotSequence).toBe("7")
  expect(result.cash[0]).toMatchObject({
    countId: "count",
    countSnapshotSequence: "3",
    originalExpectedBalanceMinor: "100",
    basisVerified: true,
    status: "PASS",
  })
  expect(f.reads).toContainEqual(
    expect.objectContaining({
      take: 201,
      where: expect.objectContaining({ bookId: "book", asOf: f.input.through }),
    }),
  )
  const query = f.reads.find((row) => row instanceof Prisma.Sql)
  expect(query).toBeDefined()
})

test("stored expected balances cannot hide a changed original ledger basis or incomplete aggregate", async () => {
  for (const basis of [
    [{ id: "count", expectedMinor: "99" }],
    [],
    [{ id: "foreign", expectedMinor: "100" }],
    [
      { id: "count", expectedMinor: "100" },
      { id: "count", expectedMinor: "100" },
    ],
  ]) {
    const f = fixture()
    f.state.basis = basis
    await expect(evidence(f.tx, f.input)).rejects.toThrow("ledger basis")
  }
})

test("canonical command binds physical observation, reference, original actor and unique ownership", async () => {
  for (const fault of [
    "amount",
    "reference",
    "actor",
    "hash",
    "missing",
    "duplicate",
    "foreign",
    "wrong-result",
    "wrong-kind",
  ]) {
    const f = fixture()
    if (fault === "amount") f.count.observedBalanceMinor = 101n
    if (fault === "reference") f.count.reference = "Altered"
    if (fault === "actor") f.count.actorUserId = "another"
    if (fault === "hash") f.command.payloadHash = "invalid"
    if (fault === "missing") f.state.commands = []
    if (fault === "duplicate")
      f.state.commands.push({ ...f.command, id: "duplicate" })
    if (fault === "foreign") f.command.bookId = "other"
    if (fault === "wrong-result") f.command.result.id = "another"
    if (fault === "wrong-kind") f.command.kind = "EXPENSE"
    await expect(evidence(f.tx, f.input)).rejects.toThrow("command")
  }
})

test("physical evidence differs from changed current cash, and missing counts remain unverified", async () => {
  const f = fixture()
  const account = f.input.accounts[0]
  if (!account) throw new Error("Missing cash")
  account.closingBalanceMinor = "101"
  expect((await evidence(f.tx, f.input)).status).toBe("BLOCKED")
  f.state.counts = []
  const result = await evidence(f.tx, f.input)
  expect(result.status).toBe("REVIEW_REQUIRED")
  expect(result.cash[0]).toMatchObject({ countId: null, basisVerified: false })
})

test("count and command overflow do not silently accept a truncated source", async () => {
  const f = fixture()
  f.state.counts = Array.from({ length: 201 }, (_, n) => ({
    ...f.count,
    id: `count-${n}`,
  }))
  let result = await evidence(f.tx, f.input)
  expect(result.countCoverageComplete).toBe(false)
  expect(result.commandCoverageComplete).toBe(false)
  expect(result.status).toBe("REVIEW_REQUIRED")
  expect(f.reads).toHaveLength(1)
  f.state.counts = [f.count]
  f.state.commands = Array.from({ length: 201 }, (_, n) => ({
    ...f.command,
    id: `command-${n}`,
  }))
  result = await evidence(f.tx, f.input)
  expect(result.commandCoverageComplete).toBe(false)
  expect(result.status).toBe("REVIEW_REQUIRED")
  expect(result.cash[0]?.basisVerified).toBe(false)
})

test("foreign, duplicate, future, negative and invalid-source counts fail closed", async () => {
  for (const fault of [
    "foreign",
    "account",
    "snapshot",
    "cutoff",
    "negative",
    "oversize",
    "future-created",
    "early-created",
    "duplicate",
  ]) {
    const f = fixture()
    if (fault === "foreign") f.count.bookId = "another"
    if (fault === "account") f.count.accountId = "bank"
    if (fault === "snapshot") f.count.snapshotSequence = 8n
    if (fault === "cutoff") f.count.asOf = new Date("2025-12-30T23:59:59.999Z")
    if (fault === "negative") f.count.observedBalanceMinor = -1n
    if (fault === "oversize")
      f.count.observedBalanceMinor = 9223372036854775808n
    if (fault === "future-created") f.count.createdAt = new Date("2030-01-01")
    if (fault === "early-created") f.count.createdAt = new Date("2020-01-01")
    if (fault === "duplicate") f.state.counts.push({ ...f.count })
    await expect(evidence(f.tx, f.input)).rejects.toThrow(
      "Cash review source changed",
    )
  }
})

test("uncompleted cutoffs cannot pass even with no registered cash controls, and cash must be an asset", async () => {
  const f = fixture()
  f.input.accounts = []
  f.input.now = f.input.through
  expect((await evidence(f.tx, f.input)).status).toBe("REVIEW_REQUIRED")
  f.input.now = new Date("2026-01-02")
  expect((await evidence(f.tx, f.input)).status).toBe("PASS")
  expect(f.reads).toEqual([])
  f.input.accounts = [
    {
      accountId: "cash",
      kind: "LIABILITY",
      purpose: "CASH",
      name: "Wrong",
      closingBalanceMinor: "0",
    },
  ]
  await expect(evidence(f.tx, f.input)).rejects.toThrow("asset accounts")
})
