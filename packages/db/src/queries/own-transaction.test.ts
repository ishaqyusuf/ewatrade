import { describe, expect, test } from "bun:test"
import type { Prisma } from "../../generated/prisma/client"
import { markSetupDraftArea } from "./assistant"
import { runInOwnTransaction } from "./own-transaction"

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
