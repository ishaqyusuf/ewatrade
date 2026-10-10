import { expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import { getStockOperationAudit } from "./inventory-reporting"
test("assistant operation audit query binds exact tenant and current Store", async () => {
  const db = { stockOperation: { findFirst: async ({ where }: { where: unknown }) => {
    expect(where).toEqual({ id: "operation", tenantId: "tenant", storeId: "store" })
    return null
  } } } as unknown as PrismaClient
  expect(await getStockOperationAudit(db, { operationId: "operation", tenantId: "tenant", storeId: "store" })).toBeNull()
})
