import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import {
  financeDocumentCommand,
  prepareFinanceDocumentCommand,
} from "./commands"

const input = {
  tenantId: "tenant",
  actorUserId: "owner",
  bookId: "book",
  clientCommandId: "confirmed-command",
}
function fixture() {
  const state = {
    allowed: true,
    previous: null as {
      kind: string
      payloadHash: string
      result: Prisma.JsonValue
    } | null,
    writes: [] as unknown[],
  }
  const tx = {
    $queryRaw: async () => [{ id: "book" }],
    membership: {
      findFirst: async () =>
        state.allowed ? { tenant: { isActive: true } } : null,
    },
    financeBook: {
      findUniqueOrThrow: async () => ({ id: "book", currencyCode: "NGN" }),
    },
    financeCommand: {
      findUnique: async () => state.previous,
      create: async ({
        data,
      }: { data: NonNullable<typeof state.previous> }) => {
        state.writes.push(data)
        state.previous = data
        return data
      },
    },
  } as unknown as Prisma.TransactionClient
  return { state, tx }
}

test("prepared command retains authority and executes once only after confirmation, with captured identity", async () => {
  const f = fixture()
  const mutable = { ...input }
  const prepared = await prepareFinanceDocumentCommand(
    f.tx,
    mutable,
    "RECEIPT",
    { total: "1100" },
  )
  expect(f.state.writes).toHaveLength(0)
  expect(prepared.replay).toBeNull()
  mutable.actorUserId = "other"
  mutable.clientCommandId = "other-command"
  let effects = 0
  const execute = async () => {
    effects++
    return { id: "receipt" }
  }
  const results = await Promise.all([
    prepared.execute(execute),
    prepared.execute(execute),
  ])
  expect(results).toEqual([{ id: "receipt" }, { id: "receipt" }])
  expect(effects).toBe(1)
  expect(f.state.writes).toHaveLength(1)
  expect(f.state.writes[0]).toMatchObject({
    clientCommandId: input.clientCommandId,
    actorUserId: "owner",
  })
})

test("normal and prepared replay preserve payload binding and fresh authority without repeating effects", async () => {
  const f = fixture()
  const payload = { total: "1100" }
  await financeDocumentCommand(f.tx, input, "RECEIPT", payload, async () => ({
    id: "receipt",
  }))
  const replay = await prepareFinanceDocumentCommand(
    f.tx,
    input,
    "RECEIPT",
    payload,
  )
  expect(replay.replay).toEqual({ id: "receipt" })
  expect(
    await replay.execute(async () => {
      throw Error("Replay repeated effects")
    }),
  ).toEqual({ id: "receipt" })
  await expect(
    prepareFinanceDocumentCommand(f.tx, input, "RECEIPT", { total: "1101" }),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  await expect(
    prepareFinanceDocumentCommand(f.tx, input, "OTHER", payload),
  ).rejects.toMatchObject({ code: "CONFLICT" })
  f.state.allowed = false
  await expect(
    prepareFinanceDocumentCommand(f.tx, input, "RECEIPT", payload),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  expect(f.state.writes).toHaveLength(1)
})

test("invalid command and unrecoverable replay fail before execution", async () => {
  const f = fixture()
  await expect(
    prepareFinanceDocumentCommand(
      f.tx,
      { ...input, clientCommandId: " " },
      "RECEIPT",
      {},
    ),
  ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
  await financeDocumentCommand(f.tx, input, "RECEIPT", {}, async () => ({
    id: "receipt",
  }))
  if (!f.state.previous) throw Error("Saved replay missing")
  f.state.previous.result = { broken: true }
  await expect(
    prepareFinanceDocumentCommand(f.tx, input, "RECEIPT", {}),
  ).rejects.toMatchObject({ code: "CONFLICT" })
})
