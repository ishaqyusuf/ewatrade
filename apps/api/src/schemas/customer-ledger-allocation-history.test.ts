import { expect, test } from "bun:test"
import { customerLedgerAllocationHistorySchema } from "./customer-ledger"
test("allocation release history is strict and always revision-pinned", () => {
  const input = {
    accountId: "account",
    allocationId: "allocation",
    expectedRevision: "2",
  }
  expect(customerLedgerAllocationHistorySchema.parse(input)).toMatchObject({
    ...input,
    limit: 20,
  })
  for (const patch of [
    { tenantId: "foreign" },
    { actorUserId: "foreign" },
    { expectedRevision: undefined },
    { afterSequence: "01" },
    { limit: 51 },
  ])
    expect(
      customerLedgerAllocationHistorySchema.safeParse({ ...input, ...patch })
        .success,
    ).toBe(false)
})
