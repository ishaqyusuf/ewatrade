import { describe, expect, test } from "bun:test"
import {
  appendAssistantMessageIfLatest,
  appendAssistantMessageIfLatestInTransaction,
} from "./assistant"

/** In-memory conversation whose transaction runs one caller at a time. */
function fakeDb() {
  const messages: Array<{ id: string; sequence: number }> = [
    { id: "msg_last", sequence: 1 },
  ]
  let lastSequence = 1
  let queue = Promise.resolve()
  const tx = {
    // Prisma's transaction client has $transaction too; calling it nests.
    $transaction: () => {
      throw new Error("A transaction was nested.")
    },
    $queryRaw: async () => [],
    assistantMessage: {
      findFirst: async () => messages.at(-1) ?? null,
      findUnique: async ({ where }: { where: { id: string } }) =>
        messages.find((message) => message.id === where.id) ?? null,
      create: async ({ data }: { data: { id: string; sequence: number } }) => {
        messages.push({ id: data.id, sequence: data.sequence })
      },
    },
    assistantConversation: {
      update: async () => ({ lastSequence: ++lastSequence }),
    },
  }
  const db = {
    // A row lock serializes transactions on the same conversation.
    $transaction: (run: (client: unknown) => Promise<unknown>) => {
      const result = queue.then(() => run(tx))
      queue = result.then(
        () => undefined,
        () => undefined,
      )
      return result
    },
  }
  return { db: db as never, messages }
}

const welcome = (id: string) => ({
  id,
  role: "assistant" as const,
  parts: [{ type: "text", text: "Welcome back!" }],
})

describe("welcome back on a new visit", () => {
  test("two concurrent visits append one welcome", async () => {
    const { db, messages } = fakeDb()
    const results = await Promise.all([
      appendAssistantMessageIfLatest(db, {
        conversationId: "conv_1",
        expectedLastMessageId: "msg_last",
        message: welcome("msg_a"),
      }),
      appendAssistantMessageIfLatest(db, {
        conversationId: "conv_1",
        expectedLastMessageId: "msg_last",
        message: welcome("msg_b"),
      }),
    ])
    expect(results.sort()).toEqual([false, true])
    expect(messages.map((message) => message.id)).toEqual(["msg_last", "msg_a"])
  })

  test("inside a caller's transaction it writes there without nesting", async () => {
    const { db, messages } = fakeDb()
    const appended = await (
      db as unknown as {
        $transaction: (run: (tx: never) => Promise<boolean>) => Promise<boolean>
      }
    ).$transaction((tx) =>
      appendAssistantMessageIfLatestInTransaction(tx, {
        conversationId: "conv_1",
        expectedLastMessageId: "msg_last",
        message: welcome("msg_in_tx"),
      }),
    )
    expect(appended).toBe(true)
    expect(messages.map((message) => message.id)).toEqual([
      "msg_last",
      "msg_in_tx",
    ])
  })
})
