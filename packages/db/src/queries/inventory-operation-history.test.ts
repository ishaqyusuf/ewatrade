import { expect, test } from "bun:test"
import { serializeOperationHistoryRow } from "./inventory-operation-history"

const decimal = (value: string) => ({ toFixed: () => value })
const operation = (variants: string[], effects: string[]) =>
  ({
    actorUserId: "actor",
    categories: [],
    createdAt: new Date(0),
    effectiveAt: new Date(0),
    id: "operation",
    movements: variants.map((variantId, index) => ({
      signedCanonicalEffect: decimal(effects[index] ?? "0"),
      balanceSource: { variantId },
    })),
    reason: "",
    source: "dashboard_inventory",
    store: { name: "Main store" },
    storeId: "store",
    type: "TRANSFER",
  }) as unknown as Parameters<typeof serializeOperationHistoryRow>[0]

test("a transfer of one product counts one product, not its two lines", () => {
  // Sending 2: the shelf line goes down, the on-the-way line goes up.
  const row = serializeOperationHistoryRow(
    operation(["eggs-large", "eggs-large"], ["-2", "2"]),
  )
  expect(row.movementCount).toBe(2)
  expect(row.productCount).toBe(1)
  expect(row.canonicalNetEffect).toBe("0")
})

test("a count of two products counts two", () => {
  const row = serializeOperationHistoryRow(
    operation(["eggs-large", "eggs-small"], ["-1", "3"]),
  )
  expect(row.productCount).toBe(2)
})
