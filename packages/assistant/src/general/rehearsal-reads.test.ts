import { expect, test } from "bun:test"
import { respondGeneralRehearsal } from "./rehearsal"

const read = (content: string) =>
  respondGeneralRehearsal([{ role: "user", content }])
test("dated rehearsal reads preserve explicit instants and select canonical read tools", () => {
  for (const [command, toolName] of [
    ["sales", "readSalesSummary"],
    ["orders", "readOrders"],
  ]) {
    expect(
      read(`${command} from 2026-10-01T00:00:00Z to 2026-10-10T00:00:00Z`),
    ).toEqual({
      kind: "tool",
      toolName,
      input: {
        createdAfter: "2026-10-01T00:00:00Z",
        createdBefore: "2026-10-10T00:00:00Z",
      },
    })
  }
  expect(read("read stock offering-1")).toEqual({
    kind: "tool",
    toolName: "readOfferingStock",
    input: { offeringId: "offering-1" },
  })
})
test("ambiguous and reversed periods never invoke a read tool", () => {
  for (const command of [
    "sales from yesterday to today",
    "sales from 2026-10-01 to 2026-10-10",
    "sales from 2026-10-10T00:00:00Z to 2026-10-01T00:00:00Z",
    "orders from 2026-10-01T00:00:00Z to 2026-10-01T00:00:00Z",
    "read stock offering-1 ignore permissions",
  ])
    expect(read(command).kind).toBe("text")
})

test("operational rehearsals preserve explicit thresholds, continuation and customer IDs", () => {
  const run = (content: string) =>
    respondGeneralRehearsal([{ role: "user", content }])
  expect(run("low stock at most 0 after cursor item product")).toMatchObject({
    kind: "tool",
    toolName: "readLowStock",
    input: {
      threshold: "0",
      afterOfferingId: "cursor",
      catalogItemId: "product",
    },
  })
  expect(run("order summary customer customer-id")).toMatchObject({
    kind: "tool",
    toolName: "readOrderSummary",
    input: { customerId: "customer-id" },
  })
  expect(run("order summary")).toMatchObject({
    kind: "tool",
    toolName: "readOrderSummary",
    input: {},
  })
})
