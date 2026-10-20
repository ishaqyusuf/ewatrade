import { describe, expect, test } from "bun:test"
import {
  discardStockCount,
  listDraftStockCounts,
} from "./inventory-stock-count-review"

function database(status: string | null) {
  const updates: unknown[] = []
  const db = {
    stockCount: {
      findFirst: async () => (status ? { id: "count-1", status } : null),
      updateMany: async (args: unknown) => {
        updates.push(args)
        return { count: status === "DRAFT" ? 1 : 0 }
      },
      findMany: async (args: { where: unknown; take: number }) => {
        updates.push(args)
        return [
          {
            id: "count-1",
            reason: "Weekly count",
            createdAt: new Date("2026-10-20T09:00:00Z"),
            actorUserId: "user-1",
            _count: { lines: 4 },
          },
        ]
      },
    },
  }
  return { db: db as never, updates }
}

const scope = { tenantId: "tenant-1", storeId: "store-1" }

describe("saved stock count drafts", () => {
  test("lists only this Store's drafts with their product count", async () => {
    const { db, updates } = database("DRAFT")
    expect(await listDraftStockCounts(db, { ...scope, limit: 500 })).toEqual([
      {
        id: "count-1",
        reason: "Weekly count",
        createdAt: "2026-10-20T09:00:00.000Z",
        actorUserId: "user-1",
        lineCount: 4,
      },
    ])
    expect(updates[0]).toMatchObject({
      where: { tenantId: "tenant-1", storeId: "store-1", status: "DRAFT" },
      take: 50,
    })
  })

  test("discards a draft, repeats harmlessly and never touches a finished count", async () => {
    const draft = database("DRAFT")
    expect(
      await discardStockCount(draft.db, { ...scope, stockCountId: "count-1" }),
    ).toEqual({ id: "count-1", status: "CANCELLED" })
    expect(draft.updates[0]).toMatchObject({
      where: { id: "count-1", status: "DRAFT" },
      data: { status: "CANCELLED" },
    })

    const again = database("CANCELLED")
    expect(
      await discardStockCount(again.db, { ...scope, stockCountId: "count-1" }),
    ).toEqual({ id: "count-1", status: "CANCELLED" })
    expect(again.updates).toEqual([])

    await expect(
      discardStockCount(database("FINALIZED").db, {
        ...scope,
        stockCountId: "count-1",
      }),
    ).rejects.toMatchObject({ code: "STOCK_COUNT_NOT_FOUND" })
    await expect(
      discardStockCount(database(null).db, { ...scope, stockCountId: "x" }),
    ).rejects.toMatchObject({ code: "STOCK_COUNT_NOT_FOUND" })
  })
})
