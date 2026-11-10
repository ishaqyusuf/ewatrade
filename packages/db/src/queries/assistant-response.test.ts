import { expect, test } from "bun:test"
import { readAssistantResponseMessages } from "./assistant-response"
import type { DbClient } from "./types"

test("old response is read by exact authorized conversation and original run question without guessing from message order", async () => {
  const calls: unknown[] = []
  const saved = {
    id: "old",
    sequence: 2,
    role: "assistant",
    parts: [{ type: "text", text: "Saved historical answer" }],
    createdAt: new Date(),
    completedRun: { requestId: "original-request" },
  }
  const question = { ...saved, id: "question", role: "user", sequence: 1 }
  const db = {
    assistantMessage: {
      findFirst: async (input: unknown) => {
        calls.push(input)
        return calls.length === 1 ? saved : question
      },
    },
  } as unknown as DbClient
  expect(
    await readAssistantResponseMessages(db, "authorized-chat", "old"),
  ).toEqual({
    message: {
      id: saved.id,
      sequence: saved.sequence,
      role: saved.role,
      parts: saved.parts,
      createdAt: saved.createdAt,
    },
    question,
  })
  expect(calls[0]).toMatchObject({
    where: { id: "old", conversationId: "authorized-chat", role: "assistant" },
  })
  expect(calls[1]).toMatchObject({
    where: {
      conversationId: "authorized-chat",
      role: "user",
      clientRequestId: "original-request",
      sequence: { lt: 2 },
    },
    orderBy: { sequence: "desc" },
  })
})
test("a missing or foreign response never substitutes a recent message", async () => {
  let calls = 0
  const db = {
    assistantMessage: {
      findFirst: async () => {
        calls++
        return null
      },
    },
  } as unknown as DbClient
  expect(
    await readAssistantResponseMessages(db, "authorized-chat", "foreign"),
  ).toBeNull()
  expect(calls).toBe(1)
})

test("without original run provenance no adjacent question is guessed", async () => {
  let calls = 0
  const saved = {
    id: "old",
    role: "assistant",
    parts: [],
    sequence: 2,
    createdAt: new Date(),
    completedRun: null,
  }
  const db = {
    assistantMessage: {
      findFirst: async () => {
        calls++
        return saved
      },
    },
  } as unknown as DbClient
  expect(
    (await readAssistantResponseMessages(db, "authorized-chat", "old"))
      ?.question,
  ).toBeNull()
  expect(calls).toBe(1)
})
