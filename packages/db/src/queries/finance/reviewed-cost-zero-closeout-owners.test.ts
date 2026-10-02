import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import { closeoutFixture } from "./inventory-closeout-test-fixture"
import { assertReviewedCostOwnerBindings } from "./reviewed-cost-owner-bindings"
import { readReviewedCostOwningSourcesInTransaction } from "./reviewed-cost-owners"

function fixture() {
  const f = closeoutFixture({ zero: true })
  const owner = {
    ...f.operation,
    clientOperationId: "zero-closeout-command",
    payloadHash: "a".repeat(64),
    linkedOperationId: null,
    purchaseReceipts: [],
    productFulfillments: [],
    productReturns: [],
    _count: { ...f.operation._count, movements: 0 },
  }
  const tx = {
    stockOperation: { findMany: async () => [owner] },
    stockMovement: { findMany: async () => [] },
    stockBalanceSource: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        [f.balance, f.parent].filter((row) => where.id.in.includes(row.id)),
    },
    inventoryUnit: { findMany: async () => [f.unit] },
    unitConfigurationVersion: {
      findMany: async () => [f.unit.configurationVersion],
    },
    store: { findMany: async () => [f.balance.store] },
    catalogProduct: { findMany: async () => [f.balance.product] },
    sellableVariant: { findMany: async () => [f.balance.variant] },
    financeInventoryPool: { findMany: async () => [] },
    inventoryCloseout: {
      findMany: async () => [{ ...f.closeout, _count: { lines: 1 } }],
    },
    inventoryCloseoutLine: { findMany: async () => [f.line] },
  } as unknown as Prisma.TransactionClient
  const discovery = {
    tenantId: "tenant",
    bookId: "book",
    currencyCode: "NGN",
    balanceSourceIds: [f.balance.id, f.parent.id],
    operationIds: [owner.id],
    movementIds: [],
    transferIds: [],
    reviewAllocationIds: [],
    sourceDocumentReferences: [
      { kind: "CLOSEOUT", id: f.closeout.id },
      { kind: "CLOSEOUT_LINE", id: f.line.id },
    ],
  } as unknown as Parameters<
    typeof readReviewedCostOwningSourcesInTransaction
  >[2]
  const returns = {
    snapshot: { ...f.book, fulfillments: [], returns: [] },
    issues: [],
  } as unknown as Parameters<
    typeof readReviewedCostOwningSourcesInTransaction
  >[3]
  const read = () =>
    readReviewedCostOwningSourcesInTransaction(
      tx,
      {
        tenantId: "tenant",
        actorUserId: "finalizer",
        bookId: "book",
        through: new Date("2026-10-02T00:00:00Z"),
      },
      discovery,
      returns,
    )
  return { f, owner, discovery, read }
}

test("zero-only Closeout is proved and retained without a physical binding", async () => {
  const f = fixture()
  const proof = await f.read()
  expect(proof.blockers).toEqual([])
  expect(proof.semantics).toEqual([])
  expect(proof.operationBindings).toEqual([])
  expect(proof.movementBindings).toEqual([])
  expect(JSON.stringify(proof.snapshot)).toContain("INVENTORY_CLOSEOUT")
  expect(JSON.stringify(proof.snapshot)).toContain("zero-closeout-command")
  assertReviewedCostOwnerBindings({ balances: [] }, proof)
})

test("zero-only metadata still requires valid original parent ownership", async () => {
  const f = fixture()
  f.f.parent.kind = "PACKAGED_STOCK"
  await expect(f.read()).rejects.toThrow("ownership is inconsistent")
})

test("zero-only metadata still requires complete discovered lines", async () => {
  const f = fixture()
  f.discovery.sourceDocumentReferences = []
  await expect(f.read()).rejects.toThrow("line coverage changed")
})
