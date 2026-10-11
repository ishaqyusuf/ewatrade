import { expect, test } from "bun:test"
import { generalActionSchema, generalReceiptSchema } from "./contracts"
import { capabilityForAction } from "../capabilities/manifest"
const payload = {
  action: "money_movement",
  kind: "TRANSFER",
  bookId: "book",
  accountId: "cash",
  destinationAccountId: "bank",
  amountMinor: "100",
  description: "Cash deposited",
  effectiveAt: "2026-10-01T12:00:00.000Z",
  movementAlreadyCompleted: true,
}
test("money proposals require distinct transfer accounts and completed movement acknowledgment", () => {
  expect(generalActionSchema.safeParse(payload).success).toBe(true)
  for (const change of [
    { destinationAccountId: undefined },
    { destinationAccountId: "cash" },
    { movementAlreadyCompleted: false },
    { effectiveAt: "yesterday" },
    { amountMinor: "0" },
    { amountMinor: "100000000000001" },
    { tenantId: "other" },
    { actorUserId: "other" },
    { clientCommandId: "key" },
    { kind: "OPENING_BALANCE" },
  ])
    expect(
      generalActionSchema.safeParse({ ...payload, ...change }).success,
    ).toBe(false)
  for (const kind of ["OWNER_CONTRIBUTION", "OWNER_WITHDRAWAL"]) {
    expect(
      generalActionSchema.safeParse({
        ...payload,
        kind,
        destinationAccountId: undefined,
      }).success,
    ).toBe(true)
    expect(generalActionSchema.safeParse({ ...payload, kind }).success).toBe(
      false,
    )
  }
})
test("movement receipt retains Book identity; capability remains planned dashboard finance", () => {
  expect(
    generalReceiptSchema.parse({
      kind: "finance_movement",
      recordId: "entry",
      bookId: "book",
      title: "Recorded",
      detail: "No transfer performed",
    }).bookId,
  ).toBe("book")
  expect(
    generalReceiptSchema.safeParse({
      kind: "finance_movement",
      recordId: "entry",
      title: "Recorded",
      detail: "No transfer performed",
    }).success,
  ).toBe(false)
  expect(capabilityForAction("money_movement")).toMatchObject({
    rollout: "planned",
    clients: ["dashboard"],
    policy: { roles: ["OWNER", "ADMIN"] },
    effect: "book",
  })
})
