import { expect, test } from "bun:test"
import { readInventoryRelocationGraph } from "./inventory-relocation-graph"
import { stockGraphFixture } from "./stock-graph-test-fixture"

function fixture() {
  const f = stockGraphFixture()
  const owner = Object.assign(f.owners[0]!, { tenantId: "tenant" })
  owner._count.movements = 2
  f.movements.push({ ...f.movements[0]!, id: "movement-other" })
  let requested: unknown
  Object.assign(f.tx, {
    stockOperation: {
      findFirst: async (args: unknown) => {
        requested = args
        return owner
      },
    },
  })
  return { ...f, owner, requested: () => requested }
}
const input = { tenantId: "tenant", stockOperationId: "operation-0" }

test("loads tenant-qualified owner and reuses bounded flat metadata reads", async () => {
  const f = fixture()
  const graph = await readInventoryRelocationGraph(f.tx, input)
  expect(f.requested()).toMatchObject({
    where: { id: "operation-0", tenantId: "tenant" },
  })
  expect(graph.movements).toHaveLength(2)
  expect(graph.movements[0]?.enteredInventoryUnit.id).toBe("entered")
  expect(graph.movements[0]?.balanceSource.inventoryUnit.id).toBe("canonical")
  expect(f.calls.filter((call) => call === "inventoryUnit")).toHaveLength(1)
  expect(f.calls.filter((call) => call === "catalogProduct")).toHaveLength(1)
  expect(f.calls.length).toBeLessThanOrEqual(13)
  for (const entity of ["stockMovement", "stockTransfer", "stockBalanceSource"])
    expect(f.calls.filter((call) => call === entity)).toHaveLength(1)
})

test("rejects changed movement coverage before building a source", async () => {
  const f = fixture()
  f.movements.pop()
  await expect(readInventoryRelocationGraph(f.tx, input)).rejects.toThrow(
    "movement set",
  )
  expect(f.calls).toEqual(["stockMovement"])
})

test("rejects multiple owners and missing balance identities", async () => {
  const f = fixture()
  f.datasets.stockTransfer = [{ id: "one" }, { id: "two" }]
  await expect(readInventoryRelocationGraph(f.tx, input)).rejects.toThrow(
    "conflicting transfer",
  )
  const missing = fixture()
  missing.datasets.stockBalanceSource = []
  await expect(readInventoryRelocationGraph(missing.tx, input)).rejects.toThrow(
    "balance set",
  )
})

test("hydrates acknowledgment from the same complete transfer graph", async () => {
  const f = fixture()
  Object.assign(f.owner, {
    transferAcknowledgment: {
      transferId: "transfer",
      operationId: "operation-0",
      quantity: "1",
    },
  })
  f.datasets.stockTransfer = [
    {
      id: "transfer",
      sourceStoreId: "store",
      targetStoreId: "store",
      sourceBalanceSourceId: "balance",
      transitBalanceSourceId: "balance",
      inventoryUnitId: "canonical",
      configurationVersionId: "version",
    },
  ]
  const graph = await readInventoryRelocationGraph(f.tx, input)
  expect(graph.transferAcknowledgment?.transfer.id).toBe("transfer")
  expect(
    graph.transferAcknowledgment?.transfer.inventoryUnit.configurationVersion
      .id,
  ).toBe("version")
})


test("nonzero competing-owner counts still load the original ownership evidence", async () => {
  const f = fixture()
  Object.assign(f.owner, { purchaseReceipts: [{ id: "receipt" }] })
  f.owner._count.purchaseReceipts = 1
  const graph = await readInventoryRelocationGraph(f.tx, input)
  expect(graph.purchaseReceipts).toEqual([{ id: "receipt" }])
  expect(f.requested()).toMatchObject({ where: { id: "operation-0", tenantId: "tenant" }, select: { purchaseReceipts: { take: 2, select: { id: true } } } })
})
