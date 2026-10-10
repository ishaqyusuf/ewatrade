import { expect, test } from "bun:test"
import { respondGeneralRehearsal } from "./rehearsal"

test("closeout rehearsal reads exact records without creating a proposal", () => {
  expect(
    respondGeneralRehearsal([{ role: "user", content: "read closeouts" }]),
  ).toEqual({ kind: "tool", toolName: "readInventoryCloseouts", input: {} })
  expect(
    respondGeneralRehearsal([
      { role: "user", content: "read closeout saved-id" },
    ]),
  ).toEqual({
    kind: "tool",
    toolName: "readInventoryCloseout",
    input: { closeoutId: "saved-id" },
  })
})
