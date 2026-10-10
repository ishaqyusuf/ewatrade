import { expect, test } from "bun:test"
import type { Prisma } from "../../generated/prisma/client"
import { publishProductUnitConfigurationInTransaction } from "./catalog-unit-configurations"

for (const balance of [
  { onHandQuantity: "2", reservedQuantity: "0" },
  { onHandQuantity: "0", reservedQuantity: "1" },
]) {
  test(`unit publication refuses semantic changes with balance ${JSON.stringify(balance)}`, async () => {
    const main = {
      key: "piece",
      name: "Piece",
      factor: "1",
      stockBehavior: "CANONICAL_SHARED",
      transactionScale: 0,
    }
    const draft = {
      id: "draft",
      productId: "product",
      canonicalBalanceScale: 0,
      units: [
        main,
        {
          key: "crate",
          name: "Crate",
          factor: "12",
          stockBehavior: "ALTERNATE_TRANSACTION",
          transactionScale: 0,
        },
      ],
      product: {
        currentUnitConfiguration: {
          id: "current",
          canonicalBalanceScale: 0,
          units: [main],
        },
        stockBalanceSources: [balance],
      },
    }
    const reads: unknown[] = []
    const tx = {
      unitConfigurationVersion: {
        findFirst: async (query: unknown) => {
          reads.push(query)
          return draft
        },
      },
      $transaction: () => {
        throw Error("Unexpected nested transaction")
      },
    } as unknown as Prisma.TransactionClient
    await expect(
      publishProductUnitConfigurationInTransaction(tx, {
        tenantId: "tenant",
        actorUserId: "actor",
        configurationId: "draft",
      }),
    ).rejects.toThrow("explicit Stock Transition")
    expect(reads).toEqual([
      expect.objectContaining({
        where: {
          id: "draft",
          product: { catalogItem: { tenantId: "tenant" } },
          status: "DRAFT",
        },
      }),
    ])
  })
}

test("changing main-unit stock precision with live stock needs a Stock Transition", async () => {
  const main = {
    key: "piece",
    name: "Piece",
    factor: "1",
    stockBehavior: "CANONICAL_SHARED",
    transactionScale: 0,
  }
  const tx = {
    unitConfigurationVersion: {
      findFirst: async () => ({
        id: "draft",
        productId: "product",
        canonicalBalanceScale: 1,
        units: [main],
        product: {
          currentUnitConfiguration: {
            id: "current",
            canonicalBalanceScale: 0,
            units: [main],
          },
          stockBalanceSources: [{ onHandQuantity: "2", reservedQuantity: "0" }],
        },
      }),
    },
  } as unknown as Prisma.TransactionClient
  await expect(
    publishProductUnitConfigurationInTransaction(tx, {
      tenantId: "tenant",
      actorUserId: "actor",
      configurationId: "draft",
    }),
  ).rejects.toThrow("explicit Stock Transition")
})
