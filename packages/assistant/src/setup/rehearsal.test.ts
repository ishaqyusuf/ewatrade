import { expect, test } from "bun:test"
import { respondSetupRehearsal } from "./rehearsal"

test("exact saved workflow review/list requests cannot become CSV drafts in local rehearsal", () => {
  for (const text of [
    "Review draft product:eggs",
    "Review drafts product:eggs, service:haircut",
    "Draft list",
    "Draft list page 2",
  ]) {
    expect(respondSetupRehearsal([{ role: "user", content: text }]).kind).toBe(
      "text",
    )
  }
  expect(
    respondSetupRehearsal([{ role: "user", content: "Eggs, 150, 3 pieces" }]),
  ).toMatchObject({ kind: "tool", toolName: "setup_draft_upsert_items" })
})
