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

test("a raw lock serialization failure restarts fresh reads, while unrelated raw and unique errors never retry", async () => {
  for (const [code, meta, message, retryable] of [
    ["P2010", { code: "40001" }, "serialization aborted", true],
    [
      "P2010",
      { driverAdapterError: { cause: { kind: "TransactionWriteConflict" } } },
      "serialization aborted",
      true,
    ],
    [
      "P2010",
      {},
      "Raw query failed. Code: `40001`. Message: `could not serialize access due to concurrent update`",
      true,
    ],
    ["P2010", { code: "42P01" }, "relation missing", false],
    ["P2002", {}, "unique collision", false],
  ] as const) {
    let calls = 0
    const optionsSeen: object[] = []
    const failure = new Prisma.PrismaClientKnownRequestError(message, {
      code,
      meta,
      clientVersion: "7.6.0",
    })
    const db = {
      $transaction: async (
        run: (tx: unknown) => Promise<string>,
        options: object,
      ) => {
        calls++
        optionsSeen.push(options)
        if (calls === 1) throw failure
        return run({})
      },
    }
    const result = runInOwnSerializableTransaction(
      db as never,
      async () => "fresh authority",
    )
    if (retryable) {
      expect(await result).toBe("fresh authority")
      expect(calls).toBe(2)
      expect(optionsSeen[0]).not.toBe(optionsSeen[1])
    } else {
      await expect(result).rejects.toBe(failure)
      expect(calls).toBe(1)
    }
  }
})

test("an unwrapped driver commit serialization failure retries the rolled-back callback, while unrelated driver errors do not", async () => {
  for (const [name, kind, originalCode, retries] of [
    ["DriverAdapterError", "TransactionWriteConflict", "40001", true],
    ["DriverAdapterError", "TransactionWriteConflict", "23505", false],
    ["DriverAdapterError", "GenericJs", "40001", false],
    ["Error", "TransactionWriteConflict", "40001", false],
  ] as const) {
    const failure = new Error(kind, { cause: { kind, originalCode } })
    failure.name = name
    let transactions = 0
    let callbacks = 0
    const db = {
      $transaction: async (run: (tx: unknown) => Promise<string>) => {
        transactions++
        const result = await run({})
        // Prisma's raw driver failure happens after the callback, during commit.
        if (transactions === 1) throw failure
        return result
      },
    }
    const operation = runInOwnSerializableTransaction(db as never, async () => {
      callbacks++
      return "fresh authority"
    })
    if (retries) {
      expect(await operation).toBe("fresh authority")
      expect(transactions).toBe(2)
      expect(callbacks).toBe(2)
    } else {
      await expect(operation).rejects.toBe(failure)
      expect(transactions).toBe(1)
      expect(callbacks).toBe(1)
    }
  }
  let attempts = 0
  const exhausted = new Error("TransactionWriteConflict", {
    cause: { kind: "TransactionWriteConflict", originalCode: "40001" },
  })
  exhausted.name = "DriverAdapterError"
  await expect(
    runInOwnSerializableTransaction(
      {
        $transaction: async () => {
          attempts++
          throw exhausted
        },
      } as never,
      async () => "never",
    ),
  ).rejects.toBe(exhausted)
  expect(attempts).toBe(3)
})
