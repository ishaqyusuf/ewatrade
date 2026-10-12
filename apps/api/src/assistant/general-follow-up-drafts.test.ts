import { expect, test } from "bun:test"
import { FinanceError } from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { announcedWithoutAction } from "./general-announced-action"
import { recoverableToolFailure } from "./general-tool-recovery"

// 12 Oct 2026, Jawdah Poultry QA stock receipt: "Use 90 pieces… Draft it."
// ended on one text step, and the retry claimed it had no access to the item.
const said = (text: string, toolCalls: unknown[] = []) => [{ text, toolCalls }]

test("a reply that only announces a draft gets another pass", () => {
  expect(
    announcedWithoutAction(said("I'll draft the stock receipt now.")),
  ).toBe(true)
  expect(announcedWithoutAction(said("Let me read the item first."))).toBe(true)
  expect(announcedWithoutAction(said("Drafting the receipt now."))).toBe(true)
})

test("answers, questions and replies that used tools end normally", () => {
  expect(
    announcedWithoutAction(said("I'll draft the stock receipt now.", [{}])),
  ).toBe(false)
  expect(
    announcedWithoutAction(
      said("How many pieces should I record? I'll draft it once you say."),
    ),
  ).toBe(false)
  expect(
    announcedWithoutAction(
      said("You have 148 Pieces of Quail Eggs available."),
    ),
  ).toBe(false)
  expect(announcedWithoutAction(said("I can't draft this one."))).toBe(false)
  expect(announcedWithoutAction([])).toBe(false)
})

test("a missing record is reported as not found, not as an access refusal", () => {
  const recovery = recoverableToolFailure(
    "readCatalogItem",
    new TRPCError({ code: "NOT_FOUND", message: "Catalog item not found." }),
  )
  expect(recovery?.status).toBe("not_found")
  expect(recovery?.reason).toContain("Catalog item not found.")
  expect(recovery?.reason).toContain("Find the record again by name")
  expect(
    recoverableToolFailure(
      "readCatalogItem",
      new TRPCError({ code: "FORBIDDEN", message: "No." }),
    ),
  ).toBeUndefined()
})

test("a draft outside the proposal limits says which field to fix", () => {
  const result = z
    .object({ amountMinor: z.number().max(100) })
    .safeParse({ amountMinor: 500 })
  expect(result.success).toBe(false)
  if (result.success) return
  expect(recoverableToolFailure("draftAction", result.error)).toMatchObject({
    status: "needs_changes",
    reason: expect.stringContaining("amountMinor"),
  })
  expect(
    recoverableToolFailure("readCatalogItem", result.error),
  ).toBeUndefined()
})

test("a finance rule refusal tells the model what to change", () => {
  const sameBook = new FinanceError(
    "INVALID_JOURNAL",
    "Choose a different account in the same financial book.",
  )
  expect(recoverableToolFailure("draftAction", sameBook)).toEqual({
    status: "needs_changes",
    reason: "Choose a different account in the same financial book.",
  })
  expect(
    recoverableToolFailure(
      "draftAction",
      new FinanceError(
        "FORBIDDEN",
        "Only Owners and Admins can manage finance.",
      ),
    ),
  ).toBeUndefined()
})
