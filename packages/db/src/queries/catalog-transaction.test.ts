import { describe, expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import { createSimpleCatalogItem } from "./catalog"

describe("catalog write transactions", () => {
  test("gives service creation enough bounded time to commit on a remote database", async () => {
    const sentinel = new Error("stop after transaction options are captured")
    let transactionOptions: { maxWait?: number; timeout?: number } | undefined
    const db = {
      $transaction: async (
        operation: (tx: unknown) => Promise<unknown>,
        options?: { maxWait?: number; timeout?: number },
      ) => {
        transactionOptions = options
        return operation({
          catalogCommandReceipt: {
            findUnique: async () => {
              throw sentinel
            },
          },
        })
      },
    } as unknown as PrismaClient

    await expect(
      createSimpleCatalogItem(db, {
        actorUserId: "user_1",
        authorizationPolicy: "on_order_confirmation",
        clientOperationId: "service-create-1",
        kind: "service",
        name: "Shirt",
        priceMinor: 50_000,
        quantityScale: 0,
        storeId: "store_1",
        tenantId: "tenant_1",
        workPolicy: "charge_only",
      }),
    ).rejects.toBe(sentinel)

    expect(transactionOptions).toEqual({
      maxWait: 10_000,
      timeout: 30_000,
    })
  })
})
