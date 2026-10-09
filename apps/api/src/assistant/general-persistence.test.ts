import { expect, test } from "bun:test"
import { generalPersistentParts } from "./general-persistence"

test("completed SDK text and card envelopes survive reopening without metadata", () => {
  const answer = {
    id: "answer-1",
    title: "Stock",
    value: "10",
    scope: "QA Store",
    asOf: "2026-10-09T00:00:00.000Z",
    detail: "Read from current stock.",
  }
  expect(
    generalPersistentParts([
      { type: "text", text: "Your saved reply", state: "done" },
      { type: "data-general-answer", id: "sdk-id", data: answer },
    ]),
  ).toEqual([
    { type: "text", text: "Your saved reply" },
    { type: "data-general-answer", data: answer },
  ])
})
test("transient runs, proposals, tool results and credentials are never stored", () => {
  expect(
    generalPersistentParts([
      { type: "data-general-run", data: { runId: "run" } },
      { type: "data-general-proposal", data: { proposalId: "proposal" } },
      { type: "tool-draftAction", output: { approvalToken: "secret" } },
      { type: "text", text: "Safe text", approvalToken: "secret" },
    ]),
  ).toEqual([{ type: "text", text: "Safe text" }])
})
test("invalid, oversized and forged card payloads stay outside saved history", () => {
  expect(
    generalPersistentParts([
      null,
      { type: "text", text: 123 },
      { type: "text", text: "x".repeat(16001) },
      { type: "data-general-answer", data: { approvalToken: "secret" } },
    ]),
  ).toEqual([])
})
