import { expect, test } from "bun:test"
import { listInventoryBalancePage } from "@ewatrade/db/queries"
import {
  generalInventoryBalancesInput,
  generalInventoryBalanceAnswers,
} from "./general-inventory-balances"
import { respondGeneralRehearsal } from "@ewatrade/assistant/general/rehearsal"

test("inventory page rejects injected authority and fences cursors before scanning", async () => {
  let scanned = false
  let scope: unknown
  const db = {
    stockBalanceSource: {
      findFirst: async (args: unknown) => {
        scope = args
        return null
      },
      findMany: async () => {
        scanned = true
        return []
      },
    },
  } as unknown as Parameters<typeof listInventoryBalancePage>[0]
  await expect(
    listInventoryBalancePage(db, {
      tenantId: "t",
      storeId: "s",
      catalogItemId: "item",
      cursor: "foreign",
    }),
  ).rejects.toThrow("list changed")
  expect(scanned).toBe(false)
  expect(scope).toMatchObject({
    where: {
      AND: [
        { tenantId: "t", storeId: "s", product: { catalogItemId: "item" } },
        { id: "foreign" },
      ],
    },
  })
  for (const patch of [
    { storeId: "other" },
    { tenantId: "other" },
    { limit: 100 },
  ])
    expect(generalInventoryBalancesInput.safeParse(patch).success).toBe(false)
  expect(
    respondGeneralRehearsal([
      { role: "user", content: "stock balances item item after source" },
    ]),
  ).toMatchObject({
    toolName: "readInventoryBalances",
    input: { catalogItemId: "item", cursor: "source" },
  })
  const empty = generalInventoryBalanceAnswers(
    { rows: [], nextCursor: null },
    { storeName: "Shop" },
  )
  expect(empty[0]?.detail).toContain("missing sources are not zero stock")
})
