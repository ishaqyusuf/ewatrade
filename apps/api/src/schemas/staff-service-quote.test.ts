import { expect, test } from "bun:test"
import { staffServiceQuoteSchema } from "./services"

const input = {
  clientQuoteId: "quote-command-1",
  clientVersionId: "version-command-1",
  customerName: "Synthetic QA",
  customerNote: "Two rooms, supplies included.",
  lines: [{ offeringId: "cleaning", quantity: "1", unitPriceMinor: 2500000 }],
}
test("staff quote cart accepts explicit zero and refuses invented source/actor fields", () => {
  expect(staffServiceQuoteSchema.safeParse(input).success).toBe(true)
  expect(
    staffServiceQuoteSchema.safeParse({
      ...input,
      lines: [{ ...input.lines[0], unitPriceMinor: 0 }],
    }).success,
  ).toBe(true)
  for (const extra of [
    { sourceLineId: "invented" },
    { actorUserId: "invented" },
  ])
    expect(
      staffServiceQuoteSchema.safeParse({
        ...input,
        lines: [{ ...input.lines[0], ...extra }],
      }).success,
    ).toBe(false)
  expect(
    staffServiceQuoteSchema.safeParse({ ...input, tenantId: "foreign" })
      .success,
  ).toBe(false)
})
test("staff quote requires scope, positive exact quantity and whole minor-unit amount", () => {
  expect(
    staffServiceQuoteSchema.safeParse({ ...input, customerNote: " " }).success,
  ).toBe(false)
  for (const patch of [
    { quantity: "0" },
    { quantity: "-1" },
    { unitPriceMinor: 1.5 },
    { unitPriceMinor: -1 },
  ])
    expect(
      staffServiceQuoteSchema.safeParse({
        ...input,
        lines: [{ ...input.lines[0], ...patch }],
      }).success,
    ).toBe(false)
})
