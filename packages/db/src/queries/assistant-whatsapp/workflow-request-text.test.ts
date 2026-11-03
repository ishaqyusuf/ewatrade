import { expect, test } from "bun:test"
import type { DbClient } from "../types"
import { assistantWhatsAppWorkflowRequestText } from "./workflow-action-reviews"

function db(message: unknown, seen: unknown[] = []) {
  return {
    assistantMessage: {
      findFirst: async (query: unknown) => {
        seen.push(query)
        return message
      },
    },
  } as unknown as DbClient
}

test("typed workflow text is the request without reading history", async () => {
  const seen: unknown[] = []
  expect(
    await assistantWhatsAppWorkflowRequestText(
      db(null, seen),
      {
        content: { type: "text", text: "Review drafts product, product-2" },
        userMessageId: "message",
      },
      "conversation",
    ),
  ).toBe("Review drafts product, product-2")
  expect(seen).toEqual([])
})

test("a tapped suggestion reads only this turn's own saved user message", async () => {
  const seen: unknown[] = []
  const tap = {
    content: { type: "reply_choice", command: { kind: "reply_choice" } },
    userMessageId: "message",
  }
  expect(
    await assistantWhatsAppWorkflowRequestText(
      db({ parts: [{ type: "text", text: "Review drafts product" }] }, seen),
      tap,
      "conversation",
    ),
  ).toBe("Review drafts product")
  expect(seen).toEqual([
    {
      where: { id: "message", conversationId: "conversation", role: "user" },
      select: { parts: true },
    },
  ])
  for (const message of [
    null,
    { parts: [] },
    {
      parts: [
        { type: "text", text: "a" },
        { type: "text", text: "b" },
      ],
    },
    { parts: [{ type: "data-setup-attachment", data: {} }] },
  ])
    expect(
      await assistantWhatsAppWorkflowRequestText(db(message), tap, "c"),
    ).toBeUndefined()
  expect(
    await assistantWhatsAppWorkflowRequestText(
      db({ parts: [{ type: "text", text: "x" }] }),
      { content: { type: "voice_choice" }, userMessageId: "m" },
      "c",
    ),
  ).toBeUndefined()
})
