import { expect, test } from "bun:test"
import { respondGeneralRehearsal } from "./rehearsal"

const after = (toolName: string) =>
  respondGeneralRehearsal([
    { role: "user", content: "add customer Ada" },
    {
      role: "tool",
      content: [{ type: "tool-result", toolName } as { type: string }],
    },
  ])

test("after a draft the reply points to the card in one line", () => {
  expect(after("draftAction")).toEqual({
    kind: "text",
    text: "Here's the draft to review. Nothing changes until you confirm.",
  })
})

test("after a lookup the reply is a short lead-in to the answer", () => {
  expect(after("searchCatalog")).toEqual({
    kind: "text",
    text: "Here's what I found.",
  })
})
