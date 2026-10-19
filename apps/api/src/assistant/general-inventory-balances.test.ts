import { expect, test } from "bun:test"
import { respondGeneralRehearsal } from "@ewatrade/assistant/general/rehearsal"
import { listInventoryBalancePage } from "@ewatrade/db/queries"
import {
  generalInventoryBalanceAnswers,
  generalInventoryBalancesInput,
} from "./general-inventory-balances"

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

test("long source units stay within saved answer schema without rounding exact quantities", async () => {
  const { generalAnswerSchema } = await import(
    "@ewatrade/assistant/general/contracts"
  )
  const row: Parameters<
    typeof generalInventoryBalanceAnswers
  >[0]["rows"][number] = {
    availableQuantity: "9007199254740993.125",
    balanceSourceId: "source",
    catalogItemId: "item",
    custodyReferenceId: "transfer",
    custodyType: "STORE",
    configurationVersionId: "config",
    inventoryUnitFactor: "24",
    inventoryUnitId: "unit",
    inventoryUnitName: "e\u0301 unit ".repeat(80),
    inventoryUnitTransactionScale: 3,
    kind: "SHARED_POOL",
    onHandQuantity: "9007199254741000.125",
    productId: "product",
    productName: "Eggs",
    reservedQuantity: "7",
    revision: 1,
    storeId: "store",
    storeName: "Shop",
    variantId: "variant",
    variantName: "Large",
  }
  const answers = generalInventoryBalanceAnswers(
    { rows: [row], nextCursor: "next" },
    { storeName: "Shop" },
  )
  expect(answers[1]?.value).toStartWith("9007199254740993.125 ")
  expect(answers[1]?.value.length).toBeLessThanOrEqual(160)
  expect(answers[1]?.detail).toContain("Unit label shortened")
  expect(answers[0]?.detail).toContain("More sources available")
  expect(
    answers.every((answer) => generalAnswerSchema.safeParse(answer).success),
  ).toBe(true)
  const transit = generalInventoryBalanceAnswers(
    {
      rows: [{ ...row, custodyType: "TRANSIT", availableQuantity: "0" }],
      nextCursor: null,
    },
    { storeName: "Shop" },
  )
  expect(transit[1]?.detail).toContain(
    "In-transit stock is not available to sell",
  )
})
