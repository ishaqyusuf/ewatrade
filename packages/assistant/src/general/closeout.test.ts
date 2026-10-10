import { expect, test } from "bun:test"
import { generalActionSchema, generalReceiptSchema } from "./contracts"
const create = {
  action: "inventory_closeout_create",
  custodyType: "staff",
  custodyReferenceId: "staff",
  declarations: [{ balanceSourceId: "balance", declaredQuantity: "0" }],
  reason: "End of shift",
}
test("closeout creation permits exact zero declarations and retains custody identity", () => {
  expect(generalActionSchema.parse(create)).toEqual(create)
  for (const quantity of ["-1", "1e3", "1.0000001", "NaN"])
    expect(
      generalActionSchema.safeParse({
        ...create,
        declarations: [
          { balanceSourceId: "balance", declaredQuantity: quantity },
        ],
      }).success,
    ).toBe(false)
})
test("closeout proposals cannot supply actor, Store, revisions or financial overrides", () => {
  for (const field of [
    "actorUserId",
    "storeId",
    "tenantId",
    "expectedRevision",
    "bookId",
  ])
    expect(
      generalActionSchema.safeParse({ ...create, [field]: "override" }).success,
    ).toBe(false)
  expect(
    generalActionSchema.safeParse({
      ...create,
      declarations: [
        {
          balanceSourceId: "balance",
          declaredQuantity: "0",
          expectedRevision: 1,
        },
      ],
    }).success,
  ).toBe(false)
  expect(
    generalActionSchema.safeParse({ ...create, declarations: [] }).success,
  ).toBe(false)
  expect(
    generalActionSchema.safeParse({
      ...create,
      declarations: Array.from({ length: 501 }, () => create.declarations[0]),
    }).success,
  ).toBe(false)
})
test("finalization refers to saved declarations and requires a reason", () => {
  const final = {
    action: "inventory_closeout_finalize",
    closeoutId: "saved",
    reason: "Reviewed original declarations",
  }
  expect(generalActionSchema.parse(final)).toEqual(final)
  expect(
    generalActionSchema.safeParse({
      ...final,
      declarations: create.declarations,
    }).success,
  ).toBe(false)
  expect(generalActionSchema.safeParse({ ...final, reason: " " }).success).toBe(
    false,
  )
  expect(
    generalReceiptSchema.parse({
      kind: "inventory_closeout",
      recordId: "saved",
      title: "Saved",
      detail: "Original declarations retained",
    }).kind,
  ).toBe("inventory_closeout")
})

test("rehearsal keeps creation and finalization as separate reviewed proposals", async () => {
  const { respondGeneralRehearsal } = await import("./rehearsal")
  expect(
    respondGeneralRehearsal([
      { role: "user", content: `create closeout ${JSON.stringify(create)}` },
    ]),
  ).toEqual({ kind: "tool", toolName: "draftAction", input: create })
  expect(
    respondGeneralRehearsal([
      { role: "user", content: "finalize closeout saved because Reconciled" },
    ]),
  ).toEqual({
    kind: "tool",
    toolName: "draftAction",
    input: {
      action: "inventory_closeout_finalize",
      closeoutId: "saved",
      reason: "Reconciled",
    },
  })
})
