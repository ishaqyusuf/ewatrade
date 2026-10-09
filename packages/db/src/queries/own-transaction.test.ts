import { describe, expect, test } from "bun:test"
import { Prisma } from "../../generated/prisma/client"
import { markSetupDraftArea } from "./assistant"
import {
  runInOwnSerializableTransaction,
  runInOwnTransaction,
} from "./own-transaction"

describe("own transactions", () => {
  test("every call gets fresh options, so a nested call cannot poison later ones", async () => {
    const seen: Array<Record<string, unknown>> = []
    const objects: object[] = []
    const db = {
      $transaction: async (
        run: (tx: unknown) => Promise<unknown>,
        options: Record<string, unknown>,
      ) => {
        seen.push({ ...options })
        objects.push(options)
        // What Prisma 7.6 does to the options when a transaction nests.
        options.newTxId = "a-committed-transaction"
        return run({})
      },
    }
    expect(await runInOwnTransaction(db as never, async () => "first")).toBe(
      "first",
    )
    await runInOwnTransaction(db as never, async () => "second")
    expect(objects[0]).not.toBe(objects[1])
    expect(seen).toEqual([
      { maxWait: 10_000, timeout: 30_000 },
      { maxWait: 10_000, timeout: 30_000 },
    ])
  })

  test("a transaction client is refused where a new transaction would open", () => {
    const tx = {} as Prisma.TransactionClient
    const nested = () =>
      // @ts-expect-error Inside a transaction, use markSetupDraftAreaInTransaction.
      markSetupDraftArea(tx, { draftId: "draft", area: "sell", mark: "DONE" })
    expect(typeof nested).toBe("function")
  })
})

test("serialization retry repeats reads with fresh options and stops after three attempts", async () => {
  let calls = 0
  let reads = 0
  const optionsSeen: object[] = []
  const conflict = () =>
    new Prisma.PrismaClientKnownRequestError("write conflict", {
      code: "P2034",
      clientVersion: "7.6.0",
    })
  const db = {
    $transaction: async (
      run: (tx: unknown) => Promise<unknown>,
      options: object,
    ) => {
      optionsSeen.push(options)
      calls++
      await run({})
      if (calls < 3) throw conflict()
      return "done"
    },
  }
  expect(
    await runInOwnSerializableTransaction(db as never, async () => {
      reads++
      return "read"
    }),
  ).toBe("done")
  expect(calls).toBe(3)
  expect(reads).toBe(3)
  expect(new Set(optionsSeen).size).toBe(3)
  calls = 0
  const alwaysFails = {
    $transaction: async () => {
      calls++
      throw conflict()
    },
  }
  await expect(
    runInOwnSerializableTransaction(alwaysFails as never, async () => null),
  ).rejects.toMatchObject({ code: "P2034" })
  expect(calls).toBe(3)
})
test("business refusals and non-serialization errors are never retried", async () => {
  for (const error of [
    new Error("OPERATOR_REQUIRED"),
    new Prisma.PrismaClientKnownRequestError("expired", {
      code: "P2028",
      clientVersion: "7.6.0",
    }),
  ]) {
    let calls = 0
    const db = {
      $transaction: async () => {
        calls++
        throw error
      },
    }
    await expect(
      runInOwnSerializableTransaction(db as never, async () => null),
    ).rejects.toBe(error)
    expect(calls).toBe(1)
  }
})
