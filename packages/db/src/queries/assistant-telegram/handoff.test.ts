import { expect, test } from "bun:test"
import { referencesTelegramHandoffProposal } from "./handoff"

const reference = (proposalId: string) => ({
  type: "data-general-proposal-reference",
  data: { proposalId, revision: 1, payloadHash: "h" },
})

test("a review-link reply references exactly one draft", () => {
  expect(
    referencesTelegramHandoffProposal(
      [{ type: "text", text: "Draft ready" }, reference("p-1")],
      "p-1",
    ),
  ).toBe(true)
  expect(referencesTelegramHandoffProposal([reference("p-2")], "p-1")).toBe(
    false,
  )
  // The runtime renders replies with several drafts as text, never as one link.
  expect(
    referencesTelegramHandoffProposal(
      [reference("p-1"), reference("p-2")],
      "p-1",
    ),
  ).toBe(false)
  expect(referencesTelegramHandoffProposal(null, "p-1")).toBe(false)
  expect(referencesTelegramHandoffProposal([null, "x"], "p-1")).toBe(false)
})
