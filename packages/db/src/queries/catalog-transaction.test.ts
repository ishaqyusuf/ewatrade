import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { currentEffectiveLegalPublication } from "@ewatrade/utils/legal-approval"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { createCatalogItem, createSimpleCatalogItem } from "./catalog"

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object")
    return JSON.stringify(value) ?? "null"
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`
}

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

  test("Catalog rereads its command after Book and advisory coordination before creating another item", async () => {
    const input = {
      actorUserId: "actor",
      tenantId: "tenant",
      storeId: "store",
      clientOperationId: "command",
      kind: "service" as const,
      name: "Mending",
      variants: [
        {
          isDefault: true,
          key: "default",
          name: "Mending",
          offerings: [
            {
              key: "default",
              name: "Mending",
              pricingPolicy: "fixed" as const,
              fixedPriceMinor: 100,
              workPolicy: "charge_only" as const,
              authorizationPolicy: "on_order_confirmation" as const,
            },
          ],
        },
      ],
    }
    const receipt = {
      id: "receipt",
      catalogItemId: "catalog",
      commandType: "CREATE_CATALOG_ITEM",
      storeId: "store",
      payloadHash: createHash("sha256").update(stableJson(input)).digest("hex"),
    }
    const sentinel = new Error("retained item reload reached")
    for (const hasBook of [false, true]) {
      const trace: string[] = []
      let locked = false
      const tx = {
        catalogCommandReceipt: {
          findUnique: async () => {
            trace.push("receipt-read")
            return locked ? receipt : null
          },
        },
        legalAcceptance: {
          findUnique: async () => ({
            documentHash: currentEffectiveLegalPublication()?.documentHash,
          }),
        },
        store: {
          findFirst: async () => ({ id: "store", currencyCode: "NGN" }),
        },
        $queryRaw: async (
          strings: TemplateStringsArray,
          ...values: unknown[]
        ) => {
          expect(strings.join("?")).toContain('FROM "FinanceBook"')
          expect(values).toEqual(["tenant", "NGN"])
          trace.push("book-lock")
          return hasBook ? [{ id: "book" }] : []
        },
        $executeRaw: async (
          strings: TemplateStringsArray,
          ...values: unknown[]
        ) => {
          expect(strings.join("?")).toContain("pg_advisory_xact_lock")
          expect(values).toEqual([
            JSON.stringify(["catalog-command", "tenant", "command"]),
          ])
          locked = true
          trace.push("command-lock")
          return 1
        },
        catalogItem: {
          findUnique: async ({ where }: { where: unknown }) => {
            expect(where).toEqual({ id: "catalog", tenantId: "tenant" })
            trace.push("retained-item")
            throw sentinel
          },
        },
      }
      const db = {
        $transaction: async <T>(
          run: (client: Prisma.TransactionClient) => Promise<T>,
        ) => run(tx as unknown as Prisma.TransactionClient),
      } as unknown as PrismaClient
      await expect(createCatalogItem(db, input)).rejects.toBe(sentinel)
      expect(trace).toEqual([
        "receipt-read",
        "book-lock",
        "command-lock",
        "receipt-read",
        "retained-item",
      ])
    }
    for (const change of [
      { commandType: "GRADUATE_CATALOG_OFFERING" },
      { storeId: "foreign-store" },
      { payloadHash: "b".repeat(64) },
    ]) {
      const db = {
        $transaction: async <T>(
          run: (client: Prisma.TransactionClient) => Promise<T>,
        ) =>
          run({
            catalogCommandReceipt: {
              findUnique: async () => ({ ...receipt, ...change }),
            },
          } as unknown as Prisma.TransactionClient),
      } as unknown as PrismaClient
      await expect(createCatalogItem(db, input)).rejects.toMatchObject({
        code: "IDEMPOTENCY_MISMATCH",
      })
    }
  })

  test("fresh opening count precision follows the canonical unit before source writes without a Book", async () => {
    let writes = 0
    const db = {
      $transaction: async <T>(
        run: (client: Prisma.TransactionClient) => Promise<T>,
      ) =>
        run({
          catalogCommandReceipt: { findUnique: async () => null },
          legalAcceptance: {
            findUnique: async () => ({
              documentHash: currentEffectiveLegalPublication()?.documentHash,
            }),
          },
          store: {
            findFirst: async () => ({ id: "store", currencyCode: "NGN" }),
          },
          $queryRaw: async () => [],
          $executeRaw: async () => 1,
          catalogItem: {
            findUnique: async () => {
              writes++
              throw new Error("unexpected source work")
            },
          },
        } as unknown as Prisma.TransactionClient),
    } as unknown as PrismaClient
    const input = {
      actorUserId: "actor",
      tenantId: "tenant",
      storeId: "store",
      clientOperationId: "precision",
      kind: "product" as const,
      name: "Goods",
      unitConfiguration: {
        canonicalBalanceScale: 18,
        units: [
          {
            key: "base",
            name: "unit",
            factor: "1",
            stockBehavior: "canonical_shared" as const,
            transactionScale: 2,
          },
        ],
      },
      variants: [
        {
          isDefault: true,
          key: "default",
          name: "Goods",
          offerings: [
            {
              key: "base",
              name: "Goods",
              pricingPolicy: "fixed" as const,
              inventoryUnitKey: "base",
              fixedPriceMinor: 100,
            },
          ],
        },
      ],
    }
    for (const command of [
      { ...input, openingStockQuantity: "0.001" },
      {
        ...input,
        variants: input.variants.map((variant) => ({
          ...variant,
          openingStockQuantity: "0.001",
        })),
      },
    ])
      await expect(createCatalogItem(db, command)).rejects.toMatchObject({
        code: "INVALID_STOCK_OPERATION",
      })
    expect(writes).toBe(0)
    const legacyCommand = { ...input, openingStockQuantity: "0.001" }
    const replayStop = new Error("legacy saved result reload")
    const replayDb = {
      $transaction: async <T>(
        run: (client: Prisma.TransactionClient) => Promise<T>,
      ) =>
        run({
          catalogCommandReceipt: {
            findUnique: async () => ({
              commandType: "CREATE_CATALOG_ITEM",
              storeId: "store",
              catalogItemId: "legacy",
              payloadHash: createHash("sha256")
                .update(stableJson(legacyCommand))
                .digest("hex"),
            }),
          },
          catalogItem: {
            findUnique: async () => {
              throw replayStop
            },
          },
        } as unknown as Prisma.TransactionClient),
    } as unknown as PrismaClient
    await expect(createCatalogItem(replayDb, legacyCommand)).rejects.toBe(
      replayStop,
    )
  })
})
