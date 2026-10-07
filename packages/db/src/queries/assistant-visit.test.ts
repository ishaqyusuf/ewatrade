import { describe, expect, test } from "bun:test"
import { appendAssistantMessageIfLatest } from "./assistant"

/** In-memory conversation whose transaction runs one caller at a time. */
function fakeDb() {
  const messages: Array<{ id: string; sequence: number }> = [
    { id: "msg_last", sequence: 1 },
  ]
  let lastSequence = 1
  let queue = Promise.resolve()
  const tx = {
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
})
